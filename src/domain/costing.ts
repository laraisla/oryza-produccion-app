import type { Incoterm, Party, TransportMode, VerificationStatus } from './catalogs';
import { dec, roundTo, sum, toFixed, toPlain, type Dec, type RoundingMode } from './decimal';
import {
  allocationRule,
  incotermAdvice,
  type CostPoint,
  type NamedPlaceKind,
} from './incoterms';
import { convert, MissingFxRateError, type Currency, type FxQuote } from './units';

export const COSTING_ENGINE_VERSION = 'costing/1.0.0';

export type CostUnit = 'per_ton' | 'per_container' | 'per_operation' | 'per_day' | 'per_unit' | 'percent';

export const COST_UNITS: Record<CostUnit, string> = {
  per_ton: 'Por tonelada',
  per_container: 'Por contenedor',
  per_operation: 'Por operación',
  per_day: 'Por día',
  per_unit: 'Por unidad',
  percent: 'Porcentaje de una base',
};

export type PercentBase = 'sale_value' | 'insured_value' | 'fob_value' | 'merchandise_value' | 'custom_amount';

export const PERCENT_BASES: Record<PercentBase, string> = {
  sale_value: 'Valor de venta (precio cotizado)',
  insured_value: 'Valor asegurado (110 % del valor CIF)',
  fob_value: 'Valor FOB equivalente',
  merchandise_value: 'Costo de la mercadería',
  custom_amount: 'Importe base indicado',
};

export type CostStage =
  | 'merchandise'
  | 'origin'
  | 'port'
  | 'international'
  | 'customs'
  | 'commercial'
  | 'financial'
  | 'contingency';

export const COST_STAGES: Record<CostStage, string> = {
  merchandise: 'Mercadería',
  origin: 'Transporte interno y origen',
  port: 'Puerto y embarque',
  international: 'Transporte internacional',
  customs: 'Aduana y certificaciones',
  commercial: 'Comercial',
  financial: 'Financiero',
  contingency: 'Contingencias',
};

export interface DayTier {
  /** Primer día cobrable del tramo (1 = primer día luego de los días libres). */
  fromDay: number;
  /** Último día del tramo, inclusive; null = sin tope. */
  toDay: number | null;
  amountPerDay: string;
}

export interface CostLineInput {
  id: string;
  name: string;
  stage: CostStage;
  point: CostPoint;
  provider?: string;
  /** Importe unitario; en `percent` es el porcentaje (2 = 2 %). */
  amount: string;
  currency: Currency;
  unit: CostUnit;
  /** Cantidad manual (días, unidades, contenedores); null = automática. */
  quantity?: string | null;
  unitBasis?: 'package' | 'pallet' | 'custom';
  tonBasis?: 'net' | 'gross';
  percentBase?: PercentBase;
  customBaseAmount?: string;
  freeDays?: number;
  tiers?: DayTier[];
  multiplyByContainers?: boolean;
  /** Pacto contractual que reemplaza la asignación del Incoterm. */
  payerOverride?: Party | null;
  overrideNote?: string;
  /** Si el concepto ya está incluido en otra partida, no se suma (evita doble conteo). */
  includedInLineId?: string | null;
  appliesTo?: { transportModes?: TransportMode[]; incoterms?: Incoterm[] };
  enabled: boolean;
  required?: boolean;
  rateDate?: string | null;
  validUntil?: string | null;
  source: string;
  sourceUrl?: string;
  verificationStatus: VerificationStatus;
  catalogId?: string;
  /** Conceptos del catálogo que suelen incluir a este (para alertar posibles duplicados). */
  mayBeIncludedIn?: string[];
  notes?: string;
}

export type PricingMode = 'margin_on_sale' | 'markup_on_cost' | 'fixed_price';

export const PRICING_MODES: Record<PricingMode, string> = {
  margin_on_sale: 'Margen sobre venta',
  markup_on_cost: 'Recargo (markup) sobre costo',
  fixed_price: 'Precio negociado (fijo)',
};

