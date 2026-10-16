import { dec, toPlain } from '@/domain/decimal';
import { applicableRequirements } from '@/domain/documents';
import { canonicalJson, termsHashForSync } from '@/integrations/stellar/terms';
import { AccessDeniedError, assertCan, can } from '../access';
import { buildAgreementTerms, byId, evaluateScenario, isScenarioQuotable, stockOf } from '../derive';
import type {
  CostScenario,
  Database,
  OperationDocument,
  Quotation,
  QuotationVersion,
  TradeOperation,
} from '../model';
import { audit, find, mutate, nextCode, trace, ValidationError, type ServiceContext } from './context';
import { releaseReservationDraft } from './catalog';

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface QuotationOptions {
  buyerOrganizationId?: string | null;
  validUntil?: string | null;
  changeNote?: string | null;
}

function buildVersion(
  db: Database,
  ctx: ServiceContext,
  quotation: Quotation,
  versionNumber: number,
  scenario: CostScenario,
  opts: QuotationOptions,
): QuotationVersion {
  const evaluation = evaluateScenario(db, scenario, ctx.today());
  if (!isScenarioQuotable(evaluation)) {
    const issues = [
      ...evaluation.result.alerts.filter((a) => a.level === 'error').map((a) => a.message),
      ...evaluation.extraAlerts.filter((a) => a.level === 'error').map((a) => a.message),
    ];
    throw new ValidationError(`No se puede generar la cotización: ${issues[0] ?? 'hay errores en el cálculo'}`, issues);
  }
  const result = evaluation.result;
  const validUntil = opts.validUntil || addDays(ctx.today(), scenario.commercial.validityDays);
  if (validUntil < ctx.today()) throw new ValidationError('La vigencia no puede ser anterior a hoy.');
  const terms = buildAgreementTerms(db, quotation, versionNumber, scenario, result, validUntil);
  return {
    id: ctx.newId(),
    quotationId: quotation.id,
    version: versionNumber,
    status: 'draft',
    scenario: structuredClone(scenario),
    costingInput: evaluation.input,
    result,
    pricePerT: result.pricePerT!,
    totalAmount: result.totalPrice!,
    currency: result.currency,
    quantityT: result.quantityT,
    incoterm: scenario.commercial.incoterm,
    namedPlace: scenario.commercial.namedPlace,
    validUntil,
    terms,
    termsHash: termsHashForSync(terms),
    changeNote: opts.changeNote ?? null,
    createdAt: ctx.now(),
    createdBy: ctx.user.id,
  };
}

export function createQuotationFromScenario(db: Database, ctx: ServiceContext, scenarioId: string, opts: QuotationOptions = {}) {
  const scenario = find(db.scenarios, scenarioId, 'Escenario');
  assertCan(ctx.user, 'quotation.manage', scenario.organizationId);
  const buyerId = opts.buyerOrganizationId ?? scenario.buyerOrganizationId;
  const buyer = byId(db.organizations, buyerId);
  if (!buyer || !buyer.kinds.includes('buyer')) throw new ValidationError('Seleccionar la empresa compradora.');
  if (!scenario.productId) throw new ValidationError('Seleccionar el producto.');
  if (scenario.quotationId) {
    throw new ValidationError('El escenario ya generó una cotización: agregar una nueva versión desde la cotización.');
  }
  return mutate(db, (draft) => {
    const quotation: Quotation = {
      id: ctx.newId(),
      code: nextCode(
        draft.quotations.map((q) => ({ code: q.code, organizationId: q.sellerOrganizationId })),
        'COT',
        ctx.today().slice(0, 4),
        ctx.user.organizationId,
      ),
      sellerOrganizationId: ctx.user.organizationId,
      buyerOrganizationId: buyer.id,
      requestId: scenario.requestId ?? null,
      scenarioId: scenario.id,
      productId: scenario.productId!,
      operationId: null,
      status: 'draft',
      currentVersionId: '',
      acceptedVersionId: null,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
    };
    const draftScenario = find(draft.scenarios, scenarioId, 'Escenario');
    draftScenario.buyerOrganizationId = buyer.id;
    const version = buildVersion(draft, ctx, quotation, 1, draftScenario, opts);
    quotation.currentVersionId = version.id;
    draft.quotations.push(quotation);
    draft.quotationVersions.push(version);
    draftScenario.status = 'quoted';
    draftScenario.quotationId = quotation.id;
    const request = byId(draft.requests, quotation.requestId);
    if (request && request.status === 'published') request.status = 'negotiating';
    if (request) {
      trace(draft, ctx, {
        type: 'request_accepted',
        title: `Solicitud ${request.code} aceptada para cotizar`,
        detail: `${quotation.code} preparada por el vendedor`,
        lotIds: scenario.lots.map((l) => l.lotId),
        entity: { kind: 'request', id: request.id },
        shared: true,
      });
    }
    trace(draft, ctx, {
      type: 'quotation_created',
      title: `Cotización ${quotation.code} v1 creada`,
      detail: `${version.incoterm} ${version.namedPlace} · ${version.currency} ${version.pricePerT}/t`,
      lotIds: scenario.lots.map((l) => l.lotId),
      entity: { kind: 'quotation', id: quotation.id },
      shared: false,
    });
    audit(draft, ctx, 'quotation', quotation.id, 'create', `Cotización ${quotation.code} creada (v1, ${version.currency} ${version.pricePerT}/t)`);
    return { quotation, version };
  });
}

