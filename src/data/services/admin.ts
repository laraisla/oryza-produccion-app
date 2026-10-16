import { VERIFICATION_STATUS, type VerificationStatus } from '@/domain/catalogs';
import { dec, isDecimalString, toPlain } from '@/domain/decimal';
import { validateVerificationChange } from '@/domain/verification';
import { assertCan } from '../access';
import type { AppSettings, CostCatalogItem, Database, FxRate, VerificationRecord } from '../model';
import { fxRateSchema, parse, type FxRateInput } from '../schemas';
import { audit, find, mutate, ValidationError, type ServiceContext } from './context';

export interface VerificationChangeInput {
  to: VerificationStatus;
  source: string;
  evidenceUrl?: string | null;
  evidenceDocumentId?: string | null;
  responsible: string;
  validUntil?: string | null;
  value?: string | null;
  note?: string | null;
}

/** Aplica el estado verificado al dato concreto que respalda el registro. */
function propagate(draft: Database, record: VerificationRecord) {
  const { kind, id, field } = record.subject;
  switch (kind) {
    case 'cost_catalog': {
      const item = draft.costCatalog.find((c) => c.id === id);
      if (item) {
        item.verificationStatus = record.status;
        item.source = record.source;
        item.sourceUrl = record.evidenceUrl ?? item.sourceUrl;
        item.validUntil = record.validUntil ?? null;
        item.rateDate = record.consultedAt;
        if (record.value && isDecimalString(record.value)) item.amount = toPlain(dec(record.value));
      }
      break;
    }
    case 'fx_rate': {
      const rate = draft.fxRates.find((r) => r.id === id);
      if (rate) rate.status = record.status;
      break;
    }
    case 'requirement': {
      const req = draft.requirements.find((r) => r.id === id);
      if (req) {
        req.verificationStatus = record.status;
        req.verifiedAt = record.status === 'verified' ? record.consultedAt : req.verifiedAt;
        req.sourceUrl = record.evidenceUrl ?? req.sourceUrl;
      }
      for (const doc of draft.documents.filter((d) => d.requirementId === id)) doc.requirementStatus = record.status;
      break;
    }
    case 'lot_quality': {
      const lot = draft.lots.find((l) => l.id === id);
      if (lot) {
        lot.quality.verificationStatus = record.status;
        lot.quality.validUntil = record.validUntil ?? lot.quality.validUntil;
      }
      break;
    }
    case 'product_ncm': {
      const product = draft.products.find((p) => p.id === id);
      if (product) {
        product.ncmStatus = record.status;
        product.ncmSource = record.source;
      }
      break;
    }
    case 'container_type': {
      const container = draft.containerTypes.find((c) => c.id === id);
      if (container) {
        container.verificationStatus = record.status;
        container.source = record.source;
        if (field && record.value && isDecimalString(record.value) && (field === 'operationalLimitKg' || field === 'maxPayloadKg')) {
          container[field] = toPlain(dec(record.value));
        }
      }
      break;
    }
    default:
      break;
  }
}

export function changeVerification(db: Database, ctx: ServiceContext, recordId: string, change: VerificationChangeInput) {
  const record = find(db.verifications, recordId, 'Registro de verificación');
  assertCan(ctx.user, 'verification.manage', record.organizationId);
  if (record.subject.kind === 'blockchain') {
    throw new ValidationError('Las confirmaciones blockchain solo se verifican consultando la red.');
  }
  const errors = validateVerificationChange({
    to: change.to,
    source: change.source,
    evidence: change.evidenceUrl || change.evidenceDocumentId,
    responsible: change.responsible,
    validUntil: change.validUntil,
  });
  if (change.value && !isDecimalString(change.value) && record.unit !== 'texto') {
    errors.push('El valor debe ser numérico (punto decimal).');
  }
  if (errors.length) throw new ValidationError(errors[0], errors);
  return mutate(db, (draft) => {
    const r = find(draft.verifications, recordId, 'Registro de verificación');
    r.history.push({
      at: ctx.now(),
      by: ctx.user.id,
      from: r.status,
      to: change.to,
      value: change.value ?? r.value,
      note: change.note ?? null,
    });
    r.status = change.to;
    r.source = change.source.trim() || r.source;
    r.evidenceUrl = change.evidenceUrl || null;
    r.evidenceDocumentId = change.evidenceDocumentId ?? null;
    r.responsible = change.responsible.trim();
    r.validUntil = change.validUntil || null;
    r.consultedAt = ctx.today();
    if (change.value) r.value = change.value;
    if (change.note) r.notes = change.note;
    propagate(draft, r);
    audit(draft, ctx, 'verification', r.id, 'status', `${r.dataLabel}: ${VERIFICATION_STATUS[r.history.at(-1)!.from]} → ${VERIFICATION_STATUS[r.status]}`);
    return r;
  });
}

