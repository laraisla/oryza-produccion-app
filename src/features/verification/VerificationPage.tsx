import { ExternalLink, History, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import type { VerificationRecord, VerificationSubjectKind } from '@/data/model';
import { userName } from '@/data/selectors';
import { changeVerification } from '@/data/services/admin';
import { todayISO, useApp, useCurrentUser, useDb } from '@/data/store';
import { VERIFICATION_STATUS, type VerificationStatus } from '@/domain/catalogs';
import { fmtDate, fmtDateTime } from '@/domain/format';
import { effectiveStatus, expiryAlerts, validateVerificationChange } from '@/domain/verification';
import { stellarRuntime } from '@/integrations/stellar/config';

const KIND_LABEL: Record<VerificationSubjectKind, string> = {
  cost_catalog: 'Tarifa / costo',
  fx_rate: 'Tipo de cambio',
  requirement: 'Requisito documental',
  lot_quality: 'Análisis de calidad',
  product_ncm: 'Clasificación NCM',
  container_type: 'Capacidad de contenedor',
  price: 'Precio comercial',
  blockchain: 'Confirmación blockchain',
};

function ChangeDialog({ record, onClose }: { record: VerificationRecord; onClose: () => void }) {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const [form, setForm] = useState({
    to: (record.status === 'expired' ? 'quoted' : record.status) as VerificationStatus,
    source: record.source,
    evidenceUrl: record.evidenceUrl ?? '',
    responsible: user.name,
    validUntil: record.validUntil ?? '',
    value: record.value,
    note: '',
  });
  const errors = validateVerificationChange({ to: form.to as VerificationStatus, source: form.source, evidence: form.evidenceUrl, responsible: form.responsible, validUntil: form.validUntil || null });
  const editable = can(user, 'verification.manage') && record.organizationId === user.organizationId && record.subject.kind !== 'blockchain';
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        size="lg"
        title={record.dataLabel}
        description={`${KIND_LABEL[record.subject.kind]} · ${record.unit}`}
        footer={
          editable ? (
            <>
              <Button variant="secondary" onClick={onClose}>Cerrar</Button>
              <Button disabled={errors.length > 0} onClick={() => { if (run((d, ctx) => changeVerification(d, ctx, record.id, { ...form, to: form.to as VerificationStatus, validUntil: form.validUntil || null, evidenceUrl: form.evidenceUrl || null }), 'Verificación actualizada')) onClose(); }}>Registrar cambio</Button>
            </>
          ) : <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        }
      >
        <div className="space-y-4">
          {editable ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nuevo estado">{(p) => <Select {...p} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value as VerificationStatus })}>{(['estimated', 'quoted', 'verified', 'pending'] as VerificationStatus[]).map((k) => <option key={k} value={k}>{VERIFICATION_STATUS[k]}</option>)}</Select>}</Field>
              <Field label="Valor">{(p) => <Input {...p} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}</Field>
              <Field label="Fuente" required>{(p) => <Input {...p} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />}</Field>
              <Field label="URL o documento de respaldo" hint="Obligatorio para marcar como verificado">{(p) => <Input {...p} value={form.evidenceUrl} onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} />}</Field>
              <Field label="Responsable" required>{(p) => <Input {...p} value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />}</Field>
              <Field label="Vence">{(p) => <Input {...p} type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />}</Field>
              <Field label="Observaciones" className="sm:col-span-2">{(p) => <Textarea {...p} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}</Field>
              {errors.length ? <Alert tone="warning" className="sm:col-span-2">{errors.join(' ')}</Alert> : null}
              <p className="text-[11px] text-slate-500 sm:col-span-2">Una estimación nunca se convierte en dato verificado automáticamente: este cambio queda en el historial con su responsable.</p>
            </div>
          ) : (
            <Alert tone="info">Solo lectura para tu rol u organización.</Alert>
          )}
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700"><History className="size-3.5" /> Historial de cambios</p>
            <Table>
              <THead><TR><TH>Fecha</TH><TH>Cambio</TH><TH>Valor</TH><TH>Por</TH><TH>Nota</TH></TR></THead>
              <TBody>
                {[...record.history].reverse().map((h, i) => (
                  <TR key={i}><TD className="text-xs">{fmtDateTime(h.at)}</TD><TD className="text-xs">{VERIFICATION_STATUS[h.from]} → {VERIFICATION_STATUS[h.to]}</TD><TD className="text-xs">{h.value ?? '—'}</TD><TD className="text-xs">{userName(db, h.by)}</TD><TD className="text-xs">{h.note ?? '—'}</TD></TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VerificationPage() {
  const db = useDb();
  const user = useCurrentUser();
  const asOf = todayISO();
  const [status, setStatus] = useState<VerificationStatus | ''>('');
  const [kind, setKind] = useState<VerificationSubjectKind | ''>('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<VerificationRecord | null>(null);
  const records = db.verifications.filter((r) => r.organizationId === user.organizationId);
  const usage = useMemo(() => {
    const map = new Map<string, { scenarios: number; sent: number }>();
    for (const item of db.costCatalog) {
      const scenarios = db.scenarios.filter((s) => s.status !== 'archived' && s.lines.some((l) => l.enabled && l.catalogId === item.key)).length;
      const sent = db.quotationVersions.filter((v) => v.status === 'sent' && v.scenario.lines.some((l) => l.enabled && l.catalogId === item.key)).length;
      map.set(item.id, { scenarios, sent });
    }
    return map;
  }, [db]);
  const rows = records
    .map((r) => ({ record: r, effective: effectiveStatus({ status: r.status, validUntil: r.validUntil }, asOf) }))
    .filter((x) => !status || x.effective === status)
    .filter((x) => !kind || x.record.subject.kind === kind)
    .filter((x) => !query || `${x.record.dataLabel} ${x.record.source}`.toLowerCase().includes(query.toLowerCase()));
  const alerts = expiryAlerts(records.map((r) => ({ id: r.id, label: r.dataLabel, status: r.status, validUntil: r.validUntil })), asOf, 15);
  const runtime = stellarRuntime(db.settings.stellar);
  const chainTx = [
    ...(runtime.evidence?.records ?? []).flatMap((r) => r.transactions.map((t) => ({ hash: t.hash, label: `${r.operationCode ?? r.operationId} · ${t.action}`, at: new Date(t.createdAt * 1000).toISOString() }))),
    ...db.blockchainRecords.map((b) => ({ hash: b.txHash, label: `${db.operations.find((o) => o.id === b.operationId)?.code} · ${b.action}`, at: b.confirmedAt })),
  ];
  const counts = (['verified', 'quoted', 'estimated', 'pending', 'expired'] as VerificationStatus[]).map((s) => ({ s, n: records.filter((r) => effectiveStatus({ status: r.status, validUntil: r.validUntil }, asOf) === s).length }));

  return (
    <div className="space-y-5">
      <PageHeader title="Verificación" description="Confiabilidad y vigencia de cada dato que usa AgroMatch: fuente, respaldo, fecha de consulta, vencimiento, responsable e historial." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {counts.map(({ s, n }) => (
          <button key={s} type="button" onClick={() => setStatus(status === s ? '' : s)} className={`rounded-lg border bg-white px-4 py-3 text-left shadow-card ${status === s ? 'border-petrol-500' : 'border-slate-200'}`}>
            <VerificationBadge status={s} />
            <p className="num mt-1 text-xl font-semibold">{n}</p>
          </button>
        ))}
      </div>
      {alerts.length ? (
        <Card>
          <CardHeader title="Alertas de vencimiento" description="Tarifas o documentos vencidos o por vencer, y dónde se usan" />
          <CardContent className="space-y-2">
            {alerts.map((a) => {
              const record = records.find((r) => r.id === a.id)!;
              const use = record.subject.kind === 'cost_catalog' ? usage.get(record.subject.id) : undefined;
              return (
                <Alert key={a.id} tone={a.status === 'expired' ? 'warning' : 'info'} title={`${a.status === 'expired' ? 'Vencido' : 'Vence pronto'}: ${a.label}`} action={<Button size="sm" variant="ghost" onClick={() => setOpen(record)}>Actualizar</Button>}>
                  {a.status === 'expired' ? `Venció el ${fmtDate(a.validUntil)}.` : `Vence el ${fmtDate(a.validUntil)} (${a.days} días).`}
                  {use ? ` Usado en ${use.scenarios} escenario(s) y ${use.sent} cotización(es) enviada(s).` : ''}
                </Alert>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" /><Input aria-label="Buscar" className="pl-8" placeholder="Buscar dato o fuente…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <Select aria-label="Tipo de dato" className="w-56" value={kind} onChange={(e) => setKind(e.target.value as VerificationSubjectKind | '')}>
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABEL).filter(([k]) => k !== 'blockchain').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <Card>
        <Table>
          <THead><TR><TH>Dato</TH><TH>Valor</TH><TH>Fuente</TH><TH>Consultado</TH><TH>Vence</TH><TH>Responsable</TH><TH>Estado</TH><TH /></TR></THead>
          <TBody>
            {rows.map(({ record: r, effective }) => (
              <TR key={r.id}>
                <TD><p className="font-medium text-slate-800">{r.dataLabel}</p><p className="text-[11px] text-slate-500">{KIND_LABEL[r.subject.kind]}</p></TD>
                <TD className="max-w-[200px] text-xs">{r.value} <span className="text-slate-500">{r.unit !== 'texto' ? r.unit : ''}</span></TD>
                <TD className="max-w-[260px] text-xs">{r.source}{r.evidenceUrl ? <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-petrol-700 hover:underline">respaldo <ExternalLink className="size-3" /></a> : null}</TD>
                <TD className="text-xs">{fmtDate(r.consultedAt)}</TD>
                <TD className="text-xs">{fmtDate(r.validUntil)}</TD>
                <TD className="text-xs">{r.responsible}</TD>
                <TD><VerificationBadge status={effective} /></TD>
                <TD className="text-right"><Button size="sm" variant="secondary" onClick={() => setOpen(r)}>{can(user, 'verification.manage') ? 'Ver / actualizar' : 'Ver'}</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 ? <p className="p-4 text-sm text-slate-500">Sin registros con los filtros elegidos.</p> : null}
      </Card>
      <Card>
        <CardHeader title="Confirmaciones blockchain" description="No se verifican manualmente: se consultan en la red desde cada expediente" icon={<ShieldCheck />} />
        <CardContent>
          {chainTx.length === 0 ? <p className="text-sm text-slate-500">Sin transacciones confirmadas en {runtime.network.label}.</p> : (
            <ul className="space-y-1 text-xs">
              {chainTx.map((t) => <li key={t.hash} className="flex flex-wrap items-center gap-2"><Badge tone="success">Confirmada</Badge><span>{t.label}</span><span className="mono text-slate-500">{t.hash.slice(0, 20)}…</span><span className="text-slate-500">{fmtDateTime(t.at)}</span></li>)}
            </ul>
          )}
        </CardContent>
      </Card>
      {open ? <ChangeDialog record={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
