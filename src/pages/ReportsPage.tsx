import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileSpreadsheet, Lightbulb, Printer, TrendingUp, Info } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { useFilters } from '@/hooks/useFilters';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState } from '@/components/ui/Card';
import { KPICard } from '@/components/ui/KPICard';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { COLORS, ParetoChart, ShareBars, ShiftChart } from '@/components/charts/ProductionCharts';
import {
  advancedKpis,
  applyFilters,
  computeInsights,
  downtimePareto,
  groupBy,
  periodSeries,
  shiftMap,
  topDowntimeReasons,
  type GroupRow,
  type Period,
} from '@/utils/analytics';
import { aggregate } from '@/utils/calc';
import { fmtDate, fmtDuration, fmtNum, fmtPct } from '@/utils/format';
import { exportCSV, exportExcel, groupSheet, periodSheet, recordsWorkbook } from '@/services/exportService';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'daily', label: 'Reporte diario' },
  { id: 'weekly', label: 'Reporte semanal' },
  { id: 'monthly', label: 'Reporte mensual' },
];

function GroupPerf({ rows, dim }: { rows: GroupRow[]; dim: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>{dim}</th>
            <th className="text-right">tn</th>
            <th className="text-right">tn/h</th>
            <th className="text-right">Cumpl.</th>
            <th className="text-right">Merma</th>
            <th className="text-right">% parada</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="max-w-[180px] truncate">{r.name}</td>
              <td className="num font-medium">{fmtNum(r.kg / 1000, 1)}</td>
              <td className="num">{r.kgPerHour !== null ? fmtNum(r.kgPerHour / 1000, 2) : '—'}</td>
              <td className={`num ${r.attainmentPct !== null && r.attainmentPct < 90 ? 'text-warn-text font-semibold' : ''}`}>{fmtPct(r.attainmentPct, 0)}</td>
              <td className="num">{fmtPct(r.scrapPct, 2)}</td>
              <td className="num">{fmtPct(r.downtimePct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage() {
  const { db } = useData();
  const { run } = useFeedback();
  const { filters, setFilters, reset } = useFilters('reports');
  const [period, setPeriod] = useState<Period>('daily');
  const sm = useMemo(() => shiftMap(db), [db]);

  const r = useMemo(() => {
    const recs = applyFilters(db.records, filters);
    return {
      recs,
      agg: aggregate(recs, sm),
      periods: periodSeries(db, recs, period),
      byShift: groupBy(db, recs, 'shiftId'),
      byProduct: groupBy(db, recs, 'productId'),
      byLine: groupBy(db, recs, 'lineId'),
      byVariety: groupBy(db, recs, 'varietyId'),
      byOperator: groupBy(db, recs, 'operatorId'),
      pareto: downtimePareto(db, recs),
      reasons: topDowntimeReasons(db, recs, 8),
      adv: advancedKpis(db, recs),
      insights: computeInsights(db, recs),
    };
  }, [db, filters, period, sm]);

  const title = PERIODS.find((p) => p.id === period)!.label;
  const exportXlsx = () =>
    run(
      () =>
        exportExcel(
          [
            periodSheet(r.periods),
            groupSheet('Por turno', 'Turno', r.byShift),
            groupSheet('Por producto', 'Producto', r.byProduct),
            groupSheet('Por línea', 'Línea', r.byLine),
            groupSheet('Por variedad', 'Variedad', r.byVariety),
            {
              name: 'Pareto paradas',
              rows: r.pareto.map((p) => ({ Categoria: p.name, Paradas: p.stops, Minutos: p.minutes, Porcentaje: Math.round(p.pct * 10) / 10, Acumulado: Math.round(p.cumPct * 10) / 10 })),
            },
            ...recordsWorkbook(db, r.recs),
          ],
          `reporte_${period}_${filters.from}_${filters.to}.xlsx`,
        ),
      'Reporte Excel generado.',
    );

  const a = r.adv;

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle={`${title} · ${fmtDate(filters.from)} al ${fmtDate(filters.to)} · ${r.recs.length} registros`}
        actions={
          <>
            <button className="btn btn-secondary" onClick={exportXlsx} disabled={!r.recs.length}><FileSpreadsheet size={16} /> Exportar Excel</button>
            <button className="btn btn-secondary" onClick={() => exportCSV(db, r.recs, `reporte_registros_${filters.from}_${filters.to}.csv`)} disabled={!r.recs.length}><Download size={16} /> Exportar CSV</button>
            <button className="btn btn-secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir / PDF</button>
          </>
        }
      />
      <FilterBar db={db} filters={filters} onChange={setFilters} onReset={reset} dims={['shiftId', 'productId', 'lineId', 'varietyId']} />

      <div role="tablist" aria-label="Tipo de reporte" className="flex gap-1 mb-5 no-print">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}
            className={`px-4 h-10 rounded-lg text-sm font-medium transition-colors ${period === p.id ? 'bg-brand-700 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {!r.recs.length ? (
        <Card><EmptyState title="Sin datos para los filtros seleccionados" /></Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <KPICard label="Toneladas producidas" value={fmtNum(r.agg.totalKg / 1000, 1)} unit="tn" sub={`${r.agg.records} registros`} />
            <KPICard label="Productividad" value={r.agg.kgPerHour ? fmtNum(r.agg.kgPerHour / 1000, 2) : '—'} unit="tn/h" sub="Por hora productiva" />
            <KPICard label="Merma" value={fmtNum(r.agg.scrapPct, 2)} unit="%" level={(r.agg.scrapPct ?? 0) > db.settings.targets.maxScrapPct ? 'critical' : 'ok'} sub={`${fmtNum(r.agg.scrapKg)} kg`} />
            <KPICard label="Tiempo detenido" value={fmtNum(r.agg.downtimeMin / 60, 1)} unit="h" sub={`${fmtPct(r.agg.downtimePct)} · ${r.agg.stops} paradas`} />
            <KPICard label="Disponibilidad" value={fmtNum(a.availabilityPct, 1)} unit="%" sub="Sin paradas planificadas" />
            <KPICard label="OEE estimado" value={a.oeePct !== null ? fmtNum(a.oeePct, 1) : '—'} unit="%" sub="Ver supuestos abajo" />
          </div>

          <Card title={`${title}: producción por período`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={r.periods.map((p) => ({ ...p, tn: p.kg / 1000 }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: COLORS.grid }} interval="preserveStartEnd" minTickGap={10} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmtNum(v)} />
                <Tooltip cursor={{ fill: 'rgba(42,95,168,0.06)' }} formatter={(v: number) => [`${fmtNum(v, 1)} tn`, 'Producción']} />
                <Bar dataKey="tn" fill={COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto mt-4">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th className="text-right">Registros</th>
                    <th className="text-right">Toneladas</th>
                    <th className="text-right">Horas prod.</th>
                    <th className="text-right">tn/h</th>
                    <th className="text-right">Merma</th>
                    <th className="text-right">Detenido</th>
                    <th className="text-right">% parada</th>
                  </tr>
                </thead>
                <tbody>
                  {r.periods.map((p) => (
                    <tr key={p.key}>
                      <td>{p.label}</td>
                      <td className="num">{p.records}</td>
                      <td className="num font-medium">{fmtNum(p.kg / 1000, 2)}</td>
                      <td className="num">{fmtNum(p.productiveMin / 60, 1)}</td>
                      <td className="num">{p.kgPerHour ? fmtNum(p.kgPerHour / 1000, 2) : '—'}</td>
                      <td className={`num ${(p.scrapPct ?? 0) > db.settings.targets.maxScrapPct ? 'text-bad-text font-semibold' : ''}`}>{fmtPct(p.scrapPct, 2)}</td>
                      <td className="num">{fmtDuration(p.downtimeMin)}</td>
                      <td className="num">{fmtPct(p.downtimePct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Oportunidades de mejora detectadas" subtitle="Análisis automático sobre los registros filtrados">
            {r.insights.length ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {r.insights.map((i) => (
                  <li key={i.id} className={`rounded-lg border px-4 py-3 ${i.kind === 'opportunity' ? 'border-warn/50 bg-warn-bg/40' : i.kind === 'positive' ? 'border-ok/30 bg-ok-bg/50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-start gap-2">
                      {i.kind === 'opportunity' ? <Lightbulb size={16} className="text-warn-text mt-0.5 shrink-0" /> : i.kind === 'positive' ? <TrendingUp size={16} className="text-ok mt-0.5 shrink-0" /> : <Info size={16} className="text-slate-400 mt-0.5 shrink-0" />}
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{i.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{i.detail}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Se necesitan al menos 5 registros para el análisis" />
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Principales causas de parada" subtitle="Pareto de minutos perdidos">
              <ParetoChart rows={r.pareto} limit={10} />
            </Card>
            <Card title="Motivos más frecuentes" bodyClassName="px-0 pb-2">
              <table className="table-base">
                <thead><tr><th>Categoría</th><th>Motivo</th><th className="text-right">Paradas</th><th className="text-right">Min</th></tr></thead>
                <tbody>
                  {r.reasons.map((x) => (
                    <tr key={x.category + x.reason}><td>{x.category}</td><td className="whitespace-normal">{x.reason}</td><td className="num">{x.stops}</td><td className="num font-medium">{fmtNum(x.minutes)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Producción por turno"><ShiftChart rows={r.byShift} /><GroupPerf rows={r.byShift} dim="Turno" /></Card>
            <Card title="Producción por producto"><ShareBars rows={r.byProduct} /><div className="mt-4"><GroupPerf rows={r.byProduct} dim="Producto" /></div></Card>
            <Card title="Eficiencia por línea"><GroupPerf rows={r.byLine} dim="Línea" /></Card>
            <Card title="Eficiencia por responsable"><GroupPerf rows={r.byOperator} dim="Responsable" /></Card>
          </div>

          <Card title="Indicadores de ingeniería (preparación OEE)" subtitle="Calculados solo cuando existen los datos necesarios">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Disponibilidad', fmtPct(a.availabilityPct, 1), `Paradas no planificadas: ${fmtDuration(a.unplannedStopMin)}`],
                ['Rendimiento', fmtPct(a.performancePct, 1), a.performanceNote ?? 'kg reales / capacidad nominal × tiempo de marcha'],
                ['Calidad', fmtPct(a.qualityPct, 2), '(kg − rechazado) / (kg + merma)'],
                ['OEE estimado', fmtPct(a.oeePct, 1), 'Disponibilidad × Rendimiento × Calidad'],
                ['MTBF', a.mtbfMin !== null ? fmtDuration(a.mtbfMin) : '—', `Tiempo de marcha / ${a.failures} fallas`],
                ['MTTR', a.mttrMin !== null ? fmtDuration(a.mttrMin) : '—', 'Minutos de falla / cantidad de fallas'],
                ['Paradas planificadas', fmtDuration(a.plannedStopMin), 'Limpieza y cambios de producto'],
              ].map(([l, v, s]) => (
                <div key={l} className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <div className="text-xs text-slate-500">{l}</div>
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                  <div className="text-[11px] text-slate-500">{s}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Datos adicionales necesarios para completar el tablero de ingeniería:</p>
              <p>• <strong>Producción planificada vs real</strong> y <strong>capacidad utilizada/disponible</strong>: requiere un plan de producción por turno y línea (calendario de turnos programados, horas disponibles y paradas programadas).</p>
              <p>• <strong>OEE validado</strong>: requiere confirmar la capacidad nominal de cada línea por presentación (hoy es una hipótesis configurable en Líneas) y registrar microparadas/velocidad real.</p>
              <p>• <strong>MTBF/MTTR por equipo</strong>: requiere identificar el equipo o componente que falló (catálogo de activos) y la hora de reparación, no solo la duración de la parada.</p>
              <p>• <strong>Calidad por unidades</strong>: requiere registrar unidades reprocesadas y resultados de laboratorio por lote.</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
