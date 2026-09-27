import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, FileSpreadsheet, Lock, Printer } from 'lucide-react';
import { useData, useLookups } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SeverityIcon } from '@/components/ui/SeverityBadge';
import { groupBy, shiftMap, topDowntimeReasons, type GroupRow } from '@/utils/analytics';
import { aggregate, resolveTargets } from '@/utils/calc';
import { computeAlerts } from '@/utils/alerts';
import { addDays, today } from '@/utils/time';
import { fmtDate, fmtDateLong, fmtDateTime, fmtDuration, fmtNum, fmtPct } from '@/utils/format';
import { closeDay } from '@/services/masterDataService';
import { exportExcel, groupSheet, recordsWorkbook } from '@/services/exportService';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-900 whitespace-nowrap">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function GroupTable({ rows, dim }: { rows: GroupRow[]; dim: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500 py-3">Sin producción.</p>;
  const total = rows.reduce((a, r) => a + r.kg, 0);
  return (
    <table className="table-base">
      <thead>
        <tr>
          <th>{dim}</th>
          <th className="text-right">Registros</th>
          <th className="text-right">Toneladas</th>
          <th className="text-right">%</th>
          <th className="text-right">tn/h</th>
          <th className="text-right">Merma</th>
          <th className="text-right">Detenido</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.name}</td>
            <td className="num">{r.records}</td>
            <td className="num font-medium">{fmtNum(r.kg / 1000, 2)}</td>
            <td className="num">{fmtNum(r.pct, 1)}</td>
            <td className="num">{r.kgPerHour !== null ? fmtNum(r.kgPerHour / 1000, 2) : '—'}</td>
            <td className="num">{fmtPct(r.scrapPct, 2)}</td>
            <td className="num">{fmtDuration(r.downtimeMin)}</td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold">
          <td>Total</td>
          <td className="num">{rows.reduce((a, r) => a + r.records, 0)}</td>
          <td className="num">{fmtNum(total / 1000, 2)}</td>
          <td className="num">100</td>
          <td colSpan={3} />
        </tr>
      </tbody>
    </table>
  );
}

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 mb-2">{title}</h3>
      <div className="overflow-x-auto [&_td]:px-2 [&_th]:px-2 [&_td]:text-[13px]">{children}</div>
    </section>
  );
}