export function addQuotationVersion(
  db: Database,
  ctx: ServiceContext,
  quotationId: string,
  opts: QuotationOptions & { scenarioId?: string } = {},
) {
  const quotation = find(db.quotations, quotationId, 'Cotización');
  assertCan(ctx.user, 'quotation.manage', quotation.sellerOrganizationId);
  if (quotation.status === 'accepted') {
    throw new ValidationError(
      'La cotización ya fue aceptada: su versión es inmutable. Para cambiar condiciones, iniciar una renegociación con una nueva cotización.',
    );
  }
  const scenario = find(db.scenarios, opts.scenarioId ?? quotation.scenarioId, 'Escenario');
  if (scenario.organizationId !== quotation.sellerOrganizationId) throw new AccessDeniedError();
  return mutate(db, (draft) => {
    const q = find(draft.quotations, quotationId, 'Cotización');
    const versions = draft.quotationVersions.filter((v) => v.quotationId === q.id);
    const number = Math.max(...versions.map((v) => v.version)) + 1;
    const version = buildVersion(draft, ctx, q, number, find(draft.scenarios, scenario.id, 'Escenario'), opts);
    for (const v of versions) {
      if (v.status === 'draft' || v.status === 'sent') v.status = 'superseded';
    }
    draft.quotationVersions.push(version);
    q.currentVersionId = version.id;
    q.status = 'draft';
    q.updatedAt = ctx.now();
    trace(draft, ctx, {
      type: 'quotation_created',
      title: `Cotización ${q.code} v${number} creada`,
      detail: opts.changeNote ?? `${version.currency} ${version.pricePerT}/t`,
      entity: { kind: 'quotation', id: q.id },
      shared: false,
    });
    audit(draft, ctx, 'quotation', q.id, 'version', `Nueva versión v${number} de ${q.code}: ${version.currency} ${version.pricePerT}/t`);
    return version;
  });
}

export function sendQuotationVersion(db: Database, ctx: ServiceContext, versionId: string) {
  const version = find(db.quotationVersions, versionId, 'Versión');
  const quotation = find(db.quotations, version.quotationId, 'Cotización');
  assertCan(ctx.user, 'quotation.manage', quotation.sellerOrganizationId);
  if (version.status !== 'draft') throw new ValidationError('Solo se pueden enviar versiones en borrador.');
  if (!version.incoterm || !version.namedPlace.trim()) {
    throw new ValidationError('No se puede enviar la cotización sin Incoterm y lugar convenido.');
  }
  if (!version.result.valid) throw new ValidationError('La versión tiene errores de cálculo.');
  if (version.validUntil < ctx.today()) throw new ValidationError('La versión está vencida: generar una nueva.');
  return mutate(db, (draft) => {
    const v = find(draft.quotationVersions, versionId, 'Versión');
    const q = find(draft.quotations, v.quotationId, 'Cotización');
    v.status = 'sent';
    v.sentAt = ctx.now();
    q.status = 'sent';
    q.updatedAt = ctx.now();
    trace(draft, ctx, {
      type: 'quotation_sent',
      title: `Cotización ${q.code} v${v.version} enviada al comprador`,
      detail: `${v.incoterm} ${v.namedPlace} · ${v.currency} ${v.pricePerT}/t · vigente hasta ${v.validUntil}`,
      entity: { kind: 'quotation', id: q.id },
      shared: true,
    });
    audit(draft, ctx, 'quotation', q.id, 'send', `Versión v${v.version} de ${q.code} enviada`);
    return v;
  });
}

