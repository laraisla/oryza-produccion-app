import { describe, expect, it } from 'vitest';
import { compareResults, computeCosting, dayCharge, sensitivity, type CostingInput, type CostLineInput } from './costing';
import { dec } from './decimal';

const line = (over: Partial<CostLineInput> & Pick<CostLineInput, 'id' | 'name' | 'point' | 'stage'>): CostLineInput => ({
  amount: '0',
  currency: 'USD',
  unit: 'per_operation',
  enabled: true,
  source: 'Caso de prueba',
  verificationStatus: 'quoted',
  ...over,
});

/** Caso numérico del PRD (6.4): enteramente simulado. */
const prdLines: CostLineInput[] = [
  line({ id: 'merch', name: 'Mercadería', point: 'merchandise', stage: 'merchandise', unit: 'per_ton', amount: '250' }),
  line({ id: 'inland', name: 'Flete interno', point: 'pre_carriage', stage: 'origin', amount: '500' }),
  line({ id: 'customs', name: 'Despacho y documentos', point: 'export_clearance', stage: 'customs', amount: '130' }),
  line({ id: 'ohc', name: 'OHC origen', point: 'origin_terminal', stage: 'port', unit: 'per_container', amount: '310' }),
  line({ id: 'commission', name: 'Comisión intermediario', point: 'commercial', stage: 'commercial', unit: 'percent', percentBase: 'sale_value', amount: '2' }),
];

const base = (over: Partial<CostingInput> = {}): CostingInput => ({
  currency: 'USD',
  quantityT: '25',
  grossT: '25.12',
  containers: 1,
  packages: 1000,
  pallets: 0,
  incoterm: 'FOB',
  namedPlace: 'Puerto de Buenos Aires',
  namedPlaceKind: 'port_of_shipment',
  transportMode: 'container',
  lines: prdLines,
  fxRates: [],
  pricing: { mode: 'margin_on_sale', marginPct: '12' },
  rounding: { decimals: 2, mode: 'half_up', target: 'total' },
  asOf: '2026-10-16',
  ...over,
});

