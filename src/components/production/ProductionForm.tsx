import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Save, Send, Wand2 } from 'lucide-react';
import type { Database, User } from '@/types/domain';
import type { RecordInput, ValidationIssue } from '@/utils/validation';
import { hasErrors, toMetricsInput } from '@/utils/validation';
import { computeMetrics, recordAllowsOvernight, resolveTargets, suggestedPallets } from '@/utils/calc';
import { validate } from '@/services/productionService';
import { SCRAP_REASONS } from '@/data/defaults';
import { addDays, shiftCrossesMidnight } from '@/utils/time';
import { fmtNum, normalize } from '@/utils/format';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Field } from '@/components/ui/Field';
import { DowntimeForm } from './DowntimeForm';
import { QualityControl } from './QualityControl';
import { MetricsPanel } from './MetricsPanel';
import { TimeInput } from './TimeInput';

interface Props {
  db: Database;
  user: User;
  initial: RecordInput;
  saving: boolean;
  /** Errores devueltos al intentar guardar (activa el resaltado de campos). */
  forceShowErrors: boolean;
  onChange?: (input: RecordInput) => void;
  onSave: (input: RecordInput, submit: boolean) => void;
  onCancel: () => void;
}

function Section({ n, title, subtitle, children, id }: { n: number; title: string; subtitle?: string; children: ReactNode; id: string }) {
  return (
    <section className="card scroll-mt-20" id={id} aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
        <span className="section-num">{n}</span>
        <div>
          <h2 id={`${id}-title`} className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="px-4 sm:px-5 py-4">{children}</div>
    </section>
  );
}

