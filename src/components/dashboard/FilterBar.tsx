import { useMemo, useState } from 'react';
import { Filter, X } from 'lucide-react';
import type { Database } from '@/types/domain';
import type { RecordFilters } from '@/utils/analytics';
import { PERIOD_PRESETS } from '@/hooks/useFilters';

type Dim = 'shiftId' | 'productId' | 'varietyId' | 'lineId' | 'operatorId' | 'lot';

interface Props {
  db: Database;
  filters: RecordFilters;
  onChange: (f: RecordFilters) => void;
  onReset: () => void;
  dims?: Dim[];
  showPending?: boolean;
  showDates?: boolean;
}

/** Barra de filtros común a Dashboard, Reportes y Registros. Todos los indicadores responden a ella. */
export function FilterBar({ db, filters, onChange, onReset, dims = ['shiftId', 'productId', 'varietyId', 'lineId', 'operatorId', 'lot'], showPending = true, showDates = true }: Props) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<RecordFilters>) => onChange({ ...filters, ...patch });
  const activePreset = PERIOD_PRESETS.find((p) => {
    const r = p.range();
    return r.from === filters.from && r.to === filters.to;
  })?.id;
  const activeCount = dims.filter((d) => filters[d]).length;
  const lots = useMemo(() => [...new Set(db.records.filter((r) => r.date >= filters.from && r.date <= filters.to).map((r) => r.lot))].sort().reverse().slice(0, 80), [db.records, filters.from, filters.to]);

  const selects: { key: Dim; label: string; options: { id: string; name: string }[] }[] = [
    { key: 'shiftId', label: 'Turno', options: db.shifts },
    { key: 'productId', label: 'Producto', options: db.products },
    { key: 'varietyId', label: 'Variedad', options: db.varieties },
    { key: 'lineId', label: 'Línea', options: db.lines.map((l) => ({ id: l.id, name: l.code ? `${l.code} · ${l.name.split('·')[1]?.trim() ?? l.name}` : l.name })) },
    { key: 'operatorId', label: 'Responsable', options: db.users.filter((u) => u.role === 'operator' || db.records.some((r) => r.operatorId === u.id)) },
  ];

  return (
    <div className="card px-4 py-3 mb-5 no-print">
      <div className="flex flex-wrap items-end gap-3">
        {showDates && (
          <>
            <div role="group" aria-label="Período" className="flex rounded-lg border border-slate-300 overflow-hidden h-9">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set(p.range())}
                  aria-pressed={activePreset === p.id}
                  className={`px-3 text-xs font-medium border-r last:border-r-0 border-slate-300 transition-colors ${
                    activePreset === p.id ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="label !mb-1" htmlFor="flt-from">Desde</label>
                <input id="flt-from" type="date" className="input input-sm w-[150px]" value={filters.from} max={filters.to} onChange={(e) => set({ from: e.target.value })} />
              </div>
              <div>
                <label className="label !mb-1" htmlFor="flt-to">Hasta</label>
                <input id="flt-to" type="date" className="input input-sm w-[150px]" value={filters.to} min={filters.from} onChange={(e) => set({ to: e.target.value })} />
              </div>
            </div>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-sm h-9 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Filter size={14} /> Filtros {activeCount > 0 && `(${activeCount})`}
        </button>
        <div className={`${open ? 'grid' : 'hidden'} md:contents grid-cols-2 gap-3 w-full md:w-auto`}>
          {selects
            .filter((s) => dims.includes(s.key))
            .map((s) => (
              <div key={s.key} className="md:w-auto">
                <label className="label !mb-1" htmlFor={`flt-${s.key}`}>{s.label}</label>
                <select id={`flt-${s.key}`} className="input input-sm md:w-[150px]" value={filters[s.key]} onChange={(e) => set({ [s.key]: e.target.value })}>
                  <option value="">Todos</option>
                  {s.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            ))}
          {dims.includes('lot') && (
            <div>
              <label className="label !mb-1" htmlFor="flt-lot">Lote</label>
              <input id="flt-lot" className="input input-sm md:w-[150px] uppercase" list="flt-lot-list" placeholder="Buscar lote" value={filters.lot} onChange={(e) => set({ lot: e.target.value })} />
              <datalist id="flt-lot-list">
                {lots.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          {showPending && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none h-9" title="Los borradores y registros rechazados nunca se incluyen en los indicadores">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-700" checked={filters.includePending} onChange={(e) => set({ includePending: e.target.checked })} />
              Incluir pendientes
            </label>
          )}
          <button type="button" className="btn btn-ghost btn-sm h-9" onClick={onReset}>
            <X size={14} /> Limpiar filtros
          </button>
        </div>
      </div>
    </div>
  );
}
