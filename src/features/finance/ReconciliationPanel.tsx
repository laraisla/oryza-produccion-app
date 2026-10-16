import { FileUp, Landmark, Plug, Plus, Scale } from 'lucide-react';
import { useRef, useState } from 'react';
import { ReconciliationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, KeyValue, StatCard } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can, canViewFinance } from '@/data/access';
import { byId } from '@/data/derive';
import type { Payment } from '@/data/model';
import { fieldErrors, invoiceSchema, paymentSchema, type InvoiceInput, type PaymentInput } from '@/data/schemas';
import { attachPaymentEvidence, markReconciled, registerInvoice, registerPayment } from '@/data/services/operations';
import { todayISO, useApp, useCurrentUser, useDb } from '@/data/store';
import { BANK_REPORT_STATUS, PAYMENT_METHODS, type BankReportStatus } from '@/domain/catalogs';
import { dec, isDecimalString, toPlain } from '@/domain/decimal';
import { fmtDate, fmtMoney, fmtTons } from '@/domain/format';
import { RECONCILIATION_DISCLAIMER } from '@/domain/reconciliation';
import { useUploader } from '../documents/DocumentChecklist';

const DIFF_TONE = { explained: 'success', needs_evidence: 'warning', to_review: 'danger', informative: 'info' } as const;
const DIFF_LABEL = { explained: 'Explicada con respaldo', needs_evidence: 'Requiere comprobante', to_review: 'A revisar', informative: 'Informativa' };

