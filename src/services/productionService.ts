/**
 * Servicio del registro de producción: alta, edición, flujo de aprobación y auditoría.
 * Es la "API" de la aplicación: si mañana se usa un backend, estas funciones
 * pasan a ser llamadas HTTP con la misma firma.
 */
import type { Database, FieldChange, ID, ProductionRecord, QualityCheck, User } from '@/types/domain';
import { repository } from './storage/repository';
import { appendAudit } from './auditService';
import { BusinessError, ValidationFailed } from './errors';
import { hasErrors, validateRecord, type RecordInput } from '@/utils/validation';
import { computeTotalKg, downtimeDuration, recordAllowsOvernight, resolveTargets } from '@/utils/calc';
import { can } from '@/utils/permissions';
import { addDays, isTimeInShift, nowHHMM, today } from '@/utils/time';
import { recordNumber, uid } from '@/utils/id';
import { fmtDate } from '@/utils/format';

export const EMPTY_QUALITY: QualityCheck = {
  lotOk: null,
  packagingOk: null,
  printingOk: null,
  weightOk: null,
  productOk: null,
  observations: '',
  hasIncident: false,
  incidentDescription: '',
};

export function suggestShiftId(db: Database, time = nowHHMM()): ID {
  const active = db.shifts.filter((s) => s.active);
  return (active.find((s) => isTimeInShift(time, s)) ?? active[0])?.id ?? '';
}

/** Formulario nuevo con valores por defecto: fecha actual, turno según la hora, usuario actual. */
export function newRecordInput(db: Database, user: User): RecordInput {
  const shiftId = suggestShiftId(db);
  const shift = db.shifts.find((s) => s.id === shiftId);
  // En turno noche después de medianoche, la fecha del registro es la del inicio del turno.
  let date = today();
  if (shift && recordAllowsOvernight(shift) && nowHHMM() < shift.end) {
    date = addDays(today(), -1);
  }
  return {
    date,
    shiftId,
    operatorId: user.id,
    lineId: '',
    productId: '',
    varietyId: '',
    lot: '',
    presentationId: '',
    startTime: shift?.start ?? '',
    endTime: '',
    units: null,
    unitWeightKg: null,
    pallets: null,
    unitsPerPallet: null,
    scrapKg: null,
    rejectedKg: null,
    scrapReason: '',
    scrapObservations: '',
    observations: '',
    downtimes: [],
    quality: { ...EMPTY_QUALITY },
  };
}

export function recordToInput(r: ProductionRecord): RecordInput {
  return {
    id: r.id,
    date: r.date,
    shiftId: r.shiftId,
    operatorId: r.operatorId,
    lineId: r.lineId,
    productId: r.productId,
    varietyId: r.varietyId,
    lot: r.lot,
    presentationId: r.presentationId,
    startTime: r.startTime,
    endTime: r.endTime,
    units: r.units,
    unitWeightKg: r.unitWeightKg,
    pallets: r.pallets,
    unitsPerPallet: r.unitsPerPallet,
    scrapKg: r.scrapKg,
    rejectedKg: r.rejectedKg,
    scrapReason: r.scrapReason,
    scrapObservations: r.scrapObservations,
    observations: r.observations,
    downtimes: structuredClone(r.downtimes),
    quality: structuredClone(r.quality),
  };
}

/** Duplicar: copia la configuración (línea, producto, presentación, lote) y deja en cero las cantidades. */
export function duplicateAsInput(db: Database, r: ProductionRecord, user: User): RecordInput {
  const base = newRecordInput(db, user);
  return {
    ...base,
    lineId: r.lineId,
    productId: r.productId,
    varietyId: r.varietyId,
    lot: r.lot,
    presentationId: r.presentationId,
    unitWeightKg: r.unitWeightKg,
    unitsPerPallet: r.unitsPerPallet,
  };
}

function validationContext(db: Database, input: RecordInput) {
  const line = db.lines.find((l) => l.id === input.lineId);
  return {
    shifts: db.shifts,
    lines: db.lines,
    records: db.records,
    targets: resolveTargets(db.settings.targets, line),
  };
}

