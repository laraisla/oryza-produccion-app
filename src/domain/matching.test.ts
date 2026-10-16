import { describe, expect, it } from 'vitest';
import {
  evaluateLot,
  evaluateRequest,
  suggestConsolidation,
  type MatchLotOffer,
  type MatchRequestCriteria,
} from './matching';

const request = (over: Partial<MatchRequestCriteria> = {}): MatchRequestCriteria => ({
  category: 'rice',
  commercialType: 'long_fine',
  varietyPolicy: 'equivalents_allowed',
  processing: 'white',
  maxBrokenPct: '5',
  quantityT: '40',
  packaging: { type: 'bag', netWeightKg: '25' },
  packagingFlexible: false,
  requiredCertifications: [],
  allowConsolidation: true,
  ...over,
});

const lot = (over: Partial<MatchLotOffer> = {}): MatchLotOffer => ({
  lotId: 'lot-1',
  lotCode: 'LOT-001',
  organizationId: 'org-a',
  organizationName: 'Molino A',
  category: 'rice',
  commercialType: 'long_fine',
  processing: 'white',
  brokenPct: '3',
  moisturePct: '13.5',
  impuritiesPct: '0.1',
  qualityStatus: 'verified',
  analysisDate: '2026-09-20',
  availableT: '60',
  packaging: { type: 'bag', netWeightKg: '25' },
  convertiblePackaging: [],
  availableFrom: '2026-10-01',
  certifications: [],
  active: true,
  ...over,
});

describe('motor de matching', () => {
  it('Escenario B / MATCH-04: 40 t largo fino ≤5 % en bolsas de 25 kg vs lote de 60 t al 3 % → compatible', () => {
    const r = evaluateLot(request(), lot());
    expect(r.status).toBe('compatible');
    expect(r.failures).toHaveLength(0);
    expect(r.checks.find((c) => c.criterion === 'volume')?.status).toBe('pass');
  });

  it('Escenario A / MATCH-01: pide jazmín y el lote es largo fino → incompatible por tipo aunque volumen y envase coincidan', () => {
    const r = evaluateLot(request({ commercialType: 'jasmine', quantityT: '25' }), lot());
    expect(r.status).toBe('incompatible');
    const typeCheck = r.checks.find((c) => c.criterion === 'commercial_type')!;
    expect(typeCheck.status).toBe('fail');
    expect(typeCheck.explanation).toMatch(/no son sustitutos automáticos/);
    expect(r.checks.find((c) => c.criterion === 'volume')?.status).toBe('pass');
    expect(r.checks.find((c) => c.criterion === 'packaging')?.status).toBe('pass');
  });

  it('MATCH-02: quebrado 7 % contra máximo 5 % → incompatible por calidad', () => {
    const r = evaluateLot(request(), lot({ brokenPct: '7' }));
    expect(r.status).toBe('incompatible');
    expect(r.failures.join(' ')).toMatch(/7 % y el máximo exigido es 5 %/);
  });

  it('MATCH-03: pide 40 t y el lote tiene 25 t → insuficiencia de stock', () => {
    const r = evaluateLot(request(), lot({ availableT: '25' }));
    expect(r.status).toBe('incompatible');
    expect(r.checks.find((c) => c.criterion === 'volume')?.explanation).toMatch(/faltan 15 t/);
  });

  it('MATCH-05: sin análisis de quebrado nunca es compatible definitivo', () => {
    const r = evaluateLot(request(), lot({ brokenPct: null, qualityStatus: 'pending' }));
    expect(r.status).toBe('conditional');
    expect(r.checks.find((c) => c.criterion === 'broken')?.status).toBe('missing');
  });

  it('calidad declarada sin verificar → compatible con condiciones', () => {
    const r = evaluateLot(request(), lot({ qualityStatus: 'estimated' }));
    expect(r.status).toBe('conditional');
  });

  it('una puntuación alta no compensa un requisito excluyente', () => {
    const excellent = lot({ brokenPct: '0.5', availableT: '500', commercialType: 'long_wide' });
    expect(evaluateLot(request(), excellent).status).toBe('incompatible');
  });

  it('presentación convertible queda con condiciones; no convertible es incompatible', () => {
    const bigBag = { type: 'big_bag' as const, netWeightKg: '1000' };
    expect(
      evaluateLot(request(), lot({ packaging: bigBag, convertiblePackaging: [{ type: 'bag', netWeightKg: '25' }] })).status,
    ).toBe('conditional');
    expect(evaluateLot(request(), lot({ packaging: bigBag })).status).toBe('incompatible');
  });

  it('variedad exacta exigida sin sustitutos', () => {
    const r = evaluateLot(request({ varietyPolicy: 'exact', variety: 'Gurí INTA CL' }), lot({ variety: 'Puitá INTA CL' }));
    expect(r.status).toBe('incompatible');
  });

  it('descarta lotes que no llegan al plazo', () => {
    const r = evaluateLot(request({ availabilityDeadline: '2026-10-10' }), lot({ availableFrom: '2026-11-01' }));
    expect(r.status).toBe('incompatible');
  });

  it('certificación exigida no informada → con condiciones', () => {
    const r = evaluateLot(request({ requiredCertifications: ['Kosher'] }), lot());
    expect(r.status).toBe('conditional');
  });

  it('ordena compatibles primero', () => {
    const results = evaluateRequest(request(), [lot({ lotId: 'x', brokenPct: '7' }), lot({ lotId: 'y' })]);
    expect(results.map((r) => r.status)).toEqual(['compatible', 'incompatible']);
  });

  it('MATCH-06: lotes con el mismo código visible de distintas organizaciones se evalúan por ID interno', () => {
    const a = lot({ lotId: 'uuid-a', lotCode: 'LOT-001', organizationId: 'org-a', availableT: '25' });
    const b = lot({ lotId: 'uuid-b', lotCode: 'LOT-001', organizationId: 'org-b', organizationName: 'Molino B', availableT: '20' });
    const results = evaluateRequest(request(), [a, b]);
    expect(new Set(results.map((r) => r.lotId))).toEqual(new Set(['uuid-a', 'uuid-b']));
    const suggestion = suggestConsolidation(request(), results, [a, b])!;
    expect(suggestion.parts.map((p) => p.lotId).sort()).toEqual(['uuid-a', 'uuid-b']);
    expect(suggestion.parts.find((p) => p.lotId === 'uuid-b')?.organizationId).toBe('org-b');
  });

  it('sugiere consolidación con condiciones sin reservar stock y solo con lotes que cumplen el resto', () => {
    const lots = [
      lot({ lotId: 'a', availableT: '25', brokenPct: '3' }),
      lot({ lotId: 'b', availableT: '20', brokenPct: '4', organizationId: 'org-b' }),
      lot({ lotId: 'c', availableT: '50', brokenPct: '7' }),
    ];
    const results = evaluateRequest(request(), lots);
    const s = suggestConsolidation(request(), results, lots)!;
    expect(s.status).toBe('conditional');
    expect(s.sufficient).toBe(true);
    expect(s.parts.map((p) => [p.lotId, p.takeT])).toEqual([
      ['a', '25'],
      ['b', '15'],
    ]);
    expect(s.notes.join(' ')).toMatch(/no se reservó stock/);
    expect(suggestConsolidation(request({ allowConsolidation: false }), results, lots)).toBeNull();
  });
});
