import { Plus, Trash2 } from 'lucide-react';
import type { Downtime, DowntimeCategory } from '@/types/domain';
import { COMMON_REASONS } from '@/data/defaults';
import { downtimeDuration } from '@/utils/calc';
import { fmtDuration } from '@/utils/format';
import { minToHHMM, hhmmToMin, isValidHHMM } from '@/utils/time';
import { uid } from '@/utils/id';
import type { ValidationIssue } from '@/utils/validation';
import { TimeInput } from './TimeInput';

interface Props {
  downtimes: Downtime[];
  categories: DowntimeCategory[];
  overnight: boolean;
  recordStart: string;
  issues: ValidationIssue[];
  showErrors: boolean;
  onChange: (d: Downtime[]) => void;
  /** Motivos cargados anteriormente, para autocompletar. */
  pastReasons: Map<string, string[]>;
}

/** Módulo de paradas: 0..N paradas con duración calculada automáticamente. */
export function DowntimeForm({ downtimes, categories, overnight, recordStart, issues, showErrors, onChange, pastReasons }: Props) {
  const update = (id: string, patch: Partial<Downtime>) =>
    onChange(
      downtimes.map((d) => {
        if (d.id !== id) return d;
        const next = { ...d, ...patch };
        next.durationMinutes = downtimeDuration(next, overnight) ?? 0;
        return next;
      }),
    );

  const add = () => {
    // Propone como inicio el fin de la última parada (o el inicio del registro + 1 h).
    const last = downtimes[downtimes.length - 1];
    const base = last && isValidHHMM(last.endTime) ? hhmmToMin(last.endTime) + 30 : isValidHHMM(recordStart) ? hhmmToMin(recordStart) + 60 : 0;
    onChange([
      ...downtimes,
      { id: uid('dt'), startTime: minToHHMM(base), endTime: minToHHMM(base + 15), durationMinutes: 15, categoryId: '', reason: '', observations: '' },
    ]);
  };

  const total = downtimes.reduce((a, d) => a + (d.durationMinutes || 0), 0);
  const active = categories.filter((c) => c.active);

  return (
    <div className="space-y-3">
      {downtimes.length === 0 && (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-4 py-3">Sin paradas registradas. Si la línea se detuvo, agrega cada parada con su causa.</p>
      )}
      {downtimes.map((d, i) => {
        const own = issues.filter((x) => x.field === `downtime:${d.id}`);
        const err = own.find((x) => x.level === 'error');
        const warn = own.find((x) => x.level === 'warning');
        const reasons = [...new Set([...(COMMON_REASONS[d.categoryId] ?? []), ...(pastReasons.get(d.categoryId) ?? [])])];
        return (
          <div key={d.id} className={`rounded-xl border p-3 sm:p-4 ${showErrors && err ? 'border-bad/60 bg-bad-bg/30' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-700">Parada {i + 1}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums">
                  Duración: <strong>{d.durationMinutes > 0 ? fmtDuration(d.durationMinutes) : '—'}</strong>
                </span>
                <button type="button" className="btn-icon" onClick={() => onChange(downtimes.filter((x) => x.id !== d.id))} aria-label={`Eliminar parada ${i + 1}`}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="label" htmlFor={`dts-${d.id}`}>Inicio</label>
                <TimeInput id={`dts-${d.id}`} value={d.startTime} onChange={(v) => update(d.id, { startTime: v })} />
              </div>
              <div>
                <label className="label" htmlFor={`dte-${d.id}`}>Fin</label>
                <TimeInput id={`dte-${d.id}`} value={d.endTime} onChange={(v) => update(d.id, { endTime: v })} />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor={`dtc-${d.id}`}>Categoría</label>
                <select
                  id={`dtc-${d.id}`}
                  className={`input ${showErrors && !d.categoryId ? 'input-error' : ''}`}
                  value={d.categoryId}
                  onChange={(e) => update(d.id, { categoryId: e.target.value })}
                >
                  <option value="">Seleccionar…</option>
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {d.categoryId && !active.some((c) => c.id === d.categoryId) && (
                    <option value={d.categoryId}>{categories.find((c) => c.id === d.categoryId)?.name}</option>
                  )}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor={`dtr-${d.id}`}>Motivo</label>
                <input
                  id={`dtr-${d.id}`}
                  className="input"
                  list={`dtr-list-${d.id}`}
                  value={d.reason}
                  placeholder={d.categoryId ? 'Elegir o escribir…' : 'Primero elige la categoría'}
                  onChange={(e) => update(d.id, { reason: e.target.value })}
                />
                <datalist id={`dtr-list-${d.id}`}>
                  {reasons.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor={`dto-${d.id}`}>Observaciones</label>
                <input id={`dto-${d.id}`} className="input" value={d.observations} onChange={(e) => update(d.id, { observations: e.target.value })} placeholder="Opcional" />
              </div>
            </div>
            {showErrors && err ? (
              <p className="mt-2 text-xs text-bad-text" role="alert">{err.message}</p>
            ) : warn ? (
              <p className="mt-2 text-xs text-warn-text">{warn.message}</p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn btn-secondary btn-lg" onClick={add}>
          <Plus size={18} /> Agregar parada
        </button>
        {downtimes.length > 0 && (
          <span className="text-sm text-slate-600">
            Tiempo total detenido: <strong className="text-slate-900">{fmtDuration(total)}</strong> en {downtimes.length} parada(s)
          </span>
        )}
      </div>
    </div>
  );
}