export function validate(db: Database, input: RecordInput, mode: 'draft' | 'submit') {
  return validateRecord(input, mode, validationContext(db, input));
}

export function isDayClosed(db: Database, date: string) {
  return db.closures.some((c) => c.date === date);
}

function assertDayOpen(db: Database, date: string, user: User) {
  if (isDayClosed(db, date) && user.role !== 'admin')
    throw new BusinessError(`La jornada del ${fmtDate(date)} ya fue cerrada. Solo un administrador puede registrar o modificar datos de esa fecha.`);
}

function normalizeInput(db: Database, input: RecordInput) {
  const shift = db.shifts.find((s) => s.id === input.shiftId);
  const overnight = recordAllowsOvernight(shift);
  const downtimes = input.downtimes.map((d) => ({
    ...d,
    reason: d.reason.trim(),
    observations: d.observations.trim(),
    durationMinutes: downtimeDuration(d, overnight) ?? 0,
  }));
  const units = input.units ?? 0;
  const unitWeightKg = input.unitWeightKg ?? 0;
  return {
    date: input.date,
    shiftId: input.shiftId,
    operatorId: input.operatorId,
    lineId: input.lineId,
    productId: input.productId,
    varietyId: input.varietyId,
    lot: input.lot.trim().toUpperCase(),
    presentationId: input.presentationId,
    startTime: input.startTime,
    endTime: input.endTime,
    units,
    unitWeightKg,
    totalKg: computeTotalKg(units, unitWeightKg),
    pallets: input.pallets ?? 0,
    unitsPerPallet: input.unitsPerPallet ?? 0,
    scrapKg: input.scrapKg ?? 0,
    rejectedKg: input.rejectedKg ?? 0,
    scrapReason: input.scrapReason.trim(),
    scrapObservations: input.scrapObservations.trim(),
    observations: input.observations.trim(),
    downtimes,
    quality: { ...input.quality },
  };
}

// ---------- Auditoría: diferencias legibles ----------

function nameOf(list: { id: string; name: string }[], id: string) {
  return list.find((x) => x.id === id)?.name ?? '—';
}

function diffRecord(db: Database, before: ProductionRecord, after: ProductionRecord): FieldChange[] {
  const changes: FieldChange[] = [];
  const add = (field: string, label: string, a: unknown, b: unknown) => {
    const from = a === undefined || a === null || a === '' ? '—' : String(a);
    const to = b === undefined || b === null || b === '' ? '—' : String(b);
    if (from !== to) changes.push({ field, label, from, to });
  };
  add('date', 'Fecha', fmtDate(before.date), fmtDate(after.date));
  add('shiftId', 'Turno', nameOf(db.shifts, before.shiftId), nameOf(db.shifts, after.shiftId));
  add('operatorId', 'Responsable', nameOf(db.users, before.operatorId), nameOf(db.users, after.operatorId));
  add('lineId', 'Línea', nameOf(db.lines, before.lineId), nameOf(db.lines, after.lineId));
  add('productId', 'Producto', nameOf(db.products, before.productId), nameOf(db.products, after.productId));
  add('varietyId', 'Variedad', nameOf(db.varieties, before.varietyId), nameOf(db.varieties, after.varietyId));
  add('lot', 'Lote', before.lot, after.lot);
  add('presentationId', 'Presentación', nameOf(db.presentations, before.presentationId), nameOf(db.presentations, after.presentationId));
  add('startTime', 'Hora inicio', before.startTime, after.startTime);
  add('endTime', 'Hora fin', before.endTime, after.endTime);
  add('units', 'Unidades', before.units, after.units);
  add('unitWeightKg', 'Peso unitario (kg)', before.unitWeightKg, after.unitWeightKg);
  add('totalKg', 'Kg producidos', before.totalKg, after.totalKg);
  add('pallets', 'Pallets', before.pallets, after.pallets);
  add('scrapKg', 'Merma (kg)', before.scrapKg, after.scrapKg);
  add('rejectedKg', 'Rechazado (kg)', before.rejectedKg, after.rejectedKg);
  add('scrapReason', 'Motivo de merma', before.scrapReason, after.scrapReason);
  add('observations', 'Observaciones', before.observations, after.observations);
  const dtSig = (r: ProductionRecord) =>
    r.downtimes.map((d) => `${d.startTime}-${d.endTime} ${nameOf(db.downtimeCategories, d.categoryId)}`).join('; ');
  add('downtimes', 'Paradas', dtSig(before), dtSig(after));
  const qSig = (q: QualityCheck) =>
    [q.lotOk, q.packagingOk, q.printingOk, q.weightOk, q.productOk].map((v) => ({ ok: '✓', obs: '⚠', nc: '✕' })[v ?? 'ok'] ?? '·').join(' ') +
    (q.hasIncident ? ' · incidencia' : '');
  add('quality', 'Controles de calidad', qSig(before.quality), qSig(after.quality));
  return changes;
}

