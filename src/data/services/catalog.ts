import { dec, toPlain } from '@/domain/decimal';
import { assertAvailable } from '@/domain/quantity';
import { assertCan } from '../access';
import { stockOf } from '../derive';
import type { Database, Facility, Lot, Product } from '../model';
import { facilitySchema, lotSchema, parse, productSchema, type FacilityInput, type LotInput, type ProductInput } from '../schemas';
import { audit, diff, find, mutate, nextCode, trace, ValidationError, type ServiceContext } from './context';

function normalizeProduct(input: ReturnType<typeof productSchema.parse>, ctx: ServiceContext, previous?: Product) {
  return {
    ...input,
    variety: input.variety?.trim() || null,
    ncm: input.ncm?.trim() || null,
    presentations: input.presentations.map((p) => ({
      id: p.id ?? previous?.presentations.find((x) => x.label === p.label)?.id ?? ctx.newId(),
      label: p.label,
      packaging: p.packaging,
      netWeightKg: p.packaging === 'bulk' ? null : p.netWeightKg || null,
      tareWeightKg: p.tareWeightKg || null,
      unitsPerPallet: p.unitsPerPallet ?? null,
      palletTareKg: p.palletTareKg || null,
    })),
    convertibleTo: input.convertibleTo.map((c) => ({ type: c.type, netWeightKg: c.netWeightKg ?? null })),
  };
}

