import { History } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { VersionStatusBadge } from '@/components/status';
import { Card, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { EmptyState, Hash, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { canViewFinance } from '@/data/access';
import { byId } from '@/data/derive';
import { visibleDocuments, visibleLots, visibleOperations, visibleTraceEvents, visibleVersions } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { fmtDateTime, fmtMoney } from '@/domain/format';
import { EventLog, StandardTimeline } from './Timeline';

export function OperationTrace({ operationId }: { operationId: string }) {
  const db = useDb();
  const user = useCurrentUser();
  const op = byId(db.operations, operationId)!;
  const lotIds = op.lots.map((l) => l.lotId);
  const events = visibleTraceEvents(db, user, (e) => e.operationId === op.id || Boolean(e.lotIds?.some((id) => lotIds.includes(id))) || (e.entity.kind === 'request' && e.entity.id === op.requestId) || (e.entity.kind === 'quotation' && e.entity.id === op.quotationId));
  const versions = visibleVersions(db, user, op.quotationId);
  const docs = visibleDocuments(db, user, op.id);
  const docVersions = db.documentVersions.filter((v) => docs.some((d) => d.id === v.documentId)).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <StandardTimeline events={events} hiddenFinance={!canViewFinance(user, op)} />
        <div className="space-y-5">
          <Card>
            <CardHeader title="Versiones de la cotización" description="Las versiones anteriores se conservan" />
            <Table>
              <THead><TR><TH>Versión</TH><TH>Precio</TH><TH>Hash</TH><TH>Estado</TH></TR></THead>
              <TBody>
                {versions.map((v) => (
                  <TR key={v.id}><TD>v{v.version}<p className="text-[11px] text-slate-500">{fmtDateTime(v.createdAt)}</p></TD><TD className="num text-xs">{fmtMoney(v.pricePerT, v.currency)}/t</TD><TD><Hash value={v.termsHash} /></TD><TD><VersionStatusBadge status={v.status} /></TD></TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Versiones de documentos" />
            <Table>
              <THead><TR><TH>Documento</TH><TH>Versión</TH><TH>SHA-256</TH><TH>Fecha</TH></TR></THead>
              <TBody>
                {docVersions.map((v) => (
                  <TR key={v.id}><TD className="text-xs">{docs.find((d) => d.id === v.documentId)?.name}</TD><TD>v{v.version}</TD><TD><Hash value={v.sha256} /></TD><TD className="text-xs">{fmtDateTime(v.uploadedAt)}</TD></TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
      <EventLog events={events} />
    </div>
  );
}

export default function TraceabilityPage() {
  const db = useDb();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const operations = visibleOperations(db, user);
  const lots = visibleLots(db, user);
  const lot = byId(lots, params.get('lote'));
  const op = lot ? undefined : (byId(operations, params.get('op')) ?? operations[0]);
  const lotEvents = lot ? visibleTraceEvents(db, user, (e) => Boolean(e.lotIds?.includes(lot.id))) : [];
  return (
    <div className="space-y-4">
      <PageHeader title="Trazabilidad" description="Reconstrucción del historial del producto y de la operación: quién informó, validó o cambió cada dato y cuándo. Los datos comerciales privados no se publican en blockchain." />
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Operación" className="max-w-sm" value={op?.id ?? ''} onChange={(e) => setParams(e.target.value ? { op: e.target.value } : {})}>
          <option value="">Operación…</option>
          {operations.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}
        </Select>
        <Select aria-label="Lote" className="max-w-sm" value={lot?.id ?? ''} onChange={(e) => setParams(e.target.value ? { lote: e.target.value } : {})}>
          <option value="">Lote…</option>
          {lots.map((l) => <option key={l.id} value={l.id}>{l.code} · {byId(db.organizations, l.organizationId)?.name}</option>)}
        </Select>
      </div>
      {lot ? (
        <>
          <p className="text-sm text-slate-600">Historial del lote <span className="mono font-medium">{lot.code}</span>{db.operations.filter((o) => o.lots.some((l) => l.lotId === lot.id)).map((o) => <Link key={o.id} to={`/trazabilidad?op=${o.id}`} className="ml-2 text-petrol-700 hover:underline">· asignado a {o.code}</Link>)}</p>
          <EventLog events={lotEvents} />
        </>
      ) : op ? (
        <OperationTrace key={op.id} operationId={op.id} />
      ) : (
        <EmptyState icon={History} title="Sin operaciones visibles" />
      )}
    </div>
  );
}
