import type { CostingInput, CostingResult } from '@/domain/costing';
import { computeCosting } from '@/domain/costing';
import { dec, toPlain } from '@/domain/decimal';
import type { MatchLotOffer, MatchRequestCriteria } from '@/domain/matching';
import {
  computePackaging,
  containersRequired,
  lotStock,
  type ContainerPlan,
  type LotStock,
  type PackagingResult,
} from '@/domain/quantity';
import type { FxQuote } from '@/domain/units';
import type { CanonicalValue } from '@/integrations/stellar/terms';
import type {
  AgreementTerms,
  BuyerRequest,
  CostScenario,
  Database,
  Lot,
  Presentation,
  Product,
  Quotation,
} from './model';

export function byId<T extends { id: string }>(items: T[], id: string | null | undefined): T | undefined {
  return id ? items.find((item) => item.id === id) : undefined;
}

export function stockOf(db: Database, lotId: string): LotStock {
  const lot = byId(db.lots, lotId);
  if (!lot) return lotStock('0', []);
  return lotStock(
    lot.physicalStockT,
    db.inventoryMovements.filter((m) => m.lotId === lotId),
  );
}

export function presentationOf(product: Product | undefined, presentationId: string | null | undefined): Presentation | undefined {
  if (!product) return undefined;
  return product.presentations.find((p) => p.id === presentationId) ?? product.presentations[0];
}

export function requestCriteria(request: BuyerRequest): MatchRequestCriteria {
  return {
    category: request.category,
    commercialType: request.commercialType,
    varietyPolicy: request.varietyPolicy,
    variety: request.variety,
    processing: request.processing,
    maxBrokenPct: request.maxBrokenPct,
    maxMoisturePct: request.maxMoisturePct,
    maxImpuritiesPct: request.maxImpuritiesPct,
    quantityT: request.quantityT,
    packaging: request.packaging,
    packagingFlexible: request.packagingFlexible,
    availabilityDeadline: request.availabilityDeadline,
    requiredCertifications: request.requiredCertifications,
    allowConsolidation: request.allowConsolidation,
  };
}

