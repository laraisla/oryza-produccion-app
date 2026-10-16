import { DOCUMENT_STATUS, type DocumentStatus, type DocumentType } from '@/domain/catalogs';
import { dec, toPlain } from '@/domain/decimal';
import { validateDocumentTransition } from '@/domain/documents';
import { reconcile } from '@/domain/reconciliation';
import { AccessDeniedError, assertCan, can, isParticipant } from '../access';
import type {
  BlockchainRecord,
  Database,
  OperationDocument,
  Payment,
  ResponsibleParty,
  Shipment,
  TradeOperation,
} from '../model';
import { invoiceSchema, parse, paymentSchema, shipmentSchema, type InvoiceInput, type PaymentInput, type ShipmentInput } from '../schemas';
import { audit, find, mutate, trace, ValidationError, type ServiceContext } from './context';
import { committedForOperation } from './quotations';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
  'text/plain',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
];

function sellerOperation(db: Database, ctx: ServiceContext, operationId: string, action: 'operation.manage' | 'finance.manage') {
  const op = find(db.operations, operationId, 'Operación');
  assertCan(ctx.user, action, op.sellerOrganizationId);
  return op;
}

function lockedForChanges(op: TradeOperation) {
  if (op.status === 'cancelled' || op.status === 'closed') {
    throw new ValidationError(`La operación ${op.code} está ${op.status === 'closed' ? 'cerrada' : 'cancelada'}.`);
  }
}

