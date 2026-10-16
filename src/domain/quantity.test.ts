import { describe, expect, it } from 'vitest';
import { dec } from './decimal';
import {
  assertAvailable,
  checkAvailability,
  computePackaging,
  containersRequired,
  InsufficientStockError,
  lotStock,
} from './quantity';
import { convert, MissingFxRateError, toKg, toTons } from './units';

describe('stock de lotes', () => {
  it('stock disponible = físico − reservado − comprometido', () => {
    const stock = lotStock('60', [
      { type: 'reservation', quantityT: '10' },
      { type: 'commitment', quantityT: '20' },
    ]);
    expect(stock.available.toString()).toBe('30');
    expect(stock.reserved.toString()).toBe('10');
    expect(stock.committed.toString()).toBe('20');
  });

  it('un compromiso que convierte una reserva no descuenta dos veces', () => {
    const stock = lotStock('60', [
      { type: 'reservation', quantityT: '40' },
      { type: 'commitment', quantityT: '40', convertsReservation: true },
    ]);
    expect(stock.available.toString()).toBe('20');
    expect(stock.reserved.toString()).toBe('0');
  });

  it('el embarque reduce físico y comprometido sin cambiar el disponible', () => {
    const stock = lotStock('60', [
      { type: 'commitment', quantityT: '40' },
      { type: 'shipment', quantityT: '40' },
    ]);
    expect(stock.physical.toString()).toBe('20');
    expect(stock.committed.toString()).toBe('0');
    expect(stock.available.toString()).toBe('20');
  });

  it('impide comprometer stock ya comprometido', () => {
    const stock = lotStock('60', [{ type: 'commitment', quantityT: '40' }]);
    expect(() => assertAvailable(stock, '25')).toThrow(InsufficientStockError);
    expect(() => assertAvailable(stock, '20')).not.toThrow();
  });

  it('advierte cuando la demanda supera la oferta', () => {
    const check = checkAvailability('40', '25');
    expect(check.sufficient).toBe(false);
    expect(check.shortfallT).toBe('15');
  });
});

describe('conversión de unidades', () => {
  it('kg ↔ t sin errores de precisión', () => {
    expect(toTons('40000', 'kg').toString()).toBe('40');
    expect(toKg('0.1', 't').toString()).toBe('100');
    expect(toTons('1234.5', 'kg').toString()).toBe('1.2345');
  });

  it('convierte moneda solo con tipo de cambio documentado (directo o inverso)', () => {
    const rates = [{ base: 'USD' as const, quote: 'ARS' as const, rate: '1200', date: '2026-10-15', source: 'demo' }];
    expect(convert('120000', 'ARS', 'USD', rates).amount.toString()).toBe('100');
    expect(convert('2', 'USD', 'ARS', rates).amount.toString()).toBe('2400');
    expect(() => convert('1', 'EUR', 'USD', rates)).toThrow(MissingFxRateError);
  });
});

describe('envases, pallets y contenedores', () => {
  const bag25 = { type: 'bag' as const, netWeightKg: '25', tareWeightKg: '0.12', unitsPerPallet: 40, palletTareKg: '20' };

  it('40 t en bolsas de 25 kg = 1.600 bolsas y 40 pallets', () => {
    const r = computePackaging('40', bag25);
    expect(r.packages).toBe(1600);
    expect(r.isWhole).toBe(true);
    expect(r.pallets).toBe(40);
    expect(r.tareKg).toBe('992');
    expect(r.grossKg).toBe('40992');
  });

  it('si no resulta entero pide una decisión y ofrece alternativas', () => {
    const r = computePackaging('40.01', bag25);
    expect(r.isWhole).toBe(false);
    expect(r.needsDecision).toBe(true);
    expect(r.options).toEqual([
      { decision: 'round_down', packages: 1600, netT: '40' },
      { decision: 'round_up', packages: 1601, netT: '40.025' },
    ]);
    const decided = computePackaging('40.01', bag25, 'round_down');
    expect(decided.needsDecision).toBe(false);
    expect(decided.netT).toBe('40');
  });

  it('granel no genera envases', () => {
    const r = computePackaging('100', { type: 'bulk' });
    expect(r.packages).toBe(0);
    expect(r.grossT).toBe('100');
  });

  it('usa el límite operativo configurado y no asume la misma carga para todo contenedor', () => {
    const c20 = { name: '20 DV', maxPayloadKg: '28200', operationalLimitKg: '26000', usableVolumeM3: '30', maxPallets: 10 };
    const plan = containersRequired('40992', null, 40, c20);
    expect(plan.byWeight).toBe(2);
    expect(plan.byPallets).toBe(4);
    expect(plan.count).toBe(4);
    expect(plan.limitingFactor).toBe('pallets');
    const c40 = { name: '40 HC', maxPayloadKg: '26500', operationalLimitKg: null, usableVolumeM3: '68', maxPallets: 24 };
    expect(containersRequired('40992', null, 40, c40).count).toBe(2);
  });

  it('el volumen puede ser el factor limitante', () => {
    const plan = containersRequired('20000', '70', 0, { name: 'x', maxPayloadKg: '28000', usableVolumeM3: '30' });
    expect(plan.byWeight).toBe(1);
    expect(plan.byVolume).toBe(3);
    expect(plan.limitingFactor).toBe('volume');
    expect(dec(plan.averageGrossPerContainerKg!).toFixed(2)).toBe('6666.67');
  });
});
