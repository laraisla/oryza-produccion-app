/**
 * Reglas de negocio del registro de producción.
 * Todos los mensajes están redactados para el operador: sin jerga técnica.
 */
import type { Downtime, ID, Line, ProductionRecord, QualityCheck, Shift, Targets } from '@/types/domain';
import { computeMetrics, recordAllowsOvernight } from './calc';
import { isTimeInShift, isValidHHMM, offsetFrom, spanMinutes } from './time';
import { normalize } from './format';

/** Datos editables del formulario. Los números vacíos se representan como null. */
export interface RecordInput {
  id?: ID;
  date: string;
  shiftId: ID;
  operatorId: ID;
  lineId: ID;
  productId: ID;
  varietyId: ID;
  lot: string;
  presentationId: ID;
  startTime: string;
  endTime: string;
  units: number | null;
  unitWeightKg: number | null;
  pallets: number | null;
  unitsPerPallet: number | null;
  scrapKg: number | null;
  rejectedKg: number | null;
  scrapReason: string;
  scrapObservations: string;
  observations: string;
  downtimes: Downtime[];
  quality: QualityCheck;
}

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  /** Clave del campo (o `downtime:<id>`) para resaltar en el formulario. */
  field: string;
  message: string;
  level: IssueLevel;
}

export interface ValidationContext {
  shifts: Shift[];
  lines: Line[];
  records: ProductionRecord[];
  targets: Targets;
}

export type ValidationMode = 'draft' | 'submit';

const QUALITY_LABELS: Record<keyof Omit<QualityCheck, 'observations' | 'hasIncident' | 'incidentDescription'>, string> = {
  lotOk: 'lote verificado',
  packagingOk: 'envase correcto',
  printingOk: 'impresión correcta',
  weightOk: 'peso correcto',
  productOk: 'producto conforme',
};

export function toMetricsInput(r: RecordInput) {
  return {
    units: r.units ?? 0,
    unitWeightKg: r.unitWeightKg ?? 0,
    startTime: r.startTime,
    endTime: r.endTime,
    downtimes: r.downtimes,
    scrapKg: r.scrapKg ?? 0,
    rejectedKg: r.rejectedKg ?? 0,
  };
}

export function validateRecord(r: RecordInput, mode: ValidationMode, ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const verb = mode === 'submit' ? 'enviar' : 'guardar';
  const err = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const missing = (field: string, what: string) => err(field, `No puedes ${verb} el registro porque falta indicar ${what}.`);

  const shift = ctx.shifts.find((s) => s.id === r.shiftId);
  const overnight = recordAllowsOvernight(shift);

  // --- Obligatorios mínimos (también para borrador)
  if (!r.date) missing('date', 'la fecha');
  if (!r.shiftId) missing('shiftId', 'el turno');
  if (!r.operatorId) missing('operatorId', 'el operador responsable');

  // --- Obligatorios para enviar a aprobación
  if (mode === 'submit') {
    if (!r.lineId) missing('lineId', 'la línea de producción');
    if (!r.productId) missing('productId', 'el producto');
    if (!r.varietyId) missing('varietyId', 'la variedad');
    if (!r.lot.trim()) missing('lot', 'el lote');
    if (!r.presentationId) missing('presentationId', 'la presentación');
    if (!r.startTime) missing('startTime', 'la hora de inicio');
    if (!r.endTime) missing('endTime', 'la hora de finalización');
    if (r.units === null || r.units === 0) missing('units', 'las unidades producidas');
    if (!r.unitWeightKg) missing('unitWeightKg', 'el peso unitario');
    (Object.keys(QUALITY_LABELS) as (keyof typeof QUALITY_LABELS)[]).forEach((k) => {
      if (!r.quality[k]) missing(`quality.${k}`, `el control de calidad "${QUALITY_LABELS[k]}"`);
    });
  }

  // --- Números
  const nonNeg = (v: number | null, field: string, label: string) => {
    if (v === null) return;
    if (!Number.isFinite(v)) err(field, `El valor de ${label} no es un número válido.`);
    else if (v < 0) err(field, `${label.charAt(0).toUpperCase() + label.slice(1)} no puede ser negativo.`);
  };
  nonNeg(r.units, 'units', 'las unidades producidas');
  nonNeg(r.unitWeightKg, 'unitWeightKg', 'el peso unitario');
  nonNeg(r.pallets, 'pallets', 'la cantidad de pallets');
  nonNeg(r.scrapKg, 'scrapKg', 'la merma');
  nonNeg(r.rejectedKg, 'rejectedKg', 'el producto rechazado');
  if (r.units !== null && r.units > 0 && !Number.isInteger(r.units))
    err('units', 'Las unidades producidas deben ser un número entero.');

  // --- Horarios
  let durationMin: number | null = null;
  if (r.startTime && r.endTime) {
    if (!isValidHHMM(r.startTime) || !isValidHHMM(r.endTime)) {
      err('endTime', 'Revisa el formato de las horas (HH:MM).');
    } else {
      durationMin = spanMinutes(r.startTime, r.endTime, overnight);
      if (durationMin === null) {
        err(
          'endTime',
          r.startTime === r.endTime
            ? 'La hora de finalización no puede ser igual a la hora de inicio.'
            : 'La hora de finalización no puede ser anterior a la hora de inicio.',
        );
      } else if (durationMin > 12 * 60) {
        warn('endTime', 'El registro supera las 12 horas. Verifica las horas de inicio y fin.');
      }
      if (shift && durationMin !== null && !isTimeInShift(r.startTime, shift)) {
        warn('startTime', `La hora de inicio está fuera del horario del turno ${shift.name} (${shift.start}–${shift.end}).`);
      }
    }
  }

  // --- Paradas
  validateDowntimes(r, overnight, durationMin, ctx.targets, err, warn);

  // --- Producción, merma y rechazos
  const m = computeMetrics(toMetricsInput(r), shift, ctx.targets);
  if (r.rejectedKg && r.rejectedKg > m.totalKg && m.totalKg > 0)
    err('rejectedKg', 'El producto rechazado no puede superar los kg producidos.');
  if (m.scrapPct !== null && m.scrapPct > ctx.targets.maxScrapPct && !r.scrapReason.trim()) {
    if (mode === 'submit')
      err('scrapReason', `La merma (${m.scrapPct.toFixed(1)} %) supera el máximo de ${ctx.targets.maxScrapPct} %. Indica el motivo para poder enviar.`);
    else warn('scrapReason', `La merma supera el máximo de ${ctx.targets.maxScrapPct} %. Deberás indicar el motivo.`);
  } else if ((r.scrapKg ?? 0) > 0 && !r.scrapReason.trim()) {
    warn('scrapReason', 'Registraste merma sin indicar el motivo.');
  }

  const suggested = r.units && r.unitsPerPallet ? Math.ceil(r.units / r.unitsPerPallet) : null;
  if (suggested !== null && r.pallets !== null && Math.abs(r.pallets - suggested) > 1)
    warn('pallets', `Con ${r.units} unidades y ${r.unitsPerPallet} por pallet corresponderían ${suggested} pallets.`);

  const line = ctx.lines.find((l) => l.id === r.lineId);
  if (line?.nominalCapacityKgH && m.kgPerHour && m.kgPerHour > line.nominalCapacityKgH * 1.15)
    warn('units', `La productividad calculada (${Math.round(m.kgPerHour)} kg/h) supera la capacidad nominal de ${line.name}. Verifica las unidades y los tiempos.`);

  // --- Calidad
  const q = r.quality;
  const hasNc = (Object.keys(QUALITY_LABELS) as (keyof typeof QUALITY_LABELS)[]).some((k) => q[k] === 'nc');
  const hasObs = (Object.keys(QUALITY_LABELS) as (keyof typeof QUALITY_LABELS)[]).some((k) => q[k] === 'obs');
  if ((hasNc || hasObs) && !q.observations.trim()) {
    if (mode === 'submit' && hasNc)
      err('quality.observations', 'Hay controles de calidad no conformes. Describe la situación en observaciones de calidad.');
    else warn('quality.observations', 'Hay controles con observaciones: conviene describirlos.');
  }
  if (q.hasIncident && !q.incidentDescription.trim() && mode === 'submit')
    err('quality.incidentDescription', 'Indicaste una incidencia de calidad: describe brevemente qué ocurrió.');

  // --- Duplicados y lote repetido
  if (r.lot.trim()) {
    const lotN = normalize(r.lot);
    const others = ctx.records.filter((o) => o.id !== r.id && normalize(o.lot) === lotN);
    const dup = others.find(
      (o) => o.date === r.date && o.shiftId === r.shiftId && o.lineId === r.lineId && o.productId === r.productId,
    );
    if (dup)
      err('lot', `Ya existe el registro ${dup.number} para este lote, fecha, turno y línea. No se permiten registros duplicados: edita el existente.`);
    const otherProduct = others.find((o) => r.productId && o.productId !== r.productId);
    if (otherProduct)
      warn('lot', `El lote ${r.lot} ya fue utilizado en ${otherProduct.number} con otro producto. Verifica que sea correcto.`);
  }

  return issues;
}

