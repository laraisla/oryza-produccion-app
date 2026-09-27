import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { useData, useLookups } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { ACTION_LABEL } from '@/services/auditService';
import { downloadBlob, toCSV } from '@/services/exportService';
import { fmtDateTime, normalize } from '@/utils/format';
import type { AuditAction } from '@/types/domain';
import { today } from '@/utils/time';

const PAGE = 25;

export function AuditPage() {
  const { db } = useData();
  const lk = useLookups();
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState<'' | AuditAction>('');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const n = normalize(q);
    return [...db.audit]
      .reverse()
      .filter(
        (a) =>
          (!userId || a.userId === userId) &&
          (!action || a.action === action) &&
          (!n || normalize(`${a.entityLabel} ${a.comment ?? ''} ${a.changes.map((c) => `${c.label} ${c.from} ${c.to}`).join(' ')}`).includes(n)),
      );
  }, [db.audit, q, userId, action]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);

  const exportCsv = () =>
    downloadBlob(
      new Blob(
        [
          toCSV(
            rows.map((a) => ({
              FechaHora: a.at,
              Usuario: lk.userName(a.userId),
              Accion: ACTION_LABEL[a.action],
              Entidad: a.entityLabel,
              Cambios: a.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join(' | '),
              Comentario: a.comment ?? '',
            })),
          ),
        ],
        { type: 'text/csv;charset=utf-8' },
      ),
      `auditoria_${today()}.csv`,
    );

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Auditoría" subtitle="Registro inalterable de quién hizo qué y cuándo, con valores anteriores y nuevos." actions={<button className="btn btn-secondary" onClick={exportCsv}><Download size={16} /> Exportar CSV</button>} />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-slate-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="aud-q" className="sr-only">Buscar</label>
            <input id="aud-q" className="input input-sm pl-9" placeholder="Buscar registro, campo o valor…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <label htmlFor="aud-user" className="sr-only">Usuario</label>
          <select id="aud-user" className="input input-sm w-48" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
            <option value="">Todos los usuarios</option>
            {db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <label htmlFor="aud-action" className="sr-only">Acción</label>
          <select id="aud-action" className="input input-sm w-48" value={action} onChange={(e) => { setAction(e.target.value as AuditAction | ''); setPage(1); }}>
            <option value="">Todas las acciones</option>
            {(Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
          </select>
        </div>
        {rows.length ? (
          <>
            <ul className="divide-y divide-slate-100">
              {rows.slice((cur - 1) * PAGE, cur * PAGE).map((a) => {
                const isRecord = a.entity === 'production_record' && db.records.some((r) => r.id === a.entityId);
                return (
                  <li key={a.id} className="px-4 py-3 grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <div className="text-xs text-slate-500 tabular-nums">{fmtDateTime(a.at)}</div>
                    <div>
                      <div className="text-sm">
                        <strong>{lk.userName(a.userId)}</strong> {ACTION_LABEL[a.action].toLowerCase()}{' '}
                        {isRecord ? <Link to={`/registros/${a.entityId}`} className="text-brand-700 hover:underline">{a.entityLabel}</Link> : a.entityLabel}
                      </div>
                      {a.changes.map((c) => (
                        <div key={c.field} className="text-xs text-slate-600">
                          {c.label}: <span className="text-slate-400 line-through">{c.from}</span> → <span className="font-medium text-slate-800">{c.to}</span>
                        </div>
                      ))}
                      {a.comment && <div className="text-xs italic text-slate-500">“{a.comment}”</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={cur} pages={pages} total={rows.length} onPage={setPage} />
          </>
        ) : (
          <EmptyState title="Sin movimientos para los filtros" />
        )}
      </Card>
    </div>
  );
}
