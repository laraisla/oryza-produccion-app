import { CircleCheck, ExternalLink, Link2, LoaderCircle, PenLine, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, Hash, KeyValue } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can, isParticipant } from '@/data/access';
import { byId } from '@/data/derive';
import { orgName } from '@/data/selectors';
import { recordBlockchainTx } from '@/data/services/operations';
import { useApp, useCurrentUser, useDb } from '@/data/store';
import { fmtDateTime } from '@/domain/format';
import { stellarRuntime } from '@/integrations/stellar/config';
import { DealsContractClient, type OnChainDeal, type TxLookup } from '@/integrations/stellar/dealsClient';
import { connectFreighter, freighterSigner } from '@/integrations/stellar/freighter';
import { explorerContractUrl, explorerTxUrl } from '@/integrations/stellar/networks';
import { dealKeyForSync, termsHashForSync } from '@/integrations/stellar/terms';

interface TxRow {
  action: string;
  hash: string;
  ledger: number;
  confirmedAt: string;
  origin: 'script' | 'app';
  signer?: string;
}

export default function StellarPanel({ operationId }: { operationId: string }) {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const notify = useApp((s) => s.notify);
  const op = byId(db.operations, operationId)!;
  const version = byId(db.quotationVersions, op.acceptedVersionId);
  const runtime = stellarRuntime(db.settings.stellar);
  const { network, contractId } = runtime;
  const dealKey = useMemo(() => dealKeyForSync(op.id), [op.id]);
  const recomputed = useMemo(() => (version ? termsHashForSync(version.terms as never) : null), [version]);
  const hashOk = Boolean(version && recomputed === version.termsHash && op.termsHash === version.termsHash);
  const scriptRecord = runtime.evidence?.contractId === contractId ? runtime.evidence?.records.find((r) => r.operationId === op.id) : undefined;
  const appRecords = db.blockchainRecords.filter((r) => r.operationId === op.id && r.network === network.id && r.contractId === contractId);
  const rows: TxRow[] = [
    ...(scriptRecord?.transactions ?? []).map((t) => ({ action: t.action, hash: t.hash, ledger: t.ledger, confirmedAt: new Date(t.createdAt * 1000).toISOString(), origin: 'script' as const, signer: t.action === 'create_deal' ? scriptRecord?.seller : scriptRecord?.buyer })),
    ...appRecords.map((r) => ({ action: r.action, hash: r.txHash, ledger: r.ledger, confirmedAt: r.confirmedAt, origin: 'app' as const, signer: r.signer })),
  ];
  const [lookups, setLookups] = useState<Record<string, TxLookup | { status: 'ERROR'; message: string }>>({});
  const [onChain, setOnChain] = useState<OnChainDeal | null | 'error' | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [wallet, setWallet] = useState<{ address: string; networkPassphrase: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isSeller = op.sellerOrganizationId === user.organizationId;
  const isBuyer = op.buyerOrganizationId === user.organizationId;
  const buyerAddress = byId(db.organizations, op.buyerOrganizationId)?.stellarAddress ?? null;
  const client = contractId ? new DealsContractClient(network, contractId) : null;

  const verify = async () => {
    if (!client) return;
    setChecking(true);
    const results: typeof lookups = {};
    for (const row of rows) {
      try {
        results[row.hash] = await client.lookupTransaction(row.hash);
      } catch (error) {
        results[row.hash] = { status: 'ERROR', message: error instanceof Error ? error.message : String(error) };
      }
    }
    setLookups(results);
    try {
      setOnChain(await client.getDeal(dealKey));
    } catch (error) {
      setOnChain('error');
      notify({ kind: 'error', title: 'No se pudo consultar el RPC de Stellar', detail: error instanceof Error ? error.message : String(error) });
    }
    setChecking(false);
  };

  const connect = async () => {
    try {
      const w = await connectFreighter();
      if (w.networkPassphrase !== network.networkPassphrase) {
        notify({ kind: 'error', title: `Freighter está en otra red (${w.network})`, detail: `Seleccionar ${network.label} en la extensión.` });
        return;
      }
      setWallet(w);
    } catch (error) {
      notify({ kind: 'error', title: error instanceof Error ? error.message : 'No se pudo conectar Freighter' });
    }
  };

  const submit = async (action: 'create_deal' | 'accept_deal') => {
    if (!client || !wallet || !version) return;
    setBusy(action);
    try {
      const signer = freighterSigner(wallet.address);
      const tx =
        action === 'create_deal'
          ? await client.createDeal(signer, { dealKey, buyer: buyerAddress!, termsHash: version.termsHash, termsVersion: version.version })
          : await client.acceptDeal(signer, { dealKey, termsHash: version.termsHash });
      run(
        (d, ctx) =>
          recordBlockchainTx(d, ctx, op.id, {
            network: network.id,
            contractId: contractId!,
            action,
            dealKey,
            termsHash: version.termsHash,
            termsVersion: version.version,
            txHash: tx.hash,
            ledger: tx.ledger,
            confirmedAt: new Date(tx.createdAt * 1000).toISOString(),
            signer: wallet.address,
          }),
        `Transacción confirmada en ${network.label}`,
      );
    } catch (error) {
      notify({ kind: 'error', title: 'La transacción no se confirmó', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const hasCreate = rows.some((r) => r.action === 'create_deal');
  const hasAccept = rows.some((r) => r.action === 'accept_deal');

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Evidencia en Stellar"
          description="Registra solo hashes y direcciones públicas: nunca precios, nombres, CUIT ni documentos"
          icon={<ShieldCheck />}
          actions={
            <>
              <Badge tone={network.id === 'testnet' ? 'petrol' : 'warning'}>{network.id === 'testnet' ? 'TESTNET' : 'RED LOCAL DE DESARROLLO'}</Badge>
              {contractId ? <Badge tone="success">Contrato configurado</Badge> : <Badge tone="danger">Sin contrato configurado</Badge>}
            </>
          }
        />
        <CardContent className="space-y-4">
          <KeyValue
            columns={2}
            items={[
              { label: 'Red', value: `${network.label} · ${network.rpcUrl}` },
              {
                label: 'Contrato Soroban',
                value: contractId ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="mono break-all">{contractId}</span>
                    {explorerContractUrl(network, contractId) ? <a className="inline-flex items-center gap-1 text-xs text-petrol-700 hover:underline" href={explorerContractUrl(network, contractId)} target="_blank" rel="noreferrer">Explorador <ExternalLink className="size-3" /></a> : null}
                  </span>
                ) : 'No desplegado en esta red (ver README: npm run stellar:deploy)',
              },
              { label: 'Clave de operación (deal_key)', value: <Hash value={dealKey} length={20} /> },
              { label: 'Hash de términos aceptados', value: version ? <span className="flex flex-wrap items-center gap-2"><Hash value={version.termsHash} length={20} />{hashOk ? <Badge tone="success"><CircleCheck /> Recalculado desde los términos</Badge> : <Badge tone="danger">No coincide</Badge>}</span> : 'La operación aún no tiene versión aceptada' },
            ]}
          />
          {network.id === 'local' ? <Alert tone="warning">Red local de desarrollo (stellar/quickstart): sus transacciones son reales pero no verificables públicamente. Para el desafío usar Testnet.</Alert> : null}
          <Alert tone="info">Stellar Testnet no mueve fondos comerciales: es una prueba de integridad y fecha de registro de una versión del acuerdo. No es un sistema de pagos de exportaciones ni reemplaza las obligaciones cambiarias argentinas.</Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Transacciones registradas"
          description="Solo se listan transacciones que el RPC confirmó como exitosas al registrarlas"
          actions={client && rows.length ? <Button size="sm" variant="secondary" disabled={checking} onClick={verify}>{checking ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Verificar ahora en la red</Button> : undefined}
        />
        {rows.length === 0 ? (
          <CardContent><p className="text-sm text-slate-500">{contractId ? 'Todavía no hay transacciones confirmadas para esta operación en esta red.' : 'Sin contrato configurado: no hay evidencia blockchain para mostrar.'}</p></CardContent>
        ) : (
          <Table>
            <THead><TR><TH>Acción</TH><TH>Transacción</TH><TH>Ledger</TH><TH>Confirmada</TH><TH>Origen</TH><TH>Verificación en vivo</TH></TR></THead>
            <TBody>
              {rows.map((r) => {
                const live = lookups[r.hash];
                const url = explorerTxUrl(network, r.hash);
                return (
                  <TR key={r.hash}>
                    <TD className="font-medium">{r.action === 'create_deal' ? 'Registro del vendedor (create_deal)' : r.action === 'accept_deal' ? 'Confirmación del comprador (accept_deal)' : r.action}</TD>
                    <TD><span className="flex items-center gap-2"><Hash value={r.hash} length={14} />{url ? <a className="text-petrol-700" href={url} target="_blank" rel="noreferrer" aria-label="Ver en explorador"><ExternalLink className="size-3.5" /></a> : null}</span></TD>
                    <TD className="num text-xs">{r.ledger}</TD>
                    <TD className="text-xs">{fmtDateTime(r.confirmedAt)}{r.signer ? <><br /><span className="mono text-slate-500">{r.signer.slice(0, 6)}…{r.signer.slice(-4)}</span></> : null}</TD>
                    <TD><Badge tone="outline">{r.origin === 'script' ? 'Script de despliegue' : 'Freighter (app)'}</Badge></TD>
                    <TD>
                      {!live ? <span className="text-xs text-slate-400">Sin consultar</span> : live.status === 'SUCCESS' ? <Badge tone="success"><CircleCheck /> SUCCESS en ledger {live.ledger}</Badge> : live.status === 'ERROR' ? <Badge tone="warning">RPC no disponible</Badge> : <Badge tone="danger">{live.status}</Badge>}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {onChain !== undefined ? (
          <CardContent className="border-t border-slate-100">
            {onChain === 'error' ? (
              <Alert tone="warning" title="No se pudo leer el estado on-chain">El RPC no respondió desde este navegador. La evidencia sigue siendo verificable en el explorador público.</Alert>
            ) : onChain === null ? (
              <Alert tone="warning">El contrato no tiene registrado un acuerdo con esta clave de operación.</Alert>
            ) : (
              <Alert tone={onChain.termsHash === version?.termsHash ? 'success' : 'error'} title={`Estado on-chain: ${onChain.status} · versión ${onChain.termsVersion}`}>
                {onChain.termsHash === version?.termsHash ? 'El hash registrado coincide con los términos aceptados en AgroMatch.' : 'El hash registrado NO coincide con los términos aceptados.'} Vendedor {onChain.seller.slice(0, 6)}… · comprador {onChain.buyer.slice(0, 6)}…
              </Alert>
            )}
          </CardContent>
        ) : null}
      </Card>

      {client && version && isParticipant(user, op) && can(user, 'blockchain.sign') ? (
        <Card>
          <CardHeader title="Firmar con Freighter" description="Cada parte firma con su propia billetera; la app nunca recibe claves privadas" icon={<Wallet />} />
          <CardContent className="space-y-3">
            {!wallet ? (
              <Button variant="secondary" onClick={connect}><Link2 /> Conectar Freighter</Button>
            ) : (
              <p className="text-sm">Cuenta conectada: <span className="mono">{wallet.address}</span></p>
            )}
            {isSeller && !hasCreate ? (
              buyerAddress ? (
                <Button disabled={!wallet || busy !== null} onClick={() => submit('create_deal')}>{busy === 'create_deal' ? <LoaderCircle className="animate-spin" /> : <PenLine />} Registrar acuerdo (vendedor)</Button>
              ) : (
                <Alert tone="warning">{orgName(db, op.buyerOrganizationId)} todavía no configuró su dirección pública Stellar (Configuración → Organización).</Alert>
              )
            ) : null}
            {isBuyer && hasCreate && !hasAccept ? (
              <Button variant="success" disabled={!wallet || busy !== null} onClick={() => submit('accept_deal')}>{busy === 'accept_deal' ? <LoaderCircle className="animate-spin" /> : <PenLine />} Confirmar acuerdo (comprador)</Button>
            ) : null}
            {hasCreate && hasAccept ? <p className="text-sm text-emerald-700">El acuerdo ya fue registrado y confirmado on-chain.</p> : null}
            {isBuyer && !hasCreate ? <p className="text-sm text-slate-500">Esperando que el vendedor registre el acuerdo.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
