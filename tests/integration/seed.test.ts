import { describe, expect, it } from 'vitest';
import { stockOf } from '@/data/derive';
import { IDS, buildSeed } from '@/data/seed';
import { demoAgreement } from '@/data/demoAgreement';
import { UUID_PATTERN } from '@/data/ids';

describe('datos demo', () => {
  const db = buildSeed();

  it('se generan de forma determinística (mismos IDs y hash en cada carga)', () => {
    const again = buildSeed();
    expect(again.operations[0].id).toBe(db.operations[0].id);
    expect(again.quotationVersions.map((v) => v.termsHash)).toEqual(db.quotationVersions.map((v) => v.termsHash));
    expect(demoAgreement().operationCode).toBe('OP-2026-0001');
  });

  it('usan identificadores UUID', () => {
    for (const collection of [db.organizations, db.lots, db.products, db.operations, db.quotations, db.documents]) {
      for (const item of collection) expect(item.id).toMatch(UUID_PATTERN);
    }
  });

  it('OP-2026-0001 conserva producto, lote, precio, cantidad y documentos', () => {
    const op = db.operations.find((o) => o.code === 'OP-2026-0001')!;
    expect(op.quantityT).toBe('40');
    expect(op.pricePerT).toBe('750');
    expect(op.totalAmount).toBe('30000');
    expect(op.incoterm).toBe('FOB');
    expect(op.lots).toEqual([{ lotId: IDS.lot009, quantityT: '40' }]);
    expect(op.status).toBe('collected');
    const docs = db.documents.filter((d) => d.operationId === op.id);
    expect(docs.length).toBeGreaterThanOrEqual(8);
    expect(docs.some((d) => d.documentType === 'contract' && d.status === 'verified')).toBe(true);
  });

  it('Escenario F: la conciliación detecta la comisión del exterior y pide respaldo', () => {
    const op = db.operations.find((o) => o.code === 'OP-2026-0001')!;
    const rec = db.reconciliations.find((r) => r.operationId === op.id)!;
    expect(rec.status).toBe('difference_to_review');
    expect(rec.lastResult?.differences.map((d) => [d.kind, d.amount, d.status])).toEqual([['foreign_bank_fee', '150', 'needs_evidence']]);
    expect(rec.lastResult?.netCollected).toBe('29850');
  });

  it('el lote vendido quedó embarcado y sin stock libre; el lote del escenario B mantiene 60 t', () => {
    expect(stockOf(db, IDS.lot009).available.toString()).toBe('0');
    expect(stockOf(db, IDS.lot009).physical.toString()).toBe('0');
    expect(stockOf(db, IDS.lot014).available.toString()).toBe('60');
  });

  it('la versión aceptada es la v2 con precio negociado y la v1 quedó reemplazada', () => {
    const op = db.operations.find((o) => o.code === 'OP-2026-0001')!;
    const versions = db.quotationVersions.filter((v) => v.quotationId === op.quotationId).sort((a, b) => a.version - b.version);
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [1, 'superseded'],
      [2, 'accepted'],
    ]);
    expect(op.termsHash).toBe(versions[1].termsHash);
  });

  it('la línea de tiempo de la operación cubre los hitos desde el lote hasta la revisión de cobro', () => {
    const op = db.operations.find((o) => o.code === 'OP-2026-0001')!;
    const types = new Set(
      db.traceEvents.filter((e) => e.operationId === op.id || e.lotIds?.includes(IDS.lot009)).map((e) => e.type),
    );
    for (const t of ['lot_created', 'quality_recorded', 'offer_published', 'request_accepted', 'quotation_confirmed', 'documents_prepared', 'dispatched', 'shipped', 'payment_received', 'reconciliation_review']) {
      expect(types.has(t as never), t).toBe(true);
    }
  });
});
