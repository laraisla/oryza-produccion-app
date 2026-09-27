import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Pencil, Printer, RotateCcw, Send, Trash2, Undo2, X } from 'lucide-react';
import { useData, useLookups } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, EmptyState } from '@/components/ui/Card';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { QUALITY_ITEMS, QualityValueTag } from '@/components/production/QualityControl';
import { computeMetrics, resolveTargets } from '@/utils/calc';
import { computeAlerts } from '@/utils/alerts';
import { can } from '@/utils/permissions';
import { fmtDate, fmtDateTime, fmtDuration, fmtNum, fmtPct } from '@/utils/format';
import { ACTION_LABEL } from '@/services/auditService';
import { approveRecord, deleteRecord, rejectRecord, reopenRecord, submitRecord, withdrawRecord } from '@/services/productionService';
import { SeverityIcon, type Level } from '@/components/ui/SeverityBadge';

function Item({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 ${strong ? 'text-lg font-semibold' : 'text-sm font-medium'} text-slate-900 truncate`}>{children}</dd>
    </div>
  );
}

function Metric({ label, value, sub, level }: { label: string; value: string; sub?: string; level?: Level }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        {label}
        {level && <SeverityIcon level={level} size={14} />}
      </div>
      <div className="text-lg font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function RecordDetailPage() {
  const { id } = useParams();
  const { db, user } = useData();
  const lk = useLookups();
  const { confirm, run } = useFeedback();
  const navigate = useNavigate();
  const r = db.records.find((x) => x.id === id);

  const audit = useMemo(() => db.audit.filter((a) => a.entityId === id).sort((a, b) => b.at.localeCompare(a.at)), [db.audit, id]);
  const alerts = useMemo(() => (r ? computeAlerts(db, [r]) : []), [db, r]);

  if (!r)
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <p className="font-medium">El registro no existe o fue eliminado.</p>
        <Link to="/registros" className="btn btn-secondary mt-4">Volver a registros</Link>
      </div>
    );
  if (!can.viewRecord(user, r))
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <p className="font-medium">No tienes permiso para ver este registro.</p>
      </div>
    );

  const shift = lk.shifts.get(r.shiftId);
  const line = lk.lines.get(r.lineId);
  const targets = resolveTargets(db.settings.targets, line);
  const m = computeMetrics(r, shift, targets);

  const act = {
    submit: async () => {
      await run(() => submitRecord(r.id, user), `Registro ${r.number} enviado a aprobación.`);
    },
    withdraw: async () => {
      const { ok } = await confirm({ title: 'Retirar envío', message: 'El registro volverá a borrador para que puedas corregirlo.', confirmLabel: 'Retirar' });
      if (ok) await run(() => withdrawRecord(r.id, user), 'El registro volvió a borrador.');
    },
    approve: async () => {
      const { ok, text } = await confirm({
        title: `Aprobar ${r.number}`,
        message: `Producción: ${fmtNum(m.totalKg)} kg · Merma ${fmtPct(m.scrapPct, 2)} · Detenido ${fmtDuration(m.downtimeMin)}.\nUna vez aprobado, el registro queda bloqueado.`,
        confirmLabel: 'Aprobar',
        tone: 'success',
        textLabel: 'Comentario (opcional)',
      });
      if (ok) await run(() => approveRecord(r.id, user, text), `Registro ${r.number} aprobado.`);
    },
    reject: async () => {
      const { ok, text } = await confirm({
        title: `Rechazar ${r.number}`,
        message: 'El registro volverá al operador para su corrección.',
        confirmLabel: 'Rechazar',
        tone: 'danger',
        textLabel: 'Motivo del rechazo',
        textRequired: true,
        textPlaceholder: 'Qué debe corregir el operador',
      });
      if (ok) await run(() => rejectRecord(r.id, user, text), `Registro ${r.number} rechazado.`);
    },
    reopen: async () => {
      const { ok, text } = await confirm({
        title: `Reabrir ${r.number}`,
        message: 'El registro aprobado volverá a borrador y deberá aprobarse nuevamente. Esta acción queda auditada.',
        confirmLabel: 'Reabrir',
        tone: 'danger',
        textLabel: 'Motivo',
        textRequired: true,
      });
      if (ok) await run(() => reopenRecord(r.id, user, text), 'Registro reabierto.');
    },
    remove: async () => {
      const { ok } = await confirm({ title: `Eliminar ${r.number}`, message: 'La eliminación queda registrada en auditoría y no puede deshacerse.', confirmLabel: 'Eliminar', tone: 'danger' });
      if (ok) {
        const done = await run(async () => { await deleteRecord(r.id, user); return true; }, `Registro ${r.number} eliminado.`);
        if (done) navigate('/registros');
      }
    },
  };

  const scrapLevel: Level = m.scrapPct !== null && m.scrapPct > targets.maxScrapPct ? 'critical' : 'ok';
  const prodLevel: Level | undefined =
    m.productivityAttainmentPct === null ? undefined : m.productivityAttainmentPct < 75 ? 'critical' : m.productivityAttainmentPct < 90 ? 'warning' : 'ok';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="flex flex-wrap gap-2">
          {can.reviewRecord(user, r) && (
            <>
              <button className="btn btn-danger" onClick={act.reject}><X size={16} /> Rechazar</button>
              <button className="btn btn-success" onClick={act.approve}><Check size={16} /> Aprobar</button>
            </>
          )}
          {can.submitRecord(user, r) && <button className="btn btn-primary" onClick={act.submit}><Send size={16} /> Enviar a aprobación</button>}
          {can.editRecord(user, r) && <Link className="btn btn-secondary" to={`/registros/${r.id}/editar`}><Pencil size={16} /> Editar</Link>}
          {can.withdrawRecord(user, r) && <button className="btn btn-secondary" onClick={act.withdraw}><Undo2 size={16} /> Retirar envío</button>}
          {can.reopenRecord(user, r) && <button className="btn btn-secondary" onClick={act.reopen}><RotateCcw size={16} /> Reabrir</button>}
          <Link className="btn btn-secondary" to={`/registros/nuevo?from=${r.id}`}><Copy size={16} /> Duplicar</Link>
          <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
          {can.deleteRecord(user, r) && <button className="btn btn-ghost hover:!text-bad" onClick={act.remove} aria-label="Eliminar"><Trash2 size={16} /></button>}
        </div>
      </div>

      <article className="card print-area">
        <header className="flex flex-col gap-3 border-b border-slate-200 px-5 sm:px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{db.settings.companyName} · Registro de producción</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">#{r.number}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {fmtDate(r.date)} · Turno {shift?.name} · {line?.name}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1.5">
            <StatusBadge status={r.status} long />
            {r.source === 'import' && <span className="text-xs text-slate-500">Importado de planilla anterior</span>}
          </div>
        </header>

        {r.status === 'rejected' && r.reviewComment && (
          <div className="mx-5 sm:mx-6 mt-5 rounded-lg border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad-text">
            <strong>Rechazado por {lk.userName(r.rejectedBy)}:</strong> {r.reviewComment}
          </div>
        )}

        <div className="px-5 sm:px-6 py-5 grid gap-6">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            <Item label="Responsable">{lk.userName(r.operatorId)}</Item>
            <Item label="Producto">{lk.productName(r.productId)}</Item>
            <Item label="Variedad">{lk.varietyName(r.varietyId)}</Item>
            <Item label="Lote">
              <Link to={`/trazabilidad?lote=${encodeURIComponent(r.lot)}`} className="font-mono text-brand-700 hover:underline">{r.lot}</Link>
            </Item>
            <Item label="Presentación">{lk.presentationName(r.presentationId)}</Item>
            <Item label="Horario">{r.startTime} – {r.endTime}</Item>
            <Item label="Unidades">{fmtNum(r.units)} u × {fmtNum(r.unitWeightKg, r.unitWeightKg % 1 ? 2 : 0)} kg</Item>
            <Item label="Pallets">{fmtNum(r.pallets)} ({fmtNum(r.unitsPerPallet)} u/pallet)</Item>
          </dl>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Producción" value={`${fmtNum(m.totalKg)} kg`} sub={`${fmtNum(m.totalTn, 2)} tn · ${fmtPct(m.productionAttainmentPct, 0)} del objetivo`} />
            <Metric label="Tiempo total" value={fmtDuration(m.durationMin)} sub={`Productivo ${fmtDuration(m.productiveMin)}`} />
            <Metric label="Tiempo detenido" value={fmtDuration(m.downtimeMin)} sub={`${fmtPct(m.downtimePct)} · ${r.downtimes.length} parada(s)`} level={m.downtimePct !== null && m.downtimePct > targets.maxDowntimePct ? 'warning' : undefined} />
            <Metric label="Productividad" value={m.kgPerHour !== null ? `${fmtNum(m.kgPerHour)} kg/h` : '—'} sub={`Objetivo ${fmtNum(targets.targetKgPerHour)} · ${fmtPct(m.productivityAttainmentPct, 0)}`} level={prodLevel} />
            <Metric label="Merma" value={fmtPct(m.scrapPct, 2)} sub={`${fmtNum(r.scrapKg)} kg · máx. ${targets.maxScrapPct} %`} level={scrapLevel} />
            <Metric label="Producto rechazado" value={`${fmtNum(r.rejectedKg)} kg`} sub={fmtPct(m.rejectedPct, 2)} />
            <Metric label="Kg procesados" value={`${fmtNum(m.processedKg)} kg`} sub="Producido + merma" />
            <Metric label="Productividad" value={m.tnPerHour !== null ? `${fmtNum(m.tnPerHour, 2)} tn/h` : '—'} sub="Por hora productiva" />
          </div>
          {(r.scrapReason || r.scrapObservations) && (
            <p className="text-sm text-slate-600 -mt-2">
              <span className="font-medium text-slate-800">Motivo de merma:</span> {r.scrapReason || '—'} {r.scrapObservations && `· ${r.scrapObservations}`}
            </p>
          )}
        </div>
      </article>

      <div className="grid gap-5 lg:grid-cols-3 mt-5">
        <div className="lg:col-span-2 space-y-5">
          <Card title={`Paradas (${r.downtimes.length})`} bodyClassName="px-0 pb-2">
            {r.downtimes.length ? (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th className="text-right">Duración</th>
                      <th>Categoría</th>
                      <th>Motivo</th>
                      <th>Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.downtimes.map((d) => (
                      <tr key={d.id}>
                        <td className="tabular-nums">{d.startTime}</td>
                        <td className="tabular-nums">{d.endTime}</td>
                        <td className={`num font-medium ${d.durationMinutes > targets.maxStopMinutes ? 'text-bad-text' : ''}`}>{d.durationMinutes} min</td>
                        <td>{lk.categoryName(d.categoryId)}</td>
                        <td className="whitespace-normal">{d.reason || '—'}</td>
                        <td className="whitespace-normal text-slate-500">{d.observations || '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={2}>Total detenido</td>
                      <td className="num">{m.downtimeMin} min</td>
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Sin paradas registradas" />
            )}
          </Card>

          <Card title="Controles de calidad">
            <ul className="divide-y divide-slate-100">
              {QUALITY_ITEMS.map((q) => (
                <li key={q.key} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{q.label}</span>
                  <QualityValueTag value={r.quality[q.key]} />
                </li>
              ))}
            </ul>
            {r.quality.observations && <p className="mt-3 text-sm text-slate-600"><span className="font-medium text-slate-800">Observaciones:</span> {r.quality.observations}</p>}
            {r.quality.hasIncident && (
              <div className="mt-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-text">
                <strong>Incidencia de calidad:</strong> {r.quality.incidentDescription || 'Sin descripción'}
              </div>
            )}
          </Card>

          <Card title="Observaciones">
            <p className="text-sm text-slate-700 whitespace-pre-line">{r.observations || 'Sin observaciones.'}</p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Aprobación">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Creado por</dt><dd className="text-right">{lk.userName(r.createdBy)}<br /><span className="text-xs text-slate-500">{fmtDateTime(r.createdAt)}</span></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Última modificación</dt><dd className="text-right">{lk.userName(r.updatedBy)}<br /><span className="text-xs text-slate-500">{fmtDateTime(r.updatedAt)}</span></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Enviado</dt><dd className="text-right">{fmtDateTime(r.submittedAt)}</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Aprobado por</dt>
                <dd className="text-right">{r.approvedBy ? <>{lk.userName(r.approvedBy)}<br /><span className="text-xs text-slate-500">{fmtDateTime(r.approvedAt)}</span></> : '—'}</dd>
              </div>
              {r.reviewComment && r.status !== 'rejected' && <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">“{r.reviewComment}”</div>}
            </dl>
          </Card>

          {alerts.length > 0 && (
            <Card title="Alertas del registro">
              <div className="space-y-2">{alerts.map((a) => <AlertCard key={a.id} alert={a} />)}</div>
            </Card>
          )}

          <Card title="Historial de modificaciones">
            {audit.length ? (
              <ol className="relative border-l border-slate-200 ml-2 space-y-4">
                {audit.map((a) => (
                  <li key={a.id} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" />
                    <div className="text-xs text-slate-500 tabular-nums">{fmtDateTime(a.at)}</div>
                    <div className="text-sm"><strong>{lk.userName(a.userId)}</strong> {ACTION_LABEL[a.action].toLowerCase()} el registro</div>
                    {a.changes.map((c) => (
                      <div key={c.field} className="text-xs text-slate-600 mt-0.5">
                        {c.label}: <span className="line-through text-slate-400">{c.from}</span> → <span className="font-medium text-slate-800">{c.to}</span>
                      </div>
                    ))}
                    {a.comment && <div className="text-xs text-slate-500 italic mt-0.5">“{a.comment}”</div>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">Sin movimientos.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
