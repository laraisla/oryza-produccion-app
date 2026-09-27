import type { RecordMetrics } from '@/utils/calc';
import type { Targets } from '@/types/domain';
import { fmtDuration, fmtNum, fmtPct } from '@/utils/format';
import { SeverityIcon, type Level } from '@/components/ui/SeverityBadge';

function Row({ label, value, level, hint }: { label: string; value: string; level?: Level; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 tabular-nums" title={hint}>
        {level && level !== 'info' && <SeverityIcon level={level} size={14} />}
        {value}
      </span>
    </div>
  );
}

/** Indicadores calculados en vivo mientras el operador completa el formulario. */
export function MetricsPanel({
  m,
  targets,
  units,
  unitWeight,
}: {
  m: RecordMetrics;
  targets: Targets;
  units: number | null;
  unitWeight: number | null;
}) {
  const scrapLevel: Level | undefined = m.scrapPct === null ? undefined : m.scrapPct > targets.maxScrapPct ? 'critical' : 'ok';
  const prodLevel: Level | undefined =
    m.productivityAttainmentPct === null ? undefined : m.productivityAttainmentPct < 75 ? 'critical' : m.productivityAttainmentPct < 90 ? 'warning' : 'ok';
  const dtLevel: Level | undefined = m.downtimePct === null ? undefined : m.downtimePct > targets.maxDowntimePct ? 'warning' : 'ok';

  return (
    <div>
      <div className="rounded-xl bg-brand-900 text-white px-4 py-4">
        <div className="text-xs text-slate-300">Producción total</div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-3xl font-semibold tabular-nums">{fmtNum(m.totalKg)}</span>
          <span className="text-slate-300">kg</span>
        </div>
        <div className="text-sm text-slate-300 tabular-nums">= {fmtNum(m.totalTn, 2)} toneladas</div>
        {units && unitWeight ? (
          <div className="mt-2 text-xs text-slate-400 tabular-nums">
            {fmtNum(units)} u × {fmtNum(unitWeight, unitWeight % 1 ? 2 : 0)} kg
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-400">Selecciona presentación y carga unidades</div>
        )}
      </div>
      <div className="mt-3 divide-y divide-slate-100">
        <div className="pb-1">
          <Row label="Duración total" value={fmtDuration(m.durationMin)} />
          <Row label="Tiempo detenido" value={fmtDuration(m.downtimeMin)} />
          <Row label="Tiempo productivo" value={fmtDuration(m.productiveMin)} />
          <Row label="% de parada" value={fmtPct(m.downtimePct)} level={dtLevel} hint={`Máximo ${targets.maxDowntimePct} %`} />
        </div>
        <div className="py-1">
          <Row label="Productividad" value={m.kgPerHour !== null ? `${fmtNum(m.kgPerHour)} kg/h` : '—'} level={prodLevel} />
          <Row label="Productividad" value={m.tnPerHour !== null ? `${fmtNum(m.tnPerHour, 2)} tn/h` : '—'} />
          <Row label="Objetivo" value={`${fmtNum(targets.targetKgPerHour)} kg/h`} />
          <Row label="Cumplimiento productividad" value={fmtPct(m.productivityAttainmentPct, 0)} />
          <Row label="Cumplimiento producción" value={fmtPct(m.productionAttainmentPct, 0)} hint={`Objetivo ${fmtNum(targets.targetKgPerShift)} kg/turno`} />
        </div>
        <div className="pt-1">
          <Row label="Merma" value={fmtPct(m.scrapPct, 2)} level={scrapLevel} hint={`Máximo ${targets.maxScrapPct} %`} />
          {scrapLevel === 'critical' && (
            <p className="text-xs text-bad-text bg-bad-bg rounded-md px-2 py-1.5 mt-1">
              Supera la merma máxima de {targets.maxScrapPct} %. Indica el motivo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