/** Comprometido por lote para una operación: compromisos menos embarques registrados. */
export function committedForOperation(db: Database, operationId: string, lotId: string) {
  return db.inventoryMovements
    .filter((m) => m.lotId === lotId && m.reference.id === operationId)
    .reduce((acc, m) => {
      if (m.type === 'commitment') return acc.plus(dec(m.quantityT));
      if (m.type === 'shipment') return acc.minus(dec(m.quantityT));
      return acc;
    }, dec(0));
}

function reservedForQuotation(db: Database, quotationId: string, lotId: string) {
  return db.inventoryMovements
    .filter((m) => m.lotId === lotId && m.reference.kind === 'quotation' && m.reference.id === quotationId)
    .reduce((acc, m) => {
      if (m.type === 'reservation') return acc.plus(dec(m.quantityT));
      if (m.type === 'release') return acc.minus(dec(m.quantityT));
      return acc;
    }, dec(0));
}

export function generateOperationDocuments(draft: Database, ctx: ServiceContext, op: TradeOperation, scenario: CostScenario) {
  const product = byId(draft.products, op.productId);
  const request = byId(draft.requests, op.requestId);
  const rules = applicableRequirements(draft.requirements, {
    country: op.destinationCountry,
    ncm: scenario.customs.ncm || product?.ncm,
    processing: product?.processing ?? 'white',
    transportMode: scenario.commercial.transportMode,
    paymentMethod: scenario.finance.paymentMethod,
    buyerOrganizationId: op.buyerOrganizationId,
  });
  const existing = new Set(draft.documents.filter((d) => d.operationId === op.id).map((d) => d.requirementId ?? d.name));
  const due = (days?: number | null) => (op.shipmentDate && days != null ? addDays(op.shipmentDate, -days) : null);
  const docs: OperationDocument[] = [];
  for (const rule of rules) {
    if (existing.has(rule.id)) continue;
    const ownerIsBuyer = rule.responsibleParty === 'buyer';
    docs.push({
      id: ctx.newId(),
      operationId: op.id,
      organizationId: ownerIsBuyer ? op.buyerOrganizationId : op.sellerOrganizationId,
      requirementId: rule.id,
      documentType: rule.documentType,
      name: rule.name,
      responsibleParty: rule.responsibleParty,
      status: 'pending',
      dueDate: due(rule.dueDaysBeforeShipment),
      issuer: rule.issuer,
      currentVersion: 0,
      requirementSource: rule.sourceName,
      requirementStatus: rule.verificationStatus,
      notes: rule.requiredIf ?? null,
      observation: null,
      sharedWithCounterparty: rule.category !== 'bank',
      isFinancial: rule.category === 'bank',
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    });
  }
  for (const cert of request?.requiredCertifications ?? []) {
    const covered = docs.some((d) => d.name.toLowerCase().includes(cert.toLowerCase())) || existing.has(`cert:${cert}`);
    if (covered) continue;
    docs.push({
      id: ctx.newId(),
      operationId: op.id,
      organizationId: op.sellerOrganizationId,
      requirementId: null,
      documentType: 'buyer_required',
      name: `Certificación exigida por el comprador: ${cert}`,
      responsibleParty: 'seller',
      status: 'pending',
      dueDate: due(10),
      issuer: null,
      currentVersion: 0,
      requirementSource: `Solicitud ${request?.code} del comprador (exigencia particular, no normativa)`,
      requirementStatus: 'verified',
      notes: null,
      observation: null,
      sharedWithCounterparty: true,
      isFinancial: false,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    });
  }
  for (const doc of request?.buyerDocuments ?? []) {
    docs.push({
      id: ctx.newId(),
      operationId: op.id,
      organizationId: op.buyerOrganizationId,
      requirementId: null,
      documentType: 'buyer_required',
      name: `Aportado por el importador: ${doc.name}`,
      responsibleParty: 'buyer',
      status: 'pending',
      dueDate: due(15),
      issuer: null,
      currentVersion: 0,
      requirementSource: `Solicitud ${request?.code}`,
      requirementStatus: 'pending',
      notes: doc.note ?? null,
      observation: null,
      sharedWithCounterparty: true,
      isFinancial: false,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    });
  }
  draft.documents.push(...docs);
  return docs;
}