export function createVerificationRecord(
  db: Database,
  ctx: ServiceContext,
  input: Omit<VerificationRecord, 'id' | 'organizationId' | 'history'>,
) {
  assertCan(ctx.user, 'verification.manage');
  if (!input.dataLabel.trim()) throw new ValidationError('Indicar el dato a verificar.');
  if (input.status === 'verified' && !(input.evidenceUrl || input.evidenceDocumentId)) {
    throw new ValidationError('Un registro verificado requiere URL o documento de respaldo.');
  }
  return mutate(db, (draft) => {
    const record: VerificationRecord = {
      ...input,
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      history: [{ at: ctx.now(), by: ctx.user.id, from: 'pending', to: input.status, value: input.value, note: 'Alta del registro' }],
    };
    draft.verifications.push(record);
    audit(draft, ctx, 'verification', record.id, 'create', `Registro de verificación: ${record.dataLabel}`);
    return record;
  });
}

export function addFxRate(db: Database, ctx: ServiceContext, raw: FxRateInput) {
  assertCan(ctx.user, 'catalog.manage');
  const input = parse(fxRateSchema, raw);
  if (input.base === input.quote) throw new ValidationError('Las monedas deben ser distintas.');
  return mutate(db, (draft) => {
    const rate: FxRate = {
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      base: input.base,
      quote: input.quote,
      rate: toPlain(dec(input.rate)),
      date: input.date,
      source: input.source,
      sourceUrl: input.sourceUrl || null,
      status: input.status === 'verified' && !input.sourceUrl ? 'estimated' : input.status,
      createdAt: ctx.now(),
    };
    draft.fxRates.push(rate);
    draft.verifications.push({
      id: ctx.newId(),
      organizationId: ctx.user.organizationId,
      subject: { kind: 'fx_rate', id: rate.id, field: 'rate' },
      dataLabel: `Tipo de cambio ${rate.base}/${rate.quote}`,
      value: rate.rate,
      unit: `${rate.quote} por ${rate.base}`,
      source: rate.source,
      evidenceUrl: rate.sourceUrl,
      consultedAt: rate.date,
      validUntil: null,
      responsible: ctx.user.name,
      status: rate.status,
      history: [{ at: ctx.now(), by: ctx.user.id, from: 'pending', to: rate.status, value: rate.rate, note: 'Alta del tipo de cambio' }],
    });
    audit(draft, ctx, 'fx_rate', rate.id, 'create', `Tipo de cambio ${rate.base}/${rate.quote} = ${rate.rate} (${rate.source})`);
    return rate;
  });
}

export function updateCatalogItem(
  db: Database,
  ctx: ServiceContext,
  itemId: string,
  patch: Partial<Pick<CostCatalogItem, 'amount' | 'currency' | 'provider' | 'source' | 'sourceUrl' | 'validUntil' | 'rateDate' | 'notes' | 'defaultEnabled'>>,
) {
  const item = find(db.costCatalog, itemId, 'Concepto de costo');
  assertCan(ctx.user, 'catalog.manage', item.organizationId);
  if (patch.amount !== undefined && !isDecimalString(patch.amount)) throw new ValidationError('Importe inválido.');
  return mutate(db, (draft) => {
    const c = find(draft.costCatalog, itemId, 'Concepto de costo');
    const before = { amount: c.amount, source: c.source };
    Object.assign(c, patch, { updatedAt: ctx.now() });
    // Cambiar el importe sin pasar por Verificación degrada el dato a estimado.
    if (patch.amount !== undefined && patch.amount !== before.amount && c.verificationStatus === 'verified') {
      c.verificationStatus = 'estimated';
    }
    audit(draft, ctx, 'cost_catalog', c.id, 'update', `Concepto "${c.name}" actualizado`, [
      { field: 'amount', before: before.amount, after: c.amount },
    ]);
    return c;
  });
}

export function updateSettings(db: Database, ctx: ServiceContext, patch: Partial<AppSettings>) {
  assertCan(ctx.user, 'settings.manage');
  if (patch.stellar?.contractId && !/^C[A-Z2-7]{55}$/.test(patch.stellar.contractId)) {
    throw new ValidationError('El ID de contrato Stellar debe comenzar con C y tener 56 caracteres.');
  }
  return mutate(db, (draft) => {
    draft.settings = { ...draft.settings, ...structuredClone(patch) };
    audit(draft, ctx, 'settings', 'settings', 'update', 'Configuración actualizada');
    return draft.settings;
  });
}

export function setStellarAddress(db: Database, ctx: ServiceContext, address: string | null) {
  const trimmed = address?.trim() || null;
  if (trimmed && !/^G[A-Z2-7]{55}$/.test(trimmed)) {
    throw new ValidationError('La dirección pública Stellar debe comenzar con G y tener 56 caracteres.');
  }
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'exporter' && ctx.user.role !== 'buyer') {
    throw new ValidationError('Solo administradores, responsables COMEX o compradores pueden configurar la cuenta Stellar.');
  }
  return mutate(db, (draft) => {
    const org = find(draft.organizations, ctx.user.organizationId, 'Organización');
    org.stellarAddress = trimmed;
    audit(draft, ctx, 'organization', org.id, 'stellar_address', `Cuenta Stellar ${trimmed ? `configurada: ${trimmed}` : 'eliminada'}`);
    return org;
  });
}