function validateDowntimes(
  r: RecordInput,
  overnight: boolean,
  durationMin: number | null,
  targets: Targets,
  err: (f: string, m: string) => void,
  warn: (f: string, m: string) => void,
) {
  const intervals: { id: string; s: number; e: number; idx: number }[] = [];
  r.downtimes.forEach((d, i) => {
    const f = `downtime:${d.id}`;
    const n = i + 1;
    if (!d.startTime || !d.endTime) {
      err(f, `La parada ${n} debe tener hora de inicio y de fin.`);
      return;
    }
    if (!d.categoryId) err(f, `Selecciona la categoría de la parada ${n}.`);
    const dur = spanMinutes(d.startTime, d.endTime, overnight);
    if (dur === null || dur <= 0) {
      err(f, `En la parada ${n} la hora de fin es anterior o igual a la de inicio.`);
      return;
    }
    if (dur > targets.maxStopMinutes) warn(f, `La parada ${n} dura ${dur} min y supera el límite de ${targets.maxStopMinutes} min.`);
    if (r.startTime && isValidHHMM(r.startTime) && durationMin !== null) {
      const s = offsetFrom(r.startTime, d.startTime, overnight);
      const e = s + dur;
      if (s < 0 || e > durationMin) {
        err(f, `La parada ${n} (${d.startTime}–${d.endTime}) está fuera del horario del registro (${r.startTime}–${r.endTime}).`);
      }
      intervals.push({ id: d.id, s, e, idx: n });
    }
  });
  intervals.sort((a, b) => a.s - b.s);
  for (let i = 1; i < intervals.length; i++) {
    const prev = intervals[i - 1]!;
    const cur = intervals[i]!;
    if (cur.s < prev.e) err(`downtime:${cur.id}`, `Las paradas ${prev.idx} y ${cur.idx} se superponen en el tiempo.`);
  }
  if (durationMin !== null) {
    const total = r.downtimes.reduce((a, d) => a + (d.durationMinutes || 0), 0);
    if (total > durationMin) err('downtimes', 'El tiempo total de paradas supera la duración del registro.');
  }
}

export const hasErrors = (issues: ValidationIssue[]) => issues.some((i) => i.level === 'error');