export function acceptQuotationVersion(db: Database, ctx: ServiceContext, versionId: string) {
  const version = find(db.quotationVersions, versionId, 'Versión');
  const quotation = find(db.quotations, version.quotationId, 'Cotización');
  if (!can(ctx.user, 'quotation.respond') || quotation.buyerOrganizationId !== ctx.user.organizationId) {
    throw new AccessDeniedError('Solo la empresa compradora puede aceptar la cotización.');
  }
  if (quotation.status === 'accepted') throw new ValidationError('La cotización ya tiene una versión aceptada.');
  if (version.status !== 'sent') throw new ValidationError('Solo se pueden aceptar versiones enviadas.');
  if (version.validUntil < ctx.today()) throw new ValidationError(`La cotización venció el ${version.validUntil}.`);
  for (const part of version.scenario.lots) {
    const stock = stockOf(db, part.lotId);
    const reserved = reservedForQuotation(db, quotation.id, part.lotId);
    if (dec(part.quantityT).gt(stock.available.plus(reserved))) {
      const lot = byId(db.lots, part.lotId);
      throw new ValidationError(
        `El lote ${lot?.code} ya no tiene stock libre suficiente (${toPlain(stock.available)} t). El vendedor debe actualizar la cotización.`,
      );
    }
  }

  return mutate(db, (draft) => {
    const v = find(draft.quotationVersions, versionId, 'Versión');
    const q = find(draft.quotations, v.quotationId, 'Cotización');
    v.status = 'accepted';
    v.acceptedAt = ctx.now();
    v.acceptedBy = ctx.user.id;
    for (const other of draft.quotationVersions.filter((x) => x.quotationId === q.id && x.id !== v.id)) {
      if (other.status === 'draft' || other.status === 'sent') other.status = 'superseded';
    }
    q.status = 'accepted';
    q.acceptedVersionId = v.id;
    q.updatedAt = ctx.now();

    const scenario = v.scenario;
    let op = byId(draft.operations, q.operationId);
    const fields = {
      acceptedVersionId: v.id,
      lots: scenario.lots.map((l) => ({ ...l })),
      quantityT: v.quantityT,
      pricePerT: v.pricePerT,
      totalAmount: v.totalAmount,
      currency: v.currency,
      incoterm: v.incoterm,
      namedPlace: v.namedPlace,
      paymentMethod: scenario.finance.paymentMethod,
      paymentTerms: scenario.commercial.paymentTerms,
      shipmentDate: scenario.commercial.shipmentDate ?? null,
      destinationCountry: scenario.destinationCountry ?? '',
      destinationPortId: scenario.destinationPortId ?? null,
      termsHash: v.termsHash,
      status: 'confirmed' as const,
      confirmedAt: ctx.now(),
      updatedAt: ctx.now(),
    };
    if (op) {
      Object.assign(op, fields);
    } else {
      op = {
        id: ctx.newId(),
        code: nextCode(
          draft.operations.map((o) => ({ code: o.code, organizationId: o.sellerOrganizationId })),
          'OP',
          ctx.today().slice(0, 4),
          q.sellerOrganizationId,
          4,
        ),
        sellerOrganizationId: q.sellerOrganizationId,
        buyerOrganizationId: q.buyerOrganizationId,
        quotationId: q.id,
        requestId: q.requestId ?? null,
        productId: q.productId,
        createdAt: ctx.now(),
        createdBy: ctx.user.id,
        ...fields,
      };
      draft.operations.push(op);
      q.operationId = op.id;
    }
    const operation = op;

    for (const part of scenario.lots) {
      const reserved = reservedForQuotation(draft, q.id, part.lotId);
      const fromReservation = reserved.gt(dec(part.quantityT)) ? dec(part.quantityT) : reserved;
      if (fromReservation.gt(0)) {
        draft.inventoryMovements.push({
          id: ctx.newId(),
          organizationId: q.sellerOrganizationId,
          lotId: part.lotId,
          type: 'release',
          quantityT: toPlain(fromReservation),
          reference: { kind: 'quotation', id: q.id },
          note: `Reserva de ${q.code} convertida en compromiso de ${operation.code}`,
          createdAt: ctx.now(),
          createdBy: ctx.user.id,
        });
      }
      draft.inventoryMovements.push({
        id: ctx.newId(),
        organizationId: q.sellerOrganizationId,
        lotId: part.lotId,
        type: 'commitment',
        quantityT: toPlain(dec(part.quantityT)),
        reference: { kind: 'operation', id: operation.id },
        note: `Compromiso por ${operation.code}`,
        createdAt: ctx.now(),
        createdBy: ctx.user.id,
      });
    }

    const docs = generateOperationDocuments(draft, ctx, operation, scenario);
    const contractDocId = ctx.newId();
    const content = canonicalJson(v.terms);
    draft.documents.push({
      id: contractDocId,
      operationId: operation.id,
      organizationId: q.sellerOrganizationId,
      requirementId: null,
      documentType: 'contract',
      name: `Aceptación de cotización ${q.code} v${v.version}`,
      responsibleParty: 'seller',
      status: 'verified',
      dueDate: null,
      issuer: 'AgroMatch COMEX (registro de aceptación)',
      currentVersion: 1,
      requirementSource: 'Términos canónicos aceptados por el comprador',
      requirementStatus: 'verified',
      notes: 'El SHA-256 de este documento es el hash de términos que puede registrarse en Stellar.',
      observation: null,
      sharedWithCounterparty: true,
      isFinancial: false,
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    });
    draft.documentVersions.push({
      id: ctx.newId(),
      documentId: contractDocId,
      version: 1,
      fileName: `${q.code}-v${v.version}-terminos.json`,
      mimeType: 'application/json',
      sizeBytes: new TextEncoder().encode(content).length,
      sha256: v.termsHash,
      storageKey: null,
      demoContent: content,
      uploadedAt: ctx.now(),
      uploadedBy: ctx.user.id,
      note: 'Generado automáticamente al aceptar la cotización',
    });

    if (!draft.reconciliations.some((r) => r.operationId === operation.id)) {
      draft.reconciliations.push({
        id: ctx.newId(),
        operationId: operation.id,
        organizationId: q.sellerOrganizationId,
        status: 'no_data',
        lastResult: null,
        operatorNote: null,
        reconciledBy: null,
        reconciledAt: null,
        updatedAt: ctx.now(),
      });
    }
    const request = byId(draft.requests, q.requestId);
    if (request && request.status !== 'cancelled') request.status = 'closed';

    const lotIds = scenario.lots.map((l) => l.lotId);
    trace(draft, ctx, {
      type: 'quotation_confirmed',
      title: `Cotización ${q.code} v${v.version} confirmada por el comprador`,
      detail: `${v.currency} ${v.pricePerT}/t · ${v.quantityT} t · ${v.incoterm} ${v.namedPlace} · hash ${v.termsHash.slice(0, 12)}…`,
      operationId: operation.id,
      lotIds,
      entity: { kind: 'quotation_version', id: v.id },
      shared: true,
    });
    trace(draft, ctx, {
      type: 'operation_created',
      title: `Operación ${operation.code} creada`,
      detail: `${operation.quantityT} t comprometidas de ${lotIds.length} lote(s)`,
      operationId: operation.id,
      lotIds,
      entity: { kind: 'operation', id: operation.id },
      shared: true,
    });
    trace(draft, ctx, {
      type: 'documents_prepared',
      title: `Checklist documental generado (${docs.length + 1} documentos)`,
      detail: 'Requisitos marcados con su fuente y estado de verificación',
      operationId: operation.id,
      entity: { kind: 'operation', id: operation.id },
      shared: true,
    });
    audit(draft, ctx, 'quotation', q.id, 'accept', `Versión v${v.version} de ${q.code} aceptada; operación ${operation.code} creada`);
    return { operation, version: v };
  });
}

