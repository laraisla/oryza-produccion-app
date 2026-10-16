import { describe, expect, it } from 'vitest';
import { evaluateRequest, suggestConsolidation } from '@/domain/matching';
import { dec } from '@/domain/decimal';
import { evaluateScenario, lotOffer, requestCriteria, stockOf } from '@/data/derive';
import type { Database } from '@/data/model';
import { buildSeed, IDS } from '@/data/seed';
import { changeDocumentStatus, markReconciled, registerInvoice, registerPayment, saveShipment, uploadDocumentVersion, attachPaymentEvidence } from '@/data/services/operations';
import { acceptQuotationVersion, addQuotationVersion, createQuotationFromScenario, sendQuotationVersion } from '@/data/services/quotations';
import { createScenario, updateScenario } from '@/data/services/scenarios';
import { termsHashForSync } from '@/integrations/stellar/terms';
import { ctxFor } from '../helpers';

const seller = (db: Database) => ctxFor(db, IDS.userMartin);
const buyer = (db: Database) => ctxFor(db, IDS.userDiego);

function offers(db: Database) {
  return db.lots.map((l) => lotOffer(db, l, '2026-10-16')).filter((o) => o !== null);
}

describe('flujo integrado Solicitud → Matching → Cotización → Operación → Documentación → Conciliación', () => {
  it('Escenario A: el pedido de jazmín no encuentra lotes compatibles y se explica por qué', () => {
    const db = buildSeed();
    const request = db.requests.find((r) => r.id === IDS.req002)!;
    const results = evaluateRequest(requestCriteria(request), offers(db));
    expect(results.every((r) => r.status === 'incompatible')).toBe(true);
    const lf = results.find((r) => r.lotId === IDS.lot014)!;
    expect(lf.failures[0]).toMatch(/Se solicita Jazmín \(aromático\) y el lote es Largo fino/);
  });

  it('recorre el flujo completo y protege la versión aceptada', () => {
    let db = buildSeed();
    const request = db.requests.find((r) => r.id === IDS.req003)!;

    // Escenario B: matching.
    const results = evaluateRequest(requestCriteria(request), offers(db));
    const best = results[0];
    expect(best.lotId).toBe(IDS.lot014);
    expect(best.status).toBe('compatible');
    expect(results.find((r) => r.lotId === IDS.lot015)?.status).toBe('incompatible');
    expect(results.find((r) => r.lotId === IDS.lot021)?.checks.find((c) => c.criterion === 'volume')?.status).toBe('fail');
    expect(results.find((r) => r.lotId === IDS.lot022)?.status).toBe('conditional');

    // Escenario C: cotización a partir del lote compatible.
    const scenario = createScenario(db, seller(db), { requestId: request.id, lotId: IDS.lot014 });
    db = scenario.db;
    const s = scenario.value;
    expect(s.quantityT).toBe('40');
    expect(s.destinationCountry).toBe('PE');
    expect(s.commercial.incoterm).toBe('CFR');
    db = updateScenario(db, seller(db), s.id, { commercial: { ...s.commercial, shipmentDate: '2026-11-15' } }).db;
    const evalCfr = evaluateScenario(db, db.scenarios.find((x) => x.id === s.id)!, '2026-10-16');
    expect(evalCfr.logistics.packaging.packages).toBe(1600);
    expect(evalCfr.logistics.containers).toBe(2);
    expect(evalCfr.result.valid).toBe(true);
    expect(evalCfr.result.lines.find((l) => l.name.startsWith('Flete marítimo'))?.payer).toBe('seller');

    // Cambiar a FOB reasigna el flete sin borrarlo y baja el precio.
    const fobScenario = { ...db.scenarios.find((x) => x.id === s.id)!, commercial: { ...s.commercial, incoterm: 'FOB' as const, namedPlace: 'Puerto de Buenos Aires', namedPlaceKind: 'port_of_shipment' as const } };
    const evalFob = evaluateScenario(db, fobScenario, '2026-10-16');
    expect(evalFob.result.lines.find((l) => l.name.startsWith('Flete marítimo'))?.payer).toBe('buyer');
    expect(evalFob.result.lines.length).toBe(evalCfr.result.lines.length);
    expect(dec(evalFob.result.pricePerT!).lt(dec(evalCfr.result.pricePerT!))).toBe(true);

    const q = createQuotationFromScenario(db, seller(db), s.id);
    db = q.db;
    const v1 = q.value.version;
    expect(v1.termsHash).toBe(termsHashForSync(v1.terms));
    expect(db.requests.find((r) => r.id === request.id)?.status).toBe('negotiating');
    db = sendQuotationVersion(db, seller(db), v1.id).db;

    // Escenario D: el comprador acepta y se crea la operación.
    const accepted = acceptQuotationVersion(db, buyer(db), v1.id);
    db = accepted.db;
    const op = accepted.value.operation;
    expect(op.code).toBe('OP-2026-0002');
    expect(op.lots).toEqual([{ lotId: IDS.lot014, quantityT: '40' }]);
    expect(op.pricePerT).toBe(v1.pricePerT);
    expect(op.termsHash).toBe(v1.termsHash);
    expect(stockOf(db, IDS.lot014).available.toString()).toBe('20');
    expect(stockOf(db, IDS.lot014).committed.toString()).toBe('40');
    const docs = db.documents.filter((d) => d.operationId === op.id);
    expect(docs.map((d) => d.documentType)).toEqual(
      expect.arrayContaining(['commercial_invoice', 'packing_list', 'export_permit', 'bill_of_lading', 'phytosanitary_certificate', 'contract']),
    );
    expect(docs.find((d) => d.documentType === 'phytosanitary_certificate')?.requirementStatus).toBe('pending');

    // Modificar el escenario después de aceptar actualiza la calculadora pero no la versión aceptada.
    const acceptedBefore = structuredClone(db.quotationVersions.find((v) => v.id === v1.id)!);
    db = updateScenario(db, seller(db), s.id, { pricing: { mode: 'margin_on_sale', marginPct: '20' } }).db;
    const live = evaluateScenario(db, db.scenarios.find((x) => x.id === s.id)!, '2026-10-16');
    expect(live.result.pricePerT).not.toBe(acceptedBefore.pricePerT);
    expect(db.quotationVersions.find((v) => v.id === v1.id)).toEqual(acceptedBefore);
    expect(() => addQuotationVersion(db, seller(db), q.value.quotation.id)).toThrow(/inmutable/);

    // El stock comprometido no puede volver a asignarse.
    const second = createScenario(db, seller(db), { requestId: IDS.req004, lotId: IDS.lot014 });
    db = second.db;
    db = updateScenario(db, seller(db), second.value.id, { lots: [{ lotId: IDS.lot014, quantityT: '40' }], quantityT: '40' }).db;
    expect(() => createQuotationFromScenario(db, seller(db), second.value.id)).toThrow(/tiene 20 t libres/);

    // Documentación: no se presenta sin archivo; con archivo sí.
    const invoiceDoc = docs.find((d) => d.documentType === 'commercial_invoice')!;
    expect(() => changeDocumentStatus(db, seller(db), invoiceDoc.id, 'submitted')).toThrow(/Adjuntar/);
    db = uploadDocumentVersion(db, seller(db), invoiceDoc.id, {
      fileName: 'factura.pdf', mimeType: 'application/pdf', sizeBytes: 1200, sha256: 'a'.repeat(64), storageKey: 'k1',
    }).db;
    db = changeDocumentStatus(db, seller(db), invoiceDoc.id, 'submitted').db;
    expect(() => changeDocumentStatus(db, buyer(db), invoiceDoc.id, 'verified')).toThrow(/responsable COMEX/);
    db = changeDocumentStatus(db, seller(db), invoiceDoc.id, 'verified').db;

    // Escenario E: embarque.
    db = saveShipment(db, seller(db), op.id, { status: 'planned', containerTypeId: IDS.ct20, containers: [] }).db;
    const shipmentId = db.shipments.find((x) => x.operationId === op.id)!.id;
    expect(() => saveShipment(db, seller(db), op.id, { status: 'shipped', containers: [] }, shipmentId)).toThrow(/cantidad efectivamente embarcada/);
    db = saveShipment(db, seller(db), op.id, { status: 'shipped', shippedAt: '2026-11-15', shippedQuantityT: '40', containers: [{ number: 'AGMU2000011' }, { number: 'AGMU2000026' }] }, shipmentId).db;
    expect(db.operations.find((o) => o.id === op.id)?.status).toBe('shipped');
    expect(stockOf(db, IDS.lot014).physical.toString()).toBe('20');
    expect(stockOf(db, IDS.lot014).committed.toString()).toBe('0');

    // Escenario F: factura, cobro con comisión y conciliación.
    const total = db.operations.find((o) => o.id === op.id)!.totalAmount;
    db = registerInvoice(db, seller(db), op.id, { number: 'E-0001-00000099', issueDate: '2026-11-15', currency: 'USD', amount: total, quantityT: '40' }).db;
    const invoiceId = db.invoices.find((i) => i.operationId === op.id)!.id;
    const net = dec(total).minus(150).toString();
    db = registerPayment(db, seller(db), op.id, {
      reference: 'MT103-TEST', receivedDate: '2026-12-10', currency: 'USD', grossAmount: total, foreignBankFees: '150', localBankFees: '0', otherDeductions: '0', netAmount: net, isAdvance: false, bankReportStatus: 'informed_by_user', invoiceId,
    }).db;
    let rec = db.reconciliations.find((r) => r.operationId === op.id)!;
    expect(rec.status).toBe('difference_to_review');
    expect(rec.lastResult?.differences[0]).toMatchObject({ kind: 'foreign_bank_fee', amount: '150', status: 'needs_evidence' });
    expect(db.payments.find((p) => p.operationId === op.id)?.recordKind).toBe('informational');
    expect(() => markReconciled(db, seller(db), op.id, 'ok')).toThrow(/sin respaldo/);

    const bankDoc = db.documents.find((d) => d.operationId === op.id && d.documentType === 'bank_document')!;
    db = uploadDocumentVersion(db, seller(db), bankDoc.id, {
      fileName: 'aviso-credito.pdf', mimeType: 'application/pdf', sizeBytes: 900, sha256: 'b'.repeat(64), storageKey: 'k2',
    }).db;
    const paymentId = db.payments.find((p) => p.operationId === op.id)!.id;
    db = attachPaymentEvidence(db, seller(db), paymentId, bankDoc.id).db;
    rec = db.reconciliations.find((r) => r.operationId === op.id)!;
    expect(rec.lastResult?.readyToReconcile).toBe(true);
    db = markReconciled(db, seller(db), op.id, 'Comisión del exterior respaldada con aviso de crédito.').db;
    expect(db.reconciliations.find((r) => r.operationId === op.id)?.status).toBe('reconciled_by_operator');
    expect(db.operations.find((o) => o.id === op.id)?.status).toBe('closed');

    // La auditoría registró los cambios relevantes.
    expect(db.auditLog.some((a) => a.action === 'accept')).toBe(true);
    expect(db.auditLog.some((a) => a.action === 'reconcile')).toBe(true);
  });

  it('sugiere consolidar lotes para el programa de 80 t sin reservar stock', () => {
    const db = buildSeed();
    const request = db.requests.find((r) => r.id === IDS.req004)!;
    const lots = offers(db);
    const results = evaluateRequest(requestCriteria(request), lots);
    const suggestion = suggestConsolidation(requestCriteria(request), results, lots)!;
    expect(suggestion.sufficient).toBe(true);
    expect(suggestion.parts.map((p) => p.lotId)).toEqual([IDS.lot014, IDS.lot021]);
    expect(db.inventoryMovements.filter((m) => m.lotId === IDS.lot014)).toHaveLength(0);
  });
});
