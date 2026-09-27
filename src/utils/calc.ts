/**
 * Cálculos de ingeniería de producción. Todo indicador de la aplicación se
 * deriva de aquí: una única fuente de verdad para formulario, ficha, dashboard
 * y reportes.
 */
import type { Downtime, ProductionRecord, Shift, Targets } from '@/types/domain';
import { shiftCrossesMidnight, spanMinutes } from './time';

export interface RecordMetrics {
  totalKg: number;
  totalTn: number;
  durationMin: number | null;
  downtimeMin: number;
  productiveMin: number | null;
  /** kg / hora productiva */
  kgPerHour: number | null;
  tnPerHour: number | null;
  downtimePct: number | null;
  /** kg procesados = kg producidos + kg merma (hipótesis documentada) */
  processedKg: number;
  scrapPct: number | null;
  rejectedPct: number | null;
  /** Cumplimiento vs objetivo de producción por turno */
  productionAttainmentPct: number | null;
  productivityAttainmentPct: number | null;
  longestStopMin: number;
}

export const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function computeTotalKg(units: number, unitWeightKg: number): number {
  if (!Number.isFinite(units) || !Number.isFinite(unitWeightKg)) return 0;
  return round(Math.max(0, units) * Math.max(0, unitWeightKg), 2);
}

export function downtimeDuration(d: Pick<Downtime, 'startTime' | 'endTime'>, overnight: boolean): number | null {
  return spanMinutes(d.startTime, d.endTime, overnight);
}

export function sumDowntime(downtimes: Downtime[]): number {
  return downtimes.reduce((acc, d) => acc + (Number.isFinite(d.durationMinutes) ? d.durationMinutes : 0), 0);
}

/**
 * Un registro puede finalizar al día siguiente si su turno cruza la medianoche
 * (noche) o si la hora de fin es menor que la de inicio en ese turno.
 */
export function recordAllowsOvernight(shift: Shift | undefined): boolean {
  return shift ? shiftCrossesMidnight(shift) : false;
}

type MetricsInput = Pick<
  ProductionRecord,
  'units' | 'unitWeightKg' | 'startTime' | 'endTime' | 'downtimes' | 'scrapKg' | 'rejectedKg'
>;

export function computeMetrics(r: MetricsInput, shift: Shift | undefined, targets?: Targets): RecordMetrics {
  const totalKg = computeTotalKg(r.units, r.unitWeightKg);
  const durationMin = spanMinutes(r.startTime, r.endTime, recordAllowsOvernight(shift));
  const downtimeMin = sumDowntime(r.downtimes);
  const productiveMin = durationMin !== null ? Math.max(0, durationMin - downtimeMin) : null;
  const kgPerHour = productiveMin && productiveMin > 0 ? totalKg / (productiveMin / 60) : null;
  const processedKg = totalKg + Math.max(0, r.scrapKg || 0);
  const scrapPct = processedKg > 0 ? ((r.scrapKg || 0) / processedKg) * 100 : null;
  const rejectedPct = totalKg > 0 ? ((r.rejectedKg || 0) / totalKg) * 100 : null;
  const downtimePct = durationMin && durationMin > 0 ? (downtimeMin / durationMin) * 100 : null;
  const longestStopMin = r.downtimes.reduce((m, d) => Math.max(m, d.durationMinutes || 0), 0);
  return {
    totalKg,
    totalTn: totalKg / 1000,
    durationMin,
    downtimeMin,
    productiveMin,
    kgPerHour,
    tnPerHour: kgPerHour !== null ? kgPerHour / 1000 : null,
    downtimePct,
    processedKg,
    scrapPct,
    rejectedPct,
    productionAttainmentPct:
      targets && targets.targetKgPerShift > 0 ? (totalKg / targets.targetKgPerShift) * 100 : null,
    productivityAttainmentPct:
      targets && targets.targetKgPerHour > 0 && kgPerHour !== null ? (kgPerHour / targets.targetKgPerHour) * 100 : null,
    longestStopMin,
  };
}

export function suggestedPallets(units: number, unitsPerPallet: number): number {
  if (!units || !unitsPerPallet || unitsPerPallet <= 0) return 0;
  return Math.ceil(units / unitsPerPallet);
}

/** Agregado de un conjunto de registros (dashboard, cierres, reportes). */
export interface AggregateMetrics {
  records: number;
  totalKg: number;
  durationMin: number;
  downtimeMin: number;
  productiveMin: number;
  scrapKg: number;
  rejectedKg: number;
  processedKg: number;
  kgPerHour: number | null;
  scrapPct: number | null;
  downtimePct: number | null;
  stops: number;
}

export function aggregate(records: ProductionRecord[], shiftsById: Map<string, Shift>): AggregateMetrics {
  let totalKg = 0,
    durationMin = 0,
    downtimeMin = 0,
    scrapKg = 0,
    rejectedKg = 0,
    stops = 0;
  for (const r of records) {
    const m = computeMetrics(r, shiftsById.get(r.shiftId));
    totalKg += m.totalKg;
    durationMin += m.durationMin ?? 0;
    downtimeMin += m.downtimeMin;
    scrapKg += r.scrapKg || 0;
    rejectedKg += r.rejectedKg || 0;
    stops += r.downtimes.length;
  }
  const productiveMin = Math.max(0, durationMin - downtimeMin);
  const processedKg = totalKg + scrapKg;
  return {
    records: records.length,
    totalKg,
    durationMin,
    downtimeMin,
    productiveMin,
    scrapKg,
    rejectedKg,
    processedKg,
    kgPerHour: productiveMin > 0 ? totalKg / (productiveMin / 60) : null,
    scrapPct: processedKg > 0 ? (scrapKg / processedKg) * 100 : null,
    downtimePct: durationMin > 0 ? (downtimeMin / durationMin) * 100 : null,
    stops,
  };
}

/** Objetivos efectivos para una línea (los de la línea prevalecen sobre los generales). */
export function resolveTargets(targets: Targets, line?: { targetKgPerHour?: number; targetKgPerShift?: number }): Targets {
  return {
    ...targets,
    targetKgPerHour: line?.targetKgPerHour || targets.targetKgPerHour,
    targetKgPerShift: line?.targetKgPerShift || targets.targetKgPerShift,
  };
}
