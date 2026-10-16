import { describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@/data/access';
import { stockOf } from '@/data/derive';
import { UUID_PATTERN } from '@/data/ids';
import type { Database } from '@/data/model';
import { IDS, buildSeed } from '@/data/seed';
import { visibleLots } from '@/data/selectors';
import { createLot, createProduct, releaseReservation, reserveStock } from '@/data/services/catalog';
import { ValidationError } from '@/data/services/context';
import type { LotInput, ProductInput } from '@/data/schemas';
import { ctxFor } from '../helpers';

const product: ProductInput = {
  name: 'Arroz largo fino 00000 — envase 10 kg',
  category: 'rice',
  commercialType: 'long_fine',
  variety: 'Gurí INTA CL',
  processing: 'white',
  ncm: '1006.30',
  ncmStatus: 'pending',
  ncmSource: 'Familia 1006 — subposición a confirmar con el despachante',
  presentations: [{ label: 'Bolsa 10 kg', packaging: 'bag', netWeightKg: '10', tareWeightKg: '0.08', unitsPerPallet: 100, palletTareKg: '20' }],
  convertibleTo: [],
};

function lotFor(productId: string, presentationId: string, overrides: Partial<LotInput> = {}): LotInput {
  return {
    productId,
    facilityId: IDS.facMercedes,
    presentationId,
    physicalStockT: '30',
    availableFrom: '2026-10-20',
    quality: { brokenPct: '4', moisturePct: '13.4', impuritiesPct: '', other: [], analysisDate: '2026-10-10', analyst: 'Laboratorio Demo', documentRef: 'Informe LAB-DEMO-1010', verificationStatus: 'verified', validUntil: '2027-02-28' },
    certifications: [],
    published: true,
    ...overrides,
  };
}

describe('productos y lotes', () => {
  const base = buildSeed();
  const producer = (db: Database) => ctxFor(db, IDS.userLucia);

  it('crea y consulta un producto con su presentación', () => {
    const { db, value } = createProduct(base, producer(base), product);
    expect(value.id).toMatch(UUID_PATTERN);
    expect(value.organizationId).toBe(IDS.orgLitoral);
    expect(value.code).toMatch(/^PRD-2026-/);
    const stored = db.products.find((p) => p.id === value.id)!;
    expect(stored).toMatchObject({ name: product.name, commercialType: 'long_fine', processing: 'white', ncmStatus: 'pending' });
    expect(stored.presentations).toEqual([
      expect.objectContaining({ label: 'Bolsa 10 kg', packaging: 'bag', netWeightKg: '10', unitsPerPallet: 100 }),
    ]);
    expect(db.auditLog.at(-1)?.summary).toMatch(/creado/);
  });

  it('valida el producto: nombre, presentación con peso y formato NCM', () => {
    expect(() => createProduct(base, producer(base), { ...product, name: 'A' })).toThrow(ValidationError);
    expect(() => createProduct(base, producer(base), { ...product, presentations: [] })).toThrow(/al menos una presentación/);
    expect(() => createProduct(base, producer(base), { ...product, presentations: [{ label: 'Bolsa', packaging: 'bag', netWeightKg: '' }] })).toThrow(/peso neto/);
    expect(() => createProduct(base, producer(base), { ...product, ncm: '10063' })).toThrow(/NCM/);
  });

  it('un comprador no puede crear productos', () => {
    expect(() => createProduct(base, ctxFor(base, IDS.userDiego), product)).toThrow(AccessDeniedError);
  });

  it('registra un lote con cantidad, calidad respaldada y trazabilidad; el stock disponible se calcula', () => {
    const p = createProduct(base, producer(base), product);
    const productId = p.value.id;
    const presentationId = p.value.presentations[0].id;
    const { db, value: lot } = createLot(p.db, producer(p.db), lotFor(productId, presentationId));
    expect(lot.code).toMatch(/^LOT-2026-/);
    expect(lot.physicalStockT).toBe('30');
    expect(stockOf(db, lot.id).available.toString()).toBe('30');
    const events = db.traceEvents.filter((e) => e.lotIds?.includes(lot.id)).map((e) => e.type);
    expect(events).toEqual(['lot_created', 'quality_recorded', 'offer_published']);
    // Publicado: lo ve otra empresa; con stock, calidad y disponibilidad.
    expect(visibleLots(db, db.users.find((u) => u.id === IDS.userDiego)!).some((l) => l.id === lot.id)).toBe(true);

    const reserved = reserveStock(db, ctxFor(db, IDS.userMartin), lot.id, '12.5', { kind: 'manual', id: null });
    expect(stockOf(reserved.db, lot.id).available.toString()).toBe('17.5');
    expect(() => reserveStock(reserved.db, ctxFor(reserved.db, IDS.userMartin), lot.id, '17.6', { kind: 'manual', id: null })).toThrow(/Stock insuficiente/);
    const released = releaseReservation(reserved.db, ctxFor(reserved.db, IDS.userMartin), lot.id, { kind: 'manual', id: null });
    expect(stockOf(released.db, lot.id).available.toString()).toBe('30');
  });

  it('rechaza lotes inconsistentes: stock no positivo, planta ajena y calidad verificada sin respaldo', () => {
    const p = createProduct(base, producer(base), product);
    const productId = p.value.id;
    const presentationId = p.value.presentations[0].id;
    expect(() => createLot(p.db, producer(p.db), lotFor(productId, presentationId, { physicalStockT: '0' }))).toThrow(/mayor a cero/);
    expect(() => createLot(p.db, producer(p.db), lotFor(productId, presentationId, { facilityId: IDS.facLeonesa }))).toThrow(/otra organización/);
    expect(() =>
      createLot(p.db, producer(p.db), lotFor(productId, presentationId, { quality: { ...lotFor(productId, presentationId).quality, documentRef: '' } })),
    ).toThrow(/informe o documento de respaldo/);
    expect(() => createLot(p.db, ctxFor(p.db, IDS.userRocio), lotFor(productId, presentationId))).toThrow(/otra organización/);
  });
});