export function saveShipment(db: Database, ctx: ServiceContext, operationId: string, raw: ShipmentInput, shipmentId?: string) {
  const op = sellerOperation(db, ctx, operationId, 'operation.manage');
  lockedForChanges(op);
  if (op.status === 'negotiation') throw new ValidationError('La operación aún no fue confirmada por el comprador.');
  const input = parse(shipmentSchema, raw);
  const previous = shipmentId ? find(db.shipments, shipmentId, 'Embarque') : undefined;
  if (input.status === 'shipped' || input.status === 'received') {
    if (!input.shippedQuantityT) throw new ValidationError('Indicar la cantidad efectivamente embarcada.');
    if (!input.shippedAt) throw new ValidationError('Indicar la fecha de embarque.');
  }
  if (input.status === 'dispatched' && !input.dispatchedAt) throw new ValidationError('Indicar la fecha de despacho.');
  const alreadyShipped = previous?.status === 'shipped' || previous?.status === 'received';
  if (alreadyShipped && previous?.shippedQuantityT !== (input.shippedQuantityT || null)) {
    throw new ValidationError('La cantidad embarcada ya generó movimientos de stock: registrar un ajuste en lugar de editarla.');
  }
  if (!alreadyShipped && (input.status === 'shipped' || input.status === 'received')) {
    const committed = op.lots.reduce((acc, l) => acc.plus(committedForOperation(db, op.id, l.lotId)), dec(0));
    if (dec(input.shippedQuantityT!).gt(committed)) {
      throw new ValidationError(`Se embarcan ${input.shippedQuantityT} t pero la operación tiene ${toPlain(committed)} t comprometidas.`);
    }
  }

  return mutate(db, (draft) => {
    const operation = find(draft.operations, operationId, 'Operación');
    const data = {
      ...input,
      containerTypeId: input.containerTypeId ?? null,
      containers: input.containers.map((c) => ({ number: c.number, seal: c.seal ?? null, grossKg: c.grossKg ?? null, vgmKg: c.vgmKg ?? null })),
      shippedQuantityT: input.shippedQuantityT ? toPlain(dec(input.shippedQuantityT)) : null,
      grossWeightKg: input.grossWeightKg || null,
      packages: input.packages ?? null,
      updatedAt: ctx.now(),
    };
    let shipment: Shipment;
    if (previous) {
      shipment = find(draft.shipments, previous.id, 'Embarque');
      Object.assign(shipment, data);
    } else {
      shipment = {
        id: ctx.newId(),
        operationId,
        organizationId: operation.sellerOrganizationId,
        createdAt: ctx.now(),
        ...data,
      } as Shipment;
      draft.shipments.push(shipment);
    }
    const lotIds = operation.lots.map((l) => l.lotId);
    const statusChanged = previous?.status !== shipment.status;
    if (statusChanged && shipment.status === 'dispatched') {
      if (operation.status === 'confirmed') operation.status = 'in_preparation';
      trace(draft, ctx, {
        type: 'dispatched',
        title: `Mercadería despachada desde planta (${operation.code})`,
        detail: shipment.dispatchedAt ? `Fecha ${shipment.dispatchedAt}` : null,
        operationId,
        lotIds,
        entity: { kind: 'shipment', id: shipment.id },
        shared: true,
      });
    }
    if (!alreadyShipped && (shipment.status === 'shipped' || shipment.status === 'received')) {
      let remaining = dec(shipment.shippedQuantityT!);
      for (const part of operation.lots) {
        if (remaining.lte(0)) break;
        const available = committedForOperation(draft, operation.id, part.lotId);
        const take = available.lt(remaining) ? available : remaining;
        if (take.lte(0)) continue;
        draft.inventoryMovements.push({
          id: ctx.newId(),
          organizationId: operation.sellerOrganizationId,
          lotId: part.lotId,
          type: 'shipment',
          quantityT: toPlain(take),
          reference: { kind: 'operation', id: operation.id },
          note: `Embarque ${shipment.blNumber ?? shipment.id}`,
          createdAt: ctx.now(),
          createdBy: ctx.user.id,
        });
        remaining = remaining.minus(take);
      }
      operation.status = 'shipped';
      trace(draft, ctx, {
        type: 'shipped',
        title: `Embarque registrado (${operation.code})`,
        detail: `${shipment.shippedQuantityT} t · ${shipment.containers.length} contenedor(es)${shipment.vessel ? ` · ${shipment.vessel}` : ''}${shipment.blNumber ? ` · B/L ${shipment.blNumber}` : ''}`,
        operationId,
        lotIds,
        entity: { kind: 'shipment', id: shipment.id },
        shared: true,
      });
    }
    if (statusChanged && shipment.status === 'received') {
      trace(draft, ctx, {
        type: 'received',
        title: `Mercadería recibida en destino (${operation.code})`,
        operationId,
        lotIds,
        entity: { kind: 'shipment', id: shipment.id },
        shared: true,
      });
    }
    operation.updatedAt = ctx.now();
    audit(draft, ctx, 'shipment', shipment.id, previous ? 'update' : 'create', `Embarque de ${operation.code}: ${shipment.status}`);
    runReconciliationDraft(draft, ctx, operationId);
    return shipment;
  });
}

export function addDocument(
  db: Database,
  ctx: ServiceContext,
  operationId: string,
  input: {
    documentType: DocumentType;
    name: string;
    responsibleParty: ResponsibleParty;
    dueDate?: string | null;
    issuer?: string | null;
    notes?: string | null;
    sharedWithCounterparty: boolean;
    isFinancial: boolean;
  },
) {
  const op = find(db.operations, operationId, 'Operación');
  if (!isParticipant(ctx.user, op)) throw new AccessDeniedError();
  assertCan(ctx.user, 'document.manage');
  if (input.isFinancial && !can(ctx.user, 'finance.manage')) throw new AccessDeniedError('Solo finanzas puede crear documentos financieros.');
  if (!input.name.trim()) throw new ValidationError('Indicar el nombre del documento.');
  return mutate(db, (draft) => {
    const doc: OperationDocument = {
      id: ctx.newId(),
      operationId,
      organizationId: ctx.user.organizationId,
      requirementId: null,
      documentType: input.documentType,
      name: input.name.trim(),
      responsibleParty: input.responsibleParty,
      status: 'pending',
      dueDate: input.dueDate ?? null,
      issuer: input.issuer ?? null,
      currentVersion: 0,
      requirementSource: 'Agregado manualmente',
      requirementStatus: 'pending',
      notes: input.notes ?? null,
      observation: null,
      sharedWithCounterparty: input.isFinancial ? false : input.sharedWithCounterparty,
      isFinancial: input.isFinancial,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    };
    draft.documents.push(doc);
    audit(draft, ctx, 'document', doc.id, 'create', `Documento "${doc.name}" agregado a ${op.code}`);
    return doc;
  });
}

