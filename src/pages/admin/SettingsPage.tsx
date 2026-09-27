import { useEffect, useState } from 'react';
import { Database as DbIcon, RotateCcw, Save } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { resetDemo, updateSettings } from '@/services/masterDataService';
import type { Targets } from '@/types/domain';
import { fmtNum } from '@/utils/format';

const TARGET_FIELDS: { key: keyof Targets; label: string; unit: string; hint: string }[] = [
  { key: 'targetKgPerShift', label: 'Producción objetivo por turno', unit: 'kg', hint: 'Valor general. Cada línea puede tener su propio objetivo (Administración → Líneas).' },
  { key: 'targetKgPerHour', label: 'Productividad objetivo', unit: 'kg/h', hint: 'Por hora productiva. Se reemplaza por el objetivo de la línea si está definido.' },
  { key: 'maxScrapPct', label: 'Merma máxima', unit: '%', hint: 'Sobre kg procesados. Supera → alerta roja y motivo obligatorio.' },
  { key: 'maxStopMinutes', label: 'Parada máxima individual', unit: 'min', hint: 'Una parada más larga genera alerta.' },
  { key: 'maxDowntimePct', label: 'Tiempo detenido máximo', unit: '%', hint: 'Porcentaje del tiempo del registro.' },
  { key: 'pendingAlertHours', label: 'Demora máxima de aprobación', unit: 'h', hint: 'Registros pendientes más antiguos se marcan en amarillo.' },
];

export function SettingsPage() {
  const { db, user } = useData();
  const { confirm, run } = useFeedback();
  const [targets, setTargets] = useState<Record<keyof Targets, string>>(() => toStrings(db.settings.targets));
  const [company, setCompany] = useState(db.settings.companyName);
  const [plant, setPlant] = useState(db.settings.plantName);
  useEffect(() => setTargets(toStrings(db.settings.targets)), [db.settings.targets]);

  const save = async () => {
    const parsed = Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, Number(String(v).replace(',', '.'))])) as unknown as Targets;
    await run(() => updateSettings({ targets: parsed, companyName: company.trim() || db.settings.companyName, plantName: plant.trim() || db.settings.plantName }, user), 'Parámetros actualizados. Los indicadores y alertas se recalcularon.');
  };

  const reset = async () => {
    const { ok } = await confirm({
      title: 'Restablecer datos de demostración',
      message: 'Se reemplazarán TODOS los registros, maestros y configuraciones por el set de demostración de 30 días. Esta acción no puede deshacerse.',
      confirmLabel: 'Restablecer',
      tone: 'danger',
    });
    if (ok) await run(() => resetDemo(user), 'Datos de demostración restablecidos.');
  };

  const size = (() => {
    try {
      return (localStorage.getItem('oryza.mes.db')?.length ?? 0) / 1024;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Configuración" subtitle="Objetivos y parámetros que alimentan cálculos, alertas y reportes." actions={<button className="btn btn-primary" onClick={save}><Save size={16} /> Guardar cambios</button>} />
      <div className="space-y-5">
        <Card title="Objetivos y parámetros de control">
          <div className="grid gap-5 sm:grid-cols-2">
            {TARGET_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={`t-${f.key}`}>{f.label}</label>
                <div className="relative">
                  <input id={`t-${f.key}`} type="number" min={0} step="any" className="input pr-14 tabular-nums" value={targets[f.key]} onChange={(e) => setTargets({ ...targets, [f.key]: e.target.value })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{f.unit}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{f.hint}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Objetivos por línea" subtitle="Se editan en Administración → Líneas">
          <table className="table-base">
            <thead><tr><th>Línea</th><th className="text-right">Capacidad nominal</th><th className="text-right">Objetivo kg/h</th><th className="text-right">Objetivo kg/turno</th></tr></thead>
            <tbody>
              {db.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td className="num">{l.nominalCapacityKgH ? `${fmtNum(l.nominalCapacityKgH)} kg/h` : '—'}</td>
                  <td className="num">{l.targetKgPerHour ? fmtNum(l.targetKgPerHour) : <span className="text-slate-400">general</span>}</td>
                  <td className="num">{l.targetKgPerShift ? fmtNum(l.targetKgPerShift) : <span className="text-slate-400">general</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Empresa">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="s-company">Razón social</label><input id="s-company" className="input" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            <div><label className="label" htmlFor="s-plant">Planta / sector</label><input id="s-plant" className="input" value={plant} onChange={(e) => setPlant(e.target.value)} /></div>
          </div>
        </Card>

        <Card title="Datos y almacenamiento">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-sm text-slate-600">
              <DbIcon size={18} className="text-slate-400 mt-0.5" />
              <div>
                <p>Persistencia local del navegador (prototipo) · {db.records.length} registros · {fmtNum(size)} KB</p>
                <p className="text-xs text-slate-500 mt-0.5">La capa de datos está desacoplada (servicios + repositorio) para migrar a PostgreSQL / Supabase sin cambiar la interfaz.</p>
              </div>
            </div>
            <button className="btn btn-secondary shrink-0" onClick={reset}><RotateCcw size={16} /> Restablecer demo</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function toStrings(t: Targets): Record<keyof Targets, string> {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, String(v)])) as Record<keyof Targets, string>;
}
