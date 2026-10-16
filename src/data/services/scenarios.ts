import type { Incoterm } from '@/domain/catalogs';
import type { CostLineInput } from '@/domain/costing';
import { dec, toPlain } from '@/domain/decimal';
import { INCOTERM_DEFINITIONS, type NamedPlaceKind } from '@/domain/incoterms';
import { assertCan } from '../access';
import { byId, stockOf } from '../derive';
import type { CostCatalogItem, CostScenario, Database } from '../model';
import { find, mutate, ValidationError, type ServiceContext } from './context';

export function lineFromCatalog(item: CostCatalogItem, id: string): CostLineInput {
  const { organizationId: _org, key, defaultEnabled, updatedAt: _u, ...rest } = item;
  void _org;
  void _u;
  return { ...structuredClone(rest), id, catalogId: key, enabled: defaultEnabled };
}

export function suggestedNamedPlace(
  db: Database,
  incoterm: Incoterm,
  ctx: { facilityId?: string | null; exitPortId?: string | null; destinationPortId?: string | null; destinationCity?: string | null },
): { namedPlace: string; namedPlaceKind: NamedPlaceKind } {
  const kind = INCOTERM_DEFINITIONS[incoterm].defaultPlaceKind;
  const exitPort = byId(db.ports, ctx.exitPortId);
  const destPort = byId(db.ports, ctx.destinationPortId);
  const facility = byId(db.facilities, ctx.facilityId);
  switch (incoterm) {
    case 'FCA':
      return { namedPlace: exitPort ? `Terminal de contenedores, ${exitPort.name}` : (facility?.name ?? ''), namedPlaceKind: kind };
    case 'FOB':
      return { namedPlace: exitPort?.name ?? '', namedPlaceKind: kind };
    case 'CFR':
    case 'CIF':
      return { namedPlace: destPort?.name ?? '', namedPlaceKind: kind };
    case 'DAP':
      return { namedPlace: ctx.destinationCity ?? destPort?.city ?? '', namedPlaceKind: kind };
  }
}

export interface NewScenarioOptions {
  name?: string;
  requestId?: string | null;
  lotId?: string | null;
  lots?: { lotId: string; quantityT: string }[];
}