export function DailyClosePage() {
  const { db, user } = useData();
  const lk = useLookups();
  const { confirm, run } = useFeedback();
  const [params, setParams] = useSearchParams();
  // Por defecto: hoy si hay registros; si no, la última fecha con producción.
  const defaultDate = useMemo(() => {
    const t = today();
    if (db.records.some((r) => r.date === t)) return t;
    return db.records.reduce((m, r) => (r.date > m && r.date <= t ? r.date : m), '') || t;
  }, [db.records]);
  const date = params.get('fecha') ?? defaultDate;
  const setDate = (d: string) => setParams({ fecha: d });
  const [notes, setNotes] = useState('');
  const sm = useMemo(() => shiftMap(db), [db]);

  const closure = db.closures.find((c) => c.date === date);
  const d = useMemo(() => {
    const all = db.records.filter((r) => r.date === date);
    const counted = all.filter((r) => r.status === 'approved' || r.status === 'pending');
    const agg = aggregate(counted, sm);
    const target = counted.reduce((a, r) => a + resolveTargets(db.settings.targets, lk.lines.get(r.lineId)).targetKgPerShift, 0);
    const alerts = computeAlerts(db, counted).filter((a) => a.severity !== 'info' && a.type !== 'pending');
    return {
      all,
      counted,
      agg,
      target,
      byShift: groupBy(db, counted, 'shiftId'),
      byProduct: groupBy(db, counted, 'productId'),
      byLine: groupBy(db, counted, 'lineId'),
      reasons: topDowntimeReasons(db, counted, 6),
      pending: all.filter((r) => r.status === 'pending'),
      unsent: all.filter((r) => r.status === 'draft' || r.status === 'rejected'),
      incidents: alerts,
    };
  }, [db, date, sm, lk.lines]);

  const generate = async () => {
    const warn = [
      d.pending.length ? `• ${d.pending.length} registro(s) siguen pendientes de aprobación.` : '',
      d.unsent.length ? `• ${d.unsent.length} registro(s) en borrador o rechazados no se incluirán.` : '',
    ].filter(Boolean);
    const { ok } = await confirm({
      title: `Cerrar jornada del ${fmtDate(date)}`,
      message: `Se generará el cierre con ${d.counted.length} registro(s) y ${fmtNum(d.agg.totalKg / 1000, 2)} tn.\n${warn.join('\n')}\nDespués del cierre, los operadores no podrán cargar ni modificar registros de esta fecha.`,
      confirmLabel: 'Generar cierre diario',
    });
    if (ok) await run(() => closeDay(date, notes, user), 'Cierre diario generado.');
  };

  const exportDay = () =>
    run(
      () =>
        exportExcel(
          recordsWorkbook(db, d.counted, [groupSheet('Por turno', 'Turno', d.byShift), groupSheet('Por producto', 'Producto', d.byProduct), groupSheet('Por línea', 'Línea', d.byLine)]),
          `cierre_diario_${date}.xlsx`,
        ),
      'Excel del cierre generado.',
    );

  const history = [...db.closures].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const changedAfterClose = closure && Math.abs(closure.summary.totalKg - d.agg.totalKg) > 0.5;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Cierre de jornada"
        subtitle="Resumen consolidado del día para supervisión y archivo."
        actions={
          <>
            <button className="btn btn-secondary" onClick={exportDay} disabled={!d.counted.length}><FileSpreadsheet size={16} /> Exportar Excel</button>
            <button className="btn btn-secondary" onClick={() => window.print()} disabled={!d.counted.length}><Printer size={16} /> Imprimir / PDF</button>
          </>
        }
      />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3 no-print">
        <div>
          <label className="label" htmlFor="close-date">Fecha</label>
          <div className="flex items-center gap-1">
            <button className="btn-icon" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior"><ChevronLeft size={18} /></button>
            <input id="close-date" type="date" className="input w-[170px]" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button className="btn-icon" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()} aria-label="Día siguiente"><ChevronRight size={18} /></button>
          </div>
        </div>
        {!closure ? (
          <>
            <div className="flex-1 min-w-[220px]">
              <label className="label" htmlFor="close-notes">Comentarios del supervisor (opcional)</label>
              <input id="close-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Novedades relevantes de la jornada" />
            </div>
            <button className="btn btn-primary btn-lg" onClick={generate} disabled={!d.counted.length}>
              <CalendarCheck size={18} /> Generar cierre diario
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-ok-text bg-ok-bg rounded-lg px-3 py-2">
            <Lock size={16} /> Jornada cerrada por {lk.userName(closure.closedBy)} el {fmtDateTime(closure.closedAt)}
          </div>
        )}
      </div>

      {!d.all.length ? (
        <Card><EmptyState title={`No hay registros de producción el ${fmtDate(date)}`}>Selecciona otra fecha.</EmptyState></Card>
      ) : (
        <article className="card print-area">
          <header className="flex flex-col gap-2 border-b-2 border-brand-900 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{db.settings.companyName} · {db.settings.plantName}</div>
              <h2 className="text-xl font-semibold mt-1">Cierre diario de producción y fraccionado</h2>
              <p className="text-sm text-slate-600">{fmtDateLong(date)}</p>
            </div>
            <div className="text-sm text-right">
              {closure ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-ok-text"><Lock size={14} /> CERRADO</span>
              ) : (
                <span className="font-medium text-warn-text">BORRADOR · jornada abierta</span>
              )}
              <div className="text-xs text-slate-500">Emitido {fmtDateTime(new Date().toISOString())} por {user.name}</div>
            </div>
          </header>

          {changedAfterClose && (
            <div className="mx-6 mt-4 rounded-lg bg-warn-bg px-4 py-2 text-sm text-warn-text">
              Hubo cambios después del cierre: al cerrar se registraron {fmtNum(closure!.summary.totalKg / 1000, 2)} tn; hoy suman {fmtNum(d.agg.totalKg / 1000, 2)} tn.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 divide-x divide-slate-100 border-b border-slate-100">
            <Stat label="Producción total" value={`${fmtNum(d.agg.totalKg / 1000, 2)} tn`} sub={`${fmtNum(d.agg.totalKg)} kg`} />
            <Stat label="Cumplimiento" value={d.target ? fmtPct((d.agg.totalKg / d.target) * 100, 0) : '—'} sub={`Objetivo ${fmtNum(d.target / 1000, 1)} tn`} />
            <Stat label="Horas trabajadas" value={fmtDuration(d.agg.durationMin)} sub={`${d.counted.length} turnos-línea`} />
            <Stat label="Tiempo productivo" value={fmtDuration(d.agg.productiveMin)} />
            <Stat label="Tiempo detenido" value={fmtDuration(d.agg.downtimeMin)} sub={`${fmtPct(d.agg.downtimePct)} · ${d.agg.stops} paradas`} />
            <Stat label="Productividad" value={d.agg.kgPerHour !== null ? `${fmtNum(d.agg.kgPerHour / 1000, 2)} tn/h` : '—'} />
            <Stat label="Merma total" value={fmtPct(d.agg.scrapPct, 2)} sub={`${fmtNum(d.agg.scrapKg)} kg`} />
          </div>

          <div className="px-6 py-5 grid gap-6 lg:grid-cols-2">
            <DocSection title="Producción por turno"><GroupTable rows={d.byShift} dim="Turno" /></DocSection>
            <DocSection title="Producción por producto"><GroupTable rows={d.byProduct} dim="Producto" /></DocSection>
            <DocSection title="Producción por línea"><GroupTable rows={d.byLine} dim="Línea" /></DocSection>
            <DocSection title="Principales paradas">
              {d.reasons.length ? (
                <table className="table-base">
                  <thead><tr><th>Categoría</th><th>Motivo</th><th className="text-right">Paradas</th><th className="text-right">Minutos</th></tr></thead>
                  <tbody>
                    {d.reasons.map((r) => (
                      <tr key={r.category + r.reason}><td>{r.category}</td><td className="whitespace-normal">{r.reason}</td><td className="num">{r.stops}</td><td className="num font-medium">{r.minutes}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-slate-500 py-3">Sin paradas.</p>}
            </DocSection>
            <DocSection title={`Incidencias y desvíos (${d.incidents.length})`}>
              {d.incidents.length ? (
                <ul className="divide-y divide-slate-100">
                  {d.incidents.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 py-2 text-sm">
                      <SeverityIcon level={a.severity} size={15} />
                      <div className="min-w-0">
                        <Link to={`/registros/${a.recordId}`} className="font-medium hover:underline">{a.recordNumber}</Link> · {a.title}
                        <div className="text-xs text-slate-500 truncate">{a.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ok-text py-3">Sin incidencias: todos los registros dentro de parámetros.</p>}
            </DocSection>
            <DocSection title={`Registros pendientes (${d.pending.length + d.unsent.length})`}>
              {d.pending.length + d.unsent.length ? (
                <ul className="divide-y divide-slate-100">
                  {[...d.pending, ...d.unsent].map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span><Link to={`/registros/${r.id}`} className="font-medium hover:underline">{r.number}</Link> · {lk.shiftName(r.shiftId)} · {lk.userName(r.operatorId)}</span>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ok-text py-3">Todos los registros del día están aprobados.</p>}
            </DocSection>
          </div>

          {(closure?.notes || notes) && (
            <div className="px-6 pb-5">
              <DocSection title="Comentarios del supervisor"><p className="text-sm text-slate-700">{closure?.notes || notes}</p></DocSection>
            </div>
          )}

          <footer className="grid grid-cols-2 gap-8 px-6 pt-10 pb-6 text-xs text-slate-500">
            <div className="border-t border-slate-300 pt-1.5">Supervisor de turno: {closure ? lk.userName(closure.closedBy) : '________________'}</div>
            <div className="border-t border-slate-300 pt-1.5">Jefe de planta</div>
          </footer>
        </article>
      )}

      <Card title="Cierres anteriores" className="mt-5 no-print" bodyClassName="px-0 pb-2">
        {history.length ? (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Fecha</th><th className="text-right">Toneladas</th><th className="text-right">Registros</th><th className="text-right">Merma</th><th className="text-right">Detenido</th><th className="text-right">Incidencias</th><th>Cerrado por</th></tr></thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => setDate(c.date)}>
                    <td className="font-medium text-brand-700">{fmtDate(c.date)}</td>
                    <td className="num">{fmtNum(c.summary.totalKg / 1000, 2)}</td>
                    <td className="num">{c.summary.records}</td>
                    <td className="num">{fmtPct(c.summary.scrapPct, 2)}</td>
                    <td className="num">{fmtDuration(c.summary.downtimeMin)}</td>
                    <td className="num">{c.summary.incidents}</td>
                    <td>{lk.userName(c.closedBy)} <span className="text-xs text-slate-500">{fmtDateTime(c.closedAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Aún no hay cierres" />}
      </Card>
    </div>
  );
}
