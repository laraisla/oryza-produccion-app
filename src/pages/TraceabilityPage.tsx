import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertOctagon, Clock, Factory, Package, Printer, ScanSearch, User as UserIcon } from 'lucide-react';
import { useData, useLookups } from '@/hooks/useData';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QUALITY_ITEMS } from '@/components/production/QualityControl';
import { aggregate, computeMetrics } from '@/utils/calc';
import { shiftMap } from '@/utils/analytics';
import { can } from '@/utils/permissions';
import { fmtDate, fmtDateLong, fmtDuration, fmtNum, fmtPct, normalize } from '@/utils/format';
import type { QualityValue } from '@/types/domain';

const Q_STYLE: Record<Exclude<QualityValue, null>, { sym: string; cls: string; label: string }> = {
  ok: { sym: '✓', cls: 'bg-ok-bg text-ok-text', label: 'Conforme' },
  obs: { sym: '⚠', cls: 'bg-warn-bg text-warn-text', label: 'Observación' },
  nc: { sym: '✕', cls: 'bg-bad-bg text-bad-text', label: 'No conforme' },
};

export function TraceabilityPage() {
  const { db, user } = useData();
  const lk = useLookups();
  const [params, setParams] = useSearchParams();
  const lot = params.get('lote') ?? '';
  const [query, setQuery] = useState(lot);
  const sm = useMemo(() => shiftMap(db), [db]);

  const allLots = useMemo(() => {
    const m = new Map<string, string>();
    [...db.records].sort((a, b) => b.date.localeCompare(a.date)).forEach((r) => !m.has(r.lot) && m.set(r.lot, r.date));
    return [...m.entries()];
  }, [db.records]);

  const result = useMemo(() => {
    if (!lot) return null;
    const n = normalize(lot);
    const recs = db.records
      .filter((r) => normalize(r.lot) === n)
      .sort((a, b) => (a.date + (sm.get(a.shiftId)?.start ?? '')).localeCompare(b.date + (sm.get(b.shiftId)?.start ?? '')));
    const suggestions = recs.length ? [] : allLots.filter(([l]) => normalize(l).includes(n)).slice(0, 8);
    const counted = recs.filter((r) => r.status !== 'rejected');
    return { recs, suggestions, agg: aggregate(counted, sm) };
  }, [lot, db.records, sm, allLots]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setParams(query.trim() ? { lote: query.trim().toUpperCase() } : {});
  };

  const recs = result?.recs ?? [];
  const uniq = <T,>(arr: T[]) => [...new Set(arr)];
  const allQuality = recs.flatMap((r) => QUALITY_ITEMS.map((q) => r.quality[q.key]));
  const qualityState: 'nc' | 'obs' | 'ok' | null = allQuality.includes('nc') ? 'nc' : allQuality.includes('obs') ? 'obs' : allQuality.some((v) => v === 'ok') ? 'ok' : null;
  const incidents = recs.filter((r) => r.quality.hasIncident);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Trazabilidad por lote"
        subtitle="Toda la historia productiva de un lote: cuándo, dónde, quién, cuánto y con qué controles."
        actions={recs.length > 0 && <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>}
      />
      <form onSubmit={onSubmit} className="card p-4 mb-5 flex flex-col gap-3 sm:flex-row no-print" role="search">
        <label htmlFor="trace-lot" className="sr-only">Número de lote</label>
        <div className="relative flex-1">
          <ScanSearch size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="trace-lot"
            className="input !h-12 pl-11 text-base font-mono uppercase tracking-wide"
            placeholder="Ingresa o escanea un número de lote (ej. LOT-240926-01)"
            list="trace-lots"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <datalist id="trace-lots">
            {allLots.slice(0, 150).map(([l, d]) => <option key={l} value={l}>{fmtDate(d)}</option>)}
          </datalist>
        </div>
        <button className="btn btn-primary btn-lg" type="submit">Buscar lote</button>
      </form>

      {!lot && (
        <Card title="Lotes recientes">
          <div className="flex flex-wrap gap-2">
            {allLots.slice(0, 16).map(([l, d]) => (
              <button key={l} className="chip !min-h-[36px] font-mono text-xs" onClick={() => { setQuery(l); setParams({ lote: l }); }}>
                {l} <span className="ml-2 text-slate-400 font-sans">{fmtDate(d).slice(0, 5)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {lot && result && !recs.length && (
        <Card>
          <EmptyState title={`No se encontraron registros para el lote ${lot}`}>
            {result.suggestions.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2">¿Quisiste decir…?</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {result.suggestions.map(([l]) => (
                    <button key={l} className="chip !min-h-[36px] font-mono text-xs" onClick={() => { setQuery(l); setParams({ lote: l }); }}>{l}</button>
                  ))}
                </div>
              </div>
            ) : (
              'Verifica el número de lote.'
            )}
          </EmptyState>
        </Card>
      )}

      {recs.length > 0 && result && (
        <>
          {/* Encabezado del lote */}
          <section className="card overflow-hidden mb-5">
            <div className="bg-brand-900 text-white px-5 sm:px-6 py-5">
              <div className="text-xs uppercase tracking-wider text-slate-300">Lote</div>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <h2 className="text-2xl sm:text-3xl font-semibold font-mono tracking-wide">{recs[0]!.lot}</h2>
                {qualityState && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${Q_STYLE[qualityState].cls}`}>
                    {Q_STYLE[qualityState].sym} Calidad: {Q_STYLE[qualityState].label}
                  </span>
                )}
                {incidents.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-bad px-2.5 py-1 text-xs font-semibold text-white">
                    <AlertOctagon size={12} /> {incidents.length} incidencia(s)
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300 mt-1">
                {uniq(recs.map((r) => lk.productName(r.productId))).join(', ')} · {uniq(recs.map((r) => lk.varietyName(r.varietyId))).join(', ')}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-slate-100">
              {[
                ['Cantidad producida', `${fmtNum(result.agg.totalKg)} kg`, `${fmtNum(result.agg.totalKg / 1000, 2)} tn`],
                ['Unidades', fmtNum(recs.reduce((a, r) => a + (r.status !== 'rejected' ? r.units : 0), 0)), uniq(recs.map((r) => lk.presentationName(r.presentationId))).join(', ')],
                ['Pallets', fmtNum(recs.reduce((a, r) => a + (r.status !== 'rejected' ? r.pallets : 0), 0)), `${recs.length} registro(s)`],
                ['Período', recs.length > 1 && recs[0]!.date !== recs[recs.length - 1]!.date ? `${fmtDate(recs[0]!.date).slice(0, 5)} – ${fmtDate(recs[recs.length - 1]!.date).slice(0, 5)}` : fmtDate(recs[0]!.date), uniq(recs.map((r) => lk.shiftName(r.shiftId))).join(', ')],
                ['Merma / detenido', fmtPct(result.agg.scrapPct, 2), `${fmtDuration(result.agg.downtimeMin)} detenido`],
              ].map(([label, value, sub]) => (
                <div key={label} className="px-5 py-4">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-900 truncate">{value}</div>
                  <div className="text-xs text-slate-500 truncate">{sub}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Línea de tiempo */}
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Recorrido productivo</h3>
          <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
            {recs.map((r) => {
              const m = computeMetrics(r, sm.get(r.shiftId));
              const visible = can.viewRecord(user, r);
              return (
                <li key={r.id} className="relative pl-11">
                  <span className={`absolute left-0 top-4 h-[31px] w-[31px] rounded-full border-4 border-slate-50 ${r.status === 'approved' ? 'bg-ok' : r.status === 'pending' ? 'bg-warn' : r.status === 'rejected' ? 'bg-bad' : 'bg-slate-400'}`} aria-hidden />
                  <article className="card">
                    <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-100">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{fmtDateLong(r.date)} · Turno {lk.shiftName(r.shiftId)}</div>
                        <div className="text-xs text-slate-500">
                          {visible ? <Link to={`/registros/${r.id}`} className="text-brand-700 hover:underline tabular-nums">{r.number}</Link> : r.number} · {lk.productName(r.productId)} · {lk.varietyName(r.varietyId)}
                        </div>
                      </div>
                      <StatusBadge status={r.status} long />
                    </header>
                    <div className="px-4 sm:px-5 py-4 grid gap-4 md:grid-cols-[1fr_1fr]">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-start gap-2"><Factory size={15} className="text-slate-400 mt-0.5" /><div><div className="text-xs text-slate-500">Línea</div>{lk.lineName(r.lineId)}</div></div>
                        <div className="flex items-start gap-2"><UserIcon size={15} className="text-slate-400 mt-0.5" /><div><div className="text-xs text-slate-500">Responsable</div>{lk.userName(r.operatorId)}</div></div>
                        <div className="flex items-start gap-2"><Package size={15} className="text-slate-400 mt-0.5" /><div><div className="text-xs text-slate-500">Producido</div><span className="font-semibold tabular-nums">{fmtNum(m.totalKg)} kg</span> · {fmtNum(r.units)} × {lk.presentationName(r.presentationId)}</div></div>
                        <div className="flex items-start gap-2"><Clock size={15} className="text-slate-400 mt-0.5" /><div><div className="text-xs text-slate-500">Horario</div><span className="tabular-nums">{r.startTime} – {r.endTime}</span> · {fmtNum(m.kgPerHour)} kg/h</div></div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1.5">Controles realizados</div>
                        <div className="flex flex-wrap gap-1.5">
                          {QUALITY_ITEMS.map((q) => {
                            const v = r.quality[q.key];
                            const st = v ? Q_STYLE[v] : null;
                            return (
                              <span key={q.key} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${st ? st.cls : 'bg-slate-100 text-slate-500'}`} title={st?.label ?? 'Sin dato'}>
                                <span aria-hidden>{st?.sym ?? '·'}</span> {q.label}
                              </span>
                            );
                          })}
                        </div>
                        <div className="mt-2 text-xs text-slate-600">Merma {fmtPct(m.scrapPct, 2)} ({fmtNum(r.scrapKg)} kg){r.rejectedKg ? ` · Rechazado ${fmtNum(r.rejectedKg)} kg` : ''}</div>
                      </div>
                    </div>
                    {(r.downtimes.length > 0 || r.observations || r.quality.observations || r.quality.hasIncident) && (
                      <div className="px-4 sm:px-5 pb-4 grid gap-3 md:grid-cols-2">
                        {r.downtimes.length > 0 && (
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Paradas relacionadas · {fmtDuration(m.downtimeMin)}</div>
                            <ul className="space-y-1">
                              {r.downtimes.map((d) => (
                                <li key={d.id} className="text-xs text-slate-700 tabular-nums">
                                  {d.startTime}–{d.endTime} · <strong>{d.durationMinutes} min</strong> · {lk.categoryName(d.categoryId)}{d.reason ? ` — ${d.reason}` : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="space-y-1.5 text-xs">
                          {r.quality.hasIncident && <p className="rounded-md bg-bad-bg px-2 py-1.5 text-bad-text"><strong>Incidencia:</strong> {r.quality.incidentDescription}</p>}
                          {r.quality.observations && <p className="text-slate-600"><strong>Calidad:</strong> {r.quality.observations}</p>}
                          {r.observations && <p className="text-slate-600"><strong>Observaciones:</strong> {r.observations}</p>}
                        </div>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