export function rejectQuotationVersion(db: Database, ctx: ServiceContext, versionId: string, reason: string) {
  const version = find(db.quotationVersions, versionId, 'Versión');
  const quotation = find(db.quotations, version.quotationId, 'Cotización');
  if (!can(ctx.user, 'quotation.respond') || quotation.buyerOrganizationId !== ctx.user.organizationId) {
    throw new AccessDeniedError('Solo la empresa compradora puede rechazar la cotización.');
  }
  if (version.status !== 'sent') throw new ValidationError('Solo se pueden rechazar versiones enviadas.');
  if (!reason.trim()) throw new ValidationError('Indicar el motivo del rechazo.');
  return mutate(db, (draft) => {
    const v = find(draft.quotationVersions, versionId, 'Versión');
    const q = find(draft.quotations, v.quotationId, 'Cotización');
    v.status = 'rejected';
    v.rejectedAt = ctx.now();
    v.rejectedBy = ctx.user.id;
    v.rejectionReason = reason.trim();
    q.status = 'rejected';
    q.updatedAt = ctx.now();
    for (const part of v.scenario.lots) {
      releaseReservationDraft(draft, ctx, part.lotId, { kind: 'quotation', id: q.id });
    }
    trace(draft, ctx, {
      type: 'quotation_rejected',
      title: `Cotización ${q.code} v${v.version} rechazada`,
      detail: reason.trim(),
      entity: { kind: 'quotation', id: q.id },
      shared: true,
    });
    audit(draft, ctx, 'quotation', q.id, 'reject', `Versión v${v.version} de ${q.code} rechazada: ${reason.trim()}`);
    return v;
  });
}