/** Oferta de un lote para el motor de matching (stock libre calculado, nunca editado a mano). */
export function lotOffer(db: Database, lot: Lot, asOf: string = today()): MatchLotOffer | null {
  const product = byId(db.products, lot.productId);
  const org = byId(db.organizations, lot.organizationId);
  if (!product || !org) return null;
  const presentation = presentationOf(product, lot.presentationId);
  const stock = stockOf(db, lot.id);
  return {
    lotId: lot.id,
    lotCode: lot.code,
    organizationId: lot.organizationId,
    organizationName: org.name,
    category: product.category,
    commercialType: product.commercialType,
    variety: product.variety,
    processing: product.processing,
    brokenPct: lot.quality.brokenPct,
    moisturePct: lot.quality.moisturePct,
    impuritiesPct: lot.quality.impuritiesPct,
    qualityStatus:
      lot.quality.validUntil && lot.quality.verificationStatus === 'verified' && lot.quality.validUntil < asOf
        ? 'expired'
        : lot.quality.verificationStatus,
    analysisDate: lot.quality.analysisDate,
    availableT: toPlain(stock.available),
    packaging: { type: presentation?.packaging ?? 'bulk', netWeightKg: presentation?.netWeightKg ?? null },
    convertiblePackaging: product.convertibleTo,
    availableFrom: lot.availableFrom,
    certifications: lot.certifications.map((c) => ({ name: c.name, status: c.status })),
    active: lot.status === 'active' && product.status === 'active',
  };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ScenarioLogistics {
  product?: Product;
  presentation?: Presentation;
  packaging: PackagingResult;
  container?: Database['containerTypes'][number];
  containerPlan: ContainerPlan | null;
  containers: number;
}

export function scenarioLogistics(db: Database, scenario: CostScenario): ScenarioLogistics {
  const product = byId(db.products, scenario.productId);
  const presentation = presentationOf(product, scenario.presentationId);
  const packaging = computePackaging(
    scenario.quantityT && dec(scenario.quantityT).gt(0) ? scenario.quantityT : '0',
    {
      type: presentation?.packaging ?? 'bulk',
      netWeightKg: presentation?.netWeightKg,
      tareWeightKg: presentation?.tareWeightKg,
      unitsPerPallet: presentation?.unitsPerPallet,
      palletTareKg: presentation?.palletTareKg,
      packageVolumeM3: presentation?.packageVolumeM3,
    },
    scenario.packagingDecision ?? undefined,
  );
  const container = byId(db.containerTypes, scenario.containerTypeId);
  const containerPlan =
    container && scenario.commercial.transportMode === 'container'
      ? containersRequired(packaging.grossKg, packaging.volumeM3, packaging.pallets, container)
      : null;
  const containers = scenario.containersOverride ?? containerPlan?.count ?? 0;
  return { product, presentation, packaging, container, containerPlan, containers };
}

export function fxQuotesFor(db: Database, ids: string[]): FxQuote[] {
  return db.fxRates
    .filter((r) => ids.includes(r.id))
    .map((r) => ({ id: r.id, base: r.base, quote: r.quote, rate: r.rate, date: r.date, source: r.source, sourceUrl: r.sourceUrl ?? undefined }));
}

/** Arma la entrada del motor de costos reutilizando los datos del escenario (sin duplicar). */
export function scenarioCostingInput(db: Database, scenario: CostScenario, asOf: string): CostingInput {
  const logistics = scenarioLogistics(db, scenario);
  const netT = logistics.packaging.needsDecision ? scenario.quantityT : logistics.packaging.netT;
  return {
    currency: scenario.commercial.currency,
    quantityT: netT || '0',
    grossT: logistics.packaging.needsDecision
      ? toPlain(dec(logistics.packaging.grossT).minus(dec(logistics.packaging.netT)).plus(dec(scenario.quantityT || 0)))
      : logistics.packaging.grossT,
    containers: logistics.containers,
    packages: logistics.packaging.packages,
    pallets: logistics.packaging.pallets,
    incoterm: scenario.commercial.incoterm,
    namedPlace: scenario.commercial.namedPlace,
    namedPlaceKind: scenario.commercial.namedPlaceKind,
    transportMode: scenario.commercial.transportMode,
    lines: scenario.lines,
    fxRates: fxQuotesFor(db, scenario.fxRateIds),
    pricing: scenario.pricing,
    rounding: scenario.rounding,
    financing: scenario.financing,
    asOf,
  };
}

export interface ScenarioEvaluation {
  input: CostingInput;
  result: CostingResult;
  logistics: ScenarioLogistics;
  /** Advertencias de contexto que el motor de costos no conoce. */
  extraAlerts: { level: 'error' | 'warning' | 'info'; message: string }[];
}

export function evaluateScenario(db: Database, scenario: CostScenario, asOf: string): ScenarioEvaluation {
  const input = scenarioCostingInput(db, scenario, asOf);
  const result = computeCosting(input);
  const logistics = scenarioLogistics(db, scenario);
  const extraAlerts: ScenarioEvaluation['extraAlerts'] = [];
  if (!scenario.productId) extraAlerts.push({ level: 'error', message: 'Seleccionar el producto.' });
  if (scenario.lots.length === 0) extraAlerts.push({ level: 'warning', message: 'No hay lotes asignados al escenario.' });
  if (logistics.packaging.needsDecision) {
    extraAlerts.push({
      level: 'error',
      message: `La cantidad no da un número entero de envases (${logistics.packaging.exactPackages}). Elegir cómo ajustarla.`,
    });
  }
  const assigned = scenario.lots.reduce((acc, l) => acc.plus(dec(l.quantityT || 0)), dec(0));
  if (scenario.lots.length > 0 && !assigned.eq(dec(input.quantityT || 0))) {
    extraAlerts.push({
      level: 'warning',
      message: `La suma asignada por lote (${toPlain(assigned)} t) no coincide con la cantidad de la operación (${input.quantityT} t).`,
    });
  }
  for (const part of scenario.lots) {
    const stock = stockOf(db, part.lotId);
    if (dec(part.quantityT || 0).gt(stock.available)) {
      const lot = byId(db.lots, part.lotId);
      extraAlerts.push({
        level: 'error',
        message: `El lote ${lot?.code ?? part.lotId} tiene ${toPlain(stock.available)} t libres y se asignan ${part.quantityT} t.`,
      });
    }
  }
  if (scenario.commercial.transportMode === 'container' && !scenario.containerTypeId && scenario.containersOverride == null) {
    extraAlerts.push({ level: 'warning', message: 'Elegir el tipo de contenedor para estimar la cantidad de contenedores.' });
  }
  return { input, result, logistics, extraAlerts };
}

export function isScenarioQuotable(evaluation: ScenarioEvaluation): boolean {
  return evaluation.result.valid && !evaluation.extraAlerts.some((a) => a.level === 'error');
}

/** Términos canónicos de una versión: lo que ambas partes aceptan y lo que se hashea. */
export function buildAgreementTerms(
  db: Database,
  quotation: Pick<Quotation, 'id' | 'code' | 'sellerOrganizationId' | 'buyerOrganizationId' | 'requestId'>,
  version: number,
  scenario: CostScenario,
  result: CostingResult,
  validUntil: string,
): AgreementTerms {
  const logistics = scenarioLogistics(db, scenario);
  const product = logistics.product;
  const lots: CanonicalValue[] = scenario.lots.map((part) => {
    const lot = byId(db.lots, part.lotId);
    return {
      lotId: part.lotId,
      code: lot?.code ?? null,
      quantityT: toPlain(dec(part.quantityT)),
      brokenPct: lot?.quality.brokenPct ?? null,
      moisturePct: lot?.quality.moisturePct ?? null,
      qualityStatus: lot?.quality.verificationStatus ?? null,
    };
  });
  return {
    schema: 'agromatch.terms/v1',
    quotation: { id: quotation.id, code: quotation.code, version },
    requestId: quotation.requestId ?? null,
    seller: { organizationId: quotation.sellerOrganizationId },
    buyer: { organizationId: quotation.buyerOrganizationId },
    product: {
      id: product?.id ?? null,
      code: product?.code ?? null,
      category: product?.category ?? null,
      commercialType: product?.commercialType ?? null,
      variety: product?.variety ?? null,
      processing: product?.processing ?? null,
      ncm: scenario.customs.ncm || product?.ncm || null,
    },
    lots,
    quantityT: result.quantityT,
    packaging: {
      type: logistics.presentation?.packaging ?? null,
      netWeightKg: logistics.presentation?.netWeightKg ?? null,
      packages: logistics.packaging.packages,
    },
    currency: result.currency,
    pricePerT: result.pricePerT,
    totalAmount: result.totalPrice,
    incoterm: {
      rule: scenario.commercial.incoterm,
      version: '2020',
      namedPlace: scenario.commercial.namedPlace,
      namedPlaceKind: scenario.commercial.namedPlaceKind,
    },
    transportMode: scenario.commercial.transportMode,
    shipmentDate: scenario.commercial.shipmentDate ?? null,
    paymentMethod: scenario.finance.paymentMethod,
    paymentTerms: scenario.commercial.paymentTerms,
    destination: {
      country: scenario.destinationCountry ?? null,
      portId: scenario.destinationPortId ?? null,
    },
    validUntil,
  };
}
