import { describe, expect, it } from 'vitest';
import { computeMetrics, computeTotalKg, suggestedPallets } from '../calc';
import { spanMinutes } from '../time';
import type { Downtime, Shift } from '@/types/domain';

const morning: Shift = { id: 's-m', name: 'Mañana', start: '06:00', end: '14:00', active: true };
const night: Shift = { id: 's-n', name: 'Noche', start: '22:00', end: '06:00', active: true };
const dt = (s: string, e: string, d: number): Downtime => ({ id: s, startTime: s, endTime: e, durationMinutes: d, categoryId: 'x', reason: '', observations: '' });

describe('cálculos de producción', () => {
  it('peso total = unidades × peso unitario', () => {
    expect(computeTotalKg(4000, 5)).toBe(20000);
    expect(computeTotalKg(-3, 5)).toBe(0);
  });

  it('duración, tiempo detenido, productivo, productividad y merma', () => {
    const m = computeMetrics(
      { units: 3700, unitWeightKg: 5, startTime: '06:00', endTime: '13:40', downtimes: [dt('08:00', '08:30', 30), dt('10:00', '10:12', 12)], scrapKg: 262, rejectedKg: 0 },
      morning,
      { targetKgPerShift: 20000, targetKgPerHour: 3000, maxScrapPct: 2, maxStopMinutes: 45, maxDowntimePct: 15, pendingAlertHours: 24 },
    );
    expect(m.totalKg).toBe(18500);
    expect(m.durationMin).toBe(460);
    expect(m.downtimeMin).toBe(42);
    expect(m.productiveMin).toBe(418);
    expect(Math.round(m.kgPerHour!)).toBe(2656);
    expect(m.scrapPct!).toBeCloseTo((262 / 18762) * 100, 5);
    expect(m.downtimePct!).toBeCloseTo((42 / 460) * 100, 5);
    expect(m.productionAttainmentPct).toBeCloseTo(92.5, 5);
  });

  it('turno noche cruza la medianoche', () => {
    expect(spanMinutes('22:10', '05:40', true)).toBe(450);
    expect(spanMinutes('22:10', '05:40', false)).toBeNull();
    expect(computeMetrics({ units: 10, unitWeightKg: 1, startTime: '22:00', endTime: '06:00', downtimes: [], scrapKg: 0, rejectedKg: 0 }, night).durationMin).toBe(480);
  });

  it('pallets sugeridos', () => {
    expect(suggestedPallets(4000, 200)).toBe(20);
    expect(suggestedPallets(4001, 200)).toBe(21);
  });
});
