import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { PayerBadge, VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Tooltip } from '@/components/ui/misc';
import { lineFromCatalog } from '@/data/services/scenarios';
import { useCurrentUser, useDb } from '@/data/store';
import { INCOTERMS, PARTIES, TRANSPORT_MODES, VERIFICATION_STATUS, type Incoterm, type Party, type TransportMode, type VerificationStatus } from '@/domain/catalogs';
import { COST_STAGES, COST_UNITS, PERCENT_BASES, type CostLineInput, type CostStage, type CostUnit, type DayTier, type PercentBase } from '@/domain/costing';
import { isDecimalString } from '@/domain/decimal';
import { fmtDate, fmtMoney, fmtNum } from '@/domain/format';
import { COST_POINTS, type CostPoint } from '@/domain/incoterms';
import { CURRENCIES, type Currency } from '@/domain/units';
import type { ScenarioDraft } from '../useScenarioDraft';

const UNIT_SHORT: Record<CostUnit, string> = {
  per_ton: '/ t',
  per_container: '/ contenedor',
  per_operation: '/ operación',
  per_day: '/ día',
  per_unit: '/ unidad',
  percent: '%',
};

export function describeAmount(line: CostLineInput): string {
  if (line.unit === 'percent') return `${fmtNum(line.amount, 4)} % de ${PERCENT_BASES[line.percentBase ?? 'sale_value'].toLowerCase()}`;
  if (line.unit === 'per_day' && line.tiers?.length) return `Tramos por día (${line.tiers.length})`;
  return `${line.currency} ${fmtNum(line.amount, 4)} ${UNIT_SHORT[line.unit]}`;
}

