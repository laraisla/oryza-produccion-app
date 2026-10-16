/**
 * Traduce la base demo de la app (modelo de documentos en `src/data/model.ts`) al esquema
 * relacional de `supabase/migrations`. Los datos son los mismos que usa el modo demo:
 * empresas, lotes, precios y documentos ficticios.
 */
import type { CostLineInput } from '@/domain/costing';
import type { Database } from '@/data/model';
import { sid } from '@/data/ids';

type Scalar = string | number | boolean | null | undefined;
interface Json {
  json: unknown;
}
interface SqlArray {
  array: string[];
  type: 'text' | 'uuid';
}
type Value = Scalar | Json | SqlArray;
type Row = Record<string, Value>;

const json = (value: unknown): Json => ({ json: value ?? null });
const uuids = (values: string[] | null | undefined): SqlArray => ({ array: values ?? [], type: 'uuid' });
const texts = (values: string[] | null | undefined): SqlArray => ({ array: values ?? [], type: 'text' });

function quote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function literal(value: Value): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Número no finito: ${value}`);
    return String(value);
  }
  if (typeof value === 'string') return quote(value);
  if ('json' in value) return `${quote(JSON.stringify(value.json))}::jsonb`;
  if (value.array.length === 0) return `'{}'::${value.type}[]`;
  return `array[${value.array.map(quote).join(', ')}]::${value.type}[]`;
}

function insert(table: string, rows: Row[], suffix = ''): string {
  if (rows.length === 0) return `-- ${table}: sin filas\n`;
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || keys.some((k, i) => k !== columns[i])) {
      throw new Error(`Columnas inconsistentes en ${table}`);
    }
  }
  const values = rows.map((row) => `  (${columns.map((c) => literal(row[c])).join(', ')})`).join(',\n');
  return `insert into ${table} (${columns.join(', ')}) values\n${values}${suffix};\n`;
}

/** Campos de una partida que no tienen columna propia (cantidad, tramos, bases, aplicabilidad). */
function lineDefinition(line: Partial<CostLineInput>): Record<string, unknown> {
  const definition: Record<string, unknown> = {};
  const keys = ['quantity', 'unitBasis', 'tonBasis', 'percentBase', 'customBaseAmount', 'freeDays', 'tiers', 'multiplyByContainers', 'appliesTo'] as const;
  for (const key of keys) {
    if (line[key] !== undefined && line[key] !== null) definition[key] = line[key];
  }
  return definition;
}

export function seedToSql(db: Database): string {
  const out: string[] = [];
  const catalogKeyById = new Map(db.costCatalog.map((c) => [c.id, c.key]));

  out.push(insert('public.organizations', db.organizations.map((o) => ({
    id: o.id, name: o.name, kinds: texts(o.kinds), country: o.country, province: o.province, city: o.city,
    tax_id: o.taxId, stellar_address: o.stellarAddress, is_demo: o.isDemo, created_at: o.createdAt,
  }))));

  // Usuarios mínimos de Auth (sin contraseña: no pueden iniciar sesión hasta crearlos en Supabase Auth con el mismo UUID).
  out.push(insert('auth.users', db.users.map((u) => ({ id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' })), '\non conflict (id) do nothing'));
  out.push(insert('public.profiles', db.users.map((u) => ({ id: u.id, name: u.name, email: u.email, is_demo: u.isDemo }))));
  out.push(insert('public.organization_members', db.users.map((u) => ({ organization_id: u.organizationId, user_id: u.id, role: u.role }))));

  out.push(insert('public.ports', db.ports.map((p) => ({ id: p.id, name: p.name, country: p.country, city: p.city, code: p.code, kind: p.kind }))));
  out.push(insert('public.container_types', db.containerTypes.map((c) => ({
    id: c.id, code: c.code, name: c.name, max_payload_kg: c.maxPayloadKg, operational_limit_kg: c.operationalLimitKg,
    usable_volume_m3: c.usableVolumeM3, max_pallets: c.maxPallets, source: c.source, verification_status: c.verificationStatus,
  }))));

  out.push(insert('public.facilities', db.facilities.map((f) => ({
    id: f.id, organization_id: f.organizationId, name: f.name, type: f.type, country: f.country, province: f.province,
    city: f.city, address: f.address, exit_port_id: f.exitPortId, distance_to_port_km: f.distanceToPortKm,
    distance_source: f.distanceSource, loading_conditions: f.loadingConditions, logistics_notes: f.logisticsNotes,
    created_at: f.createdAt, updated_at: f.updatedAt,
  }))));

  out.push(insert('public.products', db.products.map((p) => ({
    id: p.id, organization_id: p.organizationId, code: p.code, name: p.name, category: p.category,
    commercial_type: p.commercialType, variety: p.variety, processing: p.processing, ncm: p.ncm,
    ncm_description: p.ncmDescription, ncm_status: p.ncmStatus, ncm_source: p.ncmSource, description: p.description,
    convertible_to: json(p.convertibleTo), status: p.status, created_at: p.createdAt, updated_at: p.updatedAt, created_by: p.createdBy,
  }))));
  out.push(insert('public.product_presentations', db.products.flatMap((p) => p.presentations.map((pr) => ({
    id: pr.id, product_id: p.id, label: pr.label, packaging: pr.packaging, net_weight_kg: pr.netWeightKg,
    tare_weight_kg: pr.tareWeightKg, units_per_pallet: pr.unitsPerPallet, pallet_tare_kg: pr.palletTareKg,
    package_volume_m3: pr.packageVolumeM3,
  })))));

  out.push(insert('public.lots', db.lots.map((l) => ({
    id: l.id, organization_id: l.organizationId, product_id: l.productId, code: l.code, facility_id: l.facilityId,
    presentation_id: l.presentationId, physical_stock_t: l.physicalStockT, harvest: l.harvest, available_from: l.availableFrom,
    broken_pct: l.quality.brokenPct, moisture_pct: l.quality.moisturePct, impurities_pct: l.quality.impuritiesPct,
    other_quality: json(l.quality.other), analysis_date: l.quality.analysisDate, analyst: l.quality.analyst,
    document_ref: l.quality.documentRef, quality_status: l.quality.verificationStatus, quality_valid_until: l.quality.validUntil,
    certifications: json(l.certifications), published: l.published, status: l.status, notes: l.notes,
    created_at: l.createdAt, updated_at: l.updatedAt, created_by: l.createdBy,
  }))));

  out.push(insert('public.buyer_requests', db.requests.map((r) => ({
    id: r.id, code: r.code, buyer_organization_id: r.buyerOrganizationId, contact_name: r.contactName,
    contact_email: r.contactEmail, status: r.status, visibility: r.visibility, category: r.category,
    commercial_type: r.commercialType, variety_policy: r.varietyPolicy, variety: r.variety, processing: r.processing,
    max_broken_pct: r.maxBrokenPct, max_moisture_pct: r.maxMoisturePct, max_impurities_pct: r.maxImpuritiesPct,
    quantity_t: r.quantityT, packaging_type: r.packaging.type, packaging_net_weight_kg: r.packaging.netWeightKg,
    packaging_flexible: r.packagingFlexible, allow_consolidation: r.allowConsolidation,
    destination_country: r.destinationCountry, destination_city: r.destinationCity, destination_port_id: r.destinationPortId,
    final_address: r.finalAddress, availability_deadline: r.availabilityDeadline, delivery_date: r.deliveryDate,
    currency: r.currency, preferred_incoterm: r.preferredIncoterm, notes: r.notes,
    created_at: r.createdAt, updated_at: r.updatedAt, created_by: r.createdBy,
  }))));
  out.push(insert('public.request_invitations', db.requests.flatMap((r) => r.invitedOrganizationIds.map((org) => ({ request_id: r.id, organization_id: org })))));
  out.push(insert('public.request_requirements', db.requests.flatMap((r) => [
    ...r.requiredCertifications.map((name, i) => ({ id: sid(`rr-${r.id}-c${i}`), request_id: r.id, kind: 'certification', name, note: null as string | null })),
    ...r.buyerDocuments.map((d, i) => ({ id: sid(`rr-${r.id}-d${i}`), request_id: r.id, kind: 'buyer_document', name: d.name, note: d.note ?? null })),
  ])));

  out.push(insert('public.commercial_matches', db.matchSnapshots.map((m) => ({
    id: m.id, organization_id: m.organizationId, request_id: m.requestId, lot_id: m.result.lotId, status: m.result.status,
    checks: json({ checks: m.result.checks, failures: m.result.failures, conditions: m.result.conditions, rank: m.result.rank }),
    engine_version: m.result.engineVersion, evaluated_at: m.evaluatedAt, evaluated_by: m.evaluatedBy,
  }))));

  out.push(insert('public.cost_catalog', db.costCatalog.map((c) => ({
    id: c.id, organization_id: c.organizationId, key: c.key, name: c.name, stage: c.stage, point: c.point,
    provider: c.provider, amount: c.amount, currency: c.currency, unit: c.unit, definition: json(lineDefinition(c)),
    default_enabled: c.defaultEnabled, required: c.required ?? false, rate_date: c.rateDate, valid_until: c.validUntil,
    source: c.source, source_url: c.sourceUrl, verification_status: c.verificationStatus,
    may_be_included_in: texts(c.mayBeIncludedIn), notes: c.notes, updated_at: c.updatedAt,
  }))));
  out.push(insert('public.fx_rates', db.fxRates.map((r) => ({
    id: r.id, organization_id: r.organizationId, base: r.base, quote: r.quote, rate: r.rate, date: r.date,
    source: r.source, source_url: r.sourceUrl, status: r.status, created_at: r.createdAt,
  }))));

  out.push(insert('public.cost_scenarios', db.scenarios.map((s) => ({
    id: s.id, organization_id: s.organizationId, name: s.name, status: s.status, wizard_step: s.wizardStep,
    request_id: s.requestId, buyer_organization_id: s.buyerOrganizationId, product_id: s.productId,
    presentation_id: s.presentationId, quantity_t: s.quantityT || '0', packaging_decision: s.packagingDecision,
    origin_facility_id: s.originFacilityId, exit_port_id: s.exitPortId, destination_country: s.destinationCountry,
    destination_city: s.destinationCity, destination_port_id: s.destinationPortId, container_type_id: s.containerTypeId,
    containers_override: s.containersOverride, commercial: json(s.commercial), pricing: json(s.pricing),
    rounding: json(s.rounding), financing: json(s.financing), customs: json(s.customs), finance: json(s.finance),
    fx_rate_ids: uuids(s.fxRateIds), quotation_id: s.quotationId, notes: s.notes,
    created_at: s.createdAt, updated_at: s.updatedAt, created_by: s.createdBy,
  }))));
  out.push(insert('public.scenario_lots', db.scenarios.flatMap((s) => s.lots.map((l) => ({ scenario_id: s.id, lot_id: l.lotId, quantity_t: l.quantityT })))));
  out.push(insert('public.scenario_cost_lines', db.scenarios.flatMap((s) => s.lines.map((line, position) => ({
    id: line.id, scenario_id: s.id, position, catalog_key: line.catalogId ? (catalogKeyById.get(line.catalogId) ?? null) : null,
    name: line.name, stage: line.stage, point: line.point, amount: line.amount, currency: line.currency, unit: line.unit,
    definition: json({ ...lineDefinition(line), ...(line.mayBeIncludedIn?.length ? { mayBeIncludedIn: line.mayBeIncludedIn } : {}), ...(line.provider ? { provider: line.provider } : {}), ...(line.notes ? { notes: line.notes } : {}) }),
    payer_override: line.payerOverride, override_note: line.overrideNote, included_in_line_id: line.includedInLineId,
    enabled: line.enabled, required: line.required ?? false, rate_date: line.rateDate, valid_until: line.validUntil,
    source: line.source, source_url: line.sourceUrl, verification_status: line.verificationStatus,
  })))));

  out.push(insert('public.quotations', db.quotations.map((q) => ({
    id: q.id, code: q.code, seller_organization_id: q.sellerOrganizationId, buyer_organization_id: q.buyerOrganizationId,
    request_id: q.requestId, scenario_id: q.scenarioId, product_id: q.productId, operation_id: q.operationId,
    status: q.status, current_version_id: q.currentVersionId, accepted_version_id: q.acceptedVersionId,
    created_at: q.createdAt, updated_at: q.updatedAt, created_by: q.createdBy,
  }))));
  const sellerOf = new Map(db.quotations.map((q) => [q.id, q.sellerOrganizationId]));
  out.push(insert('public.quotation_versions', db.quotationVersions.map((v) => ({
    id: v.id, quotation_id: v.quotationId, version: v.version, status: v.status, price_per_t: v.pricePerT,
    total_amount: v.totalAmount, currency: v.currency, quantity_t: v.quantityT, incoterm: v.incoterm,
    named_place: v.namedPlace, valid_until: v.validUntil, terms: json(v.terms), terms_hash: v.termsHash,
    change_note: v.changeNote, created_at: v.createdAt, created_by: v.createdBy, sent_at: v.sentAt,
    accepted_at: v.acceptedAt, accepted_by: v.acceptedBy, rejected_at: v.rejectedAt, rejected_by: v.rejectedBy,
    rejection_reason: v.rejectionReason,
  }))));
  out.push(insert('public.quotation_version_costing', db.quotationVersions.map((v) => ({
    version_id: v.id, seller_organization_id: sellerOf.get(v.quotationId), scenario: json(v.scenario),
    costing_input: json(v.costingInput), result: json(v.result), engine_version: v.result.engineVersion,
  }))));
  out.push(insert('public.quotation_items', db.quotationVersions.flatMap((v) => v.result.lines.map((line) => ({
    id: sid(`qi-${v.id}-${line.id}`), version_id: v.id, seller_organization_id: sellerOf.get(v.quotationId),
    line_key: line.id, name: line.name, stage: line.stage, point: line.point, amount: line.amount, payer: line.payer,
    payer_source: line.payerSource, explanation: line.explanation, included: line.included,
    exclusion_reason: line.exclusionReason ?? null, effective_status: line.effectiveStatus, source: line.source,
  })))));

  out.push(insert('public.trade_operations', db.operations.map((o) => ({
    id: o.id, code: o.code, seller_organization_id: o.sellerOrganizationId, buyer_organization_id: o.buyerOrganizationId,
    quotation_id: o.quotationId, accepted_version_id: o.acceptedVersionId, request_id: o.requestId, product_id: o.productId,
    quantity_t: o.quantityT, price_per_t: o.pricePerT, total_amount: o.totalAmount, currency: o.currency,
    incoterm: o.incoterm, named_place: o.namedPlace, payment_method: o.paymentMethod, payment_terms: o.paymentTerms,
    shipment_date: o.shipmentDate, destination_country: o.destinationCountry, destination_port_id: o.destinationPortId,
    terms_hash: o.termsHash, status: o.status, created_at: o.createdAt, updated_at: o.updatedAt, created_by: o.createdBy,
    confirmed_at: o.confirmedAt,
  }))));
  out.push(insert('public.operation_lots', db.operations.flatMap((o) => o.lots.map((l) => ({ operation_id: o.id, lot_id: l.lotId, quantity_t: l.quantityT })))));

  // Movimientos después de las operaciones: el control de stock se evalúa al confirmar la transacción.
  out.push(insert('public.inventory_movements', db.inventoryMovements.map((m) => ({
    id: m.id, organization_id: m.organizationId, lot_id: m.lotId, type: m.type, quantity_t: m.quantityT,
    converts_reservation: m.convertsReservation ?? false, reference_kind: m.reference.kind, reference_id: m.reference.id,
    note: m.note, created_at: m.createdAt, created_by: m.createdBy,
  }))));

  out.push(insert('public.shipments', db.shipments.map((s) => ({
    id: s.id, operation_id: s.operationId, organization_id: s.organizationId, status: s.status,
    container_type_id: s.containerTypeId, vessel: s.vessel, voyage: s.voyage, booking_number: s.bookingNumber,
    bl_number: s.blNumber, export_permit_number: s.exportPermitNumber, port_of_loading_id: s.portOfLoadingId,
    port_of_discharge_id: s.portOfDischargeId, planned_date: s.plannedDate, dispatched_at: s.dispatchedAt,
    shipped_at: s.shippedAt, received_at: s.receivedAt, shipped_quantity_t: s.shippedQuantityT, packages: s.packages,
    gross_weight_kg: s.grossWeightKg, notes: s.notes, created_at: s.createdAt, updated_at: s.updatedAt,
  }))));
  out.push(insert('public.shipment_containers', db.shipments.flatMap((s) => s.containers.map((c) => ({
    id: sid(`sc-${s.id}-${c.number}`), shipment_id: s.id, number: c.number, seal: c.seal, gross_kg: c.grossKg, vgm_kg: c.vgmKg,
  })))));

  out.push(insert('public.destination_requirements', db.requirements.map((r) => ({
    id: r.id, country: r.country, ncm_prefix: r.ncmPrefix, processing: r.processing ? texts(r.processing) : null,
    transport_modes: r.transportModes ? texts(r.transportModes) : null, payment_methods: r.paymentMethods ? texts(r.paymentMethods) : null,
    buyer_organization_id: r.buyerOrganizationId, category: r.category, document_type: r.documentType, name: r.name,
    description: r.description, issuer: r.issuer, responsible_party: r.responsibleParty, required_if: r.requiredIf,
    source_name: r.sourceName, source_url: r.sourceUrl, verified_at: r.verifiedAt, verification_status: r.verificationStatus,
    due_days_before_shipment: r.dueDaysBeforeShipment,
  }))));
  out.push(insert('public.operation_documents', db.documents.map((d) => ({
    id: d.id, operation_id: d.operationId, organization_id: d.organizationId, requirement_id: d.requirementId,
    document_type: d.documentType, name: d.name, responsible_party: d.responsibleParty, status: d.status,
    due_date: d.dueDate, issuer: d.issuer, current_version: d.currentVersion, requirement_source: d.requirementSource,
    requirement_status: d.requirementStatus, notes: d.notes, observation: d.observation,
    shared_with_counterparty: d.sharedWithCounterparty, is_financial: d.isFinancial, created_at: d.createdAt, updated_at: d.updatedAt,
  }))));
  out.push(insert('public.document_versions', db.documentVersions.map((v) => ({
    id: v.id, document_id: v.documentId, version: v.version, file_name: v.fileName, mime_type: v.mimeType,
    size_bytes: v.sizeBytes, sha256: v.sha256, storage_path: v.storageKey, demo_content: v.demoContent,
    uploaded_at: v.uploadedAt, uploaded_by: v.uploadedBy, note: v.note,
  }))));

  out.push(insert('public.invoices', db.invoices.map((i) => ({
    id: i.id, operation_id: i.operationId, organization_id: i.organizationId, number: i.number, issue_date: i.issueDate,
    currency: i.currency, amount: i.amount, quantity_t: i.quantityT, export_permit_number: i.exportPermitNumber,
    created_at: i.createdAt, created_by: i.createdBy,
  }))));
  out.push(insert('public.payments', db.payments.map((p) => ({
    id: p.id, operation_id: p.operationId, organization_id: p.organizationId, reference: p.reference,
    received_date: p.receivedDate, currency: p.currency, gross_amount: p.grossAmount, foreign_bank_fees: p.foreignBankFees,
    local_bank_fees: p.localBankFees, other_deductions: p.otherDeductions, net_amount: p.netAmount, is_advance: p.isAdvance,
    bank_name: p.bankName, bank_report_status: p.bankReportStatus, evidence_document_ids: uuids(p.evidenceDocumentIds),
    record_kind: p.recordKind, notes: p.notes, created_at: p.createdAt, created_by: p.createdBy,
  }))));
  out.push(insert('public.payment_allocations', db.paymentAllocations.map((a) => ({ id: a.id, payment_id: a.paymentId, invoice_id: a.invoiceId, amount: a.amount }))));
  out.push(insert('public.financial_reconciliations', db.reconciliations.map((r) => ({
    id: r.id, operation_id: r.operationId, organization_id: r.organizationId, status: r.status,
    last_result: r.lastResult ? json(r.lastResult) : null, operator_note: r.operatorNote, reconciled_by: r.reconciledBy,
    reconciled_at: r.reconciledAt, updated_at: r.updatedAt,
  }))));

  out.push(insert('public.verification_records', db.verifications.map((v) => ({
    id: v.id, organization_id: v.organizationId, subject_kind: v.subject.kind, subject_id: v.subject.id,
    subject_field: v.subject.field, data_label: v.dataLabel, value: v.value, unit: v.unit, source: v.source,
    evidence_url: v.evidenceUrl, evidence_document_id: v.evidenceDocumentId, consulted_at: v.consultedAt,
    valid_until: v.validUntil, responsible: v.responsible, status: v.status, notes: v.notes,
  }))));
  out.push(insert('public.verification_history', db.verifications.flatMap((v) => v.history.map((h, i) => ({
    id: sid(`vh-${v.id}-${i}`), record_id: v.id, at: h.at, by_user: h.by, from_status: h.from, to_status: h.to,
    value: h.value ?? null, note: h.note ?? null,
  })))));
  out.push(insert('public.traceability_events', db.traceEvents.map((e) => ({
    id: e.id, at: e.at, actor_user_id: e.actorUserId, organization_id: e.organizationId, type: e.type, title: e.title,
    detail: e.detail, operation_id: e.operationId, lot_ids: uuids(e.lotIds), entity_kind: e.entity.kind,
    entity_id: e.entity.id, shared: e.shared,
  }))));
  // Solo registros confirmados por la red; el seed demo no trae ninguno (no se inventan transacciones).
  out.push(insert('public.blockchain_records', db.blockchainRecords.map((b) => ({
    id: b.id, operation_id: b.operationId, network: b.network, contract_id: b.contractId, action: b.action,
    deal_key: b.dealKey, terms_hash: b.termsHash, terms_version: b.termsVersion, tx_hash: b.txHash, ledger: b.ledger,
    confirmed_at: b.confirmedAt, signer: b.signer, status: b.status, created_by: b.createdBy,
  }))));
  out.push(insert('public.audit_logs', db.auditLog.map((a) => ({
    id: a.id, at: a.at, actor_user_id: a.actorUserId, organization_id: a.organizationId, entity: a.entity,
    entity_id: a.entityId, action: a.action, summary: a.summary, changes: a.changes ? json(a.changes) : null,
  }))));
  out.push(insert('public.app_settings', db.organizations.map((o) => ({
    organization_id: o.id, rounding: json(db.settings.rounding), stellar: json(db.settings.stellar),
  }))));

  return [
    '-- AgroMatch COMEX — datos de demostración (generado por scripts/db/export-seed.ts; no editar a mano).',
    `-- Seed ${db.seedVersion}. TODO es ficticio: empresas, lotes, precios, tarifas, documentos y cobros.`,
    '-- Sin registros blockchain: solo se guardan transacciones confirmadas por la red.',
    'begin;',
    ...out,
    'commit;',
    '',
  ].join('\n');
}