export interface PricingInput {
  mode: PricingMode;
  marginPct?: string;
  markupPct?: string;
  pricePerT?: string;
}

export interface FinancingInput {
  enabled: boolean;
  principalBase: 'sale_value' | 'custom_amount';
  /** Porcentaje del valor de venta financiado (si principalBase = sale_value). */
  principalPct: string;
  customAmount?: string;
  annualRatePct: string;
  days: number;
  dayCountBase: 360 | 365;
}

export interface CostingInput {
  currency: Currency;
  quantityT: string;
  grossT: string;
  containers: number;
  packages: number;
  pallets: number;
  incoterm: Incoterm;
  namedPlace: string;
  namedPlaceKind: NamedPlaceKind;
  transportMode: TransportMode;
  lines: CostLineInput[];
  fxRates: FxQuote[];
  pricing: PricingInput;
  /** Redondeo del precio cotizado: por tonelada (precio contractual) o sobre el total. */
  rounding: { decimals: number; mode: RoundingMode; target?: 'per_ton' | 'total' };
  financing?: FinancingInput;
  /** Fecha de referencia (YYYY-MM-DD) para evaluar vencimientos. */
  asOf: string;
}

export type AlertLevel = 'error' | 'warning' | 'info';

export interface CostingAlert {
  level: AlertLevel;
  code: string;
  message: string;
  lineId?: string;
}

export interface LineResult {
  id: string;
  name: string;
  stage: CostStage;
  point: CostPoint;
  unit: CostUnit;
  included: boolean;
  exclusionReason?: string;
  quantity: string | null;
  /** Parte fija (β) en moneda de cotización. */
  fixedAmount: string;
  /** Fracción del precio de venta (α). */
  saleRate: string;
  /** Importe evaluado al precio cotizado: β + α·P. */
  amount: string;
  payer: Party;
  payerSource: 'incoterm' | 'agreement';
  explanation: string;
  fx: { rate: string; date: string; source: string; pair: string } | null;
  effectiveStatus: VerificationStatus;
  source: string;
}

export interface StageTotals {
  stage: CostStage;
  seller: string;
  buyer: string;
  total: string;
}

export interface DuplicateWarning {
  lineIds: string[];
  message: string;
}

export interface CostingResult {
  engineVersion: string;
  asOf: string;
  valid: boolean;
  currency: Currency;
  quantityT: string;
  containers: number;
  incoterm: Incoterm;
  pricing: { mode: PricingMode; label: string; formula: string };
  pricePerT: string | null;
  totalPrice: string | null;
  minPricePerT: string | null;
  sellerCostTotal: string;
  sellerCostPerT: string;
  sellerCostPerContainer: string | null;
  buyerCostTotal: string;
  operationCostTotal: string;
  commissionsTotal: string;
  marginAbs: string | null;
  marginPctOnSale: string | null;
  markupPctOnCost: string | null;
  financing: { interest: string; convention: string } | null;
  stages: StageTotals[];
  lines: LineResult[];
  alerts: CostingAlert[];
  duplicates: DuplicateWarning[];
}

interface Evaluated {
  line: CostLineInput;
  included: boolean;
  exclusionReason?: string;
  quantity: Dec | null;
  beta: Dec;
  alpha: Dec;
  payer: Party;
  payerSource: 'incoterm' | 'agreement';
  explanation: string;
  fx: LineResult['fx'];
  effectiveStatus: VerificationStatus;
}

const POST_FOB_POINTS: CostPoint[] = ['main_carriage', 'insurance', 'destination_terminal', 'on_carriage'];

