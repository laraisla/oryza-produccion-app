/**
 * Generador de datos de demostración (≈30 días) con un PRNG determinista.
 *
 * Los patrones son intencionales para que el análisis tenga algo que mostrar:
 *  - Mecánica y Cambio de producto dominan el Pareto de paradas.
 *  - El turno Noche de la Línea 1 rinde menos.
 *  - El Arroz Quebrado tiene mayor merma.
 *  - Algunos controles no conformes, mermas elevadas y un lote con incidencia.
 *  - Registros de los últimos días pendientes / rechazados / en borrador.
 */
import type {
  AuditEntry,
  DailyClosure,
  Database,
  Downtime,
  ProductionRecord,
  QualityCheck,
  QualityValue,
} from '@/types/domain';
import {
  COMMON_REASONS,
  DEFAULT_DOWNTIME_CATEGORIES,
  DEFAULT_LINES,
  DEFAULT_PRESENTATIONS,
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
  DEFAULT_SHIFTS,
  DEFAULT_USERS,
  DEFAULT_VARIETIES,
  SCRAP_REASONS,
} from './defaults';
import { addDays, hhmmToMin, minToHHMM, parseISODate, today } from '@/utils/time';
import { aggregate, computeTotalKg } from '@/utils/calc';
import { recordNumber } from '@/utils/id';

export const SCHEMA_VERSION = 1;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEmptyDatabase(): Database {
  return {
    schemaVersion: SCHEMA_VERSION,
    users: structuredClone(DEFAULT_USERS),
    products: structuredClone(DEFAULT_PRODUCTS),
    varieties: structuredClone(DEFAULT_VARIETIES),
    presentations: structuredClone(DEFAULT_PRESENTATIONS),
    lines: structuredClone(DEFAULT_LINES),
    shifts: structuredClone(DEFAULT_SHIFTS),
    downtimeCategories: structuredClone(DEFAULT_DOWNTIME_CATEGORIES),
    records: [],
    audit: [],
    closures: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    counters: { record: 100 },
  };
}

