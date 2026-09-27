import type { QualityCheck, QualityValue } from '@/types/domain';
import type { ValidationIssue } from '@/utils/validation';

type QKey = 'lotOk' | 'packagingOk' | 'printingOk' | 'weightOk' | 'productOk';

export const QUALITY_ITEMS: { key: QKey; label: string }[] = [
  { key: 'lotOk', label: 'Lote verificado' },
  { key: 'packagingOk', label: 'Envase correcto' },
  { key: 'printingOk', label: 'Impresión correcta' },
  { key: 'weightOk', label: 'Peso correcto' },
  { key: 'productOk', label: 'Producto conforme' },
];

const OPTIONS: { value: Exclude<QualityValue, null>; symbol: string; label: string; active: string }[] = [
  { value: 'ok', symbol: '✓', label: 'Conforme', active: 'bg-ok-text border-ok-text text-white' },
  { value: 'obs', symbol: '⚠', label: 'Observación', active: 'bg-warn border-warn text-brand-900' },
  { value: 'nc', symbol: '✕', label: 'No conforme', active: 'bg-bad border-bad text-white' },
];

export function QualityValueTag({ value }: { value: QualityValue }) {
  if (!value) return <span className="text-xs text-slate-400">Sin dato</span>;
  const o = OPTIONS.find((x) => x.value === value)!;
  const cls = value === 'ok' ? 'text-ok-text bg-ok-bg' : value === 'obs' ? 'text-warn-text bg-warn-bg' : 'text-bad-text bg-bad-bg';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span aria-hidden>{o.symbol}</span> {o.label}
    </span>
  );
}

export function QualityControl({
  value,
  onChange,
  issues,
  showErrors,
}: {
  value: QualityCheck;
  onChange: (q: QualityCheck) => void;
  issues: ValidationIssue[];
  showErrors: boolean;
}) {
  const set = (patch: Partial<QualityCheck>) => onChange({ ...value, ...patch });
  const issueFor = (f: string) => issues.find((i) => i.field === f);
  const allOk = () => set(Object.fromEntries(QUALITY_ITEMS.map((i) => [i.key, 'ok'])) as Partial<QualityCheck>);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" className="btn btn-secondary btn-sm" onClick={allOk}>
          ✓ Marcar todo conforme
        </button>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {QUALITY_ITEMS.map((item) => {
          const missing = showErrors && !value[item.key];
          return (
            <div key={item.key} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${missing ? 'bg-bad-bg/40' : ''}`}>
              <span id={`q-${item.key}`} className="text-sm font-medium text-slate-800">
                {item.label}
                {missing && <span className="ml-2 text-xs font-normal text-bad-text">Falta completar</span>}
              </span>
              <div role="radiogroup" aria-labelledby={`q-${item.key}`} className="grid grid-cols-3 gap-2 sm:w-[360px]">
                {OPTIONS.map((o) => {
                  const active = value[item.key] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set({ [item.key]: o.value } as Partial<QualityCheck>)}
                      className={`h-11 rounded-lg border text-sm font-medium transition-colors ${
                        active ? o.active : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <span aria-hidden>{o.symbol}</span> <span className="hidden sm:inline">{o.label}</span>
                      <span className="sm:hidden">{o.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <label className="label" htmlFor="q-obs">Observaciones de calidad</label>
        <textarea
          id="q-obs"
          className={`textarea ${showErrors && issueFor('quality.observations')?.level === 'error' ? 'input-error' : ''}`}
          value={value.observations}
          onChange={(e) => set({ observations: e.target.value })}
          placeholder="Describe cualquier observación o no conformidad"
        />
        {issueFor('quality.observations') && (showErrors || issueFor('quality.observations')!.level === 'warning') && (
          <p className={`mt-1 text-xs ${issueFor('quality.observations')!.level === 'error' ? 'text-bad-text' : 'text-warn-text'}`}>
            {issueFor('quality.observations')!.message}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
            checked={value.hasIncident}
            onChange={(e) => set({ hasIncident: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">Existe una incidencia de calidad</span>
        </label>
        {value.hasIncident && (
          <div className="mt-3">
            <label className="label" htmlFor="q-inc">Descripción de la incidencia *</label>
            <textarea
              id="q-inc"
              className={`textarea ${showErrors && issueFor('quality.incidentDescription') ? 'input-error' : ''}`}
              value={value.incidentDescription}
              onChange={(e) => set({ incidentDescription: e.target.value })}
              placeholder="Qué ocurrió, qué producto se afectó y qué acción se tomó"
            />
            {showErrors && issueFor('quality.incidentDescription') && (
              <p className="mt-1 text-xs text-bad-text">{issueFor('quality.incidentDescription')!.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