/** Cargo por días con días libres y tramos (p. ej., demurrage). */
export function dayCharge(amountPerDay: string, days: number, freeDays = 0, tiers?: DayTier[]): Dec {
  const chargeable = Math.max(0, Math.floor(days) - Math.max(0, Math.floor(freeDays)));
  if (!tiers || tiers.length === 0) return dec(amountPerDay).times(chargeable);
  let total = dec(0);
  for (const tier of tiers) {
    const end = tier.toDay === null ? chargeable : Math.min(tier.toDay, chargeable);
    const overlap = Math.max(0, end - tier.fromDay + 1);
    total = total.plus(dec(tier.amountPerDay).times(overlap));
  }
  return total;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function detectDuplicates(lines: CostLineInput[]): DuplicateWarning[] {
  const active = lines.filter((l) => l.enabled && !l.includedInLineId);
  const warnings: DuplicateWarning[] = [];
  const byKey = new Map<string, CostLineInput[]>();
  for (const line of active) {
    const keys = new Set([`name:${line.point}:${normalizeName(line.name)}`]);
    if (line.catalogId) keys.add(`catalog:${line.catalogId}`);
    for (const key of keys) byKey.set(key, [...(byKey.get(key) ?? []), line]);
  }
  const reported = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const ids = group.map((l) => l.id).sort();
    const signature = ids.join('|');
    if (reported.has(signature)) continue;
    reported.add(signature);
    warnings.push({
      lineIds: ids,
      message: `Posible duplicado: "${group[0].name}" aparece ${group.length} veces en el mismo punto de la cadena.`,
    });
  }
  for (const line of active) {
    for (const container of line.mayBeIncludedIn ?? []) {
      const parent = active.find((other) => other.id !== line.id && other.catalogId === container);
      if (parent) {
        warnings.push({
          lineIds: [line.id, parent.id],
          message: `Verificar si "${line.name}" ya está incluido en "${parent.name}"; si es así, marcarlo como incluido para no sumarlo dos veces.`,
        });
      }
    }
  }
  return warnings;
}

function lineQuantity(line: CostLineInput, input: CostingInput): Dec | null {
  const manual = line.quantity !== undefined && line.quantity !== null && line.quantity !== '';
  switch (line.unit) {
    case 'per_ton':
      return manual ? dec(line.quantity!) : dec(line.tonBasis === 'gross' ? input.grossT : input.quantityT);
    case 'per_container':
      return manual ? dec(line.quantity!) : dec(input.containers);
    case 'per_operation':
      return manual ? dec(line.quantity!) : dec(1);
    case 'per_unit':
      if (manual) return dec(line.quantity!);
      if (line.unitBasis === 'pallet') return dec(input.pallets);
      if (line.unitBasis === 'package' || line.unitBasis === undefined) return dec(input.packages);
      return null;
    case 'per_day':
      return manual ? dec(line.quantity!) : null;
    case 'percent':
      return null;
  }
}

function isApplicable(line: CostLineInput, input: CostingInput): string | null {
  const modes = line.appliesTo?.transportModes;
  if (modes && modes.length > 0 && !modes.includes(input.transportMode)) {
    return 'No aplica al modo de transporte elegido';
  }
  const terms = line.appliesTo?.incoterms;
  if (terms && terms.length > 0 && !terms.includes(input.incoterm)) {
    return `Solo aplica con ${terms.join(', ')}`;
  }
  return null;
}

function effectiveStatus(line: CostLineInput, asOf: string): VerificationStatus {
  if (line.validUntil && line.validUntil < asOf) return 'expired';
  return line.verificationStatus;
}