export function buildDemoDatabase(refDate = today(), now: Date = new Date()): Database {
  const db = buildEmptyDatabase();
  const rnd = mulberry32(20260926);
  const r = (min: number, max: number) => min + rnd() * (max - min);
  const ri = (min: number, max: number) => Math.floor(r(min, max + 1));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const weighted = <T,>(items: [T, number][]): T => {
    const total = items.reduce((a, [, w]) => a + w, 0);
    let x = rnd() * total;
    for (const [v, w] of items) {
      x -= w;
      if (x <= 0) return v;
    }
    return items[items.length - 1]![0];
  };
  const normal = (mean: number, sd: number) => {
    const u = Math.max(1e-9, rnd());
    const v = rnd();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const operators = db.users.filter((u) => u.role === 'operator');
  const supervisors = db.users.filter((u) => u.role === 'supervisor');
  const shiftCrewOffset: Record<string, number> = { 's-m': 0, 's-t': 1, 's-n': 2 };

  const catWeights: [string, number][] = [
    ['dc-mec', 24],
    ['dc-cambio', 19],
    ['dc-env', 13],
    ['dc-limp', 12],
    ['dc-ajuste', 11],
    ['dc-ele', 7],
    ['dc-mp', 6],
    ['dc-cc', 4],
    ['dc-pers', 2],
    ['dc-otros', 2],
  ];

  const records: ProductionRecord[] = [];
  const audit: AuditEntry[] = [];
  let counter = db.counters.record;
  let auditN = 0;
  const lotSeq = new Map<string, number>();
  const lotKey = new Map<string, string>(); // (date|product) -> lot

  const iso = (date: string, hhmm: string, plusMin = 0) => {
    const d = parseISODate(date);
    d.setMinutes(hhmmToMin(hhmm) + plusMin);
    return d.toISOString();
  };

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const date = addDays(refDate, -dayOffset);
    const dow = parseISODate(date).getDay();
    const week = Math.floor((29 - dayOffset) / 7);
    const isSunday = dow === 0;

    for (const shift of db.shifts) {
      if (isSunday && shift.id !== 's-m') continue;
      // No se generan turnos que todavía no terminaron (el dato debe ser verosímil a la hora de apertura).
      if (dayOffset <= 1) {
        const end = parseISODate(date);
        end.setMinutes(hhmmToMin(shift.end) + (hhmmToMin(shift.end) <= hhmmToMin(shift.start) ? 1440 : 0));
        if (end.getTime() > now.getTime()) continue;
      }

      for (const line of db.lines) {
        let prob = 0;
        if (line.id === 'l-1') prob = 0.96;
        if (line.id === 'l-2') prob = shift.id === 's-n' ? 0.3 : 0.9;
        if (line.id === 'l-3') prob = shift.id === 's-m' ? 0.3 : 0.08;
        if (isSunday) prob *= 0.5;
        if (rnd() > prob) continue;

        // --- Producto / presentación según línea
        let productId: string;
        let presentationId: string;
        if (line.id === 'l-1') {
          productId = weighted([['p-largofino', 6], ['p-blanco', 4]]);
          presentationId = weighted([['pr-1', 7], ['pr-5', 3]]);
        } else if (line.id === 'l-2') {
          productId = weighted([['p-largofino', 4], ['p-blanco', 3], ['p-quebrado', 3]]);
          presentationId = weighted([['pr-25', 4], ['pr-50', 3], ['pr-10', 2], ['pr-45', 1]]);
        } else {
          productId = weighted([['p-quebrado', 6], ['p-blanco', 2], ['p-largofino', 2]]);
          presentationId = 'pr-bb';
        }
        const product = db.products.find((p) => p.id === productId)!;
        const presentation = db.presentations.find((p) => p.id === presentationId)!;
        const varietyId =
          productId === 'p-quebrado'
            ? weighted([['v-otras', 6], ['v-irga424', 4]])
            : productId === 'p-largofino'
              ? weighted([['v-irga424', 8], ['v-nupoty', 2]])
              : weighted([['v-nupoty', 6], ['v-irga424', 4]]);

        // --- Lote: uno por fecha+producto; se reutiliza entre turnos/líneas del mismo día
        const lk = `${date}|${productId}|${varietyId}`;
        let lot = lotKey.get(lk);
        if (!lot) {
          const n = (lotSeq.get(date) ?? 0) + 1;
          lotSeq.set(date, n);
          const [y, m, d] = date.split('-');
          lot = `LOT-${d}${m}${y!.slice(2)}-${String(n).padStart(2, '0')}`;
          lotKey.set(lk, lot);
        }

        // --- Operador (cuadrillas rotan semanalmente)
        const lineIdx = db.lines.indexOf(line);
        const operator = operators[(shiftCrewOffset[shift.id]! + week + lineIdx) % operators.length]!;

        // --- Horario
        const startMin = hhmmToMin(shift.start) + ri(0, 18);
        const durationMin = 480 - ri(5, 35) - (startMin - hhmmToMin(shift.start));
        const startTime = minToHHMM(startMin);
        const endTime = minToHHMM(startMin + durationMin);

        // --- Paradas
        const nStops = weighted([[0, 2], [1, 4], [2, 3], [3, 1.2], [4, 0.4]]);
        const downtimes: Downtime[] = [];
        let cursor = ri(20, 60);
        for (let k = 0; k < nStops; k++) {
          const categoryId = weighted(catWeights);
          let dur = Math.round(Math.max(4, Math.exp(normal(Math.log(categoryId === 'dc-mec' ? 26 : 16), 0.55))));
          if (categoryId === 'dc-limp') dur = ri(15, 30);
          if (rnd() < 0.04) dur = ri(55, 95); // paradas largas ocasionales
          const room = durationMin - cursor - 20;
          if (room < dur + 5) break;
          const s = cursor + ri(10, Math.max(12, Math.floor((room - dur) / Math.max(1, nStops - k))));
          if (s + dur > durationMin - 5) break;
          downtimes.push({
            id: `dt-${counter}-${k}`,
            startTime: minToHHMM(startMin + s),
            endTime: minToHHMM(startMin + s + dur),
            durationMinutes: dur,
            categoryId,
            reason: pick(COMMON_REASONS[categoryId] ?? ['']),
            observations: rnd() < 0.2 ? 'Se informó a mantenimiento.' : '',
          });
          cursor = s + dur;
        }
        const downtimeMin = downtimes.reduce((a, d) => a + d.durationMinutes, 0);
        const productiveMin = durationMin - downtimeMin;

        // --- Producción
        let perf = normal(0.93, 0.07);
        if (line.id === 'l-1' && shift.id === 's-n') perf -= 0.09; // hallazgo: noche L1 rinde menos
        if (presentationId === 'pr-1') perf -= 0.04;
        perf = Math.min(1.08, Math.max(0.6, perf));
        const kgTarget = (line.targetKgPerHour ?? 3000) * perf * (productiveMin / 60);
        const units = Math.max(1, Math.round(kgTarget / presentation.unitWeightKg));
        const totalKg = computeTotalKg(units, presentation.unitWeightKg);

        // --- Merma
        let scrapPct = productId === 'p-quebrado' ? normal(2.0, 0.55) : normal(1.15, 0.35);
        if (rnd() < 0.06) scrapPct += r(1.2, 2.2);
        scrapPct = Math.max(0.3, scrapPct);
        const scrapKg = Math.round((totalKg * scrapPct) / (100 - scrapPct));
        const scrapReason = scrapPct > 1.6 || rnd() < 0.5 ? pick(SCRAP_REASONS) : '';
        const rejectedKg = rnd() < 0.18 ? Math.round(r(0.001, 0.006) * totalKg) : 0;

        // --- Calidad
        const qv = (): QualityValue => weighted<QualityValue>([['ok', 95], ['obs', 3.5], ['nc', 1.5]]);
        const quality: QualityCheck = {
          lotOk: 'ok',
          packagingOk: qv(),
          printingOk: qv(),
          weightOk: qv(),
          productOk: 'ok',
          observations: '',
          hasIncident: false,
          incidentDescription: '',
        };
        const qvals = [quality.packagingOk, quality.printingOk, quality.weightOk];
        if (qvals.includes('obs')) quality.observations = pick(['Fechado poco legible en algunas bolsas.', 'Sellado irregular, se ajustó la mordaza.', 'Peso en límite superior de tolerancia.']);
        if (qvals.includes('nc')) {
          quality.observations = pick(['Bolsas con impresión de lote ilegible, se reprocesaron.', 'Peso por debajo de tolerancia en muestreo, se recalibró la balanza.', 'Envase con microperforaciones, se segregó el pallet.']);
          quality.hasIncident = true;
          quality.incidentDescription = 'Se segregó producto y se informó a Calidad.';
        }

        // --- Estado y trazabilidad de aprobación
        const createdAt = iso(date, endTime, shift.id === 's-n' ? 1440 + ri(5, 25) : ri(5, 25));
        let status: ProductionRecord['status'] = 'approved';
        if (dayOffset === 0) status = rnd() < 0.5 ? 'pending' : 'draft';
        else if (dayOffset === 1) status = weighted([['pending', 6], ['approved', 3], ['rejected', 1]]);
        else if (dayOffset === 2) status = weighted([['approved', 8], ['pending', 1.2]]);
        const supervisor = pick(supervisors);
        counter++;
        const id = `rec-${counter}`;
        const number = recordNumber(counter);
        const approvedAt = status === 'approved' ? new Date(new Date(createdAt).getTime() + ri(40, 600) * 60000).toISOString() : undefined;

        const rec: ProductionRecord = {
          id,
          number,
          module: 'fraccionamiento',
          date,
          shiftId: shift.id,
          operatorId: operator.id,
          lineId: line.id,
          productId: product.id,
          varietyId,
          lot,
          presentationId,
          startTime,
          endTime,
          units,
          unitWeightKg: presentation.unitWeightKg,
          totalKg,
          pallets: Math.ceil(units / presentation.unitsPerPallet),
          unitsPerPallet: presentation.unitsPerPallet,
          scrapKg,
          rejectedKg,
          scrapReason,
          scrapObservations: scrapPct > 2.8 ? 'Merma elevada, revisar con mantenimiento.' : '',
          observations: rnd() < 0.15 ? pick(['Arranque demorado por espera de producto.', 'Se trabajó con dotación reducida.', 'Sin novedades relevantes.', 'Se cambió bobina de film a mitad de turno.']) : '',
          downtimes,
          quality,
          status,
          source: 'manual',
          createdBy: operator.id,
          createdAt,
          updatedBy: operator.id,
          updatedAt: createdAt,
          submittedAt: status !== 'draft' ? createdAt : undefined,
          approvedBy: status === 'approved' ? supervisor.id : undefined,
          approvedAt,
          rejectedBy: status === 'rejected' ? supervisor.id : undefined,
          rejectedAt: status === 'rejected' ? approvedAt ?? createdAt : undefined,
          reviewComment:
            status === 'rejected'
              ? 'Las unidades informadas no coinciden con el conteo de pallets. Revisar y reenviar.'
              : status === 'approved' && rnd() < 0.1
                ? 'Verificado con parte de depósito.'
                : undefined,
        };
        records.push(rec);

        const label = `Producción ${number}`;
        audit.push({ id: `a-${++auditN}`, at: createdAt, userId: operator.id, action: 'create', entity: 'production_record', entityId: id, entityLabel: label, changes: [] });
        if (status !== 'draft')
          audit.push({ id: `a-${++auditN}`, at: createdAt, userId: operator.id, action: 'submit', entity: 'production_record', entityId: id, entityLabel: label, changes: [] });
        if (status === 'approved' && rnd() < 0.08) {
          const before = Math.round(totalKg * r(0.97, 0.995));
          audit.push({
            id: `a-${++auditN}`,
            at: new Date(new Date(createdAt).getTime() - 10 * 60000).toISOString(),
            userId: operator.id,
            action: 'update',
            entity: 'production_record',
            entityId: id,
            entityLabel: label,
            changes: [{ field: 'totalKg', label: 'Kg producidos', from: String(before), to: String(totalKg) }],
          });
        }
        if (status === 'approved')
          audit.push({ id: `a-${++auditN}`, at: approvedAt!, userId: supervisor.id, action: 'approve', entity: 'production_record', entityId: id, entityLabel: label, changes: [], comment: rec.reviewComment });
        if (status === 'rejected')
          audit.push({ id: `a-${++auditN}`, at: rec.rejectedAt!, userId: supervisor.id, action: 'reject', entity: 'production_record', entityId: id, entityLabel: label, changes: [], comment: rec.reviewComment });
      }
    }
  }

  db.records = records;
  db.audit = audit.sort((a, b) => a.at.localeCompare(b.at));
  db.counters.record = counter;

  // --- Cierres de jornada históricos (hasta hace 3 días)
  const shiftsById = new Map(db.shifts.map((s) => [s.id, s]));
  const closures: DailyClosure[] = [];
  for (let dayOffset = 29; dayOffset >= 3; dayOffset--) {
    const date = addDays(refDate, -dayOffset);
    const dayRecs = records.filter((x) => x.date === date);
    if (!dayRecs.length) continue;
    const agg = aggregate(dayRecs, shiftsById);
    const sup = pick(supervisors);
    closures.push({
      id: `cl-${date}`,
      date,
      closedBy: sup.id,
      closedAt: iso(addDays(date, 1), '07:30', ri(0, 60)),
      notes: '',
      summary: {
        totalKg: agg.totalKg,
        records: agg.records,
        pending: dayRecs.filter((x) => x.status === 'pending').length,
        productiveMin: agg.productiveMin,
        downtimeMin: agg.downtimeMin,
        scrapKg: agg.scrapKg,
        scrapPct: agg.scrapPct ?? 0,
        incidents: dayRecs.filter((x) => x.quality.hasIncident).length,
      },
    });
    audit.push({ id: `a-${++auditN}`, at: closures[closures.length - 1]!.closedAt, userId: sup.id, action: 'close_day', entity: 'daily_closure', entityId: `cl-${date}`, entityLabel: `Cierre ${date}`, changes: [] });
  }
  db.closures = closures;
  db.audit.sort((a, b) => a.at.localeCompare(b.at));
  return db;
}