export interface UploadedFileMeta {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string | null;
  demoContent?: string | null;
}

export function uploadDocumentVersion(db: Database, ctx: ServiceContext, documentId: string, file: UploadedFileMeta, note?: string) {
  const doc = find(db.documents, documentId, 'Documento');
  const op = find(db.operations, doc.operationId, 'Operación');
  if (doc.organizationId !== ctx.user.organizationId || !isParticipant(ctx.user, op)) {
    throw new AccessDeniedError('Solo la organización responsable puede cargar versiones de este documento.');
  }
  assertCan(ctx.user, doc.isFinancial ? 'finance.manage' : 'document.manage');
  if (file.sizeBytes > MAX_FILE_BYTES) throw new ValidationError('El archivo supera el máximo de 10 MB.');
  if (!ALLOWED_MIME.includes(file.mimeType)) throw new ValidationError(`Tipo de archivo no admitido (${file.mimeType || 'desconocido'}).`);
  if (!/^[0-9a-f]{64}$/.test(file.sha256)) throw new ValidationError('Hash SHA-256 inválido.');
  const safeName = file.fileName.replace(/[\\/]/g, '_').slice(0, 180);
  return mutate(db, (draft) => {
    const d = find(draft.documents, documentId, 'Documento');
    d.currentVersion += 1;
    d.updatedAt = ctx.now();
    if (d.status === 'pending') d.status = 'in_preparation';
    const version = {
      id: ctx.newId(),
      documentId,
      version: d.currentVersion,
      fileName: safeName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      storageKey: file.storageKey,
      demoContent: file.demoContent ?? null,
      uploadedAt: ctx.now(),
      uploadedBy: ctx.user.id,
      note: note ?? null,
    };
    draft.documentVersions.push(version);
    trace(draft, ctx, {
      type: 'document_updated',
      title: `${d.name}: versión ${d.currentVersion} cargada`,
      detail: `SHA-256 ${file.sha256.slice(0, 16)}…`,
      operationId: d.operationId,
      entity: { kind: 'document', id: d.id },
      shared: d.sharedWithCounterparty,
    });
    audit(draft, ctx, 'document', d.id, 'upload', `Versión ${d.currentVersion} de "${d.name}" (${safeName})`);
    return version;
  });
}

export function changeDocumentStatus(db: Database, ctx: ServiceContext, documentId: string, to: DocumentStatus, note?: string) {
  const doc = find(db.documents, documentId, 'Documento');
  const op = find(db.operations, doc.operationId, 'Operación');
  if (!isParticipant(ctx.user, op)) throw new AccessDeniedError();
  const reviewing = to === 'verified' || to === 'observed';
  if (reviewing) {
    if (!can(ctx.user, 'document.verify') || op.sellerOrganizationId !== ctx.user.organizationId) {
      throw new AccessDeniedError('Solo el responsable COMEX del vendedor puede verificar u observar documentos.');
    }
  } else if (doc.organizationId !== ctx.user.organizationId) {
    throw new AccessDeniedError('Solo la organización responsable puede cambiar el estado de este documento.');
  }
  const error = validateDocumentTransition(doc.status, to, { hasFile: doc.currentVersion > 0, note });
  if (error) throw new ValidationError(error);
  return mutate(db, (draft) => {
    const d = find(draft.documents, documentId, 'Documento');
    const from = d.status;
    d.status = to;
    if (to === 'observed') d.observation = note ?? null;
    if (to === 'not_applicable') d.notes = note ?? d.notes;
    d.updatedAt = ctx.now();
    const operation = find(draft.operations, d.operationId, 'Operación');
    if (operation.status === 'confirmed') operation.status = 'in_preparation';
    trace(draft, ctx, {
      type: 'document_updated',
      title: `${d.name}: ${DOCUMENT_STATUS[from]} → ${DOCUMENT_STATUS[to]}`,
      detail: note ?? null,
      operationId: d.operationId,
      entity: { kind: 'document', id: d.id },
      shared: d.sharedWithCounterparty,
    });
    audit(draft, ctx, 'document', d.id, 'status', `"${d.name}": ${DOCUMENT_STATUS[from]} → ${DOCUMENT_STATUS[to]}`, [{ field: 'status', before: from, after: to }]);
    return d;
  });
}

