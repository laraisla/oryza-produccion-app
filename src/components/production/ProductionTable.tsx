import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Eye, Pencil, Trash2 } from 'lucide-react';
import type { ProductionRecord, Shift, User } from '@/types/domain';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { computeMetrics } from '@/utils/calc';
import { fmtDate, fmtDuration, fmtNum } from '@/utils/format';
import { can, editBlockReason } from '@/utils/permissions';
import { useLookups } from '@/hooks/useData';

export type SortKey = 'number' | 'date' | 'shift' | 'product' | 'lot' | 'operator' | 'kg' | 'scrap' | 'downtime' | 'status';

interface Props {
  records: ProductionRecord[];
  user: User;
  shifts: Map<string, Shift>;
  maxScrapPct: number;
  compact?: boolean;
  sort?: { key: SortKey; dir: 'asc' | 'desc' };
  onSort?: (k: SortKey) => void;
  onDelete?: (r: ProductionRecord) => void;
  onDuplicate?: (r: ProductionRecord) => void;
  onEdit?: (r: ProductionRecord) => void;
}

/** Tabla de registros de producción con acciones sujetas a permisos. */
export function ProductionTable({ records, user, shifts, maxScrapPct, compact, sort, onSort, onDelete, onDuplicate, onEdit }: Props) {
  const lk = useLookups();
  const Th = ({ k, children, num }: { k: SortKey; children: string; num?: boolean }) => (
    <th className={num ? 'text-right' : ''} aria-sort={sort?.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {onSort ? (
        <button className={`inline-flex items-center gap-1 hover:text-slate-900 uppercase ${num ? 'flex-row-reverse' : ''}`} onClick={() => onSort(k)}>
          {children}
          {sort?.key === k && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <Th k="number">ID</Th>
            <Th k="date">Fecha</Th>
            {!compact && <Th k="shift">Turno</Th>}
            <Th k="product">Producto</Th>
            <Th k="lot">Lote</Th>
            {!compact && <Th k="operator">Responsable</Th>}
            <Th k="kg" num>Producción</Th>
            <Th k="scrap" num>Merma</Th>
            {!compact && <Th k="downtime" num>T. detenido</Th>}
            <Th k="status">Estado</Th>
            <th className="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const m = computeMetrics(r, shifts.get(r.shiftId));
            const scrapHigh = m.scrapPct !== null && m.scrapPct > maxScrapPct;
            const editable = can.editRecord(user, r);
            const deletable = can.deleteRecord(user, r);
            return (
              <tr key={r.id}>
                <td>
                  <Link to={`/registros/${r.id}`} className="font-medium text-brand-700 hover:underline tabular-nums">
                    {r.number}
                  </Link>
                </td>
                <td className="tabular-nums">{fmtDate(r.date)}{compact && <span className="block text-[11px] text-slate-500">{lk.shiftName(r.shiftId)}</span>}</td>
                {!compact && <td>{lk.shiftName(r.shiftId)}</td>}
                <td className="max-w-[160px] truncate">
                  {lk.productName(r.productId)}
                  {!compact && <span className="block text-[11px] text-slate-500">{lk.presentationName(r.presentationId)} · {lk.lineCode(r.lineId)}</span>}
                </td>
                <td className="font-mono text-xs">{r.lot}</td>
                {!compact && <td>{lk.userName(r.operatorId)}</td>}
                <td className="num font-medium">{fmtNum(m.totalKg)} kg</td>
                <td className={`num ${scrapHigh ? 'text-bad-text font-semibold' : ''}`}>{m.scrapPct !== null ? `${fmtNum(m.scrapPct, 1)} %` : '—'}</td>
                {!compact && <td className="num">{fmtDuration(m.downtimeMin)}</td>}
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <div className="flex justify-end gap-0.5">
                    <Link to={`/registros/${r.id}`} className="btn-icon" title="Ver" aria-label={`Ver ${r.number}`}>
                      <Eye size={16} />
                    </Link>
                    {!compact && (
                      <>
                        <button className="btn-icon" disabled={!editable} title={editable ? 'Editar' : editBlockReason(user, r) ?? ''} aria-label={`Editar ${r.number}`} onClick={() => onEdit?.(r)}>
                          <Pencil size={16} />
                        </button>
                        <button className="btn-icon" title="Duplicar (copia producto, línea y lote)" aria-label={`Duplicar ${r.number}`} onClick={() => onDuplicate?.(r)}>
                          <Copy size={16} />
                        </button>
                        <button
                          className="btn-icon hover:!text-bad"
                          disabled={!deletable}
                          title={deletable ? 'Eliminar' : r.status === 'approved' ? 'Un registro aprobado no puede eliminarse' : 'Sin permiso para eliminar'}
                          aria-label={`Eliminar ${r.number}`}
                          onClick={() => onDelete?.(r)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
