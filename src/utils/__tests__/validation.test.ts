import { describe, expect, it } from 'vitest';
import { validateRecord, type RecordInput } from '../validation';
import { buildDemoDatabase } from '@/data/seed';

const db = buildDemoDatabase('2026-09-26', new Date('2026-09-26T23:30:00'));
const ctx = { shifts: db.shifts, lines: db.lines, records: db.records, targets: db.settings.targets };

const base = (): RecordInput => ({
  date: '2026-10-05',
  shiftId: 's-m',
  operatorId: 'u-jperez',
  lineId: 'l-1',
  productId: 'p-largofino',
  varietyId: 'v-irga424',
  lot: 'LOT-051026-01',
  presentationId: 'pr-5',
  startTime: '06:00',
  endTime: '13:30',
  units: 3500,
  unitWeightKg: 5,
  pallets: 18,
  unitsPerPallet: 200,
  scrapKg: 150,
  rejectedKg: 0,
  scrapReason: '',
  scrapObservations: '',
  observations: '',
  downtimes: [],
  quality: { lotOk: 'ok', packagingOk: 'ok', printingOk: 'ok', weightOk: 'ok', productOk: 'ok', observations: '', hasIncident: false, incidentDescription: '' },
});
const errors = (r: RecordInput, mode: 'draft' | 'submit' = 'submit') => validateRecord(r, mode, ctx).filter((i) => i.level === 'error');

describe('reglas de negocio', () => {
  it('registro completo es válido', () => {
    expect(errors(base())).toEqual([]);
  });

  it('lote obligatorio con mensaje claro', () => {
    const e = errors({ ...base(), lot: '' });
    expect(e.map((x) => x.message)).toContain('No puedes enviar el registro porque falta indicar el lote.');
  });

  it('borrador exige solo datos mínimos', () => {
    expect(errors({ ...base(), lot: '', productId: '', units: null }, 'draft')).toEqual([]);
  });

  it('hora fin anterior a inicio (turno diurno)', () => {
    expect(errors({ ...base(), endTime: '05:00' }).some((e) => e.field === 'endTime')).toBe(true);
  });

  it('valores negativos', () => {
    expect(errors({ ...base(), scrapKg: -1 }).some((e) => e.field === 'scrapKg')).toBe(true);
    expect(errors({ ...base(), units: -5 }).some((e) => e.field === 'units')).toBe(true);
  });

  it('parada fuera del intervalo y superpuestas', () => {
    const d = (id: string, s: string, e: string, dur: number) => ({ id, startTime: s, endTime: e, durationMinutes: dur, categoryId: 'dc-mec', reason: '', observations: '' });
    expect(errors({ ...base(), downtimes: [d('a', '05:00', '05:30', 30)] }).some((e) => e.field === 'downtime:a')).toBe(true);
    const ov = errors({ ...base(), downtimes: [d('a', '08:00', '08:30', 30), d('b', '08:20', '08:40', 20)] });
    expect(ov.some((e) => e.message.includes('se superponen'))).toBe(true);
  });

  it('merma sobre el límite exige motivo', () => {
    expect(errors({ ...base(), scrapKg: 1000 }).some((e) => e.field === 'scrapReason')).toBe(true);
    expect(errors({ ...base(), scrapKg: 1000, scrapReason: 'Bolsas rotas' }).some((e) => e.field === 'scrapReason')).toBe(false);
  });

  it('detecta duplicados', () => {
    const existing = db.records[0]!;
    const dup = { ...base(), date: existing.date, shiftId: existing.shiftId, lineId: existing.lineId, productId: existing.productId, lot: existing.lot };
    expect(errors(dup).some((e) => e.message.includes('duplicados'))).toBe(true);
  });

  it('no conforme exige observación', () => {
    const q = { ...base().quality, weightOk: 'nc' as const };
    expect(errors({ ...base(), quality: q }).some((e) => e.field === 'quality.observations')).toBe(true);
  });
});

describe('datos de demostración', () => {
  it('30 días de datos con estados variados', () => {
    const dates = new Set(db.records.map((r) => r.date));
    expect(dates.size).toBeGreaterThanOrEqual(28);
    expect(db.records.some((r) => r.status === 'pending')).toBe(true);
    expect(db.records.some((r) => r.status === 'approved')).toBe(true);
    expect(db.records.some((r) => r.quality.hasIncident)).toBe(true);
  });

  it('los registros generados cumplen las reglas de horario y paradas', () => {
    const bad = db.records.filter((r) => {
      const issues = validateRecord({ ...r, id: r.id }, 'draft', ctx).filter((i) => i.level === 'error');
      return issues.length > 0;
    });
    expect(bad.map((r) => r.number)).toEqual([]);
  });
});
