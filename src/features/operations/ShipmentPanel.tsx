import { Container, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ShipmentStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, KeyValue } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import { byId } from '@/data/derive';
import type { Shipment } from '@/data/model';
import { portName } from '@/data/selectors';
import { fieldErrors, shipmentSchema, type ShipmentInput } from '@/data/schemas';
import { saveShipment } from '@/data/services/operations';
import { useApp, useCurrentUser, useDb } from '@/data/store';
import { SHIPMENT_STATUS, type ShipmentStatus } from '@/domain/catalogs';
import { fmtDate, fmtNum, fmtTons } from '@/domain/format';

const FLOW: ShipmentStatus[] = ['planned', 'dispatched', 'shipped', 'received'];

function toInput(s: Shipment | undefined, operationQty: string): ShipmentInput {
  return {
    status: s?.status ?? 'planned',
    containerTypeId: s?.containerTypeId ?? null,
    containers: s?.containers ?? [],
    vessel: s?.vessel ?? '',
    voyage: s?.voyage ?? '',
    bookingNumber: s?.bookingNumber ?? '',
    blNumber: s?.blNumber ?? '',
    exportPermitNumber: s?.exportPermitNumber ?? '',
    portOfLoadingId: s?.portOfLoadingId ?? null,
    portOfDischargeId: s?.portOfDischargeId ?? null,
    plannedDate: s?.plannedDate ?? '',
    dispatchedAt: s?.dispatchedAt ?? '',
    shippedAt: s?.shippedAt ?? '',
    receivedAt: s?.receivedAt ?? '',
    shippedQuantityT: s?.shippedQuantityT ?? (s ? '' : ''),
    packages: s?.packages ?? null,
    grossWeightKg: s?.grossWeightKg ?? '',
    notes: s?.notes ?? (operationQty ? '' : ''),
  };
}