describe('motor de costos y cotización', () => {
  it('reproduce el caso del PRD: 7.190 / (1 − 0,02 − 0,12) = 8.360,47 y 334,42 USD/t', () => {
    const r = computeCosting(base());
    expect(r.valid).toBe(true);
    expect(r.totalPrice).toBe('8360.47');
    expect(dec(r.pricePerT!).toFixed(2)).toBe('334.42');
    const fixedSeller = r.lines.filter((l) => l.payer === 'seller').reduce((acc, l) => acc.plus(l.fixedAmount), dec(0));
    expect(fixedSeller.toString()).toBe('7190');
  });

  it('QUOTE-03: con 2 % sobre ventas y 12 % de margen usa denominador 0,86 y no suma 14 % al costo', () => {
    const r = computeCosting(base({ rounding: { decimals: 2, mode: 'half_up', target: 'total' } }));
    expect(dec(r.totalPrice!).toFixed(2)).toBe(dec(7190).div('0.86').toFixed(2));
    expect(dec(r.totalPrice!).eq(dec(7190).times('1.14'))).toBe(false);
    expect(r.pricing.formula).toMatch(/1 − margen 12.00 % − cargos sobre venta 2.0000 %/);
    expect(dec(r.marginPctOnSale!).toFixed(2)).toBe('12.00');
  });

  it('redondeo configurable sobre el precio por tonelada', () => {
    const r = computeCosting(base({ rounding: { decimals: 2, mode: 'half_up', target: 'per_ton' } }));
    expect(r.pricePerT).toBe('334.42');
    expect(r.totalPrice).toBe('8360.5');
    const up = computeCosting(base({ rounding: { decimals: 0, mode: 'up', target: 'per_ton' } }));
    expect(up.pricePerT).toBe('335');
  });

  it('precio mínimo (equilibrio) cubre costos y cargos sobre la venta sin margen', () => {
    const r = computeCosting(base());
    expect(dec(r.minPricePerT!).times(25).toFixed(2)).toBe(dec(7190).div('0.98').toFixed(2));
  });

  it('QUOTE-04: comisiones + margen ≥ 100 % → cálculo inválido con mensaje claro', () => {
    const lines = prdLines.map((l) => (l.id === 'commission' ? { ...l, amount: '30' } : l));
    const r = computeCosting(base({ lines, pricing: { mode: 'margin_on_sale', marginPct: '70' } }));
    expect(r.valid).toBe(false);
    expect(r.totalPrice).toBeNull();
    expect(r.alerts.find((a) => a.code === 'margin_overflow')?.message).toMatch(/≥ 100 %/);
  });

  it('recargo sobre costo: precio = costo × (1 + recargo) y la comisión se calcula aparte', () => {
    const r = computeCosting(base({ pricing: { mode: 'markup_on_cost', markupPct: '10' } }));
    expect(r.totalPrice).toBe('7909');
    const commission = r.lines.find((l) => l.id === 'commission')!;
    expect(commission.amount).toBe('158.18');
    expect(r.marginAbs).toBe('560.82');
  });

  it('precio negociado fijo: el margen resulta de los costos', () => {
    const r = computeCosting(base({ pricing: { mode: 'fixed_price', pricePerT: '334' } }));
    expect(r.totalPrice).toBe('8350');
    expect(r.marginAbs).toBe('993');
  });

  const freightLines: CostLineInput[] = [
    ...prdLines,
    line({ id: 'freight', name: 'Flete marítimo', point: 'main_carriage', stage: 'international', unit: 'per_container', amount: '1800' }),
    line({ id: 'insurance', name: 'Seguro internacional', point: 'insurance', stage: 'international', unit: 'percent', percentBase: 'insured_value', amount: '0.3' }),
    line({ id: 'dthc', name: 'THC destino', point: 'destination_terminal', stage: 'port', unit: 'per_container', amount: '250' }),
  ];

  it('QUOTE-01: FOB → CIF suma flete y seguro al vendedor sin borrar partidas', () => {
    const fob = computeCosting(base({ lines: freightLines }));
    const cif = computeCosting(
      base({ lines: freightLines, incoterm: 'CIF', namedPlace: 'Callao', namedPlaceKind: 'port_of_destination' }),
    );
    expect(fob.lines.find((l) => l.id === 'freight')?.payer).toBe('buyer');
    expect(cif.lines.find((l) => l.id === 'freight')?.payer).toBe('seller');
    expect(cif.lines.find((l) => l.id === 'insurance')?.payer).toBe('seller');
    expect(cif.lines.find((l) => l.id === 'dthc')?.payer).toBe('buyer');
    expect(cif.lines).toHaveLength(fob.lines.length);
    expect(dec(cif.totalPrice!).gt(dec(fob.totalPrice!))).toBe(true);
    // El costo total de la operación (ambas partes) es el mismo antes de evaluar el seguro sobre precio.
    expect(fob.lines.find((l) => l.id === 'freight')?.amount).toBe('1800');
    expect(cif.lines.find((l) => l.id === 'freight')?.amount).toBe('1800');
  });

  it('seguro sobre valor asegurado = 110 % del valor CIF', () => {
    const cif = computeCosting(
      base({ lines: freightLines, incoterm: 'CIF', namedPlace: 'Callao', namedPlaceKind: 'port_of_destination' }),
    );
    const insurance = cif.lines.find((l) => l.id === 'insurance')!;
    expect(dec(insurance.amount).toFixed(2)).toBe(dec(cif.totalPrice!).times('1.1').times('0.003').toFixed(2));
  });

  it('cambiar de Incoterm conserva los valores y recalcula la asignación con explicación', () => {
    const dap = computeCosting(
      base({ lines: freightLines, incoterm: 'DAP', namedPlace: 'Almacén Lima', namedPlaceKind: 'inland_destination' }),
    );
    expect(dap.lines.find((l) => l.id === 'dthc')?.payer).toBe('seller');
    const dapTerminal = computeCosting(
      base({ lines: freightLines, incoterm: 'DAP', namedPlace: 'Terminal Callao', namedPlaceKind: 'destination_terminal' }),
    );
    expect(dapTerminal.lines.find((l) => l.id === 'dthc')?.payer).toBe('buyer');
    const fca = computeCosting(
      base({ lines: freightLines, incoterm: 'FCA', namedPlace: 'Planta Resistencia', namedPlaceKind: 'seller_premises' }),
    );
    expect(fca.lines.find((l) => l.id === 'inland')?.payer).toBe('buyer');
    expect(fca.lines.find((l) => l.id === 'ohc')?.payer).toBe('buyer');
    expect(fca.lines.find((l) => l.id === 'inland')?.explanation).toMatch(/FCA en instalaciones del vendedor/);
  });

  it('un pacto contractual reemplaza la regla del Incoterm y queda explicado', () => {
    const lines = freightLines.map((l) =>
      l.id === 'dthc' ? { ...l, payerOverride: 'seller' as const, overrideNote: 'Cláusula 7 del contrato' } : l,
    );
    const r = computeCosting(base({ lines, incoterm: 'CFR', namedPlace: 'Callao', namedPlaceKind: 'port_of_destination' }));
    const dthc = r.lines.find((l) => l.id === 'dthc')!;
    expect(dthc.payer).toBe('seller');
    expect(dthc.payerSource).toBe('agreement');
    expect(dthc.explanation).toMatch(/Pactado: Cláusula 7/);
  });

  it('no suma dos veces un concepto incluido en otra tarifa y detecta posibles duplicados', () => {
    const lines: CostLineInput[] = [
      ...prdLines,
      line({ id: 'vgm', name: 'VGM', point: 'origin_terminal', stage: 'port', amount: '40', includedInLineId: 'ohc' }),
      line({ id: 'ohc2', name: 'OHC  origen', point: 'origin_terminal', stage: 'port', unit: 'per_container', amount: '310' }),
    ];
    const r = computeCosting(base({ lines }));
    const vgm = r.lines.find((l) => l.id === 'vgm')!;
    expect(vgm.included).toBe(false);
    expect(vgm.exclusionReason).toBe('Incluido en "OHC origen"');
    expect(r.duplicates[0].lineIds).toEqual(['ohc', 'ohc2']);
    expect(r.alerts.some((a) => a.code === 'duplicate')).toBe(true);
  });

  it('alerta cuando un concepto del catálogo suele estar incluido en otro', () => {
    const lines: CostLineInput[] = [
      line({ id: 'f', name: 'Flete all-in', point: 'main_carriage', stage: 'international', amount: '2000', catalogId: 'freight_all_in' }),
      line({ id: 'baf', name: 'Recargo BAF', point: 'main_carriage', stage: 'international', amount: '150', catalogId: 'baf', mayBeIncludedIn: ['freight_all_in'] }),
    ];
    const r = computeCosting(base({ lines, pricing: { mode: 'fixed_price', pricePerT: '500' } }));
    expect(r.duplicates.some((d) => d.message.includes('Recargo BAF'))).toBe(true);
  });

  it('QUOTE-02: error si falta el lugar convenido o una tarifa crítica requerida', () => {
    const r = computeCosting(base({ namedPlace: '  ' }));
    expect(r.valid).toBe(false);
    expect(r.alerts.some((a) => a.code === 'named_place_missing' && a.level === 'error')).toBe(true);
    const lines = prdLines.map((l) => (l.id === 'ohc' ? { ...l, amount: '0', required: true } : l));
    expect(computeCosting(base({ lines })).alerts.some((a) => a.code === 'required_missing')).toBe(true);
  });

  it('QUOTE-05: una tarifa vencida no desaparece; queda como estimación no verificada', () => {
    const lines = prdLines.map((l) => (l.id === 'ohc' ? { ...l, validUntil: '2026-09-30' } : l));
    const r = computeCosting(base({ lines }));
    const ohc = r.lines.find((l) => l.id === 'ohc')!;
    expect(ohc.included).toBe(true);
    expect(ohc.effectiveStatus).toBe('expired');
    expect(r.alerts.find((a) => a.code === 'expired')?.message).toMatch(/estimación no verificada/);
  });

  it('convierte moneda con tipo de cambio documentado y bloquea si falta', () => {
    const lines = prdLines.map((l) => (l.id === 'inland' ? { ...l, amount: '600000', currency: 'ARS' as const } : l));
    const fx = [{ base: 'USD' as const, quote: 'ARS' as const, rate: '1200', date: '2026-10-15', source: 'BNA demo' }];
    const ok = computeCosting(base({ lines, fxRates: fx }));
    const inland = ok.lines.find((l) => l.id === 'inland')!;
    expect(inland.amount).toBe('500');
    expect(inland.fx?.pair).toBe('USD/ARS');
    expect(ok.totalPrice).toBe('8360.47');
    const missing = computeCosting(base({ lines }));
    expect(missing.valid).toBe(false);
    expect(missing.lines.find((l) => l.id === 'inland')?.exclusionReason).toMatch(/Falta tipo de cambio ARS→USD/);
  });

  it('cargos por día con días libres y tramos (demurrage por contenedor)', () => {
    expect(dayCharge('100', 12, 5).toString()).toBe('700');
    const tiers = [
      { fromDay: 1, toDay: 5, amountPerDay: '100' },
      { fromDay: 6, toDay: null, amountPerDay: '150' },
    ];
    expect(dayCharge('0', 12, 5, tiers).toString()).toBe('800');
    const lines: CostLineInput[] = [
      ...prdLines,
      line({ id: 'dem', name: 'Demurrage', point: 'origin_terminal', stage: 'contingency', unit: 'per_day', amount: '0', quantity: '12', freeDays: 5, tiers, multiplyByContainers: true }),
    ];
    const r = computeCosting(base({ lines, containers: 2 }));
    expect(r.lines.find((l) => l.id === 'dem')?.amount).toBe('1600');
  });

  it('comisión porcentual sobre una base fija = base × % / 100', () => {
    const lines: CostLineInput[] = [
      ...prdLines.filter((l) => l.id !== 'commission'),
      line({ id: 'c', name: 'Comisión sobre mercadería', point: 'commercial', stage: 'commercial', unit: 'percent', percentBase: 'merchandise_value', amount: '1.5' }),
    ];
    const r = computeCosting(base({ lines }));
    expect(r.lines.find((l) => l.id === 'c')?.amount).toBe('93.75');
  });

  it('interés simple con convención explícita (capital × tasa × días / base)', () => {
    const r = computeCosting(
      base({
        pricing: { mode: 'fixed_price', pricePerT: '400' },
        financing: { enabled: true, principalBase: 'sale_value', principalPct: '70', annualRatePct: '8', days: 90, dayCountBase: 360 },
      }),
    );
    // 10.000 × 70 % × 8 % × 90 / 360 = 140
    expect(r.financing?.interest).toBe('140');
    expect(r.financing?.convention).toMatch(/90 días \/ 360/);
  });

  it('costo por tonelada y por contenedor', () => {
    const r = computeCosting(base({ containers: 1 }));
    expect(dec(r.sellerCostPerT).times(25).toFixed(2)).toBe(dec(r.sellerCostTotal).toFixed(2));
    expect(r.sellerCostPerContainer).toBe(r.sellerCostTotal);
  });

  it('el cálculo es reproducible: mismas entradas, mismos resultados', () => {
    expect(computeCosting(base())).toEqual(computeCosting(base()));
  });

  it('análisis de sensibilidad y comparación de escenarios', () => {
    const cases = sensitivity(base(), 10);
    const merchUp = cases.find((c) => c.label === 'Mercadería +10 %')!;
    expect(dec(merchUp.deltaPricePerT!).gt(0)).toBe(true);
    const a = computeCosting(base());
    const b = computeCosting(base({ pricing: { mode: 'margin_on_sale', marginPct: '15' } }));
    const diff = compareResults(a, b).find((d) => d.metric === 'Precio total')!;
    expect(dec(diff.diff!).gt(0)).toBe(true);
  });
});