export function createProduct(db: Database, ctx: ServiceContext, raw: ProductInput) {
  assertCan(ctx.user, 'product.manage');
  const input = parse(productSchema, raw);
  return mutate(db, (draft) => {
    const product: Product = {
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      code: nextCode(draft.products, 'PRD', ctx.today().slice(0, 4), ctx.user.organizationId),
      ...normalizeProduct(input, ctx),
      status: 'active',
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.products.push(product);
    audit(draft, ctx, 'product', product.id, 'create', `Producto ${product.code} creado: ${product.name}`);
    return product;
  });
}

export function updateProduct(db: Database, ctx: ServiceContext, productId: string, raw: ProductInput) {
  const current = find(db.products, productId, 'Producto');
  assertCan(ctx.user, 'product.manage', current.organizationId);
  const input = parse(productSchema, raw);
  return mutate(db, (draft) => {
    const product = find(draft.products, productId, 'Producto');
    const before = { ...product };
    Object.assign(product, normalizeProduct(input, ctx, product), { updatedAt: ctx.now() });
    const removed = before.presentations.filter((p) => !product.presentations.some((n) => n.id === p.id));
    for (const p of removed) {
      if (draft.lots.some((l) => l.presentationId === p.id)) {
        throw new ValidationError(`La presentación "${p.label}" está asignada a lotes y no puede eliminarse.`);
      }
    }
    audit(
      draft,
      ctx,
      'product',
      product.id,
      'update',
      `Producto ${product.code} actualizado`,
      diff(before, product, ['name', 'commercialType', 'variety', 'processing', 'ncm', 'ncmStatus', 'presentations']),
    );
    return product;
  });
}

export function duplicateProduct(db: Database, ctx: ServiceContext, productId: string) {
  const source = find(db.products, productId, 'Producto');
  assertCan(ctx.user, 'product.manage', source.organizationId);
  return mutate(db, (draft) => {
    const copy: Product = {
      ...structuredClone(source),
      id: ctx.newId(),
      code: nextCode(draft.products, 'PRD', ctx.today().slice(0, 4), ctx.user.organizationId),
      name: `${source.name} (copia)`,
      presentations: source.presentations.map((p) => ({ ...p, id: ctx.newId() })),
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.products.push(copy);
    audit(draft, ctx, 'product', copy.id, 'duplicate', `Producto ${copy.code} duplicado desde ${source.code}`);
    return copy;
  });
}

export function setProductStatus(db: Database, ctx: ServiceContext, productId: string, status: Product['status']) {
  const current = find(db.products, productId, 'Producto');
  assertCan(ctx.user, 'product.manage', current.organizationId);
  return mutate(db, (draft) => {
    const product = find(draft.products, productId, 'Producto');
    product.status = status;
    product.updatedAt = ctx.now();
    audit(draft, ctx, 'product', product.id, 'status', `Producto ${product.code} marcado como ${status === 'active' ? 'disponible' : 'inactivo'}`);
    return product;
  });
}

function validateLotRefs(db: Database, ctx: ServiceContext, input: ReturnType<typeof lotSchema.parse>) {
  const product = find(db.products, input.productId, 'Producto');
  if (product.organizationId !== ctx.user.organizationId) throw new ValidationError('El producto pertenece a otra organización.');
  const facility = find(db.facilities, input.facilityId, 'Establecimiento');
  if (facility.organizationId !== ctx.user.organizationId) throw new ValidationError('La planta pertenece a otra organización.');
  if (!product.presentations.some((p) => p.id === input.presentationId)) {
    throw new ValidationError('La presentación no corresponde al producto.');
  }
  return product;
}

export function createLot(db: Database, ctx: ServiceContext, raw: LotInput) {
  assertCan(ctx.user, 'lot.manage');
  const input = parse(lotSchema, raw);
  const product = validateLotRefs(db, ctx, input);
  return mutate(db, (draft) => {
    const lot: Lot = {
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      code: nextCode(draft.lots, 'LOT', ctx.today().slice(0, 4), ctx.user.organizationId),
      productId: input.productId,
      facilityId: input.facilityId,
      presentationId: input.presentationId,
      physicalStockT: toPlain(dec(input.physicalStockT)),
      harvest: input.harvest ?? null,
      availableFrom: input.availableFrom,
      quality: { ...input.quality, other: input.quality.other ?? [] },
      certifications: input.certifications.map((c) => ({ ...c, documentRef: c.documentRef ?? null })),
      published: input.published,
      status: 'active',
      notes: input.notes ?? null,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.lots.push(lot);
    audit(draft, ctx, 'lot', lot.id, 'create', `Lote ${lot.code} creado (${lot.physicalStockT} t de ${product.name})`);
    trace(draft, ctx, {
      type: 'lot_created',
      title: `Lote ${lot.code} creado`,
      detail: `${lot.physicalStockT} t de ${product.name}`,
      lotIds: [lot.id],
      entity: { kind: 'lot', id: lot.id },
      shared: true,
    });
    if (lot.quality.brokenPct || lot.quality.moisturePct) {
      trace(draft, ctx, {
        type: 'quality_recorded',
        title: `Calidad registrada para ${lot.code}`,
        detail: `Quebrado ${lot.quality.brokenPct ?? '—'} %, humedad ${lot.quality.moisturePct ?? '—'} % (${lot.quality.verificationStatus})`,
        lotIds: [lot.id],
        entity: { kind: 'lot', id: lot.id },
        shared: true,
      });
    }
    if (lot.published) {
      trace(draft, ctx, {
        type: 'offer_published',
        title: `Oferta publicada: ${lot.code}`,
        lotIds: [lot.id],
        entity: { kind: 'lot', id: lot.id },
        shared: true,
      });
    }
    return lot;
  });
}

export function updateLot(db: Database, ctx: ServiceContext, lotId: string, raw: LotInput) {
  const current = find(db.lots, lotId, 'Lote');
  assertCan(ctx.user, 'lot.manage', current.organizationId);
  const input = parse(lotSchema, raw);
  validateLotRefs(db, ctx, input);
  return mutate(db, (draft) => {
    const lot = find(draft.lots, lotId, 'Lote');
    const before = structuredClone(lot);
    const committed = stockOf(db, lotId);
    const newPhysical = dec(input.physicalStockT);
    const used = committed.reserved.plus(committed.committed);
    const physicalNow = committed.physical;
    // El stock físico solo se corrige con un ajuste registrado, para no perder trazabilidad.
    if (!newPhysical.eq(dec(before.physicalStockT))) {
      const delta = newPhysical.minus(dec(before.physicalStockT));
      if (physicalNow.plus(delta).lt(used)) {
        throw new ValidationError('El nuevo stock físico queda por debajo de lo reservado o comprometido.');
      }
      draft.inventoryMovements.push({
        id: ctx.newId(),
        organizationId: lot.organizationId,
        lotId,
        type: 'adjustment',
        quantityT: toPlain(delta),
        reference: { kind: 'manual', id: null },
        note: 'Ajuste por edición del lote',
        createdAt: ctx.now(),
        createdBy: ctx.user.id,
      });
    }
    Object.assign(lot, {
      productId: input.productId,
      facilityId: input.facilityId,
      presentationId: input.presentationId,
      harvest: input.harvest ?? null,
      availableFrom: input.availableFrom,
      quality: { ...input.quality, other: input.quality.other ?? [] },
      certifications: input.certifications.map((c) => ({ ...c, documentRef: c.documentRef ?? null })),
      published: input.published,
      notes: input.notes ?? null,
      updatedAt: ctx.now(),
    });
    audit(
      draft,
      ctx,
      'lot',
      lot.id,
      'update',
      `Lote ${lot.code} actualizado`,
      diff(before, lot, ['availableFrom', 'quality', 'certifications', 'published', 'presentationId']),
    );
    if (JSON.stringify(before.quality) !== JSON.stringify(lot.quality)) {
      trace(draft, ctx, {
        type: 'quality_recorded',
        title: `Calidad actualizada para ${lot.code}`,
        detail: `Quebrado ${lot.quality.brokenPct ?? '—'} %, humedad ${lot.quality.moisturePct ?? '—'} % (${lot.quality.verificationStatus})`,
        lotIds: [lot.id],
        entity: { kind: 'lot', id: lot.id },
        shared: true,
      });
    }
    if (!before.published && lot.published) {
      trace(draft, ctx, {
        type: 'offer_published',
        title: `Oferta publicada: ${lot.code}`,
        lotIds: [lot.id],
        entity: { kind: 'lot', id: lot.id },
        shared: true,
      });
    }
    return lot;
  });
}

export function setLotStatus(db: Database, ctx: ServiceContext, lotId: string, status: Lot['status']) {
  const current = find(db.lots, lotId, 'Lote');
  assertCan(ctx.user, 'lot.manage', current.organizationId);
  return mutate(db, (draft) => {
    const lot = find(draft.lots, lotId, 'Lote');
    lot.status = status;
    if (status === 'inactive') lot.published = false;
    lot.updatedAt = ctx.now();
    audit(draft, ctx, 'lot', lot.id, 'status', `Lote ${lot.code} ${status === 'active' ? 'reactivado' : 'inactivado'}`);
    return lot;
  });
}

export function reserveStock(
  db: Database,
  ctx: ServiceContext,
  lotId: string,
  quantityT: string,
  reference: { kind: 'quotation' | 'manual'; id: string | null },
  note?: string,
) {
  const lot = find(db.lots, lotId, 'Lote');
  assertCan(ctx.user, 'quotation.manage', lot.organizationId);
  assertAvailable(stockOf(db, lotId), quantityT);
  return mutate(db, (draft) => {
    const movement = {
      id: ctx.newId(),
      organizationId: lot.organizationId,
      lotId,
      type: 'reservation' as const,
      quantityT: toPlain(dec(quantityT)),
      reference,
      note: note ?? null,
      createdAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.inventoryMovements.push(movement);
    audit(draft, ctx, 'lot', lotId, 'reserve', `Reserva de ${movement.quantityT} t en ${lot.code}`);
    return movement;
  });
}

export function releaseReservation(db: Database, ctx: ServiceContext, lotId: string, reference: { kind: 'quotation' | 'manual'; id: string | null }) {
  const lot = find(db.lots, lotId, 'Lote');
  assertCan(ctx.user, 'quotation.manage', lot.organizationId);
  return mutate(db, (draft) => releaseReservationDraft(draft, ctx, lotId, reference));
}

/** Libera lo reservado para una referencia (p. ej., una cotización rechazada). */
export function releaseReservationDraft(
  draft: Database,
  ctx: ServiceContext,
  lotId: string,
  reference: { kind: string; id: string | null },
): string {
  const movements = draft.inventoryMovements.filter(
    (m) => m.lotId === lotId && m.reference.kind === reference.kind && m.reference.id === reference.id,
  );
  const reserved = movements.reduce((acc, m) => {
    if (m.type === 'reservation') return acc.plus(dec(m.quantityT));
    if (m.type === 'release' || (m.type === 'commitment' && m.convertsReservation)) return acc.minus(dec(m.quantityT));
    return acc;
  }, dec(0));
  if (reserved.gt(0)) {
    draft.inventoryMovements.push({
      id: ctx.newId(),
      organizationId: movements[0].organizationId,
      lotId,
      type: 'release',
      quantityT: toPlain(reserved),
      reference: { kind: reference.kind as 'quotation', id: reference.id },
      note: 'Liberación de reserva',
      createdAt: ctx.now(),
      createdBy: ctx.user.id,
    });
  }
  return toPlain(reserved);
}

export function createFacility(db: Database, ctx: ServiceContext, raw: FacilityInput) {
  assertCan(ctx.user, 'facility.manage');
  const input = parse(facilitySchema, raw);
  return mutate(db, (draft) => {
    const facility: Facility = {
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      ...input,
      exitPortId: input.exitPortId ?? null,
      distanceToPortKm: input.distanceToPortKm || null,
      distanceSource: input.distanceToPortKm ? (input.distanceSource ?? 'manual') : null,
      loadingConditions: input.loadingConditions ?? null,
      logisticsNotes: input.logisticsNotes ?? null,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    };
    draft.facilities.push(facility);
    audit(draft, ctx, 'facility', facility.id, 'create', `Establecimiento ${facility.name} registrado`);
    return facility;
  });
}

export function updateFacility(db: Database, ctx: ServiceContext, facilityId: string, raw: FacilityInput) {
  const current = find(db.facilities, facilityId, 'Establecimiento');
  assertCan(ctx.user, 'facility.manage', current.organizationId);
  const input = parse(facilitySchema, raw);
  return mutate(db, (draft) => {
    const facility = find(draft.facilities, facilityId, 'Establecimiento');
    const before = { ...facility };
    Object.assign(facility, input, {
      exitPortId: input.exitPortId ?? null,
      distanceToPortKm: input.distanceToPortKm || null,
      distanceSource: input.distanceToPortKm ? (input.distanceSource ?? 'manual') : null,
      updatedAt: ctx.now(),
    });
    audit(draft, ctx, 'facility', facility.id, 'update', `Establecimiento ${facility.name} actualizado`, diff(before, facility, ['address', 'exitPortId', 'distanceToPortKm']));
    return facility;
  });
}
