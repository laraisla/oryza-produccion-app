import { ArrowLeft, Calculator, CircleCheck, Download, FileText, Printer, Send, ShieldCheck, Ship, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PayerBadge, VerificationBadge, VersionStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { Alert, EmptyState, Hash, KeyValue, PageHeader, Tooltip } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can, canViewQuotation } from '@/data/access';
import { byId } from '@/data/derive';
import { countryName, hasCosts, orgName, portName, userName, visibleVersions, type VersionView } from '@/data/selectors';
import { acceptQuotationVersion, rejectQuotationVersion, sendQuotationVersion } from '@/data/services/quotations';
import { todayISO, useApp, useCurrentUser, useDb } from '@/data/store';
import { PACKAGING_TYPES, PAYMENT_METHODS, PROCESSING, RICE_TYPES, TRANSPORT_MODES, type PackagingType, type PaymentMethod, type Processing, type RiceType, type TransportMode } from '@/domain/catalogs';
import { COST_STAGES, compareResults } from '@/domain/costing';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtPct, fmtTons } from '@/domain/format';
import { canonicalJson, termsHashForSync } from '@/integrations/stellar/terms';
import { CostCompositionChart } from '../scenario/ResultsPanel';

type Terms = Record<string, unknown>;

function TermsCard({ version }: { version: VersionView }) {
  const db = useDb();
  const t = version.terms as Terms;
  const product = (t.product ?? {}) as Record<string, string | null>;
  const packaging = (t.packaging ?? {}) as Record<string, string | number | null>;
  const incoterm = (t.incoterm ?? {}) as Record<string, string>;
  const lots = (t.lots ?? []) as Record<string, string | null>[];
  const destination = (t.destination ?? {}) as Record<string, string | null>;
  const recomputed = termsHashForSync(version.terms as never);
  const ok = recomputed === version.termsHash;
  return (
    <Card>
      <CardHeader title={`Términos de la versión ${version.version}`} description="Lo que ambas partes ven y aceptan" icon={<FileText />} />
      <CardContent className="space-y-4">
        <KeyValue
          columns={3}
          items={[
            { label: 'Producto', value: `${product.commercialType ? RICE_TYPES[product.commercialType as RiceType] : '—'} · ${product.processing ? PROCESSING[product.processing as Processing] : ''}` },
            { label: 'NCM', value: product.ncm ?? '—' },
            { label: 'Cantidad', value: fmtTons(version.quantityT) },
            { label: 'Presentación', value: `${packaging.type ? PACKAGING_TYPES[packaging.type as PackagingType] : '—'} ${packaging.netWeightKg ?? ''} kg · ${fmtNum(packaging.packages as number, 0)} envases` },
            { label: 'Precio', value: <span className="font-semibold">{fmtMoney(version.pricePerT, version.currency)} / t</span> },
            { label: 'Total', value: <span className="font-semibold">{fmtMoney(version.totalAmount, version.currency)}</span> },
            { label: 'Incoterm', value: `${incoterm.rule} ${incoterm.version} · ${incoterm.namedPlace}` },
            { label: 'Transporte', value: TRANSPORT_MODES[t.transportMode as TransportMode] ?? '—' },
            { label: 'Fecha de embarque', value: fmtDate(t.shipmentDate as string | null) },
            { label: 'Forma de pago', value: PAYMENT_METHODS[t.paymentMethod as PaymentMethod] ?? '—' },
            { label: 'Condición de pago', value: String(t.paymentTerms ?? '—') },
            { label: 'Destino', value: `${countryName(destination.country)} · ${portName(db, destination.portId)}` },
            { label: 'Vigencia', value: fmtDate(version.validUntil) },
            { label: 'Lotes', value: lots.map((l) => `${l.code} (${fmtTons(l.quantityT)}, quebrado ${l.brokenPct ?? '—'} %)`).join(' · ') },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <ShieldCheck className="size-4 text-petrol-700" />
          <span>Hash SHA-256 de los términos canónicos:</span>
          <Hash value={version.termsHash} length={16} />
          {ok ? <Badge tone="success"><CircleCheck /> Recalculado: coincide</Badge> : <Badge tone="danger">El hash no coincide con los términos</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function QuotationDetailPage() {
  const { quotationId } = useParams();
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const navigate = useNavigate();
  const quotation = byId(db.quotations, quotationId);
  const versions = quotation ? visibleVersions(db, user, quotation.id) : [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [reason, setReason] = useState('');
  if (!quotation || !canViewQuotation(user, quotation) || versions.length === 0) {
    return <EmptyState icon={FileText} title="Cotización no disponible" description="No existe o no es visible para tu organización." action={<Button asChild variant="secondary"><Link to="/cotizaciones">Volver</Link></Button>} />;
  }
  const asOf = todayISO();
  const selected = versions.find((v) => v.id === selectedId) ?? versions.find((v) => v.id === quotation.acceptedVersionId) ?? versions.at(-1)!;
  const isSeller = quotation.sellerOrganizationId === user.organizationId && can(user, 'quotation.manage');
  const isBuyer = quotation.buyerOrganizationId === user.organizationId && can(user, 'quotation.respond');
  const expired = selected.status === 'sent' && selected.validUntil < asOf;
  const previous = versions.filter((v) => v.version < selected.version).at(-1);
  const operation = byId(db.operations, quotation.operationId);
  const request = byId(db.requests, quotation.requestId);

  const downloadTerms = () => {
    const blob = new Blob([canonicalJson(selected.terms as never)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quotation.code}-v${selected.version}-terminos.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Cotización ${quotation.code}`}
        badge={<VersionStatusBadge status={expired ? 'expired' : selected.status} />}
        description={`${orgName(db, quotation.sellerOrganizationId)} → ${orgName(db, quotation.buyerOrganizationId)}${request ? ` · solicitud ${request.code}` : ''}`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button asChild variant="ghost"><Link to="/cotizaciones"><ArrowLeft /> Cotizaciones</Link></Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer /> Imprimir / PDF</Button>
            <Button variant="secondary" onClick={downloadTerms}><Download /> Términos (.json)</Button>
            {isSeller && quotation.scenarioId && quotation.status !== 'accepted' ? <Button asChild variant="secondary"><Link to={`/calculadora/${quotation.scenarioId}`}><Calculator /> Nueva versión desde escenario</Link></Button> : null}
            {isSeller && selected.status === 'draft' ? <Button onClick={() => run((d, ctx) => sendQuotationVersion(d, ctx, selected.id), 'Versión enviada al comprador')}><Send /> Enviar al comprador</Button> : null}
            {isBuyer && selected.status === 'sent' && !expired ? (
              <>
                <Button variant="danger" onClick={() => setRejecting(true)}><ThumbsDown /> Rechazar</Button>
                <Button variant="success" onClick={() => setAccepting(true)}><ThumbsUp /> Aceptar versión {selected.version}</Button>
              </>
            ) : null}
            {operation ? <Button asChild><Link to={`/operaciones/${operation.id}`}><Ship /> Ver operación {operation.code}</Link></Button> : null}
          </div>
        }
      />

      {expired ? <Alert tone="warning" title="Versión vencida">Venció el {fmtDate(selected.validUntil)}. No puede aceptarse: el vendedor debe emitir una nueva versión con datos actualizados.</Alert> : null}
      {selected.status === 'accepted' ? <Alert tone="success" title={`Versión ${selected.version} aceptada el ${fmtDateTime(selected.acceptedAt)} por ${userName(db, selected.acceptedBy)}`}>Es inmutable: cualquier cambio posterior requiere una nueva negociación.</Alert> : null}
      {selected.status === 'rejected' ? <Alert tone="error" title="Versión rechazada">{selected.rejectionReason}</Alert> : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader title="Versiones" description="Historial completo, sin sobrescrituras" />
          <ul className="divide-y divide-slate-100">
            {versions.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setSelectedId(v.id)} className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 ${v.id === selected.id ? 'bg-petrol-50' : ''}`}>
                  <span className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Versión {v.version}</span><VersionStatusBadge status={v.status === 'sent' && v.validUntil < asOf ? 'expired' : v.status} /></span>
                  <span className="num block text-xs text-slate-700">{fmtMoney(v.pricePerT, v.currency)}/t</span>
                  <span className="block text-[11px] text-slate-500">{fmtDateTime(v.createdAt)}{v.changeNote ? ` · ${v.changeNote}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="min-w-0 space-y-5">
          <TermsCard version={selected} />

          {hasCosts(selected) ? (
            <Card>
              <CardHeader title="Desglose de costos (privado del vendedor)" description={`Calculado con ${selected.result.engineVersion} al ${fmtDate(selected.result.asOf)}: los resultados históricos no se recalculan`} />
              <CardContent className="space-y-4">
                <KeyValue
                  columns={4}
                  items={[
                    { label: 'Costo del vendedor', value: fmtMoney(selected.result.sellerCostTotal, selected.currency) },
                    { label: 'Costo por tonelada', value: fmtMoney(selected.result.sellerCostPerT, selected.currency) },
                    { label: 'Margen', value: `${fmtMoney(selected.result.marginAbs, selected.currency)} (${fmtPct(selected.result.marginPctOnSale)} s/venta)` },
                    { label: 'Precio mínimo', value: `${fmtMoney(selected.result.minPricePerT, selected.currency)}/t` },
                  ]}
                />
                <CostCompositionChart result={selected.result} />
                <Table>
                  <THead><TR><TH>Concepto</TH><TH>Etapa</TH><TH className="text-right">Importe</TH><TH>Paga</TH><TH>Estado del dato</TH></TR></THead>
                  <TBody>
                    {selected.result.lines.filter((l) => l.included).map((l) => (
                      <TR key={l.id}>
                        <TD className="text-xs font-medium">{l.name}</TD>
                        <TD className="text-xs">{COST_STAGES[l.stage]}</TD>
                        <TD className="num text-right text-xs">{fmtMoney(l.amount, selected.currency)}</TD>
                        <TD><Tooltip content={l.explanation}><span className="inline-flex"><PayerBadge payer={l.payer} agreed={l.payerSource === 'agreement'} /></span></Tooltip></TD>
                        <TD><VerificationBadge status={l.effectiveStatus} /></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {previous && hasCosts(previous) ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-700">Cambios respecto de la versión {previous.version}</p>
                    <Table>
                      <THead><TR><TH>Métrica</TH><TH className="text-right">v{previous.version}</TH><TH className="text-right">v{selected.version}</TH><TH className="text-right">Diferencia</TH></TR></THead>
                      <TBody>
                        {compareResults(previous.result, selected.result).map((d) => (
                          <TR key={d.metric}><TD className="text-xs">{d.metric}</TD><TD className="num text-right text-xs">{fmtNum(d.a, 2, 2)}</TD><TD className="num text-right text-xs">{fmtNum(d.b, 2, 2)}</TD><TD className="num text-right text-xs">{fmtNum(d.diff, 2, 2)}</TD></TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Alert tone="info" title="Costos internos no compartidos">El comprador ve los términos, el precio y su hash. El desglose de costos y márgenes es privado del vendedor.</Alert>
          )}
        </div>
      </div>

      {accepting ? (
        <Dialog open onOpenChange={setAccepting}>
          <DialogContent
            title={`Aceptar versión ${selected.version} de ${quotation.code}`}
            description="Se crea la operación, se compromete el stock y se genera el checklist documental."
            footer={<><Button variant="secondary" onClick={() => setAccepting(false)}>Cancelar</Button><Button variant="success" onClick={() => { const r = run((d, ctx) => acceptQuotationVersion(d, ctx, selected.id), 'Cotización aceptada: operación creada'); setAccepting(false); if (r) navigate(`/operaciones/${r.operation.id}`); }}><ThumbsUp /> Confirmar aceptación</Button></>}
          >
            <div className="space-y-2 text-sm">
              <p>Precio <strong>{fmtMoney(selected.pricePerT, selected.currency)}/t</strong> · total <strong>{fmtMoney(selected.totalAmount, selected.currency)}</strong> · {selected.incoterm} {selected.namedPlace}.</p>
              <p className="text-xs text-slate-600">Estás aceptando exactamente los términos con hash <span className="mono break-all">{selected.termsHash}</span>. Esta aceptación es un registro comercial en AgroMatch; no reemplaza un contrato ni obligaciones regulatorias.</p>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {rejecting ? (
        <Dialog open onOpenChange={setRejecting}>
          <DialogContent
            title={`Rechazar versión ${selected.version}`}
            footer={<><Button variant="secondary" onClick={() => setRejecting(false)}>Cancelar</Button><Button variant="danger" disabled={!reason.trim()} onClick={() => { if (run((d, ctx) => rejectQuotationVersion(d, ctx, selected.id, reason), 'Versión rechazada')) setRejecting(false); }}>Rechazar</Button></>}
          >
            <Field label="Motivo" required hint="Lo verá el vendedor para preparar una nueva versión">{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
