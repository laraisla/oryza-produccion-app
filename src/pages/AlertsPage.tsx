import { useMemo, useState } from 'react';
import { useData } from '@/hooks/useData';
import { useFilters } from '@/hooks/useFilters';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, EmptyState } from '@/components/ui/Card';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { applyFilters } from '@/utils/analytics';
import { ALERT_TYPE_LABEL, computeAlerts, type AlertType, type Severity } from '@/utils/alerts';
import { can } from '@/utils/permissions';
import { addDays, today } from '@/utils/time';

export function AlertsPage() {
  const { db, user } = useData();
  const { filters, setFilters, reset } = useFilters('alerts', { from: addDays(today(), -6) });
  const [severity, setSeverity] = useState<'' | Severity>('');
  const [type, setType] = useState<'' | AlertType>('');

  const all = useMemo(() => {
    // Las alertas incluyen borradores (registro incompleto), por eso se filtra sin restricción de estado.
    const recs = applyFilters(db.records, filters, { anyStatus: true }).filter((r) => can.viewRecord(user, r));
    return computeAlerts(db, recs);
  }, [db, filters, user]);
  const shown = all.filter((a) => (!severity || a.severity === severity) && (!type || a.type === type));
  const count = (s: Severity) => all.filter((a) => a.severity === s).length;
  const byType = (Object.keys(ALERT_TYPE_LABEL) as AlertType[]).map((t) => [t, all.filter((a) => a.type === t).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Alertas operativas" subtitle="Desvíos detectados automáticamente según los parámetros de Configuración." />
      <FilterBar db={db} filters={filters} onChange={setFilters} onReset={reset} showPending={false} dims={['shiftId', 'productId', 'lineId', 'lot']} />
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Severidad">
            <div className="space-y-1">
              {([['', 'Todas', all.length], ['critical', 'Problema', count('critical')], ['warning', 'Atención', count('warning')], ['info', 'Información', count('info')]] as const).map(([id, label, n]) => (
                <button key={id} onClick={() => setSeverity(id)} aria-pressed={severity === id}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm ${severity === id ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-slate-50 text-slate-700'}`}>
                  {id ? <SeverityBadge level={id} label={label} /> : label}
                  <span className="tabular-nums text-slate-500">{n}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Tipo">
            <div className="space-y-1">
              <button onClick={() => setType('')} className={`w-full flex justify-between rounded-lg px-3 py-2 text-sm ${!type ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-slate-50'}`}>
                Todos <span className="tabular-nums text-slate-500">{all.length}</span>
              </button>
              {byType.map(([t, n]) => (
                <button key={t} onClick={() => setType(t)} className={`w-full flex justify-between rounded-lg px-3 py-2 text-sm text-left ${type === t ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-slate-50 text-slate-700'}`}>
                  {ALERT_TYPE_LABEL[t]} <span className="tabular-nums text-slate-500">{n}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
        <Card title={`${shown.length} alerta(s)`}>
          {shown.length ? (
            <div className="space-y-2">{shown.slice(0, 200).map((a) => <AlertCard key={a.id} alert={a} />)}</div>
          ) : (
            <EmptyState title="Sin alertas para los filtros seleccionados">Los registros están dentro de los parámetros configurados.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