export function computeCosting(input: CostingInput): CostingResult {
  const alerts: CostingAlert[] = [];
  const qty = dec(input.quantityT || 0);
  if (qty.lte(0)) {
    alerts.push({ level: 'error', code: 'quantity', message: 'La cantidad neta debe ser mayor a cero.' });
  }
  for (const advice of incotermAdvice(input.incoterm, input.transportMode, input.namedPlaceKind, input.namedPlace)) {
    alerts.push({ level: advice.level, code: advice.code, message: advice.message });
  }

  const byId = new Map(input.lines.map((l) => [l.id, l]));
  const evaluated: Evaluated[] = input.lines.map((line) => {
    const rule = allocationRule(input.incoterm, line.point, input.namedPlaceKind);
    const agreed = line.payerOverride ?? null;
    const ev: Evaluated = {
      line,
      included: true,
      quantity: null,
      beta: dec(0),
      alpha: dec(0),
      payer: agreed ?? rule.payer,
      payerSource: agreed ? 'agreement' : 'incoterm',
      explanation: agreed
        ? `Pactado: ${line.overrideNote?.trim() || 'asignación acordada entre las partes'}. Regla por defecto: ${rule.explanation}`
        : rule.explanation,
      fx: null,
      effectiveStatus: effectiveStatus(line, input.asOf),
    };
    if (!line.enabled) {
      ev.included = false;
      ev.exclusionReason = 'Desactivado';
      return ev;
    }
    const notApplicable = isApplicable(line, input);
    if (notApplicable) {
      ev.included = false;
      ev.exclusionReason = notApplicable;
      return ev;
    }
    if (line.includedInLineId) {
      const parent = byId.get(line.includedInLineId);
      if (parent && parent.enabled) {
        ev.included = false;
        ev.exclusionReason = `Incluido en "${parent.name}"`;
        return ev;
      }
      alerts.push({
        level: 'warning',
        code: 'included_missing',
        lineId: line.id,
        message: `"${line.name}" figura incluido en un concepto inexistente o desactivado: se suma para no omitir el costo.`,
      });
    }
    if (ev.effectiveStatus === 'expired') {
      alerts.push({
        level: 'warning',
        code: 'expired',
        lineId: line.id,
        message: `Tarifa vencida: "${line.name}" (venció el ${line.validUntil}). Se mantiene como estimación no verificada hasta actualizarla.`,
      });
    } else if (ev.effectiveStatus === 'estimated' || ev.effectiveStatus === 'pending') {
      alerts.push({
        level: 'info',
        code: 'unverified',
        lineId: line.id,
        message: `"${line.name}" es un valor ${ev.effectiveStatus === 'estimated' ? 'estimado' : 'pendiente de verificación'}.`,
      });
    }
    if (!line.source.trim()) {
      alerts.push({ level: 'warning', code: 'no_source', lineId: line.id, message: `"${line.name}" no tiene fuente registrada.` });
    }
    if (line.required && dec(line.amount || 0).lte(0)) {
      alerts.push({
        level: 'error',
        code: 'required_missing',
        lineId: line.id,
        message: `Falta el importe de "${line.name}", marcado como tarifa crítica requerida.`,
      });
    }
    return ev;
  });

  const toQuote = (ev: Evaluated, amount: Dec): Dec | null => {
    try {
      const conversion = convert(amount, ev.line.currency, input.currency, input.fxRates);
      if (conversion.fx) {
        ev.fx = {
          rate: conversion.fx.rate,
          date: conversion.fx.date,
          source: conversion.fx.source,
          pair: `${conversion.fx.base}/${conversion.fx.quote}`,
        };
      }
      return conversion.amount;
    } catch (error) {
      if (error instanceof MissingFxRateError) {
        ev.included = false;
        ev.exclusionReason = `Falta tipo de cambio ${error.from}→${error.to}`;
        alerts.push({
          level: 'error',
          code: 'missing_fx',
          lineId: ev.line.id,
          message: `No se puede convertir "${ev.line.name}": falta un tipo de cambio documentado ${error.from}→${error.to}.`,
        });
        return null;
      }
      throw error;
    }
  };

  // 1) Partidas no porcentuales: importe fijo (β).
  for (const ev of evaluated) {
    if (!ev.included || ev.line.unit === 'percent') continue;
    const quantity = lineQuantity(ev.line, input);
    ev.quantity = quantity;
    if (quantity === null) {
      alerts.push({
        level: 'warning',
        code: 'missing_quantity',
        lineId: ev.line.id,
        message: `"${ev.line.name}" requiere indicar ${ev.line.unit === 'per_day' ? 'la cantidad de días' : 'la cantidad'}.`,
      });
      continue;
    }
    if (ev.line.unit === 'per_container' && quantity.isZero()) {
      alerts.push({
        level: 'warning',
        code: 'no_containers',
        lineId: ev.line.id,
        message: `"${ev.line.name}" es por contenedor pero la operación no tiene contenedores calculados.`,
      });
    }
    const raw =
      ev.line.unit === 'per_day'
        ? dayCharge(ev.line.amount, quantity.toNumber(), ev.line.freeDays, ev.line.tiers).times(
            ev.line.multiplyByContainers ? input.containers : 1,
          )
        : dec(ev.line.amount || 0).times(quantity);
    const converted = toQuote(ev, raw);
    if (converted) ev.beta = converted;
  }

  // 2) Porcentajes en orden de dependencia: bases fijas, valor asegurado, FOB, venta.
  const percentOf = (base: PercentBase) =>
    evaluated.filter((ev) => ev.included && ev.line.unit === 'percent' && (ev.line.percentBase ?? 'sale_value') === base);

  const merchandiseBase = sum(
    evaluated.filter((ev) => ev.included && ev.line.point === 'merchandise' && ev.line.unit !== 'percent').map((ev) => ev.beta),
  );
  for (const ev of percentOf('merchandise_value')) {
    ev.beta = dec(ev.line.amount).div(100).times(merchandiseBase);
  }
  for (const ev of percentOf('custom_amount')) {
    const base = toQuote(ev, dec(ev.line.customBaseAmount || 0));
    if (base) ev.beta = dec(ev.line.amount).div(100).times(base);
  }
  // Valor CIF equivalente: en FCA/FOB se suma el flete que paga el comprador.
  const buyerFreight =
    input.incoterm === 'FCA' || input.incoterm === 'FOB'
      ? sum(evaluated.filter((ev) => ev.included && ev.line.point === 'main_carriage').map((ev) => ev.beta))
      : dec(0);
  for (const ev of percentOf('insured_value')) {
    const rate = dec(ev.line.amount).div(100).times('1.1');
    ev.alpha = rate;
    ev.beta = rate.times(buyerFreight);
  }
  if (input.incoterm === 'CFR' || input.incoterm === 'CIF' || input.incoterm === 'DAP') {
    const post = evaluated.filter(
      (ev) =>
        ev.included &&
        ev.payer === 'seller' &&
        POST_FOB_POINTS.includes(ev.line.point) &&
        !(ev.line.unit === 'percent' && ev.line.percentBase === 'fob_value'),
    );
    const postBeta = sum(post.map((ev) => ev.beta));
    const postAlpha = sum(post.map((ev) => ev.alpha));
    for (const ev of percentOf('fob_value')) {
      const rate = dec(ev.line.amount).div(100);
      ev.alpha = rate.times(dec(1).minus(postAlpha));
      ev.beta = rate.times(postBeta).negated();
    }
  } else {
    for (const ev of percentOf('fob_value')) ev.alpha = dec(ev.line.amount).div(100);
  }
  for (const ev of percentOf('sale_value')) ev.alpha = dec(ev.line.amount).div(100);

  // 3) Financiación (interés simple con convención explícita).
  let financingEv: Evaluated | null = null;
  let financingConvention = '';
  const fin = input.financing;
  if (fin?.enabled) {
    const factor = dec(fin.annualRatePct || 0).div(100).times(fin.days).div(fin.dayCountBase);
    financingConvention = `Interés simple: capital × ${fin.annualRatePct} % anual × ${fin.days} días / ${fin.dayCountBase}`;
    const rule = allocationRule(input.incoterm, 'financial', input.namedPlaceKind);
    financingEv = {
      line: {
        id: '__financing__',
        name: 'Interés de financiación',
        stage: 'financial',
        point: 'financial',
        amount: fin.annualRatePct,
        currency: input.currency,
        unit: 'percent',
        enabled: true,
        source: 'Condiciones de financiación ingresadas',
        verificationStatus: 'estimated',
      },
      included: true,
      quantity: null,
      beta: fin.principalBase === 'custom_amount' ? dec(fin.customAmount || 0).times(factor) : dec(0),
      alpha: fin.principalBase === 'sale_value' ? dec(fin.principalPct || 0).div(100).times(factor) : dec(0),
      payer: 'seller',
      payerSource: 'incoterm',
      explanation: `${rule.explanation} ${financingConvention}.`,
      fx: null,
      effectiveStatus: 'estimated',
    };
    evaluated.push(financingEv);
  }

  const included = evaluated.filter((ev) => ev.included);
  const sellerBeta = sum(included.filter((ev) => ev.payer === 'seller').map((ev) => ev.beta));
  const sellerAlpha = sum(included.filter((ev) => ev.payer === 'seller').map((ev) => ev.alpha));

  // 4) Precio.
  const pricing = input.pricing;
  let price: Dec | null = null;
  let formula = '';
  let minPrice: Dec | null = null;
  if (sellerAlpha.lt(1)) {
    minPrice = sellerBeta.div(dec(1).minus(sellerAlpha));
  } else {
    alerts.push({
      level: 'error',
      code: 'sale_charges',
      message: 'Los cargos calculados sobre la venta suman 100 % o más: no existe un precio que los cubra.',
    });
  }
  if (pricing.mode === 'margin_on_sale') {
    const m = dec(pricing.marginPct || 0).div(100);
    const denominator = dec(1).minus(m).minus(sellerAlpha);
    formula = `Precio = costos fijos del vendedor / (1 − margen ${toFixed(m.times(100), 2)} % − cargos sobre venta ${toFixed(sellerAlpha.times(100), 4)} %)`;
    if (denominator.lte(0)) {
      alerts.push({
        level: 'error',
        code: 'margin_overflow',
        message: 'Margen + comisiones y cargos sobre la venta ≥ 100 %: el cálculo no es válido. Reducir el margen o las comisiones.',
      });
    } else {
      price = sellerBeta.div(denominator);
    }
  } else if (pricing.mode === 'markup_on_cost') {
    const k = dec(pricing.markupPct || 0).div(100);
    formula = `Precio = costo base del vendedor × (1 + recargo ${toFixed(k.times(100), 2)} %); las comisiones sobre la venta se calculan aparte y reducen el margen`;
    price = sellerBeta.times(dec(1).plus(k));
  } else {
    formula = 'Precio negociado ingresado por el usuario; el margen resulta de los costos';
    if (!pricing.pricePerT || dec(pricing.pricePerT).lte(0)) {
      alerts.push({ level: 'error', code: 'price_missing', message: 'Ingresar el precio por tonelada negociado.' });
    } else {
      price = dec(pricing.pricePerT).times(qty);
    }
  }

  let pricePerT: Dec | null = null;
  let totalPrice: Dec | null = null;
  if (price && qty.gt(0)) {
    if (pricing.mode === 'fixed_price') {
      pricePerT = dec(pricing.pricePerT!);
      totalPrice = pricePerT.times(qty);
    } else if (input.rounding.target === 'total') {
      totalPrice = roundTo(price, input.rounding.decimals, input.rounding.mode);
      pricePerT = totalPrice.div(qty);
    } else {
      pricePerT = roundTo(price.div(qty), input.rounding.decimals, input.rounding.mode);
      totalPrice = pricePerT.times(qty);
    }
  }

  // 5) Evaluación final al precio cotizado.
  const P = totalPrice ?? dec(0);
  const amountOf = (ev: Evaluated) => (ev.included ? ev.beta.plus(ev.alpha.times(P)) : dec(0));
  const sellerCost = sum(included.filter((ev) => ev.payer === 'seller').map(amountOf));
  const buyerCost = sum(included.filter((ev) => ev.payer === 'buyer').map(amountOf));
  const commissions = sum(
    included
      .filter((ev) => ev.payer === 'seller' && (ev.line.stage === 'commercial' || ev.line.stage === 'financial'))
      .map(amountOf),
  );
  const margin = totalPrice ? totalPrice.minus(sellerCost) : null;
  if (margin && margin.lt(0)) {
    alerts.push({
      level: 'warning',
      code: 'negative_margin',
      message: 'El precio no cubre los costos asumidos por el vendedor: margen negativo.',
    });
  }

  const stages = (Object.keys(COST_STAGES) as CostStage[])
    .map((stage) => {
      const inStage = included.filter((ev) => ev.line.stage === stage);
      const seller = sum(inStage.filter((ev) => ev.payer === 'seller').map(amountOf));
      const buyer = sum(inStage.filter((ev) => ev.payer === 'buyer').map(amountOf));
      return { stage, seller: toPlain(seller), buyer: toPlain(buyer), total: toPlain(seller.plus(buyer)) };
    })
    .filter((s) => !dec(s.total).isZero());

  const duplicates = detectDuplicates(input.lines);
  for (const dup of duplicates) {
    alerts.push({ level: 'warning', code: 'duplicate', message: dup.message, lineId: dup.lineIds[0] });
  }

  const valid = !alerts.some((a) => a.level === 'error');
  return {
    engineVersion: COSTING_ENGINE_VERSION,
    asOf: input.asOf,
    valid,
    currency: input.currency,
    quantityT: toPlain(qty),
    containers: input.containers,
    incoterm: input.incoterm,
    pricing: { mode: pricing.mode, label: PRICING_MODES[pricing.mode], formula },
    pricePerT: pricePerT ? toPlain(pricePerT) : null,
    totalPrice: totalPrice ? toPlain(totalPrice) : null,
    minPricePerT: minPrice && qty.gt(0) ? toPlain(minPrice.div(qty)) : null,
    sellerCostTotal: toPlain(sellerCost),
    sellerCostPerT: qty.gt(0) ? toPlain(sellerCost.div(qty)) : '0',
    sellerCostPerContainer: input.containers > 0 ? toPlain(sellerCost.div(input.containers)) : null,
    buyerCostTotal: toPlain(buyerCost),
    operationCostTotal: toPlain(sellerCost.plus(buyerCost)),
    commissionsTotal: toPlain(commissions),
    marginAbs: margin ? toPlain(margin) : null,
    marginPctOnSale: margin && totalPrice && !totalPrice.isZero() ? toPlain(margin.div(totalPrice).times(100)) : null,
    markupPctOnCost: margin && !sellerCost.isZero() ? toPlain(margin.div(sellerCost).times(100)) : null,
    financing: financingEv ? { interest: toPlain(amountOf(financingEv)), convention: financingConvention } : null,
    stages,
    lines: evaluated.map((ev) => ({
      id: ev.line.id,
      name: ev.line.name,
      stage: ev.line.stage,
      point: ev.line.point,
      unit: ev.line.unit,
      included: ev.included,
      exclusionReason: ev.exclusionReason,
      quantity: ev.quantity ? toPlain(ev.quantity) : null,
      fixedAmount: toPlain(ev.beta),
      saleRate: toPlain(ev.alpha),
      amount: toPlain(amountOf(ev)),
      payer: ev.payer,
      payerSource: ev.payerSource,
      explanation: ev.explanation,
      fx: ev.fx,
      effectiveStatus: ev.effectiveStatus,
      source: ev.line.source,
    })),
    alerts,
    duplicates,
  };
}