/** Expediente en negociación (asistente): se crea antes de la aceptación para preparar documentación. */
export function createNegotiationOperation(db: Database, ctx: ServiceContext, quotationId: string) {
  const quotation = find(db.quotations, quotationId, 'Cotización');
  assertCan(ctx.user, 'quotation.manage', quotation.sellerOrganizationId);
  if (quotation.operationId) throw new ValidationError('La cotización ya tiene un expediente.');
  const version = find(db.quotationVersions, quotation.currentVersionId, 'Versión');
  return mutate(db, (draft) => {
    const q = find(draft.quotations, quotationId, 'Cotización');
    const op: TradeOperation = {
      id: ctx.newId(),
      code: nextCode(
        draft.operations.map((o) => ({ code: o.code, organizationId: o.sellerOrganizationId })),
        'OP',
        ctx.today().slice(0, 4),
        q.sellerOrganizationId,
        4,
      ),
      sellerOrganizationId: q.sellerOrganizationId,
      buyerOrganizationId: q.buyerOrganizationId,
      quotationId: q.id,
      acceptedVersionId: null,
      requestId: q.requestId ?? null,
      productId: q.productId,
      lots: version.scenario.lots.map((l) => ({ ...l })),
      quantityT: version.quantityT,
      pricePerT: version.pricePerT,
      totalAmount: version.totalAmount,
      currency: version.currency,
      incoterm: version.incoterm,
      namedPlace: version.namedPlace,
      paymentMethod: version.scenario.finance.paymentMethod,
      paymentTerms: version.scenario.commercial.paymentTerms,
      shipmentDate: version.scenario.commercial.shipmentDate ?? null,
      destinationCountry: version.scenario.destinationCountry ?? '',
      destinationPortId: version.scenario.destinationPortId ?? null,
      termsHash: null,
      status: 'negotiation',
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
      createdBy: ctx.user.id,
      confirmedAt: null,
    };
    draft.operations.push(op);
    q.operationId = op.id;
    const docs = generateOperationDocuments(draft, ctx, op, version.scenario);
    trace(draft, ctx, {
      type: 'operation_created',
      title: `Expediente ${op.code} abierto en negociación`,
      detail: `${docs.length} documentos en el checklist; sin stock comprometido hasta la aceptación`,
      operationId: op.id,
      entity: { kind: 'operation', id: op.id },
      shared: false,
    });
    audit(draft, ctx, 'operation', op.id, 'create', `Expediente ${op.code} creado en negociación para ${q.code}`);
    return op;
  });
}