function LineDialog({
  line,
  lines,
  onSave,
  onClose,
}: {
  line: CostLineInput;
  lines: CostLineInput[];
  onSave: (line: CostLineInput) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CostLineInput>(line);
  const set = <K extends keyof CostLineInput>(k: K, v: CostLineInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const amountError = !isDecimalString(form.amount) ? 'Importe numérico (punto decimal)' : undefined;
  const qtyError = form.quantity && !isDecimalString(form.quantity) ? 'Cantidad numérica' : undefined;
  const tiers = form.tiers ?? [];
  const canVerify = Boolean(form.sourceUrl?.trim());
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        size="lg"
        title={line.name ? `Concepto: ${line.name}` : 'Nuevo concepto de costo'}
        description="Cada concepto conserva proveedor, fuente, fecha, vencimiento y estado de verificación."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button disabled={Boolean(amountError || qtyError || !form.name.trim())} onClick={() => onSave(form)}>Guardar concepto</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nombre" required error={!form.name.trim() ? 'Requerido' : undefined} className="sm:col-span-2">
              {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} />}
            </Field>
            <Field label="Proveedor">{(p) => <Input {...p} value={form.provider ?? ''} onChange={(e) => set('provider', e.target.value)} />}</Field>
            <Field label="Categoría">
              {(p) => <Select {...p} value={form.stage} onChange={(e) => set('stage', e.target.value as CostStage)}>{Object.entries(COST_STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
            </Field>
            <Field label="Punto de la cadena" hint="Define quién paga según el Incoterm">
              {(p) => <Select {...p} value={form.point} onChange={(e) => set('point', e.target.value as CostPoint)}>{Object.entries(COST_POINTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
            </Field>
            <Field label="Unidad de cálculo">
              {(p) => <Select {...p} value={form.unit} onChange={(e) => set('unit', e.target.value as CostUnit)}>{Object.entries(COST_UNITS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
            </Field>
            <Field label={form.unit === 'percent' ? 'Porcentaje (%)' : form.unit === 'per_day' && tiers.length ? 'Importe por día (sin tramos)' : 'Importe unitario'} error={amountError}>
              {(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} />}
            </Field>
            {form.unit !== 'percent' ? (
              <Field label="Moneda">
                {(p) => <Select {...p} value={form.currency} onChange={(e) => set('currency', e.target.value as Currency)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>}
              </Field>
            ) : (
              <Field label="Base del porcentaje">
                {(p) => <Select {...p} value={form.percentBase ?? 'sale_value'} onChange={(e) => set('percentBase', e.target.value as PercentBase)}>{Object.entries(PERCENT_BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
              </Field>
            )}
            {form.unit === 'percent' && form.percentBase === 'custom_amount' ? (
              <Field label="Importe base">{(p) => <Input {...p} inputMode="decimal" value={form.customBaseAmount ?? ''} onChange={(e) => set('customBaseAmount', e.target.value)} />}</Field>
            ) : null}
            {form.unit !== 'percent' ? (
              <Field label={form.unit === 'per_day' ? 'Días totales' : 'Cantidad'} hint={form.unit === 'per_day' ? 'Requerido' : 'Vacío = automática según la operación'} error={qtyError}>
                {(p) => <Input {...p} inputMode="decimal" placeholder="auto" value={form.quantity ?? ''} onChange={(e) => set('quantity', e.target.value || null)} />}
              </Field>
            ) : null}
            {form.unit === 'per_ton' ? (
              <Field label="Base de toneladas">
                {(p) => <Select {...p} value={form.tonBasis ?? 'net'} onChange={(e) => set('tonBasis', e.target.value as 'net' | 'gross')}><option value="net">Netas</option><option value="gross">Brutas</option></Select>}
              </Field>
            ) : null}
            {form.unit === 'per_unit' ? (
              <Field label="Unidad">
                {(p) => <Select {...p} value={form.unitBasis ?? 'package'} onChange={(e) => set('unitBasis', e.target.value as 'package' | 'pallet' | 'custom')}><option value="package">Envases</option><option value="pallet">Pallets</option><option value="custom">Otra (cantidad manual)</option></Select>}
              </Field>
            ) : null}
            {form.unit === 'per_day' ? (
              <>
                <Field label="Días libres">{(p) => <Input {...p} inputMode="numeric" value={form.freeDays ?? 0} onChange={(e) => set('freeDays', Math.max(0, Number(e.target.value) || 0))} />}</Field>
                <div className="sm:pt-6"><Checkbox checked={Boolean(form.multiplyByContainers)} onChange={(v) => set('multiplyByContainers', v)} label="Por contenedor" /></div>
              </>
            ) : null}
          </div>

          {form.unit === 'per_day' ? (
            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-700">Tramos de tarifa por día (posteriores a los días libres)</p>
                <Button size="sm" variant="secondary" onClick={() => set('tiers', [...tiers, { fromDay: (tiers.at(-1)?.toDay ?? 0) + 1, toDay: null, amountPerDay: '0' }])}><Plus /> Tramo</Button>
              </div>
              {tiers.map((t, i) => {
                const upd = (patch: Partial<DayTier>) => set('tiers', tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <Input aria-label="Desde día" inputMode="numeric" value={t.fromDay} onChange={(e) => upd({ fromDay: Number(e.target.value) || 1 })} />
                    <Input aria-label="Hasta día" inputMode="numeric" placeholder="sin tope" value={t.toDay ?? ''} onChange={(e) => upd({ toDay: e.target.value ? Number(e.target.value) : null })} />
                    <Input aria-label="Importe por día" inputMode="decimal" value={t.amountPerDay} onChange={(e) => upd({ amountPerDay: e.target.value })} />
                    <Button size="icon" variant="ghost" aria-label="Quitar tramo" onClick={() => set('tiers', tiers.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Responsable del pago" hint="Automático aplica la regla del Incoterm">
              {(p) => <Select {...p} value={form.payerOverride ?? ''} onChange={(e) => set('payerOverride', (e.target.value || null) as Party | null)}><option value="">Automático (Incoterm)</option>{Object.entries(PARTIES).map(([k, v]) => <option key={k} value={k}>Pactado: {v}</option>)}</Select>}
            </Field>
            {form.payerOverride ? (
              <Field label="Fundamento del pacto" className="sm:col-span-2">{(p) => <Input {...p} value={form.overrideNote ?? ''} onChange={(e) => set('overrideNote', e.target.value)} placeholder="Cláusula o acuerdo que lo respalda" />}</Field>
            ) : null}
            <Field label="Incluido en otro cargo" hint="Evita sumarlo dos veces">
              {(p) => <Select {...p} value={form.includedInLineId ?? ''} onChange={(e) => set('includedInLineId', e.target.value || null)}><option value="">No (se suma)</option>{lines.filter((l) => l.id !== form.id).map((l) => <option key={l.id} value={l.id}>Incluido en: {l.name}</option>)}</Select>}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-700">Aplica solo a modos de transporte</p>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(TRANSPORT_MODES) as TransportMode[]).map((m) => (
                  <Checkbox key={m} label={TRANSPORT_MODES[m]} checked={Boolean(form.appliesTo?.transportModes?.includes(m))} onChange={(v) => set('appliesTo', { ...form.appliesTo, transportModes: v ? [...(form.appliesTo?.transportModes ?? []), m] : (form.appliesTo?.transportModes ?? []).filter((x) => x !== m) })} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-700">Aplica solo con Incoterms</p>
              <div className="flex flex-wrap gap-3">
                {INCOTERMS.map((i: Incoterm) => (
                  <Checkbox key={i} label={i} checked={Boolean(form.appliesTo?.incoterms?.includes(i))} onChange={(v) => set('appliesTo', { ...form.appliesTo, incoterms: v ? [...(form.appliesTo?.incoterms ?? []), i] : (form.appliesTo?.incoterms ?? []).filter((x) => x !== i) })} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Fuente" required error={!form.source.trim() ? 'Indicar la fuente' : undefined} className="sm:col-span-2">{(p) => <Input {...p} value={form.source} onChange={(e) => set('source', e.target.value)} />}</Field>
            <Field label="Estado de verificación" hint={canVerify ? undefined : 'Verificado requiere URL o documento'}>
              {(p) => <Select {...p} value={form.verificationStatus} onChange={(e) => set('verificationStatus', e.target.value as VerificationStatus)}>{(['estimated', 'quoted', 'pending', 'verified'] as VerificationStatus[]).map((k) => <option key={k} value={k} disabled={k === 'verified' && !canVerify}>{VERIFICATION_STATUS[k]}</option>)}</Select>}
            </Field>
            <Field label="URL o documento de respaldo" className="sm:col-span-2">{(p) => <Input {...p} value={form.sourceUrl ?? ''} onChange={(e) => set('sourceUrl', e.target.value)} />}</Field>
            <div className="sm:pt-6"><Checkbox checked={Boolean(form.required)} onChange={(v) => set('required', v)} label="Tarifa crítica requerida" /></div>
            <Field label="Fecha de tarifa">{(p) => <Input {...p} type="date" value={form.rateDate ?? ''} onChange={(e) => set('rateDate', e.target.value || null)} />}</Field>
            <Field label="Vencimiento">{(p) => <Input {...p} type="date" value={form.validUntil ?? ''} onChange={(e) => set('validUntil', e.target.value || null)} />}</Field>
            <Field label="Observaciones">{(p) => <Textarea {...p} className="min-h-[38px]" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_OPEN: CostStage[] = ['origin', 'port', 'international'];

export function CostLinesSection({ draft, stages, title }: { draft: ScenarioDraft; stages?: CostStage[]; title?: string }) {
  const db = useDb();
  const user = useCurrentUser();
  const { scenario: s, update, evaluation } = draft;
  const [open, setOpen] = useState<Set<CostStage>>(new Set(DEFAULT_OPEN));
  const [editing, setEditing] = useState<CostLineInput | null>(null);
  const [adding, setAdding] = useState(false);
  const shownStages = stages ?? (Object.keys(COST_STAGES) as CostStage[]);
  const results = new Map(evaluation.result.lines.map((l) => [l.id, l]));
  const catalog = db.costCatalog.filter((c) => c.organizationId === user.organizationId && !s.lines.some((l) => l.catalogId === c.key));
  const currency = s.commercial.currency;

  const saveLine = (line: CostLineInput) => {
    const exists = s.lines.some((l) => l.id === line.id);
    update({ lines: exists ? s.lines.map((l) => (l.id === line.id ? line : l)) : [...s.lines, line] });
    setEditing(null);
  };

  return (
    <Card>
      <CardHeader
        title={title ?? 'Logística y costos'}
        description="Separá tarifas estimadas de cotizaciones reales; los conceptos incluidos en otra tarifa no se suman dos veces"
        icon={<Truck />}
        actions={<Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus /> Agregar concepto</Button>}
      />
      {evaluation.result.duplicates.length ? (
        <CardContent className="pb-0">
          {evaluation.result.duplicates.map((d) => <Alert key={d.message} tone="warning" className="mb-2">{d.message}</Alert>)}
        </CardContent>
      ) : null}
      <div className="divide-y divide-slate-100">
        {shownStages.map((stage) => {
          const lines = s.lines.filter((l) => l.stage === stage);
          const totals = evaluation.result.stages.find((x) => x.stage === stage);
          const isOpen = open.has(stage);
          return (
            <div key={stage}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(stage)) n.delete(stage); else n.add(stage); return n; })}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {isOpen ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
                  {COST_STAGES[stage]} <Badge>{lines.length}</Badge>
                </span>
                <span className="num text-xs text-slate-600">
                  Vendedor {fmtMoney(totals?.seller ?? '0', currency)} · Comprador {fmtMoney(totals?.buyer ?? '0', currency)}
                </span>
              </button>
              {isOpen ? (
                <div className="overflow-x-auto px-2 pb-2">
                  {lines.length === 0 ? <p className="px-2 py-1 text-xs text-slate-500">Sin conceptos en esta categoría.</p> : null}
                  <table className="w-full min-w-[720px] text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((line) => {
                        const r = results.get(line.id);
                        return (
                          <tr key={line.id} className={r?.included ? '' : 'opacity-60'}>
                            <td className="w-8 px-2 py-2 align-top">
                              <input type="checkbox" aria-label={`Incluir ${line.name}`} className="mt-0.5 size-4 rounded border-slate-300 text-petrol-700" checked={line.enabled} onChange={(e) => update({ lines: s.lines.map((l) => (l.id === line.id ? { ...l, enabled: e.target.checked } : l)) })} />
                            </td>
                            <td className="px-2 py-2 align-top">
                              <p className="font-medium text-slate-800">{line.name}{line.required ? <span className="ml-1 text-red-600" title="Tarifa crítica">*</span> : null}</p>
                              <p className="text-[11px] text-slate-500">{line.provider ? `${line.provider} · ` : ''}{COST_POINTS[line.point]}</p>
                              {r && !r.included && r.exclusionReason ? <p className="text-[11px] font-medium text-amber-700">{r.exclusionReason}</p> : null}
                            </td>
                            <td className="px-2 py-2 align-top text-xs text-slate-600">{describeAmount(line)}{r?.quantity ? <><br />× {fmtNum(r.quantity, 3)}</> : null}{r?.fx ? <><br /><span className="text-slate-500">TC {r.fx.pair} {fmtNum(r.fx.rate, 4)} ({fmtDate(r.fx.date)})</span></> : null}</td>
                            <td className="num px-2 py-2 text-right align-top font-medium">{r?.included ? fmtMoney(r.amount, currency) : '—'}</td>
                            <td className="px-2 py-2 align-top">
                              {r ? <Tooltip content={r.explanation}><span className="inline-flex"><PayerBadge payer={r.payer} agreed={r.payerSource === 'agreement'} /></span></Tooltip> : null}
                            </td>
                            <td className="max-w-[230px] px-2 py-2 align-top">
                              <VerificationBadge status={r?.effectiveStatus ?? line.verificationStatus} />
                              <p className="mt-0.5 text-[11px] text-slate-500">{line.validUntil ? `Vence ${fmtDate(line.validUntil)}` : 'Sin vencimiento'}</p>
                              <p className="line-clamp-2 text-[11px] text-slate-500" title={line.source}>{line.source || <span className="text-red-600">Sin fuente</span>}</p>
                            </td>
                            <td className="w-20 px-2 py-2 text-right align-top">
                              <Button size="icon" variant="ghost" aria-label={`Editar ${line.name}`} onClick={() => setEditing(line)}><Pencil /></Button>
                              <Button size="icon" variant="ghost" aria-label={`Quitar ${line.name}`} onClick={() => update({ lines: s.lines.filter((l) => l.id !== line.id).map((l) => (l.includedInLineId === line.id ? { ...l, includedInLineId: null } : l)) })}><Trash2 /></Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {adding ? (
        <Dialog open onOpenChange={(v) => !v && setAdding(false)}>
          <DialogContent title="Agregar concepto de costo" description="Desde el catálogo de la empresa (con su fuente y estado) o un concepto nuevo." size="lg"
            footer={<Button variant="secondary" onClick={() => { setAdding(false); setEditing({ id: crypto.randomUUID(), name: '', stage: 'origin', point: 'pre_carriage', amount: '0', currency: 'USD', unit: 'per_operation', enabled: true, source: '', verificationStatus: 'estimated' }); }}><Plus /> Concepto nuevo</Button>}>
            {catalog.length === 0 ? <p className="text-sm text-slate-500">Todos los conceptos del catálogo ya están en el escenario.</p> : null}
            <ul className="divide-y divide-slate-100">
              {catalog.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    <p className="text-[11px] text-slate-500">{COST_STAGES[c.stage]} · {describeAmount({ ...c, id: c.id, enabled: true })} · {c.source}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <VerificationBadge status={c.verificationStatus} />
                    <Button size="sm" onClick={() => { update({ lines: [...s.lines, { ...lineFromCatalog(c, crypto.randomUUID()), enabled: true }] }); }}>Agregar</Button>
                  </div>
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      ) : null}
      {editing ? <LineDialog line={editing} lines={s.lines} onSave={saveLine} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}