export interface SensitivityCase {
  label: string;
  pricePerT: string | null;
  marginAbs: string | null;
  marginPctOnSale: string | null;
  deltaPricePerT: string | null;
  deltaMargin: string | null;
}

/** Recalcula variando ±pct las partidas principales del vendedor, los tipos de cambio y la cantidad. */
export function sensitivity(input: CostingInput, pct = 10): SensitivityCase[] {
  const base = computeCosting(input);
  const factorUp = dec(1).plus(dec(pct).div(100));
  const factorDown = dec(1).minus(dec(pct).div(100));
  const cases: { label: string; input: CostingInput }[] = [];

  const topLines = base.lines
    .filter((l) => l.included && l.payer === 'seller' && l.id !== '__financing__')
    .sort((a, b) => dec(b.amount).comparedTo(dec(a.amount)))
    .slice(0, 3);
  for (const top of topLines) {
    for (const [sign, factor] of [['+', factorUp], ['−', factorDown]] as const) {
      cases.push({
        label: `${top.name} ${sign}${pct} %`,
        input: {
          ...input,
          lines: input.lines.map((l) => (l.id === top.id ? { ...l, amount: toPlain(dec(l.amount).times(factor)) } : l)),
        },
      });
    }
  }
  const foreign = new Set(input.lines.filter((l) => l.enabled && l.currency !== input.currency).map((l) => l.currency));
  for (const currency of foreign) {
    for (const [sign, factor] of [['+', factorUp], ['−', factorDown]] as const) {
      cases.push({
        label: `Tipo de cambio ${currency} ${sign}${pct} %`,
        input: {
          ...input,
          fxRates: input.fxRates.map((r) =>
            r.base === currency || r.quote === currency ? { ...r, rate: toPlain(dec(r.rate).times(factor)) } : r,
          ),
        },
      });
    }
  }
  cases.push({
    label: `Cantidad −${pct} %`,
    input: {
      ...input,
      quantityT: toPlain(dec(input.quantityT).times(factorDown)),
      grossT: toPlain(dec(input.grossT).times(factorDown)),
    },
  });

  return cases.map(({ label, input: variant }) => {
    const result = computeCosting(variant);
    return {
      label,
      pricePerT: result.pricePerT,
      marginAbs: result.marginAbs,
      marginPctOnSale: result.marginPctOnSale,
      deltaPricePerT:
        result.pricePerT && base.pricePerT ? toPlain(dec(result.pricePerT).minus(base.pricePerT)) : null,
      deltaMargin: result.marginAbs && base.marginAbs ? toPlain(dec(result.marginAbs).minus(base.marginAbs)) : null,
    };
  });
}

export interface ScenarioDiff {
  metric: string;
  a: string | null;
  b: string | null;
  diff: string | null;
}

export function compareResults(a: CostingResult, b: CostingResult): ScenarioDiff[] {
  const metric = (label: string, x: string | null, y: string | null): ScenarioDiff => ({
    metric: label,
    a: x,
    b: y,
    diff: x !== null && y !== null ? toPlain(dec(y).minus(x)) : null,
  });
  return [
    metric('Precio por tonelada', a.pricePerT, b.pricePerT),
    metric('Precio total', a.totalPrice, b.totalPrice),
    metric('Precio mínimo por tonelada', a.minPricePerT, b.minPricePerT),
    metric('Costo del vendedor', a.sellerCostTotal, b.sellerCostTotal),
    metric('Costo del vendedor por tonelada', a.sellerCostPerT, b.sellerCostPerT),
    metric('Costos a cargo del comprador', a.buyerCostTotal, b.buyerCostTotal),
    metric('Margen absoluto', a.marginAbs, b.marginAbs),
    metric('Margen % sobre venta', a.marginPctOnSale, b.marginPctOnSale),
  ];
}