const numOrNull = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export function ProductionForm({ db, user, initial, saving, forceShowErrors, onChange, onSave, onCancel }: Props) {
  const [f, setF] = useState<RecordInput>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const palletsManual = useRef(initial.id !== undefined);

  useEffect(() => setF(initial), [initial]);
  useEffect(() => {
    if (forceShowErrors) setShowErrors(true);
  }, [forceShowErrors]);
  useEffect(() => onChange?.(f), [f, onChange]);

  const set = (patch: Partial<RecordInput>) => setF((prev) => ({ ...prev, ...patch }));

  const shift = db.shifts.find((s) => s.id === f.shiftId);
  const line = db.lines.find((l) => l.id === f.lineId);
  const targets = resolveTargets(db.settings.targets, line);
  const overnight = recordAllowsOvernight(shift);
  const metrics = useMemo(() => computeMetrics(toMetricsInput(f), shift, targets), [f, shift, targets]);
  const issues = useMemo(() => validate(db, f, 'submit'), [db, f]);
  const draftIssues = useMemo(() => validate(db, f, 'draft'), [db, f]);

  const issue = (field: string): { error?: string; warning?: string } => {
    const list = issues.filter((i) => i.field === field);
    const e = list.find((i) => i.level === 'error');
    const w = list.find((i) => i.level === 'warning');
    return { error: showErrors ? e?.message : undefined, warning: w?.message };
  };
  const invalid = (field: string) => showErrors && issues.some((i) => i.field === field && i.level === 'error');

  // ---- Productividad de carga: autocompletados ----
  const onShift = (id: string) => {
    const prev = db.shifts.find((s) => s.id === f.shiftId);
    const next = db.shifts.find((s) => s.id === id);
    const patch: Partial<RecordInput> = { shiftId: id };
    if (next && (!f.startTime || f.startTime === prev?.start)) patch.startTime = next.start;
    if (next && (!f.endTime || f.endTime === prev?.end)) patch.endTime = '';
    set(patch);
  };

  const onProduct = (id: string) => {
    const p = db.products.find((x) => x.id === id);
    const prev = db.products.find((x) => x.id === f.productId);
    const patch: Partial<RecordInput> = { productId: id };
    if (p?.defaultVarietyId && (!f.varietyId || f.varietyId === prev?.defaultVarietyId)) patch.varietyId = p.defaultVarietyId;
    set(patch);
  };

  const onPresentation = (id: string) => {
    const p = db.presentations.find((x) => x.id === id);
    if (!p) return;
    palletsManual.current = false;
    set({
      presentationId: id,
      unitWeightKg: p.unitWeightKg,
      unitsPerPallet: p.unitsPerPallet,
      pallets: f.units ? suggestedPallets(f.units, p.unitsPerPallet) : f.pallets,
    });
  };

  const onUnits = (v: number | null) => {
    const patch: Partial<RecordInput> = { units: v };
    if (!palletsManual.current && v && f.unitsPerPallet) patch.pallets = suggestedPallets(v, f.unitsPerPallet);
    set(patch);
  };

  const generateLot = () => {
    if (!f.date) return;
    const [y, m, d] = f.date.split('-');
    const prefix = `LOT-${d}${m}${y!.slice(2)}-`;
    const used = new Set(db.records.map((r) => r.lot).filter((l) => l.startsWith(prefix)));
    let n = 1;
    while (used.has(prefix + String(n).padStart(2, '0'))) n++;
    set({ lot: prefix + String(n).padStart(2, '0') });
  };

  // Lotes recientes del mismo producto: un lote suele continuar en el turno siguiente.
  const recentLots = useMemo(() => {
    const from = addDays(f.date || '2000-01-01', -3);
    const seen = new Map<string, string>();
    db.records
      .filter((r) => r.date >= from && r.date <= (f.date || '9999') && (!f.productId || r.productId === f.productId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((r) => {
        if (!seen.has(r.lot)) seen.set(r.lot, `${db.products.find((p) => p.id === r.productId)?.name ?? ''} · ${r.date}`);
      });
    return [...seen.entries()].slice(0, 12);
  }, [db.records, db.products, f.date, f.productId]);

  const pastReasons = useMemo(() => {
    const m = new Map<string, string[]>();
    db.records.slice(-300).forEach((r) =>
      r.downtimes.forEach((d) => {
        if (!d.reason) return;
        const l = m.get(d.categoryId) ?? [];
        if (!l.some((x) => normalize(x) === normalize(d.reason))) l.push(d.reason);
        m.set(d.categoryId, l);
      }),
    );
    return m;
  }, [db.records]);

  const operators = db.users.filter((u) => u.active);
  const canPickOperator = user.role !== 'operator';

  const trySave = (submit: boolean) => {
    const list = submit ? issues : draftIssues;
    if (hasErrors(list)) {
      setShowErrors(true);
      const first = list.find((i) => i.level === 'error')!;
      const el = document.getElementById(fieldAnchor(first.field));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onSave(f, submit); // el padre muestra el mensaje amigable (validación del servicio)
      return;
    }
    onSave(f, submit);
  };

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning');

  const scrapPct = metrics.scrapPct;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5 pb-28 xl:pb-0">
        {/* 1. Información general */}
        <Section n={1} id="sec-general" title="Información general" subtitle="Fecha, turno, responsable y línea">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha" htmlFor="f-date" required {...issue('date')}>
              <input id="f-date" type="date" className={`input ${invalid('date') ? 'input-error' : ''}`} value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label="Operador responsable" htmlFor="f-operator" required {...issue('operatorId')}>
              <select
                id="f-operator"
                className="input"
                value={f.operatorId}
                disabled={!canPickOperator}
                onChange={(e) => set({ operatorId: e.target.value })}
              >
                {operators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Turno" required className="sm:col-span-2" {...issue('shiftId')}>
              <div id="f-shiftId">
                <ChipSelect
                  ariaLabel="Turno"
                  cols="grid-cols-3"
                  invalid={invalid('shiftId')}
                  value={f.shiftId}
                  onChange={onShift}
                  options={db.shifts.filter((s) => s.active || s.id === f.shiftId).map((s) => ({ value: s.id, label: s.name, sub: `${s.start} – ${s.end}` }))}
                />
              </div>
            </Field>
            <Field label="Línea de producción" required className="sm:col-span-2" {...issue('lineId')}>
              <div id="f-lineId">
                <ChipSelect
                  ariaLabel="Línea de producción"
                  cols="grid-cols-1 sm:grid-cols-3"
                  invalid={invalid('lineId')}
                  value={f.lineId}
                  onChange={(v) => set({ lineId: v })}
                  options={db.lines.filter((l) => l.active || l.id === f.lineId).map((l) => ({ value: l.id, label: l.name, sub: l.targetKgPerHour ? `Objetivo ${fmtNum(l.targetKgPerHour)} kg/h` : undefined }))}
                />
              </div>
            </Field>
          </div>
        </Section>

        {/* 2. Producto */}
        <Section n={2} id="sec-product" title="Producto" subtitle="Producto, variedad, lote y presentación">
          <div className="grid gap-4">
            <Field label="Producto" required {...issue('productId')}>
              <div id="f-productId">
                <ChipSelect ariaLabel="Producto" invalid={invalid('productId')} value={f.productId} onChange={onProduct}
                  options={db.products.filter((p) => p.active || p.id === f.productId).map((p) => ({ value: p.id, label: p.name }))} />
              </div>
            </Field>
            <Field label="Variedad" required {...issue('varietyId')}>
              <div id="f-varietyId">
                <ChipSelect ariaLabel="Variedad" invalid={invalid('varietyId')} value={f.varietyId} onChange={(v) => set({ varietyId: v })}
                  options={db.varieties.filter((v) => v.active || v.id === f.varietyId).map((v) => ({ value: v.id, label: v.name }))} />
              </div>
            </Field>
            <Field label="Lote" htmlFor="f-lot" required {...issue('lot')} hint="Elige un lote reciente o genera uno nuevo con el formato estándar.">
              <div className="flex gap-2">
                <input
                  id="f-lot"
                  className={`input uppercase font-medium tracking-wide ${invalid('lot') ? 'input-error' : ''}`}
                  list="lot-list"
                  value={f.lot}
                  placeholder="LOT-DDMMAA-NN"
                  autoComplete="off"
                  onChange={(e) => set({ lot: e.target.value.toUpperCase() })}
                />
                <datalist id="lot-list">
                  {recentLots.map(([lot, desc]) => (
                    <option key={lot} value={lot}>{desc}</option>
                  ))}
                </datalist>
                <button type="button" className="btn btn-secondary h-11 shrink-0" onClick={generateLot} title="Generar número de lote">
                  <Wand2 size={16} /> <span className="hidden sm:inline">Generar</span>
                </button>
              </div>
            </Field>
            <Field label="Presentación" required {...issue('presentationId')}>
              <div id="f-presentationId">
                <ChipSelect ariaLabel="Presentación" cols="grid-cols-3 sm:grid-cols-4" invalid={invalid('presentationId')} value={f.presentationId} onChange={onPresentation}
                  options={db.presentations.filter((p) => p.active || p.id === f.presentationId).map((p) => ({ value: p.id, label: p.name, sub: `${p.unitsPerPallet} u/pallet` }))} />
              </div>
            </Field>
          </div>
        </Section>

        {/* 3. Producción */}
        <Section n={3} id="sec-production" title="Producción" subtitle="Horario y cantidades. Los kg se calculan automáticamente.">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            <Field label="Hora inicio" htmlFor="f-startTime" required {...issue('startTime')}>
              <TimeInput id="f-startTime" value={f.startTime} invalid={invalid('startTime')} onChange={(v) => set({ startTime: v })} />
            </Field>
            <Field
              label="Hora fin"
              htmlFor="f-endTime"
              required
              {...issue('endTime')}
              hint={shift && shiftCrossesMidnight(shift) && f.endTime && f.startTime && f.endTime < f.startTime ? 'Finaliza el día siguiente' : undefined}
            >
              <TimeInput id="f-endTime" value={f.endTime} invalid={invalid('endTime')} onChange={(v) => set({ endTime: v })} />
            </Field>
            <Field label="Unidades producidas" htmlFor="f-units" required className="col-span-2 md:col-span-1" {...issue('units')}>
              <input
                id="f-units"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={`input text-lg font-semibold tabular-nums ${invalid('units') ? 'input-error' : ''}`}
                value={f.units ?? ''}
                placeholder="0"
                onChange={(e) => onUnits(numOrNull(e.target.value))}
              />
            </Field>
            <Field label="Peso unitario (kg)" htmlFor="f-unitWeightKg" required {...issue('unitWeightKg')} hint="Según presentación">
              <input
                id="f-unitWeightKg"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className={`input tabular-nums ${invalid('unitWeightKg') ? 'input-error' : ''}`}
                value={f.unitWeightKg ?? ''}
                onChange={(e) => set({ unitWeightKg: numOrNull(e.target.value) })}
              />
            </Field>
            <Field label="Peso total" hint="Unidades × peso unitario">
              <div className="input bg-slate-50 flex items-center justify-between font-semibold tabular-nums" aria-live="polite">
                <span>{fmtNum(metrics.totalKg)} kg</span>
                <span className="text-xs text-slate-500 font-normal">{fmtNum(metrics.totalTn, 2)} tn</span>
              </div>
            </Field>
            <Field label="Unidades por pallet" htmlFor="f-upp">
              <input
                id="f-upp"
                type="number"
                inputMode="numeric"
                min={0}
                className="input tabular-nums"
                value={f.unitsPerPallet ?? ''}
                onChange={(e) => {
                  const v = numOrNull(e.target.value);
                  set({ unitsPerPallet: v, pallets: !palletsManual.current && f.units && v ? suggestedPallets(f.units, v) : f.pallets });
                }}
              />
            </Field>
            <Field label="Pallets producidos" htmlFor="f-pallets" {...issue('pallets')} hint={!palletsManual.current ? 'Calculado; puedes corregirlo' : undefined}>
              <input
                id="f-pallets"
                type="number"
                inputMode="numeric"
                min={0}
                className={`input tabular-nums ${invalid('pallets') ? 'input-error' : ''}`}
                value={f.pallets ?? ''}
                onChange={(e) => {
                  palletsManual.current = true;
                  set({ pallets: numOrNull(e.target.value) });
                }}
              />
            </Field>
          </div>
        </Section>

        {/* 4. Paradas */}
        <Section n={4} id="sec-downtimes" title="Paradas de producción" subtitle="Registra cada detención con su causa: alimenta el Pareto de pérdidas.">
          <div id="f-downtimes">
            <DowntimeForm
              downtimes={f.downtimes}
              categories={db.downtimeCategories}
              overnight={overnight}
              recordStart={f.startTime}
              issues={issues}
              showErrors={showErrors}
              pastReasons={pastReasons}
              onChange={(d) => set({ downtimes: d })}
            />
            {issue('downtimes').error && <p className="mt-2 text-xs text-bad-text">{issue('downtimes').error}</p>}
          </div>
        </Section>

        {/* 5. Mermas */}
        <Section n={5} id="sec-scrap" title="Mermas y rechazos">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Merma (kg)" htmlFor="f-scrapKg" {...issue('scrapKg')}>
              <input id="f-scrapKg" type="number" inputMode="decimal" min={0} className={`input tabular-nums ${invalid('scrapKg') ? 'input-error' : ''}`}
                value={f.scrapKg ?? ''} placeholder="0" onChange={(e) => set({ scrapKg: numOrNull(e.target.value) })} />
            </Field>
            <Field label="% Merma" hint={`Máximo ${targets.maxScrapPct} %`}>
              <div
                className={`input flex items-center font-semibold tabular-nums ${
                  scrapPct !== null && scrapPct > targets.maxScrapPct ? 'border-bad bg-bad-bg text-bad-text' : 'bg-slate-50'
                }`}
                aria-live="polite"
              >
                {scrapPct !== null ? `${fmtNum(scrapPct, 2)} %` : '—'}
                {scrapPct !== null && scrapPct > targets.maxScrapPct && <AlertTriangle size={16} className="ml-auto" aria-label="Supera el máximo" />}
              </div>
            </Field>
            <Field label="Producto rechazado (kg)" htmlFor="f-rejectedKg" {...issue('rejectedKg')}>
              <input id="f-rejectedKg" type="number" inputMode="decimal" min={0} className={`input tabular-nums ${invalid('rejectedKg') ? 'input-error' : ''}`}
                value={f.rejectedKg ?? ''} placeholder="0" onChange={(e) => set({ rejectedKg: numOrNull(e.target.value) })} />
            </Field>
            <Field label="Motivo de merma" htmlFor="f-scrapReason" className="sm:col-span-1" {...issue('scrapReason')}>
              <input id="f-scrapReason" className={`input ${invalid('scrapReason') ? 'input-error' : ''}`} list="scrap-reasons" value={f.scrapReason}
                placeholder="Elegir o escribir…" onChange={(e) => set({ scrapReason: e.target.value })} />
              <datalist id="scrap-reasons">
                {SCRAP_REASONS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </Field>
            <Field label="Observaciones de merma" htmlFor="f-scrapObs" className="sm:col-span-2">
              <input id="f-scrapObs" className="input" value={f.scrapObservations} placeholder="Opcional" onChange={(e) => set({ scrapObservations: e.target.value })} />
            </Field>
          </div>
        </Section>

        {/* 6. Calidad */}
        <Section n={6} id="sec-quality" title="Controles de calidad" subtitle="✓ Conforme · ⚠ Observación · ✕ No conforme">
          <div id="f-quality">
            <QualityControl value={f.quality} onChange={(q) => set({ quality: q })} issues={issues} showErrors={showErrors} />
          </div>
        </Section>

        {/* 7. Observaciones */}
        <Section n={7} id="sec-obs" title="Observaciones generales">
          <textarea id="f-observations" className="textarea" rows={3} value={f.observations} onChange={(e) => set({ observations: e.target.value })}
            placeholder="Novedades del turno, relevos, pedidos a mantenimiento…" />
        </Section>

        {/* Resumen visible en tablet / celular (en escritorio está en el panel lateral) */}
        <div className="xl:hidden grid gap-5 md:grid-cols-2">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Indicadores calculados</h2>
            <MetricsPanel m={metrics} targets={targets} units={f.units} unitWeight={f.unitWeightKg} />
          </div>
          <ReviewBox errorCount={errorCount} warnings={warnings} issues={issues} showErrors={showErrors} />
        </div>
      </div>

      {/* Panel lateral: cálculos en vivo + revisión */}
      <aside className="hidden xl:block">
        <div className="sticky top-20 space-y-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Indicadores calculados</h2>
            <MetricsPanel m={metrics} targets={targets} units={f.units} unitWeight={f.unitWeightKg} />
          </div>
          <ReviewBox errorCount={errorCount} warnings={warnings} issues={issues} showErrors={showErrors} />
          <div className="grid gap-2">
            <button className="btn btn-primary btn-lg" disabled={saving} onClick={() => trySave(true)}>
              <Send size={18} /> Enviar a aprobación
            </button>
            <button className="btn btn-secondary btn-lg" disabled={saving} onClick={() => trySave(false)}>
              <Save size={18} /> Guardar borrador
            </button>
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>
      </aside>

      {/* Barra inferior para tablet / celular */}
      <div className="xl:hidden fixed bottom-0 inset-x-0 lg:left-64 z-30 bg-white border-t border-slate-200 px-4 py-3 no-print shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 max-w-[1600px] mx-auto">
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-semibold tabular-nums">
              {fmtNum(metrics.totalKg)} kg · {metrics.kgPerHour ? `${fmtNum(metrics.kgPerHour)} kg/h` : '— kg/h'}
            </div>
            <div className={`text-xs ${errorCount ? 'text-bad-text' : 'text-ok-text'}`}>
              {errorCount ? `${errorCount} dato(s) pendiente(s) para enviar` : 'Listo para enviar'}
              {scrapPct !== null && ` · Merma ${fmtNum(scrapPct, 1)} %`}
            </div>
          </div>
          <button className="btn btn-secondary btn-lg !px-3 sm:!px-5" disabled={saving} onClick={() => trySave(false)} aria-label="Guardar borrador">
            <Save size={18} /> <span className="hidden sm:inline">Guardar</span>
          </button>
          <button className="btn btn-primary btn-lg !px-3 sm:!px-5" disabled={saving} onClick={() => trySave(true)}>
            <Send size={18} /> Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function fieldAnchor(field: string): string {
  if (field.startsWith('downtime')) return 'f-downtimes';
  if (field.startsWith('quality')) return 'f-quality';
  return `f-${field}`;
}

function ReviewBox({ errorCount, warnings, issues, showErrors }: { errorCount: number; warnings: ValidationIssue[]; issues: ValidationIssue[]; showErrors: boolean }) {
  const errors = issues.filter((i) => i.level === 'error');
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-2">Revisión</h2>
      {errorCount === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ok-text">
          <CheckCircle2 size={16} /> Datos completos para enviar
        </p>
      ) : (
        <div>
          <p className="text-sm text-slate-600">{errorCount} dato(s) pendiente(s) para enviar a aprobación.</p>
          {showErrors && (
            <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {errors.map((e, i) => (
                <li key={i}>
                  <button className="text-left text-xs text-bad-text hover:underline" onClick={() => document.getElementById(fieldAnchor(e.field))?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                    • {e.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-warn-text">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