export function registerInvoice(db: Database, ctx: ServiceContext, operationId: string, raw: InvoiceInput) {
  const op = sellerOperation(db, ctx, operationId, 'finance.manage');
  lockedForChanges(op);
  const input = parse(invoiceSchema, raw);
  if (db.invoices.some((i) => i.organizationId === op.sellerOrganizationId && i.number === input.number)) {
    throw new ValidationError(`Ya existe la factura ${input.number}.`);
  }
  return mutate(db, (draft) => {
    const invoice = {
      id: ctx.newId(),
      operationId,
      organizationId: op.sellerOrganizationId,
      number: input.number,
      issueDate: input.issueDate,
      currency: input.currency,
      amount: toPlain(dec(input.amount)),
      quantityT: toPlain(dec(input.quantityT)),
      exportPermitNumber: input.exportPermitNumber ?? null,
      createdAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.invoices.push(invoice);
    audit(draft, ctx, 'invoice', invoice.id, 'create', `Factura ${invoice.number} por ${invoice.currency} ${invoice.amount}`);
    runReconciliationDraft(draft, ctx, operationId);
    return invoice;
  });
}

export function registerPayment(db: Database, ctx: ServiceContext, operationId: string, raw: PaymentInput) {
  const op = sellerOperation(db, ctx, operationId, 'finance.manage');
  lockedForChanges(op);
  const input = parse(paymentSchema, raw);
  const invoice = input.invoiceId ? find(db.invoices, input.invoiceId, 'Factura') : null;
  if (invoice && invoice.operationId !== operationId) throw new ValidationError('La factura pertenece a otra operación.');
  return mutate(db, (draft) => {
    const payment: Payment = {
      id: ctx.newId(),
      operationId,
      organizationId: op.sellerOrganizationId,
      reference: input.reference,
      receivedDate: input.receivedDate,
      currency: input.currency,
      grossAmount: toPlain(dec(input.grossAmount)),
      foreignBankFees: toPlain(dec(input.foreignBankFees)),
      localBankFees: toPlain(dec(input.localBankFees)),
      otherDeductions: toPlain(dec(input.otherDeductions)),
      netAmount: toPlain(dec(input.netAmount)),
      isAdvance: input.isAdvance,
      bankName: input.bankName ?? null,
      bankReportStatus: input.bankReportStatus,
      evidenceDocumentIds: [],
      recordKind: 'informational',
      notes: input.notes ?? null,
      createdAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    draft.payments.push(payment);
    if (invoice) {
      draft.paymentAllocations.push({
        id: ctx.newId(),
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount: toPlain(dec(input.allocatedAmount || input.grossAmount)),
      });
    }
    const operation = find(draft.operations, operationId, 'Operación');
    trace(draft, ctx, {
      type: 'payment_received',
      title: `Cobro registrado (${operation.code})`,
      detail: `Bruto ${payment.currency} ${payment.grossAmount} · neto ${payment.netAmount} · registro informativo, no es una operación bancaria`,
      operationId,
      entity: { kind: 'payment', id: payment.id },
      shared: false,
    });
    audit(draft, ctx, 'payment', payment.id, 'create', `Cobro ${payment.reference}: bruto ${payment.grossAmount}, neto ${payment.netAmount}`);
    const result = runReconciliationDraft(draft, ctx, operationId);
    if (result && dec(result.pendingBalance).lte(0) && (operation.status === 'shipped' || operation.status === 'in_preparation')) {
      operation.status = 'collected';
    }
    return payment;
  });
}

export function allocatePayment(db: Database, ctx: ServiceContext, paymentId: string, invoiceId: string, amount: string) {
  const payment = find(db.payments, paymentId, 'Cobro');
  sellerOperation(db, ctx, payment.operationId, 'finance.manage');
  const invoice = find(db.invoices, invoiceId, 'Factura');
  if (invoice.operationId !== payment.operationId) throw new ValidationError('La factura pertenece a otra operación.');
  if (!dec(amount || 0).gt(0)) throw new ValidationError('El importe imputado debe ser mayor a cero.');
  return mutate(db, (draft) => {
    draft.paymentAllocations.push({ id: ctx.newId(), paymentId, invoiceId, amount: toPlain(dec(amount)) });
    audit(draft, ctx, 'payment', paymentId, 'allocate', `Cobro ${payment.reference} imputado a ${invoice.number}: ${amount}`);
    runReconciliationDraft(draft, ctx, payment.operationId);
  });
}

export function attachPaymentEvidence(db: Database, ctx: ServiceContext, paymentId: string, documentId: string) {
  const payment = find(db.payments, paymentId, 'Cobro');
  sellerOperation(db, ctx, payment.operationId, 'finance.manage');
  const doc = find(db.documents, documentId, 'Documento');
  if (doc.operationId !== payment.operationId) throw new ValidationError('El documento pertenece a otra operación.');
  if (doc.currentVersion === 0) throw new ValidationError('El documento no tiene archivo cargado.');
  return mutate(db, (draft) => {
    const p = find(draft.payments, paymentId, 'Cobro');
    if (!p.evidenceDocumentIds.includes(documentId)) p.evidenceDocumentIds.push(documentId);
    audit(draft, ctx, 'payment', paymentId, 'evidence', `Comprobante "${doc.name}" vinculado al cobro ${p.reference}`);
    runReconciliationDraft(draft, ctx, p.operationId);
    return p;
  });
}

export function runReconciliationDraft(draft: Database, ctx: ServiceContext, operationId: string) {
  const op = find(draft.operations, operationId, 'Operación');
  const invoices = draft.invoices.filter((i) => i.operationId === operationId);
  const payments = draft.payments.filter((p) => p.operationId === operationId);
  const result = reconcile({
    currency: op.currency,
    contractPricePerT: op.pricePerT,
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, currency: i.currency, amount: i.amount, quantityT: i.quantityT })),
    shipments: draft.shipments
      .filter((s) => s.operationId === operationId && (s.status === 'shipped' || s.status === 'received'))
      .map((s) => ({ id: s.id, shippedQuantityT: s.shippedQuantityT ?? null })),
    payments: payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      currency: p.currency,
      grossAmount: p.grossAmount,
      foreignBankFees: p.foreignBankFees,
      localBankFees: p.localBankFees,
      otherDeductions: p.otherDeductions,
      netAmount: p.netAmount,
      isAdvance: p.isAdvance,
      deductionEvidenceCount: p.evidenceDocumentIds.length,
    })),
    allocations: draft.paymentAllocations
      .filter((a) => payments.some((p) => p.id === a.paymentId))
      .map((a) => ({ paymentId: a.paymentId, invoiceId: a.invoiceId, amount: a.amount })),
  });
  let rec = draft.reconciliations.find((r) => r.operationId === operationId);
  if (!rec) {
    rec = {
      id: ctx.newId(),
      operationId,
      organizationId: op.sellerOrganizationId,
      status: 'no_data',
      lastResult: null,
      updatedAt: ctx.now(),
    };
    draft.reconciliations.push(rec);
  }
  const previousStatus = rec.status;
  rec.lastResult = result;
  if (rec.status !== 'reconciled_by_operator' || !result.readyToReconcile) {
    rec.status = result.suggestedStatus;
    if (previousStatus === 'reconciled_by_operator') {
      rec.reconciledAt = null;
      rec.reconciledBy = null;
    }
  }
  rec.updatedAt = ctx.now();
  if (rec.status === 'difference_to_review' && previousStatus !== 'difference_to_review') {
    trace(draft, ctx, {
      type: 'reconciliation_review',
      title: `Conciliación ${op.code}: diferencias a revisar`,
      detail: result.differences
        .filter((d) => d.status === 'needs_evidence' || d.status === 'to_review')
        .map((d) => `${d.label}: ${d.amount}`)
        .join(' · '),
      operationId,
      entity: { kind: 'reconciliation', id: rec.id },
      shared: false,
    });
  }
  return result;
}