export function createScenario(db: Database, ctx: ServiceContext, options: NewScenarioOptions = {}) {
  assertCan(ctx.user, 'scenario.manage');
  const request = byId(db.requests, options.requestId);
  const lotParts =
    options.lots ??
    (options.lotId ? [{ lotId: options.lotId, quantityT: request?.quantityT ?? toPlain(stockOf(db, options.lotId).available) }] : []);
  const firstLot = byId(db.lots, lotParts[0]?.lotId);
  if (firstLot && firstLot.organizationId !== ctx.user.organizationId) {
    throw new ValidationError('Solo se pueden cotizar lotes propios.');
  }
  const facility = byId(db.facilities, firstLot?.facilityId);
  const incoterm: Incoterm = request?.preferredIncoterm ?? 'FOB';
  const place = suggestedNamedPlace(db, incoterm, {
    facilityId: facility?.id,
    exitPortId: facility?.exitPortId,
    destinationPortId: request?.destinationPortId,
    destinationCity: request?.destinationCity,
  });
  const catalog = db.costCatalog.filter((c) => c.organizationId === ctx.user.organizationId);
  const latestFx = new Map<string, string>();
  for (const rate of [...db.fxRates].filter((r) => r.organizationId === ctx.user.organizationId).sort((a, b) => a.date.localeCompare(b.date))) {
    latestFx.set(`${rate.base}/${rate.quote}`, rate.id);
  }
  const product = byId(db.products, firstLot?.productId);
  const quantity = lotParts.reduce((acc, p) => acc.plus(dec(p.quantityT || 0)), dec(0));

  return mutate(db, (draft) => {
    const scenario: CostScenario = {
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      name: options.name ?? (request ? `Cotización ${request.code}` : 'Nuevo escenario'),
      status: 'draft',
      wizardStep: 0,
      requestId: request?.id ?? null,
      buyerOrganizationId: request?.buyerOrganizationId ?? null,
      productId: product?.id ?? null,
      lots: lotParts.map((p) => ({ lotId: p.lotId, quantityT: toPlain(dec(p.quantityT || 0)) })),
      quantityT: toPlain(quantity),
      presentationId: firstLot?.presentationId ?? product?.presentations[0]?.id ?? null,
      packagingDecision: null,
      originFacilityId: facility?.id ?? null,
      exitPortId: facility?.exitPortId ?? null,
      destinationCountry: request?.destinationCountry ?? null,
      destinationCity: request?.destinationCity ?? null,
      destinationPortId: request?.destinationPortId ?? null,
      containerTypeId: draft.containerTypes[0]?.id ?? null,
      containersOverride: null,
      commercial: {
        incoterm,
        namedPlace: place.namedPlace,
        namedPlaceKind: place.namedPlaceKind,
        transportMode: 'container',
        currency: request?.currency ?? 'USD',
        shipmentDate: request?.availabilityDeadline ?? null,
        paymentTerms: 'Transferencia: 30 % anticipo, saldo contra copia de B/L',
        validityDays: 15,
        commissionNote: null,
      },
      lines: catalog.map((item) => lineFromCatalog(item, ctx.newId())),
      pricing: { mode: 'margin_on_sale', marginPct: '10' },
      rounding: structuredClone(draft.settings.rounding),
      financing: { enabled: false, principalBase: 'sale_value', principalPct: '70', annualRatePct: '9', days: 60, dayCountBase: 360 },
      customs: {
        ncm: product?.ncm ?? '',
        ncmDescription: product?.ncmDescription ?? '',
        exportDutyStatus: 'pending',
        exportDutyNote: 'Sin alícuota verificada para la posición exacta: no se aplica derecho de exportación en el cálculo.',
        refundStatus: 'pending',
        refundNote: 'Reintegro potencial no aplicado: requiere posición arancelaria y norma vigente verificadas.',
        normativeSource: 'ARCA — Arancel Integrado (consultar la posición vigente)',
        verifiedAt: null,
      },
      finance: {
        bank: '',
        paymentMethod: 'advance_transfer',
        expectedCollectionDate: null,
        advancePct: '30',
        fxRateId: latestFx.get('USD/ARS') ?? null,
        notes: null,
      },
      fxRateIds: [...latestFx.values()],
      quotationId: null,
      notes: null,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.scenarios.push(scenario);
    return scenario;
  });
}

export function updateScenario(db: Database, ctx: ServiceContext, scenarioId: string, patch: Partial<CostScenario>) {
  const current = find(db.scenarios, scenarioId, 'Escenario');
  assertCan(ctx.user, 'scenario.manage', current.organizationId);
  if (patch.lots) {
    for (const part of patch.lots) {
      const lot = find(db.lots, part.lotId, 'Lote');
      if (lot.organizationId !== ctx.user.organizationId) throw new ValidationError('Solo se pueden asignar lotes propios.');
    }
  }
  return mutate(db, (draft) => {
    const scenario = find(draft.scenarios, scenarioId, 'Escenario');
    const { id: _id, organizationId: _org, createdAt: _c, createdBy: _b, ...allowed } = patch;
    void _id;
    void _org;
    void _c;
    void _b;
    Object.assign(scenario, structuredClone(allowed), { updatedAt: ctx.now() });
    return scenario;
  });
}

export function duplicateScenario(db: Database, ctx: ServiceContext, scenarioId: string, name?: string) {
  const source = find(db.scenarios, scenarioId, 'Escenario');
  assertCan(ctx.user, 'scenario.manage', source.organizationId);
  return mutate(db, (draft) => {
    const copy: CostScenario = {
      ...structuredClone(source),
      id: ctx.newId(),
      name: name ?? `${source.name} (alternativa)`,
      status: 'draft',
      quotationId: null,
      lines: source.lines.map((l) => ({ ...l, id: ctx.newId(), includedInLineId: null })),
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    // Recalcular referencias "incluido en" con los nuevos ids.
    const idMap = new Map(source.lines.map((l, i) => [l.id, copy.lines[i].id]));
    copy.lines.forEach((l, i) => {
      const original = source.lines[i].includedInLineId;
      l.includedInLineId = original ? (idMap.get(original) ?? null) : null;
    });
    draft.scenarios.push(copy);
    return copy;
  });
}

export function archiveScenario(db: Database, ctx: ServiceContext, scenarioId: string) {
  const current = find(db.scenarios, scenarioId, 'Escenario');
  assertCan(ctx.user, 'scenario.manage', current.organizationId);
  return mutate(db, (draft) => {
    const scenario = find(draft.scenarios, scenarioId, 'Escenario');
    scenario.status = 'archived';
    scenario.updatedAt = ctx.now();
    return scenario;
  });
}
