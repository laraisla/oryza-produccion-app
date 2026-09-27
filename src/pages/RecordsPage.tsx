import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Plus, Search } from 'lucide-react';
import { useData, useLookups } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { useFilters } from '@/hooks/useFilters';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { ProductionTable, type SortKey } from '@/components/production/ProductionTable';
import { applyFilters, shiftMap } from '@/utils/analytics';
import { computeMetrics } from '@/utils/calc';
import { can } from '@/utils/permissions';
import { normalize } from '@/utils/format';
import { deleteRecord } from '@/services/productionService';
import { exportCSV, exportExcel, recordsWorkbook } from '@/services/exportService';
import type { ProductionRecord, RecordStatus } from '@/types/domain';
import { today } from '@/utils/time';

const PAGE_SIZE = 15;
const STATUS_TABS: { id: '' | RecordStatus; label: string }[] = [
  { id: '', label: 'Todos' },
  { id: 'draft', label: 'Borradores' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobados' },
  { id: 'rejected', label: 'Rechazados' },
];

export function RecordsPage() {
  const { db, user } = useData();
  const lk = useLookups();
  const { confirm, run } = useFeedback();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { filters, setFilters, reset } = useFilters('records');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | RecordStatus>((params.get('estado') as RecordStatus) ?? '');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const sm = useMemo(() => shiftMap(db), [db]);

  useEffect(() => {
    const s = params.get('estado') as RecordStatus | null;
    if (s !== null) setStatus(s);
  }, [params]);

  const rows = useMemo(() => {
    const q = normalize(search);
    const list = applyFilters(db.records, filters, { anyStatus: true }).filter(
      (r) =>
        can.viewRecord(user, r) &&
        (!status || r.status === status) &&
        (!q ||
          normalize(`${r.number} ${r.lot} ${lk.productName(r.productId)} ${lk.userName(r.operatorId)} ${lk.lineName(r.lineId)} ${r.observations}`).includes(q)),
    );
    const val = (r: ProductionRecord): string | number => {
      switch (sort.key) {
        case 'number':
          return r.number;
        case 'date':
          return r.date + (sm.get(r.shiftId)?.start ?? '');
        case 'shift':
          return lk.shiftName(r.shiftId);
        case 'product':
          return lk.productName(r.productId);
        case 'lot':
          return r.lot;
        case 'operator':
          return lk.userName(r.operatorId);
        case 'kg':
          return r.totalKg;
        case 'scrap':
          return computeMetrics(r, sm.get(r.shiftId)).scrapPct ?? -1;
        case 'downtime':
          return computeMetrics(r, sm.get(r.shiftId)).downtimeMin;
        case 'status':
          return r.status;
      }
    };
    return list.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? c : -c;
    });
  }, [db.records, filters, search, status, sort, user, lk, sm]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  useEffect(() => setPage(1), [filters, search, status]);

  const counts = useMemo(() => {
    const visible = applyFilters(db.records, filters, { anyStatus: true }).filter((r) => can.viewRecord(user, r));
    return Object.fromEntries(STATUS_TABS.map((t) => [t.id, t.id ? visible.filter((r) => r.status === t.id).length : visible.length]));
  }, [db.records, filters, user]);

  const onDelete = async (r: ProductionRecord) => {
    const { ok } = await confirm({
      title: `Eliminar ${r.number}`,
      message: `Se eliminará el registro del lote ${r.lot} (${lk.productName(r.productId)}). La eliminación queda registrada en auditoría y no puede deshacerse.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (ok) await run(() => deleteRecord(r.id, user), `Registro ${r.number} eliminado.`);
  };

  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'date' || k === 'kg' ? 'desc' : 'asc' }));

  return (
    <div>
      <PageHeader
        title="Registros de producción"
        subtitle={can.viewAllRecords(user) ? 'Historial de todos los operadores' : 'Tus registros de producción'}
        actions={
          <>
            {can.exportData(user) && (
              <>
                <button className="btn btn-secondary" onClick={() => exportCSV(db, rows, `registros_produccion_${today()}.csv`)} disabled={!rows.length}>
                  <Download size={16} /> Exportar CSV
                </button>
                <button className="btn btn-secondary" disabled={!rows.length} onClick={() => run(() => exportExcel(recordsWorkbook(db, rows), `registros_produccion_${today()}.xlsx`), 'Excel generado.')}>
                  <FileSpreadsheet size={16} /> Exportar Excel
                </button>
              </>
            )}
            <Link to="/registros/nuevo" className="btn btn-primary">
              <Plus size={16} /> Nuevo registro
            </Link>
          </>
        }
      />
      <FilterBar db={db} filters={filters} onChange={setFilters} onReset={() => { reset(); setSearch(''); setStatus(''); setParams({}); }} showPending={false}
        dims={can.viewAllRecords(user) ? ['shiftId', 'productId', 'lineId', 'operatorId', 'lot'] : ['shiftId', 'productId', 'lineId', 'lot']} />
      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-100 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="Estado" className="flex gap-1 overflow-x-auto">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={status === t.id}
                onClick={() => {
                  setStatus(t.id);
                  setParams(t.id ? { estado: t.id } : {});
                }}
                className={`px-3 h-8 rounded-lg text-sm whitespace-nowrap transition-colors ${status === t.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {t.label} <span className="text-xs text-slate-400 tabular-nums">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <div className="relative md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="rec-search" className="sr-only">Buscar</label>
            <input id="rec-search" className="input input-sm pl-9" placeholder="Buscar ID, lote, producto, operador…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {pageRows.length ? (
          <>
            <ProductionTable
              records={pageRows}
              user={user}
              shifts={sm}
              maxScrapPct={db.settings.targets.maxScrapPct}
              sort={sort}
              onSort={onSort}
              onDelete={onDelete}
              onEdit={(r) => navigate(`/registros/${r.id}/editar`)}
              onDuplicate={(r) => navigate(`/registros/nuevo?from=${r.id}`)}
            />
            <Pagination page={current} pages={pages} total={rows.length} onPage={setPage} />
          </>
        ) : (
          <EmptyState title="No hay registros que coincidan">Modifica la búsqueda o limpia los filtros.</EmptyState>
        )}
      </Card>
    </div>
  );
}
