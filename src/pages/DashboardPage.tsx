import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useFilters } from '@/hooks/useFilters';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPICard } from '@/components/ui/KPICard';
import { Card, EmptyState } from '@/components/ui/Card';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { ProductionTable } from '@/components/production/ProductionTable';
import { DailyProductionChart, ParetoChart, ProductivityChart, ScrapChart, ShareBars, ShiftChart } from '@/components/charts/ProductionCharts';
import { applyFilters, dailySeries, downtimePareto, groupBy, shiftMap } from '@/utils/analytics';
import { aggregate, resolveTargets } from '@/utils/calc';
import { computeAlerts } from '@/utils/alerts';
import { fmtDate, fmtDuration, fmtNum } from '@/utils/format';
import { daysBetween, today } from '@/utils/time';
import { can } from '@/utils/permissions';
import type { Level } from '@/components/ui/SeverityBadge';

export function DashboardPage() {
  const { db, user } = useData();
  const navigate = useNavigate();
  const { filters, setFilters, reset } = useFilters('dashboard');
  const sm = useMemo(() => shiftMap(db), [db]);

  const data = useMemo(() => {
    const t = today();
    const scoped = applyFilters(db.records, filters);
    const todayRecs = applyFilters(db.records, filters, { ignoreDates: true }).filter((r) => r.date === t);
    const agg = aggregate(scoped, sm);
    const aggToday = aggregate(todayRecs, sm);
    const todayTarget = todayRecs.reduce((a, r) => a + resolveTargets(db.settings.targets, db.lines.find((l) => l.id === r.lineId)).targetKgPerShift, 0);
    const daily = dailySeries(db, scoped, filters.from, filters.to);
    const targetTnH = (() => {
      let w = 0,
        h = 0;
      daily.forEach((d) => {
        if (d.targetTnPerHour !== null && d.tnPerHour !== null && d.tn > 0) {
          const hours = d.tn / d.tnPerHour;
          w += d.targetTnPerHour * hours;
          h += hours;
        }
      });
      return h > 0 ? w / h : null;
    })();
    const pendingAll = db.records.filter(
      (r) => r.status === 'pending' && (can.viewAllRecords(user) || r.operatorId === user.id || r.createdBy === user.id),
    );
    const visible = db.records.filter((r) => can.viewRecord(user, r));
    const recent = [...visible].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
    const alerts = computeAlerts(db, scoped.filter((r) => can.viewRecord(user, r)));
    const daysWithProd = new Set(scoped.map((r) => r.date)).size;
    return {
      scoped,
      agg,
      aggToday,
      todayTarget,
      daily,
      targetTnH,
      byProduct: groupBy(db, scoped, 'productId'),
      byShift: groupBy(db, scoped, 'shiftId'),
      pareto: downtimePareto(db, scoped),
      pending: pendingAll.length,
      recent,
      alerts,
      days: daysBetween(filters.from, filters.to).length,
      daysWithProd,
      shiftsCount: scoped.length,
    };
  }, [db, filters, sm, user]);

  const t = db.settings.targets;
  const { agg, aggToday } = data;
  const tnh = agg.kgPerHour !== null ? agg.kgPerHour / 1000 : null;
  const prodLevel: Level | undefined = tnh !== null && data.targetTnH ? (tnh / data.targetTnH < 0.9 ? 'warning' : 'ok') : undefined;
  const scrapLevel: Level | undefined = agg.scrapPct === null ? undefined : agg.scrapPct > t.maxScrapPct ? 'critical' : 'ok';
  const dtLevel: Level | undefined = agg.downtimePct === null ? undefined : agg.downtimePct > t.maxDowntimePct ? 'warning' : 'ok';
  const periodLabel = filters.from === filters.to ? fmtDate(filters.from) : `${fmtDate(filters.from)} – ${fmtDate(filters.to)}`;

  return (
    <div>
      <PageHeader
        title="Dashboard de Producción"
        subtitle={`Fraccionamiento · ${periodLabel} · ${data.shiftsCount} registros de turno`}
        actions={
          <Link to="/registros/nuevo" className="btn btn-primary">
            <Plus size={16} /> Nuevo registro
          </Link>
        }
      />
      <FilterBar db={db} filters={filters} onChange={setFilters} onReset={reset} />

      {/* Fila 2 · KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KPICard
          label="Producción de hoy"
          value={fmtNum(aggToday.totalKg / 1000, 1)}
          unit="tn"
          sub={data.todayTarget ? `${fmtNum((aggToday.totalKg / data.todayTarget) * 100, 0)} % del objetivo (${fmtNum(data.todayTarget / 1000, 0)} tn)` : 'Sin registros enviados hoy'}
        />
        <KPICard
          label="Producción del período"
          value={fmtNum(agg.totalKg / 1000, agg.totalKg >= 100000 ? 0 : 1)}
          unit="tn"
          sub={data.daysWithProd ? `Promedio ${fmtNum(agg.totalKg / 1000 / data.daysWithProd, 1)} tn/día` : '—'}
        />
        <KPICard
          label="Productividad promedio"
          value={tnh !== null ? fmtNum(tnh, 2) : '—'}
          unit="tn/h"
          level={prodLevel}
          sub={data.targetTnH ? `Objetivo ${fmtNum(data.targetTnH, 2)} tn/h · ${tnh ? fmtNum((tnh / data.targetTnH) * 100, 0) : '—'} %` : 'Por hora productiva'}
        />
        <KPICard
          label="Tiempo detenido"
          value={agg.downtimeMin >= 600 ? fmtNum(agg.downtimeMin / 60, 1) : fmtNum(agg.downtimeMin)}
          unit={agg.downtimeMin >= 600 ? 'h' : 'min'}
          level={dtLevel}
          sub={agg.records ? `${fmtNum(agg.downtimePct, 1)} % del tiempo · ${fmtNum(agg.downtimeMin / agg.records, 0)} min/turno` : '—'}
        />
        <KPICard
          label="Merma"
          value={agg.scrapPct !== null ? fmtNum(agg.scrapPct, 2) : '—'}
          unit="%"
          level={scrapLevel}
          sub={`${fmtNum(agg.scrapKg)} kg · máx. ${fmtNum(t.maxScrapPct, 1)} %`}
        />
        <KPICard
          label="Registros pendientes"
          value={String(data.pending)}
          level={data.pending > 0 ? 'warning' : 'ok'}
          sub={data.pending ? 'Esperando aprobación del supervisor' : 'Sin pendientes'}
          onClick={() => navigate('/registros?estado=pending')}
        />
      </div>

      {/* Fila 3 */}
      <div className="grid gap-5 lg:grid-cols-3 mb-5">
        <Card title="Producción diaria" subtitle="Toneladas por día vs objetivo · clic en una barra para ver el cierre" className="lg:col-span-2">
          <DailyProductionChart data={data.daily} onSelectDate={can.closeDay(user) ? (d) => navigate(`/cierre?fecha=${d}`) : undefined} />
        </Card>
        <Card title="Producción por producto" subtitle="Participación en toneladas">
          <ShareBars rows={data.byProduct} />
        </Card>
      </div>

      {/* Fila 4 */}
      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        <Card title="Productividad" subtitle="Evolución de tn por hora productiva">
          <ProductivityChart data={data.daily} />
        </Card>
        <Card title="Tiempo detenido por causa" subtitle="Pareto de minutos perdidos">
          <ParetoChart rows={data.pareto} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        <Card title="Producción por turno" subtitle="Toneladas por turno en el período">
          <ShiftChart rows={data.byShift} />
        </Card>
        <Card title="Merma diaria" subtitle="% de merma sobre kg procesados">
          <ScrapChart data={data.daily} max={t.maxScrapPct} />
        </Card>
      </div>

      {/* Fila 5 */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card
          title="Últimos registros"
          className="xl:col-span-2"
          bodyClassName="pb-2"
          actions={<Link to="/registros" className="btn btn-ghost btn-sm">Ver todos</Link>}
        >
          {data.recent.length ? (
            <ProductionTable records={data.recent} user={user} shifts={sm} maxScrapPct={t.maxScrapPct} compact />
          ) : (
            <EmptyState title="Todavía no hay registros">Crea el primero desde “Nuevo registro”.</EmptyState>
          )}
        </Card>
        <Card
          title="Alertas operativas"
          subtitle={`${data.alerts.filter((a) => a.severity === 'critical').length} problemas · ${data.alerts.filter((a) => a.severity === 'warning').length} a revisar`}
          actions={<Link to="/alertas" className="btn btn-ghost btn-sm">Ver todas</Link>}
        >
          {data.alerts.length ? (
            <div className="space-y-2">
              {data.alerts.slice(0, 6).map((a) => (
                <AlertCard key={a.id} alert={a} compact />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin alertas en el período">Todos los indicadores están dentro de los parámetros.</EmptyState>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Los indicadores consideran registros aprobados{filters.includePending ? ' y pendientes de aprobación' : ''}. Tiempo detenido total del período: {fmtDuration(agg.downtimeMin)}.
      </p>
    </div>
  );
}
