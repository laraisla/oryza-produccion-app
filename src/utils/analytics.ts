/**
 * Agregaciones para dashboard, reportes, cierre diario y análisis.
 * Toda la información de los gráficos se calcula desde los registros.
 */
import type { Database, ProductionRecord, Shift } from '@/types/domain';
import { aggregate, computeMetrics, resolveTargets } from './calc';
import { daysBetween, isoWeekNumber, startOfMonth, startOfWeek } from './time';
import { fmtDateShort, normalize } from './format';

export interface RecordFilters {
  from: string;
  to: string;
  shiftId: string;
  productId: string;
  varietyId: string;
  lineId: string;
  operatorId: string;
  lot: string;
  /** Incluir registros pendientes de aprobación (además de aprobados). */
  includePending: boolean;
}

export function emptyFilters(from: string, to: string): RecordFilters {
  return { from, to, shiftId: '', productId: '', varietyId: '', lineId: '', operatorId: '', lot: '', includePending: true };
}

/** Registros que cuentan para indicadores: aprobados (+ pendientes si se indica). Borradores y rechazados no. */
export function isCountable(r: ProductionRecord, includePending: boolean) {
  return r.status === 'approved' || (includePending && r.status === 'pending');
}

export function applyFilters(records: ProductionRecord[], f: RecordFilters, opts: { ignoreDates?: boolean; anyStatus?: boolean } = {}) {
  const lot = normalize(f.lot);
  return records.filter(
    (r) =>
      (opts.anyStatus || isCountable(r, f.includePending)) &&
      (opts.ignoreDates || ((!f.from || r.date >= f.from) && (!f.to || r.date <= f.to))) &&
      (!f.shiftId || r.shiftId === f.shiftId) &&
      (!f.productId || r.productId === f.productId) &&
      (!f.varietyId || r.varietyId === f.varietyId) &&
      (!f.lineId || r.lineId === f.lineId) &&
      (!f.operatorId || r.operatorId === f.operatorId) &&
      (!lot || normalize(r.lot).includes(lot)),
  );
}

export const shiftMap = (db: Database) => new Map<string, Shift>(db.shifts.map((s) => [s.id, s]));

function nameMap(list: { id: string; name: string }[]) {
  return new Map(list.map((x) => [x.id, x.name]));
}

/** Objetivo de kg del registro (según su línea). */
function recordTargets(db: Database, r: ProductionRecord) {
  return resolveTargets(db.settings.targets, db.lines.find((l) => l.id === r.lineId));
}

export interface DailyPoint {
  date: string;
  label: string;
  kg: number;
  tn: number;
  targetTn: number;
  tnPerHour: number | null;
  targetTnPerHour: number | null;
  scrapPct: number | null;
  downtimeMin: number;
  records: number;
}

export function dailySeries(db: Database, records: ProductionRecord[], from: string, to: string): DailyPoint[] {
  const sm = shiftMap(db);
  const byDate = new Map<string, ProductionRecord[]>();
  records.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]));
  return daysBetween(from, to).map((date) => {
    const recs = byDate.get(date) ?? [];
    const agg = aggregate(recs, sm);
    let targetKg = 0;
    let targetRateWeighted = 0;
    let prodHours = 0;
    recs.forEach((r) => {
      const t = recordTargets(db, r);
      const m = computeMetrics(r, sm.get(r.shiftId));
      targetKg += t.targetKgPerShift;
      const h = (m.productiveMin ?? 0) / 60;
      targetRateWeighted += t.targetKgPerHour * h;
      prodHours += h;
    });
    return {
      date,
      label: fmtDateShort(date),
      kg: agg.totalKg,
      tn: agg.totalKg / 1000,
      targetTn: targetKg / 1000,
      tnPerHour: agg.kgPerHour !== null ? agg.kgPerHour / 1000 : null,
      targetTnPerHour: prodHours > 0 ? targetRateWeighted / prodHours / 1000 : null,
      scrapPct: agg.scrapPct,
      downtimeMin: agg.downtimeMin,
      records: recs.length,
    };
  });
}