export function markReconciled(db: Database, ctx: ServiceContext, operationId: string, note: string) {
  const op = sellerOperation(db, ctx, operationId, 'finance.manage');
  const rec = db.reconciliations.find((r) => r.operationId === operationId);
  if (!rec?.lastResult) throw new ValidationError('No hay datos de facturación y cobro para conciliar.');
  if (!rec.lastResult.readyToReconcile) {
    throw new ValidationError('Hay diferencias sin respaldo o saldo pendiente: adjuntar comprobantes antes de conciliar.');
  }
  if (!note.trim()) throw new ValidationError('Registrar una nota del operador.');
  return mutate(db, (draft) => {
    const r = draft.reconciliations.find((x) => x.operationId === operationId)!;
    r.status = 'reconciled_by_operator';
    r.operatorNote = note.trim();
    r.reconciledBy = ctx.user.id;
    r.reconciledAt = ctx.now();
    r.updatedAt = ctx.now();
    const operation = find(draft.operations, operationId, 'Operación');
    operation.status = 'closed';
    operation.updatedAt = ctx.now();
    trace(draft, ctx, {
      type: 'reconciled',
      title: `Operación ${op.code} conciliada por el operador`,
      detail: note.trim(),
      operationId,
      entity: { kind: 'reconciliation', id: r.id },
      shared: false,
    });
    audit(draft, ctx, 'reconciliation', r.id, 'reconcile', `Conciliación de ${op.code} confirmada por el operador`);
    return r;
  });
}