function ShipmentDialog({ operationId, shipment, onClose }: { operationId: string; shipment?: Shipment; onClose: () => void }) {
  const db = useDb();
  const run = useApp((s) => s.run);
  const op = byId(db.operations, operationId)!;
  const [form, setForm] = useState<ShipmentInput>(() => toInput(shipment, op.quantityT));
  const [touched, setTouched] = useState(false);
  const errors = touched ? fieldErrors(shipmentSchema, form) : {};
  const set = <K extends keyof ShipmentInput>(k: K, v: ShipmentInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const containers = form.containers ?? [];
  const locked = shipment?.status === 'shipped' || shipment?.status === 'received';
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" title={shipment ? 'Actualizar embarque' : 'Planificar embarque'} description="La cantidad embarcada genera movimientos de stock y alimenta la conciliación." footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => { setTouched(true); if (Object.keys(fieldErrors(shipmentSchema, form)).length) return; if (run((d, ctx) => saveShipment(d, ctx, operationId, form, shipment?.id), 'Embarque actualizado')) onClose(); }}>Guardar</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Estado">{(p) => <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as ShipmentStatus)}>{Object.entries(SHIPMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="Tipo de contenedor">{(p) => <Select {...p} value={form.containerTypeId ?? ''} onChange={(e) => set('containerTypeId', e.target.value || null)}><option value="">—</option>{db.containerTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
            <Field label="Booking">{(p) => <Input {...p} value={form.bookingNumber ?? ''} onChange={(e) => set('bookingNumber', e.target.value)} />}</Field>
            <Field label="Puerto de carga">{(p) => <Select {...p} value={form.portOfLoadingId ?? ''} onChange={(e) => set('portOfLoadingId', e.target.value || null)}><option value="">—</option>{db.ports.filter((x) => x.kind !== 'destination').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
            <Field label="Puerto de descarga">{(p) => <Select {...p} value={form.portOfDischargeId ?? ''} onChange={(e) => set('portOfDischargeId', e.target.value || null)}><option value="">—</option>{db.ports.filter((x) => x.kind !== 'origin').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
            <Field label="Buque / viaje">{(p) => <div className="flex gap-1"><Input {...p} value={form.vessel ?? ''} onChange={(e) => set('vessel', e.target.value)} placeholder="Buque" /><Input aria-label="Viaje" value={form.voyage ?? ''} onChange={(e) => set('voyage', e.target.value)} placeholder="Viaje" className="w-24" /></div>}</Field>
            <Field label="Fecha planificada" error={errors.plannedDate}>{(p) => <Input {...p} type="date" value={form.plannedDate ?? ''} onChange={(e) => set('plannedDate', e.target.value)} />}</Field>
            <Field label="Fecha de despacho (planta)" error={errors.dispatchedAt}>{(p) => <Input {...p} type="date" value={form.dispatchedAt ?? ''} onChange={(e) => set('dispatchedAt', e.target.value)} />}</Field>
            <Field label="Fecha de embarque (a bordo)" error={errors.shippedAt}>{(p) => <Input {...p} type="date" value={form.shippedAt ?? ''} onChange={(e) => set('shippedAt', e.target.value)} />}</Field>
            <Field label="Cantidad embarcada (t)" error={errors.shippedQuantityT} hint={locked ? 'Ya generó movimientos de stock' : `Comprometido: ${fmtTons(op.quantityT)}`}>{(p) => <Input {...p} disabled={locked} inputMode="decimal" value={form.shippedQuantityT ?? ''} onChange={(e) => set('shippedQuantityT', e.target.value)} />}</Field>
            <Field label="Bultos">{(p) => <Input {...p} inputMode="numeric" value={form.packages ?? ''} onChange={(e) => set('packages', e.target.value ? Number(e.target.value) : null)} />}</Field>
            <Field label="Peso bruto (kg)" error={errors.grossWeightKg}>{(p) => <Input {...p} inputMode="decimal" value={form.grossWeightKg ?? ''} onChange={(e) => set('grossWeightKg', e.target.value)} />}</Field>
            <Field label="B/L">{(p) => <Input {...p} value={form.blNumber ?? ''} onChange={(e) => set('blNumber', e.target.value)} />}</Field>
            <Field label="Permiso de embarque" className="sm:col-span-2">{(p) => <Input {...p} value={form.exportPermitNumber ?? ''} onChange={(e) => set('exportPermitNumber', e.target.value)} />}</Field>
            <Field label="Fecha de recepción en destino">{(p) => <Input {...p} type="date" value={form.receivedAt ?? ''} onChange={(e) => set('receivedAt', e.target.value)} />}</Field>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><p className="text-xs font-medium text-slate-700">Contenedores</p><Button size="sm" variant="secondary" onClick={() => set('containers', [...containers, { number: '', seal: '', grossKg: '', vgmKg: '' }])}><Plus /> Contenedor</Button></div>
            {containers.map((c, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
                <Input aria-label="Número" placeholder="ABCU1234567" value={c.number} onChange={(e) => set('containers', containers.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
                <Input aria-label="Precinto" placeholder="Precinto" value={c.seal ?? ''} onChange={(e) => set('containers', containers.map((x, j) => (j === i ? { ...x, seal: e.target.value } : x)))} />
                <Input aria-label="Peso bruto" placeholder="Bruto kg" value={c.grossKg ?? ''} onChange={(e) => set('containers', containers.map((x, j) => (j === i ? { ...x, grossKg: e.target.value } : x)))} />
                <Input aria-label="VGM" placeholder="VGM kg" value={c.vgmKg ?? ''} onChange={(e) => set('containers', containers.map((x, j) => (j === i ? { ...x, vgmKg: e.target.value } : x)))} />
                <Button size="icon" variant="ghost" aria-label="Quitar contenedor" onClick={() => set('containers', containers.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
            {errors.containers ? <p className="text-xs text-red-600">Revisar números de contenedor (mínimo 4 caracteres).</p> : null}
          </div>
          <Field label="Observaciones">{(p) => <Textarea {...p} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ShipmentPanel({ operationId }: { operationId: string }) {
  const db = useDb();
  const user = useCurrentUser();
  const [editing, setEditing] = useState<Shipment | 'new' | null>(null);
  const op = byId(db.operations, operationId)!;
  const shipments = db.shipments.filter((s) => s.operationId === operationId);
  const manage = can(user, 'operation.manage') && op.sellerOrganizationId === user.organizationId;
  return (
    <div className="space-y-4">
      {op.status === 'negotiation' ? <Alert tone="info">El embarque se planifica cuando el comprador acepta la cotización.</Alert> : null}
      {shipments.length === 0 && op.status !== 'negotiation' ? (
        <Card><CardContent className="flex items-center justify-between"><p className="text-sm text-slate-600">Sin embarque registrado.</p>{manage ? <Button onClick={() => setEditing('new')}><Plus /> Planificar embarque</Button> : null}</CardContent></Card>
      ) : null}
      {shipments.map((s) => {
        const ct = byId(db.containerTypes, s.containerTypeId);
        const stepIndex = FLOW.indexOf(s.status);
        return (
          <Card key={s.id}>
            <CardHeader title={`Embarque ${s.blNumber ? `· B/L ${s.blNumber}` : ''}`} description={`${portName(db, s.portOfLoadingId)} → ${portName(db, s.portOfDischargeId)}`} icon={<Container />} actions={<><ShipmentStatusBadge status={s.status} />{manage ? <Button size="sm" variant="secondary" onClick={() => setEditing(s)}><Pencil /> Actualizar</Button> : null}</>} />
            <CardContent className="space-y-4">
              <ol className="grid grid-cols-4 gap-2">
                {FLOW.map((step, i) => (
                  <li key={step} className={`rounded-md border px-2 py-1.5 text-center text-xs ${i <= stepIndex ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-800' : 'border-slate-200 text-slate-500'}`}>{SHIPMENT_STATUS[step]}</li>
                ))}
              </ol>
              <KeyValue
                columns={4}
                items={[
                  { label: 'Planificado', value: fmtDate(s.plannedDate) },
                  { label: 'Despachado', value: fmtDate(s.dispatchedAt) },
                  { label: 'Embarcado', value: fmtDate(s.shippedAt) },
                  { label: 'Recibido', value: fmtDate(s.receivedAt) },
                  { label: 'Cantidad embarcada', value: s.shippedQuantityT ? fmtTons(s.shippedQuantityT) : '—' },
                  { label: 'Bultos / peso bruto', value: `${s.packages ? fmtNum(s.packages, 0) : '—'} · ${s.grossWeightKg ? `${fmtNum(s.grossWeightKg, 0)} kg` : '—'}` },
                  { label: 'Buque / viaje', value: `${s.vessel ?? '—'} ${s.voyage ?? ''}` },
                  { label: 'Booking', value: s.bookingNumber ?? '—' },
                  { label: 'Permiso de embarque', value: s.exportPermitNumber ?? '—' },
                  { label: 'Equipo', value: ct?.name ?? '—' },
                ]}
              />
              {s.containers.length ? (
                <Table>
                  <THead><TR><TH>Contenedor</TH><TH>Precinto</TH><TH className="text-right">Bruto</TH><TH className="text-right">VGM</TH></TR></THead>
                  <TBody>{s.containers.map((c) => <TR key={c.number}><TD className="mono">{c.number}</TD><TD className="text-xs">{c.seal ?? '—'}</TD><TD className="num text-right text-xs">{c.grossKg ? `${fmtNum(c.grossKg, 0)} kg` : '—'}</TD><TD className="num text-right text-xs">{c.vgmKg ? `${fmtNum(c.vgmKg, 0)} kg` : '—'}</TD></TR>)}</TBody>
                </Table>
              ) : null}
              {s.shippedQuantityT && op.quantityT !== s.shippedQuantityT ? <Alert tone="warning">Embarcado {fmtTons(s.shippedQuantityT)} frente a {fmtTons(op.quantityT)} pactadas: la conciliación lo marca para revisión.</Alert> : null}
            </CardContent>
          </Card>
        );
      })}
      {editing ? <ShipmentDialog operationId={operationId} shipment={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