// ---------- Comandos ----------

export async function saveRecord(input: RecordInput, user: User, submit: boolean): Promise<ProductionRecord> {
  return repository.transaction((db) => {
    assertDayOpen(db, input.date, user);
    const issues = validate(db, input, submit ? 'submit' : 'draft');
    if (hasErrors(issues)) throw new ValidationFailed(issues);
    const now = new Date().toISOString();
    const data = normalizeInput(db, input);

    if (!input.id) {
      db.counters.record += 1;
      const rec: ProductionRecord = {
        id: uid('rec'),
        number: recordNumber(db.counters.record),
        module: 'fraccionamiento',
        ...data,
        status: submit ? 'pending' : 'draft',
        source: 'manual',
        createdBy: user.id,
        createdAt: now,
        updatedBy: user.id,
        updatedAt: now,
        submittedAt: submit ? now : undefined,
      };
      db.records.push(rec);
      const label = `Producción ${rec.number}`;
      appendAudit(db, { userId: user.id, action: 'create', entity: 'production_record', entityId: rec.id, entityLabel: label });
      if (submit) appendAudit(db, { userId: user.id, action: 'submit', entity: 'production_record', entityId: rec.id, entityLabel: label });
      return rec;
    }

    const idx = db.records.findIndex((r) => r.id === input.id);
    if (idx < 0) throw new BusinessError('El registro ya no existe. Es posible que otro usuario lo haya eliminado.');
    const before = db.records[idx]!;
    if (!can.editRecord(user, before))
      throw new BusinessError(
        before.status === 'approved'
          ? 'Este registro está aprobado y no puede modificarse directamente.'
          : 'No tienes permiso para modificar este registro en su estado actual.',
      );
    assertDayOpen(db, before.date, user);
    const after: ProductionRecord = {
      ...before,
      ...data,
      status: submit ? 'pending' : 'draft',
      updatedBy: user.id,
      updatedAt: now,
      submittedAt: submit ? now : before.submittedAt,
    };
    db.records[idx] = after;
    const label = `Producción ${after.number}`;
    const changes = diffRecord(db, before, after);
    if (changes.length)
      appendAudit(db, { userId: user.id, action: 'update', entity: 'production_record', entityId: after.id, entityLabel: label, changes });
    if (submit) appendAudit(db, { userId: user.id, action: 'submit', entity: 'production_record', entityId: after.id, entityLabel: label });
    return after;
  });
}

function mutateRecord(id: ID, fn: (db: Database, r: ProductionRecord) => void) {
  return repository.transaction((db) => {
    const r = db.records.find((x) => x.id === id);
    if (!r) throw new BusinessError('El registro ya no existe.');
    fn(db, r);
    return r;
  });
}

