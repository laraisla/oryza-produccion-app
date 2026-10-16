import { describe, expect, it } from 'vitest';
import { canViewDocument, canViewFinance, canViewLot, canViewQuotationCosts, canViewTraceEvent, redactVersion } from '@/data/access';
import { buildSeed, IDS } from '@/data/seed';
import { updateLot } from '@/data/services/catalog';
import { registerPayment } from '@/data/services/operations';
import { acceptQuotationVersion } from '@/data/services/quotations';
import { createRequest } from '@/data/services/requests';
import { ctxFor } from '../helpers';

describe('control de acceso por organización y rol', () => {
  const db = buildSeed();
  const user = (id: string) => db.users.find((u) => u.id === id)!;
  const op = db.operations[0];
  const quotation = db.quotations.find((q) => q.id === op.quotationId)!;

  it('el comprador ve la cotización pero no los costos ni márgenes del vendedor', () => {
    expect(canViewQuotationCosts(user(IDS.userDiego), quotation)).toBe(false);
    expect(canViewQuotationCosts(user(IDS.userMartin), quotation)).toBe(true);
    const redacted = redactVersion(db.quotationVersions.find((v) => v.id === op.acceptedVersionId)!);
    expect(redacted.result).toBeNull();
    expect(redacted.costingInput).toBeNull();
    expect(redacted.scenario).toBeNull();
    expect(redacted.pricePerT).toBe('750');
  });

  it('otra empresa no accede a finanzas ni documentos financieros', () => {
    expect(canViewFinance(user(IDS.userDiego), op)).toBe(false);
    expect(canViewFinance(user(IDS.userRocio), op)).toBe(false);
    expect(canViewFinance(user(IDS.userLucia), op)).toBe(false); // productor del vendedor: sin rol financiero
    expect(canViewFinance(user(IDS.userMartin), op)).toBe(true);
    const bankDoc = db.documents.find((d) => d.operationId === op.id && d.isFinancial)!;
    expect(canViewDocument(user(IDS.userDiego), bankDoc, op)).toBe(false);
    expect(canViewDocument(user(IDS.userMartin), bankDoc, op)).toBe(true);
    const invoice = db.documents.find((d) => d.operationId === op.id && d.documentType === 'commercial_invoice')!;
    expect(canViewDocument(user(IDS.userDiego), invoice, op)).toBe(true);
    expect(canViewDocument(user(IDS.userNoa), invoice, op)).toBe(false);
  });

  it('eventos privados de cobro no son visibles para el comprador', () => {
    const paymentEvent = db.traceEvents.find((e) => e.type === 'payment_received')!;
    expect(canViewTraceEvent(user(IDS.userDiego), paymentEvent, db)).toBe(false);
    expect(canViewTraceEvent(user(IDS.userMartin), paymentEvent, db)).toBe(true);
    const shipped = db.traceEvents.find((e) => e.type === 'shipped')!;
    expect(canViewTraceEvent(user(IDS.userDiego), shipped, db)).toBe(true);
    expect(canViewTraceEvent(user(IDS.userNoa), shipped, db)).toBe(false);
  });

  it('lotes no publicados solo los ve su organización', () => {
    const sold = db.lots.find((l) => l.id === IDS.lot009)!;
    expect(canViewLot(user(IDS.userRocio), sold)).toBe(false);
    expect(canViewLot(user(IDS.userLucia), sold)).toBe(true);
  });

  it('no se puede modificar el lote de otra empresa', () => {
    const lot = db.lots.find((l) => l.id === IDS.lot021)!;
    expect(() =>
      updateLot(db, ctxFor(db, IDS.userLucia), lot.id, {
        productId: lot.productId,
        facilityId: lot.facilityId,
        presentationId: lot.presentationId,
        physicalStockT: '999',
        availableFrom: lot.availableFrom,
        quality: lot.quality,
        certifications: [],
        published: true,
      }),
    ).toThrow(/otra organización/);
  });

  it('solo la empresa compradora puede aceptar; un comprador no registra cobros del vendedor', () => {
    const versionId = op.acceptedVersionId!;
    expect(() => acceptQuotationVersion(db, ctxFor(db, IDS.userNoa), versionId)).toThrow(/compradora/);
    expect(() =>
      registerPayment(db, ctxFor(db, IDS.userDiego), op.id, {
        reference: 'X', receivedDate: '2026-10-16', currency: 'USD', grossAmount: '1', foreignBankFees: '0', localBankFees: '0', otherDeductions: '0', netAmount: '1', isAdvance: false, bankReportStatus: 'informed_by_user',
      }),
    ).toThrow();
  });

  it('un productor no puede crear solicitudes de compra', () => {
    expect(() =>
      createRequest(db, ctxFor(db, IDS.userLucia), {} as never),
    ).toThrow(/permisos/);
  });
});