export interface GroupRow {
  id: string;
  name: string;
  kg: number;
  pct: number;
  records: number;
  kgPerHour: number | null;
  scrapPct: number | null;
  downtimeMin: number;
  downtimePct: number | null;
  attainmentPct: number | null;
}

export function groupBy(
  db: Database,
  records: ProductionRecord[],
  key: 'productId' | 'shiftId' | 'lineId' | 'varietyId' | 'operatorId' | 'presentationId',
): GroupRow[] {
  const sm = shiftMap(db);
  const lists: Record<typeof key, { id: string; name: string }[]> = {
    productId: db.products,
    shiftId: db.shifts,
    lineId: db.lines,
    varietyId: db.varieties,
    operatorId: db.users,
    presentationId: db.presentations,
  };
  const names = nameMap(lists[key]);
  const groups = new Map<string, ProductionRecord[]>();
  records.forEach((r) => groups.set(r[key], [...(groups.get(r[key]) ?? []), r]));
  const total = records.reduce((a, r) => a + r.totalKg, 0);
  const order = lists[key].map((x) => x.id);
  return [...groups.entries()]
    .map(([id, recs]) => {
      const agg = aggregate(recs, sm);
      let targetRateWeighted = 0;
      recs.forEach((r) => {
        const m = computeMetrics(r, sm.get(r.shiftId));
        targetRateWeighted += recordTargets(db, r).targetKgPerHour * ((m.productiveMin ?? 0) / 60);
      });
      const targetRate = agg.productiveMin > 0 ? targetRateWeighted / (agg.productiveMin / 60) : null;
      return {
        id,
        name: names.get(id) ?? '—',
        kg: agg.totalKg,
        pct: total > 0 ? (agg.totalKg / total) * 100 : 0,
        records: recs.length,
        kgPerHour: agg.kgPerHour,
        scrapPct: agg.scrapPct,
        downtimeMin: agg.downtimeMin,
        downtimePct: agg.downtimePct,
        attainmentPct: agg.kgPerHour !== null && targetRate ? (agg.kgPerHour / targetRate) * 100 : null,
      };
    })
    .sort((a, b) => (key === 'shiftId' ? order.indexOf(a.id) - order.indexOf(b.id) : b.kg - a.kg));
}

export interface ParetoRow {
  id: string;
  name: string;
  minutes: number;
  stops: number;
  pct: number;
  cumPct: number;
}

export function downtimePareto(db: Database, records: ProductionRecord[]): ParetoRow[] {
  const names = nameMap(db.downtimeCategories);
  const acc = new Map<string, { minutes: number; stops: number }>();
  records.forEach((r) =>
    r.downtimes.forEach((d) => {
      const cur = acc.get(d.categoryId) ?? { minutes: 0, stops: 0 };
      cur.minutes += d.durationMinutes;
      cur.stops += 1;
      acc.set(d.categoryId, cur);
    }),
  );
  const total = [...acc.values()].reduce((a, v) => a + v.minutes, 0);
  let cum = 0;
  return [...acc.entries()]
    .map(([id, v]) => ({ id, name: names.get(id) ?? 'Sin categoría', ...v }))
    .sort((a, b) => b.minutes - a.minutes)
    .map((row) => {
      const pct = total > 0 ? (row.minutes / total) * 100 : 0;
      cum += pct;
      return { ...row, pct, cumPct: Math.min(100, cum) };
    });
}

export interface TopReason {
  category: string;
  reason: string;
  minutes: number;
  stops: number;
}

export function topDowntimeReasons(db: Database, records: ProductionRecord[], limit = 5): TopReason[] {
  const names = nameMap(db.downtimeCategories);
  const acc = new Map<string, TopReason>();
  records.forEach((r) =>
    r.downtimes.forEach((d) => {
      const k = `${d.categoryId}|${d.reason || '(sin detalle)'}`;
      const cur = acc.get(k) ?? { category: names.get(d.categoryId) ?? '—', reason: d.reason || '(sin detalle)', minutes: 0, stops: 0 };
      cur.minutes += d.durationMinutes;
      cur.stops += 1;
      acc.set(k, cur);
    }),
  );
  return [...acc.values()].sort((a, b) => b.minutes - a.minutes).slice(0, limit);
}