export function submitRecord(id: ID, user: User) {
  return mutateRecord(id, (db, r) => {
    if (!can.submitRecord(user, r)) throw new BusinessError('Este registro no puede enviarse en su estado actual.');
    const issues = validate(db, recordToInput(r), 'submit');
    if (hasErrors(issues)) throw new ValidationFailed(issues);
    const now = new Date().toISOString();
    r.status = 'pending';
    r.submittedAt = now;
    r.updatedAt = now;
    r.updatedBy = user.id;
    appendAudit(db, { userId: user.id, action: 'submit', entity: 'production_record', entityId: r.id, entityLabel: `Producción ${r.number}` });
  });
}

export function withdrawRecord(id: ID, user: User) {
  return mutateRecord(id, (db, r) => {
    if (!can.withdrawRecord(user, r)) throw new BusinessError('Solo pueden retirarse registros pendientes de aprobación.');
    r.status = 'draft';
    r.updatedAt = new Date().toISOString();
    r.updatedBy = user.id;
    appendAudit(db, { userId: user.id, action: 'withdraw', entity: 'production_record', entityId: r.id, entityLabel: `Producción ${r.number}` });
  });
}

export function approveRecord(id: ID, user: User, comment = '') {
  return mutateRecord(id, (db, r) => {
    if (!can.reviewRecord(user, r)) throw new BusinessError('Solo un supervisor puede aprobar registros pendientes.');
    const now = new Date().toISOString();
    r.status = 'approved';
    r.approvedBy = user.id;
    r.approvedAt = now;
    r.reviewComment = comment.trim() || undefined;
    r.updatedAt = now;
    r.updatedBy = user.id;
    appendAudit(db, { userId: user.id, action: 'approve', entity: 'production_record', entityId: r.id, entityLabel: `Producción ${r.number}`, comment: r.reviewComment });
  });
}

export function rejectRecord(id: ID, user: User, comment: string) {
  return mutateRecord(id, (db, r) => {
    if (!can.reviewRecord(user, r)) throw new BusinessError('Solo un supervisor puede rechazar registros pendientes.');
    if (!comment.trim()) throw new BusinessError('Indica el motivo del rechazo para que el operador pueda corregirlo.');
    const now = new Date().toISOString();
    r.status = 'rejected';
    r.rejectedBy = user.id;
    r.rejectedAt = now;
    r.reviewComment = comment.trim();
    r.updatedAt = now;
    r.updatedBy = user.id;
    appendAudit(db, { userId: user.id, action: 'reject', entity: 'production_record', entityId: r.id, entityLabel: `Producción ${r.number}`, comment: r.reviewComment });
  });
}

export function reopenRecord(id: ID, user: User, reason: string) {
  return mutateRecord(id, (db, r) => {
    if (!can.reopenRecord(user, r)) throw new BusinessError('Solo un administrador puede reabrir un registro aprobado.');
    if (!reason.trim()) throw new BusinessError('Indica el motivo por el cual se reabre el registro.');
    r.status = 'draft';
    r.approvedAt = undefined;
    r.approvedBy = undefined;
    r.updatedAt = new Date().toISOString();
    r.updatedBy = user.id;
    appendAudit(db, { userId: user.id, action: 'reopen', entity: 'production_record', entityId: r.id, entityLabel: `Producción ${r.number}`, comment: reason.trim() });
  });
}

export function deleteRecord(id: ID, user: User) {
  return repository.transaction((db) => {
    const r = db.records.find((x) => x.id === id);
    if (!r) throw new BusinessError('El registro ya no existe.');
    if (!can.deleteRecord(user, r))
      throw new BusinessError(
        r.status === 'approved'
          ? 'Un registro aprobado no puede eliminarse: forma parte del historial operativo.'
          : 'No tienes permiso para eliminar este registro.',
      );
    db.records = db.records.filter((x) => x.id !== id);
    appendAudit(db, {
      userId: user.id,
      action: 'delete',
      entity: 'production_record',
      entityId: r.id,
      entityLabel: `Producción ${r.number}`,
      changes: [{ field: 'lot', label: 'Lote', from: r.lot, to: '—' }, { field: 'totalKg', label: 'Kg producidos', from: String(r.totalKg), to: '—' }],
    });
  });
}