function InvoiceDialog({ operationId, onClose }: { operationId: string; onClose: () => void }) {
  const db = useDb();
  const run = useApp((s) => s.run);
  const op = byId(db.operations, operationId)!;
  const shipped = db.shipments.find((s) => s.operationId === operationId && s.shippedQuantityT);
  const qty = shipped?.shippedQuantityT ?? op.quantityT;
  const [form, setForm] = useState<InvoiceInput>({ number: '', issueDate: todayISO(), currency: op.currency, amount: toPlain(dec(qty).times(op.pricePerT)), quantityT: qty, exportPermitNumber: shipped?.exportPermitNumber ?? '' });
  const [touched, setTouched] = useState(false);
  const errors = touched ? fieldErrors(invoiceSchema, form) : {};
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Registrar factura" description="Importe sugerido: cantidad embarcada × precio pactado." footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => { setTouched(true); if (Object.keys(fieldErrors(invoiceSchema, form)).length) return; if (run((d, ctx) => registerInvoice(d, ctx, operationId, form), 'Factura registrada')) onClose(); }}>Registrar</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Número de factura" required error={errors.number}>{(p) => <Input {...p} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="E-0001-00000000" />}</Field>
          <Field label="Fecha de emisión" required error={errors.issueDate}>{(p) => <Input {...p} type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />}</Field>
          <Field label={`Importe (${form.currency})`} required error={errors.amount}>{(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field>
          <Field label="Cantidad facturada (t)" required error={errors.quantityT}>{(p) => <Input {...p} inputMode="decimal" value={form.quantityT} onChange={(e) => setForm({ ...form, quantityT: e.target.value })} />}</Field>
          <Field label="Permiso de embarque" className="sm:col-span-2">{(p) => <Input {...p} value={form.exportPermitNumber ?? ''} onChange={(e) => setForm({ ...form, exportPermitNumber: e.target.value })} />}</Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ operationId, onClose }: { operationId: string; onClose: () => void }) {
  const db = useDb();
  const run = useApp((s) => s.run);
  const op = byId(db.operations, operationId)!;
  const invoices = db.invoices.filter((i) => i.operationId === operationId);
  const [form, setForm] = useState<PaymentInput>({ reference: '', receivedDate: todayISO(), currency: op.currency, grossAmount: '', foreignBankFees: '0', localBankFees: '0', otherDeductions: '0', netAmount: '', isAdvance: false, bankName: '', bankReportStatus: 'informed_by_user', invoiceId: invoices[0]?.id ?? null, allocatedAmount: '', notes: '' });
  const [autoNet, setAutoNet] = useState(true);
  const [touched, setTouched] = useState(false);
  const computedNet = [form.grossAmount, form.foreignBankFees, form.localBankFees, form.otherDeductions].every((v) => isDecimalString(v ?? ''))
    ? toPlain(dec(form.grossAmount).minus(dec(form.foreignBankFees)).minus(dec(form.localBankFees)).minus(dec(form.otherDeductions)))
    : '';
  const value = autoNet ? { ...form, netAmount: computedNet } : form;
  const errors = touched ? fieldErrors(paymentSchema, value) : {};
  const set = <K extends keyof PaymentInput>(k: K, v: PaymentInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" title="Registrar cobro (informativo)" description="Se registra la información que informa el banco o el usuario. No se ejecuta ninguna operación bancaria ni cambiaria." footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => { setTouched(true); if (Object.keys(fieldErrors(paymentSchema, value)).length) return; if (run((d, ctx) => registerPayment(d, ctx, operationId, value), 'Cobro registrado y conciliación recalculada')) onClose(); }}>Registrar</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Referencia bancaria" required error={errors.reference}>{(p) => <Input {...p} value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="MT103 / aviso de crédito" />}</Field>
          <Field label="Fecha de acreditación" required>{(p) => <Input {...p} type="date" value={form.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} />}</Field>
          <Field label="Banco">{(p) => <Input {...p} value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} />}</Field>
          <Field label={`Cobro bruto (${form.currency})`} required error={errors.grossAmount}>{(p) => <Input {...p} inputMode="decimal" value={form.grossAmount} onChange={(e) => set('grossAmount', e.target.value)} />}</Field>
          <Field label="Comisiones del exterior" error={errors.foreignBankFees}>{(p) => <Input {...p} inputMode="decimal" value={form.foreignBankFees} onChange={(e) => set('foreignBankFees', e.target.value)} />}</Field>
          <Field label="Comisiones locales" error={errors.localBankFees}>{(p) => <Input {...p} inputMode="decimal" value={form.localBankFees} onChange={(e) => set('localBankFees', e.target.value)} />}</Field>
          <Field label="Otras deducciones documentadas" error={errors.otherDeductions}>{(p) => <Input {...p} inputMode="decimal" value={form.otherDeductions} onChange={(e) => set('otherDeductions', e.target.value)} />}</Field>
          <Field label="Cobro neto acreditado" required error={errors.netAmount} hint={autoNet ? 'Calculado: bruto − comisiones − deducciones' : 'Ingresado manualmente'}>{(p) => <Input {...p} inputMode="decimal" disabled={autoNet} value={value.netAmount} onChange={(e) => set('netAmount', e.target.value)} />}</Field>
          <div className="sm:pt-6"><Checkbox checked={!autoNet} onChange={(v) => { setAutoNet(!v); if (v) set('netAmount', computedNet); }} label="Ingresar neto manualmente" /></div>
          <Field label="Imputar a factura">{(p) => <Select {...p} value={form.invoiceId ?? ''} onChange={(e) => set('invoiceId', e.target.value || null)}><option value="">Sin imputar</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {fmtMoney(i.amount, i.currency)}</option>)}</Select>}</Field>
          <Field label="Importe imputado" hint="Vacío = bruto completo">{(p) => <Input {...p} inputMode="decimal" value={form.allocatedAmount ?? ''} onChange={(e) => set('allocatedAmount', e.target.value)} />}</Field>
          <Field label="Estado informado por la entidad">{(p) => <Select {...p} value={form.bankReportStatus} onChange={(e) => set('bankReportStatus', e.target.value as BankReportStatus)}>{Object.entries(BANK_REPORT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <div className="sm:pt-6"><Checkbox checked={form.isAdvance} onChange={(v) => set('isAdvance', v)} label="Es un anticipo" /></div>
          <Field label="Observaciones" className="sm:col-span-3">{(p) => <Textarea {...p} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReconciliationPanel({ operationId }: { operationId: string }) {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const upload = useUploader();
  const op = byId(db.operations, operationId)!;
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [evidenceFor, setEvidenceFor] = useState<Payment | null>(null);
  if (!canViewFinance(user, op)) {
    return <Alert tone="info" title="Información financiera privada">Solo el responsable COMEX o finanzas del vendedor accede a facturación, cobros y conciliación.</Alert>;
  }
  const rec = db.reconciliations.find((r) => r.operationId === operationId);
  const r = rec?.lastResult;
  const invoices = db.invoices.filter((i) => i.operationId === operationId);
  const payments = db.payments.filter((p) => p.operationId === operationId);
  const version = byId(db.quotationVersions, op.acceptedVersionId);
  const manage = can(user, 'finance.manage');
  const bankDoc = db.documents.find((d) => d.operationId === operationId && d.documentType === 'bank_document');
  const cur = op.currency;
  const advancePct = version?.scenario.finance.advancePct ?? '0';
  const advance = dec(op.totalAmount).times(dec(advancePct)).div(100);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">{rec ? <ReconciliationBadge status={rec.status} /> : null}{rec?.reconciledAt ? <span className="text-xs text-slate-500">Conciliado el {fmtDate(rec.reconciledAt)}: {rec.operatorNote}</span> : null}</div>
        {manage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setInvoiceOpen(true)}><Plus /> Registrar factura</Button>
            <Button variant="secondary" onClick={() => setPaymentOpen(true)}><Plus /> Registrar cobro</Button>
            <Button disabled={!r?.readyToReconcile || rec?.status === 'reconciled_by_operator'} onClick={() => setReconcileOpen(true)}><Scale /> Marcar conciliado</Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Facturado" value={fmtMoney(r?.invoiced ?? '0', cur)} hint={`${fmtTons(r?.invoicedQuantityT ?? '0')}`} />
        <StatCard label="Valor embarcado" value={fmtMoney(r?.shippedValue ?? '0', cur)} hint={`${fmtTons(r?.shippedQuantityT ?? '0')} × ${fmtMoney(op.pricePerT, cur)}`} />
        <StatCard label="Cobrado bruto" value={fmtMoney(r?.grossCollected ?? '0', cur)} />
        <StatCard label="Cobrado neto" value={fmtMoney(r?.netCollected ?? '0', cur)} hint={`Comisiones ${fmtMoney(dec(r?.foreignFees ?? 0).plus(dec(r?.localFees ?? 0)).toFixed(2), cur)}`} tone={r && dec(r.netCollected).lt(dec(r.invoiced)) ? 'warning' : 'success'} />
        <StatCard label="Saldo pendiente" value={fmtMoney(r?.pendingBalance ?? op.totalAmount, cur)} tone={r && dec(r.pendingBalance).gt(0) ? 'warning' : 'neutral'} />
      </div>

      <Card>
        <CardHeader title="Diferencias detectadas" description="Cada diferencia indica su causa probable y el respaldo necesario" icon={<Scale />} />
        <CardContent className="space-y-3">
          <Alert tone="info">{RECONCILIATION_DISCLAIMER}</Alert>
          {!r || r.differences.length === 0 ? (
            <p className="text-sm text-slate-500">{r ? 'Sin diferencias entre lo facturado, embarcado y cobrado.' : 'Sin datos de facturación ni cobro.'}</p>
          ) : (
            <Table>
              <THead><TR><TH>Diferencia</TH><TH className="text-right">Importe</TH><TH>Causa probable</TH><TH>Respaldo requerido</TH><TH>Estado</TH></TR></THead>
              <TBody>
                {r.differences.map((d) => (
                  <TR key={`${d.kind}-${d.paymentId ?? ''}`}>
                    <TD className="font-medium">{d.label}</TD>
                    <TD className="num text-right">{fmtMoney(d.amount, cur)}</TD>
                    <TD className="max-w-[280px] text-xs">{d.probableCause}</TD>
                    <TD className="max-w-[260px] text-xs">{d.requiredEvidence ?? '—'}</TD>
                    <TD><Badge tone={DIFF_TONE[d.status]}>{DIFF_LABEL[d.status]}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Facturas" />
          <Table>
            <THead><TR><TH>Número</TH><TH>Fecha</TH><TH className="text-right">Cantidad</TH><TH className="text-right">Importe</TH><TH>Permiso</TH></TR></THead>
            <TBody>
              {invoices.map((i) => <TR key={i.id}><TD className="mono text-xs">{i.number}</TD><TD className="text-xs">{fmtDate(i.issueDate)}</TD><TD className="num text-right text-xs">{fmtTons(i.quantityT)}</TD><TD className="num text-right">{fmtMoney(i.amount, i.currency)}</TD><TD className="text-xs">{i.exportPermitNumber ?? '—'}</TD></TR>)}
            </TBody>
          </Table>
          {invoices.length === 0 ? <p className="p-4 text-sm text-slate-500">Sin facturas.</p> : null}
        </Card>
        <Card>
          <CardHeader title="Cobros registrados" description="Registros informativos: no son operaciones bancarias" />
          <Table>
            <THead><TR><TH>Referencia</TH><TH className="text-right">Bruto</TH><TH className="text-right">Comisiones</TH><TH className="text-right">Neto</TH><TH>Respaldo</TH></TR></THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD className="text-xs"><span className="mono">{p.reference}</span><br />{fmtDate(p.receivedDate)} · {BANK_REPORT_STATUS[p.bankReportStatus]}{p.isAdvance ? ' · anticipo' : ''}</TD>
                  <TD className="num text-right text-xs">{fmtMoney(p.grossAmount, p.currency)}</TD>
                  <TD className="num text-right text-xs">{fmtMoney(dec(p.foreignBankFees).plus(p.localBankFees).plus(p.otherDeductions).toFixed(2), p.currency)}</TD>
                  <TD className="num text-right text-xs font-medium">{fmtMoney(p.netAmount, p.currency)}</TD>
                  <TD>
                    {p.evidenceDocumentIds.length ? <Badge tone="success">{p.evidenceDocumentIds.length} comprobante(s)</Badge> : manage && bankDoc ? (
                      <Button size="sm" variant="secondary" onClick={() => { setEvidenceFor(p); fileInput.current?.click(); }}><FileUp /> Adjuntar comprobante</Button>
                    ) : <Badge tone="warning">Sin comprobante</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {payments.length === 0 ? <p className="p-4 text-sm text-slate-500">Sin cobros registrados.</p> : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Planificación financiera pactada" description="Tomada de la versión aceptada de la cotización" icon={<Landmark />} />
          <CardContent>
            <KeyValue
              columns={2}
              items={[
                { label: 'Forma de pago', value: PAYMENT_METHODS[op.paymentMethod] },
                { label: 'Condición', value: op.paymentTerms },
                { label: 'Banco', value: version?.scenario.finance.bank || '—' },
                { label: 'Fecha prevista de cobro', value: fmtDate(version?.scenario.finance.expectedCollectionDate) },
                { label: 'Anticipo previsto', value: `${fmtMoney(advance.toFixed(2), cur)} (${advancePct} %)` },
                { label: 'Saldo previsto', value: fmtMoney(dec(op.totalAmount).minus(advance).toFixed(2), cur) },
                { label: 'Comisiones previstas (vendedor)', value: version ? fmtMoney(version.result.commissionsTotal, cur) : '—' },
                { label: 'Resultado comercial esperado', value: version ? fmtMoney(version.result.marginAbs, cur) : '—' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Integraciones autorizadas" description="Estructura preparada; ninguna conexión está simulada" icon={<Plug />} />
          <CardContent className="space-y-2 text-sm">
            {[
              ['WebCOMEX (canales bancarios de comercio exterior)', 'No conectado: requiere convenio y API autorizada por el banco.'],
              ['SECOEXPO (seguimiento de cobros de exportación, BCRA)', 'No conectado: la información la gestionan organismos y entidades financieras.'],
              ['Extractos bancarios (CSV / API)', 'Carga manual por ahora; conector futuro con autorización.'],
            ].map(([name, status]) => (
              <div key={name} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                <div><p className="font-medium text-slate-800">{name}</p><p className="text-xs text-slate-500">{status}</p></div>
                <Badge>No disponible</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <input ref={fileInput} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.csv,.txt" onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !evidenceFor || !bankDoc) return;
        const uploaded = await upload(bankDoc, file, `Comprobante del cobro ${evidenceFor.reference}`);
        if (uploaded) run((d, ctx) => attachPaymentEvidence(d, ctx, evidenceFor.id, bankDoc.id), 'Comprobante vinculado al cobro');
        setEvidenceFor(null);
      }} />
      {invoiceOpen ? <InvoiceDialog operationId={operationId} onClose={() => setInvoiceOpen(false)} /> : null}
      {paymentOpen ? <PaymentDialog operationId={operationId} onClose={() => setPaymentOpen(false)} /> : null}
      {reconcileOpen ? (
        <Dialog open onOpenChange={setReconcileOpen}>
          <DialogContent title="Confirmar conciliación" description="El operador confirma que cada diferencia tiene causa identificada y respaldo." footer={<><Button variant="secondary" onClick={() => setReconcileOpen(false)}>Cancelar</Button><Button disabled={!note.trim()} onClick={() => { if (run((d, ctx) => markReconciled(d, ctx, operationId, note), 'Operación conciliada por el operador')) setReconcileOpen(false); }}>Confirmar</Button></>}>
            <Field label="Nota del operador" required>{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: comisión del exterior respaldada con aviso de crédito; tratamiento verificado con el banco." />}</Field>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