export type Period = 'daily' | 'weekly' | 'monthly';

export interface PeriodRow {
  key: string;
  label: string;
  records: number;
  kg: number;
  productiveMin: number;
  downtimeMin: number;
  kgPerHour: number | null;
  scrapPct: number | null;
  downtimePct: number | null;
}

export function periodSeries(db: Database, records: ProductionRecord[], period: Period): PeriodRow[] {
  const sm = shiftMap(db);
  const keyOf = (d: string) => (period === 'daily' ? d : period === 'weekly' ? startOfWeek(d) : startOfMonth(d));
  const groups = new Map<string, ProductionRecord[]>();
  records.forEach((r) => {
    const k = keyOf(r.date);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, recs]) => {
      const agg = aggregate(recs, sm);
      const label =
        period === 'daily'
          ? fmtDateShort(key)
          : period === 'weekly'
            ? `Sem ${isoWeekNumber(key)} (${fmtDateShort(key)})`
            : `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
      return {
        key,
        label,
        records: agg.records,
        kg: agg.totalKg,
        productiveMin: agg.productiveMin,
        downtimeMin: agg.downtimeMin,
        kgPerHour: agg.kgPerHour,
        scrapPct: agg.scrapPct,
        downtimePct: agg.downtimePct,
      };
    });
}

// ---------------------------------------------------------------------------
// Indicadores avanzados (preparación para OEE / MTBF / MTTR)
// ---------------------------------------------------------------------------

export interface AdvancedKpis {
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  mtbfMin: number | null;
  mttrMin: number | null;
  failures: number;
  plannedStopMin: number;
  unplannedStopMin: number;
  performanceNote: string | null;
}

/**
 * Supuestos:
 *  - Tiempo planificado = duración registrada − paradas planificadas (limpieza, cambio de producto).
 *  - Disponibilidad = (tiempo planificado − paradas no planificadas) / tiempo planificado.
 *  - Rendimiento = kg reales / (capacidad nominal de la línea × tiempo de marcha). Requiere capacidad nominal.
 *  - Calidad = (kg producidos − kg rechazados) / (kg producidos + kg merma).
 *  - MTBF / MTTR consideran solo paradas de tipo "falla" (mecánica / eléctrica).
 */
export function advancedKpis(db: Database, records: ProductionRecord[]): AdvancedKpis {
  const sm = shiftMap(db);
  const kindOf = new Map(db.downtimeCategories.map((c) => [c.id, c.kind]));
  const lineCap = new Map(db.lines.map((l) => [l.id, l.nominalCapacityKgH]));
  let planned = 0,
    plannedStops = 0,
    unplannedStops = 0,
    runMin = 0,
    idealKg = 0,
    kg = 0,
    rejected = 0,
    scrap = 0,
    failures = 0,
    failureMin = 0,
    missingCap = false;
  records.forEach((r) => {
    const m = computeMetrics(r, sm.get(r.shiftId));
    const dur = m.durationMin ?? 0;
    const ps = r.downtimes.filter((d) => kindOf.get(d.categoryId) === 'planificada').reduce((a, d) => a + d.durationMinutes, 0);
    const us = m.downtimeMin - ps;
    planned += dur - ps;
    plannedStops += ps;
    unplannedStops += us;
    const run = Math.max(0, dur - m.downtimeMin);
    runMin += run;
    const cap = lineCap.get(r.lineId);
    if (cap) idealKg += (cap * run) / 60;
    else missingCap = true;
    kg += m.totalKg;
    rejected += r.rejectedKg || 0;
    scrap += r.scrapKg || 0;
    r.downtimes.forEach((d) => {
      if (kindOf.get(d.categoryId) === 'falla') {
        failures++;
        failureMin += d.durationMinutes;
      }
    });
  });
  const availabilityPct = planned > 0 ? ((planned - unplannedStops) / planned) * 100 : null;
  const performancePct = !missingCap && idealKg > 0 ? Math.min(100, (kg / idealKg) * 100) : null;
  const qualityPct = kg + scrap > 0 ? ((kg - rejected) / (kg + scrap)) * 100 : null;
  const oeePct =
    availabilityPct !== null && performancePct !== null && qualityPct !== null
      ? (availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100
      : null;
  return {
    availabilityPct,
    performancePct,
    qualityPct,
    oeePct,
    mtbfMin: failures > 0 ? runMin / failures : null,
    mttrMin: failures > 0 ? failureMin / failures : null,
    failures,
    plannedStopMin: plannedStops,
    unplannedStopMin: unplannedStops,
    performanceNote: missingCap ? 'Falta la capacidad nominal de al menos una línea (Administración → Líneas).' : null,
  };
}

// ---------------------------------------------------------------------------
// Análisis automático: oportunidades de mejora
// ---------------------------------------------------------------------------

export interface Insight {
  id: string;
  kind: 'opportunity' | 'positive' | 'info';
  title: string;
  detail: string;
}

const f1 = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const f0 = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });

export function computeInsights(db: Database, records: ProductionRecord[]): Insight[] {
  const out: Insight[] = [];
  if (records.length < 5) return out;
  const sm = shiftMap(db);

  // 1. Principal causa de parada (Pareto)
  const pareto = downtimePareto(db, records);
  if (pareto.length) {
    const top = pareto[0]!;
    const top2 = pareto.slice(0, 2);
    const cum2 = top2[top2.length - 1]!.cumPct;
    out.push({
      id: 'pareto',
      kind: 'opportunity',
      title: `${top.name} es la principal causa de tiempo improductivo`,
      detail: `Explica el ${f1(top.pct)} % de los minutos detenidos (${f0(top.minutes)} min en ${top.stops} paradas). Junto con ${top2[1]?.name ?? '—'} suman el ${f1(cum2)} %: atacar estas dos causas tiene el mayor impacto.`,
    });
  }

  // 2. Turnos: mejor y peor productividad
  const shifts = groupBy(db, records, 'shiftId').filter((s) => s.kgPerHour !== null && s.records >= 3);
  if (shifts.length >= 2) {
    const sorted = [...shifts].sort((a, b) => (b.attainmentPct ?? 0) - (a.attainmentPct ?? 0));
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    const gap = (best.attainmentPct ?? 0) - (worst.attainmentPct ?? 0);
    if (gap > 3)
      out.push({
        id: 'shift',
        kind: 'opportunity',
        title: `El turno ${worst.name} rinde ${f1(gap)} puntos menos que el turno ${best.name}`,
        detail: `Cumplimiento de productividad vs objetivo: ${best.name} ${f1(best.attainmentPct ?? 0)} % · ${worst.name} ${f1(worst.attainmentPct ?? 0)} %. Revisar dotación, arranques y paradas del turno ${worst.name}.`,
      });
  }

  // 3. Producto con mayor merma
  const products = groupBy(db, records, 'productId').filter((p) => p.scrapPct !== null);
  if (products.length >= 2) {
    const worst = [...products].sort((a, b) => (b.scrapPct ?? 0) - (a.scrapPct ?? 0))[0]!;
    const max = db.settings.targets.maxScrapPct;
    out.push({
      id: 'scrap',
      kind: (worst.scrapPct ?? 0) > max ? 'opportunity' : 'info',
      title: `${worst.name} concentra la mayor merma (${f1(worst.scrapPct ?? 0)} %)`,
      detail:
        (worst.scrapPct ?? 0) > max
          ? `Supera el máximo configurado de ${max} %. Analizar motivos de merma de este producto y el estado de la línea que lo procesa.`
          : `Está dentro del máximo configurado de ${max} %, pero es el producto a vigilar.`,
    });
  }

  // 4. Diferencias entre líneas
  const lines = groupBy(db, records, 'lineId').filter((l) => l.attainmentPct !== null && l.records >= 3);
  if (lines.length >= 2) {
    const worst = [...lines].sort((a, b) => (a.attainmentPct ?? 0) - (b.attainmentPct ?? 0))[0]!;
    out.push({
      id: 'line',
      kind: (worst.attainmentPct ?? 100) < 90 ? 'opportunity' : 'info',
      title: `${worst.name}: ${f1(worst.attainmentPct ?? 0)} % de cumplimiento de productividad`,
      detail: `Es la línea con menor cumplimiento vs su objetivo. Tiempo detenido: ${f1(worst.downtimePct ?? 0)} % del tiempo registrado.`,
    });
  }

  // 5. Variabilidad diaria de producción
  const byDay = new Map<string, number>();
  records.forEach((r) => byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.totalKg));
  const vals = [...byDay.values()];
  if (vals.length >= 7) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const cv = mean > 0 ? (sd / mean) * 100 : 0;
    out.push({
      id: 'cv',
      kind: cv > 25 ? 'opportunity' : 'info',
      title: `Variabilidad de la producción diaria: ${f1(cv)} %`,
      detail: `Promedio ${f1(mean / 1000)} tn/día (desvío ${f1(sd / 1000)} tn). ${cv > 25 ? 'Una variabilidad alta dificulta planificar: revisar días con menor producción y su causa.' : 'La producción es relativamente estable.'}`,
    });
  }

  // 6. Tendencia de eficiencia (últimos 7 días vs 7 anteriores)
  const dates = [...byDay.keys()].sort();
  if (dates.length >= 10) {
    const last = new Set(dates.slice(-7));
    const prev = new Set(dates.slice(-14, -7));
    const a = aggregate(records.filter((r) => last.has(r.date)), sm);
    const b = aggregate(records.filter((r) => prev.has(r.date)), sm);
    if (a.kgPerHour && b.kgPerHour) {
      const delta = ((a.kgPerHour - b.kgPerHour) / b.kgPerHour) * 100;
      out.push({
        id: 'trend',
        kind: delta >= 0 ? 'positive' : 'opportunity',
        title: `Productividad ${delta >= 0 ? 'en alza' : 'en baja'}: ${delta >= 0 ? '+' : ''}${f1(delta)} % en los últimos 7 días`,
        detail: `${f1(a.kgPerHour / 1000)} tn/h vs ${f1(b.kgPerHour / 1000)} tn/h en los 7 días previos.`,
      });
    }
  }

  // 7. Repetición de incidencias (misma causa en la misma línea)
  const lineNames = nameMap(db.lines);
  const catNames = nameMap(db.downtimeCategories);
  const rep = new Map<string, number>();
  records.forEach((r) => r.downtimes.forEach((d) => {
    if (!d.reason) return;
    const k = `${r.lineId}|${d.categoryId}|${d.reason}`;
    rep.set(k, (rep.get(k) ?? 0) + 1);
  }));
  const topRep = [...rep.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topRep && topRep[1] >= 4) {
    const [lineId, catId, reason] = topRep[0].split('|');
    out.push({
      id: 'repeat',
      kind: 'opportunity',
      title: `Falla repetitiva: "${reason}" en ${lineNames.get(lineId!) ?? '—'}`,
      detail: `Se registró ${topRep[1]} veces (${catNames.get(catId!) ?? ''}). Candidata a análisis de causa raíz (5 porqués / Ishikawa) y a mantenimiento preventivo.`,
    });
  }

  // 8. Calidad
  const nc = records.filter((r) => [r.quality.lotOk, r.quality.packagingOk, r.quality.printingOk, r.quality.weightOk, r.quality.productOk].includes('nc'));
  if (nc.length)
    out.push({
      id: 'quality',
      kind: 'opportunity',
      title: `${nc.length} registro(s) con controles de calidad no conformes`,
      detail: `Representan el ${f1((nc.length / records.length) * 100)} % de los registros del período. Revisar en Alertas y por lote en Trazabilidad.`,
    });

  return out;
}