export function recordBlockchainTx(
  db: Database,
  ctx: ServiceContext,
  operationId: string,
  record: Omit<BlockchainRecord, 'id' | 'createdBy' | 'status' | 'operationId'>,
) {
  const op = find(db.operations, operationId, 'Operación');
  if (!isParticipant(ctx.user, op)) throw new AccessDeniedError();
  assertCan(ctx.user, 'blockchain.sign');
  if (!/^[0-9a-f]{64}$/.test(record.txHash)) throw new ValidationError('Hash de transacción inválido.');
  if (op.termsHash && record.termsHash !== op.termsHash && record.action !== 'record_proof') {
    throw new ValidationError('El hash registrado no coincide con los términos aceptados de la operación.');
  }
  if (db.blockchainRecords.some((r) => r.txHash === record.txHash)) {
    throw new ValidationError('Esa transacción ya está registrada.');
  }
  return mutate(db, (draft) => {
    const rec: BlockchainRecord = { ...record, id: ctx.newId(), operationId, status: 'confirmed', createdBy: ctx.user.id };
    draft.blockchainRecords.push(rec);
    trace(draft, ctx, {
      type: 'blockchain_recorded',
      title: `${record.action} confirmada en Stellar ${record.network === 'testnet' ? 'Testnet' : '(red local)'}`,
      detail: `tx ${record.txHash.slice(0, 16)}… · ledger ${record.ledger}`,
      operationId,
      entity: { kind: 'blockchain_record', id: rec.id },
      shared: true,
    });
    audit(draft, ctx, 'blockchain', rec.id, record.action, `Transacción ${record.txHash} confirmada (${record.network})`);
    return rec;
  });
}
