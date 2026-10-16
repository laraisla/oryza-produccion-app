import type {
  DocumentStatus,
  DocumentType,
  Party,
  PaymentMethod,
  Processing,
  RequirementCategory,
  TransportMode,
  VerificationStatus,
} from './catalogs';

export const DOCUMENTS_DISCLAIMER =
  'Cargar o marcar documentos no equivale a una autorización oficial de exportación ni reemplaza la intervención del despachante, SENASA, la Aduana o el banco.';

export interface RequirementRuleLike {
  id: string;
  /** País de destino (ISO-2) o "*" para cualquier destino. */
  country: string;
  ncmPrefix?: string | null;
  processing?: Processing[] | null;
  transportModes?: TransportMode[] | null;
  paymentMethods?: PaymentMethod[] | null;
  buyerOrganizationId?: string | null;
  category: RequirementCategory;
  documentType: DocumentType;
  name: string;
  responsibleParty: Party | 'forwarder' | 'customs_broker' | 'bank' | 'laboratory';
  verificationStatus: VerificationStatus;
}

export interface RequirementContext {
  country: string;
  ncm?: string | null;
  processing: Processing;
  transportMode: TransportMode;
  paymentMethod?: PaymentMethod | null;
  buyerOrganizationId: string;
}

export function applicableRequirements<T extends RequirementRuleLike>(rules: T[], ctx: RequirementContext): T[] {
  return rules.filter((rule) => {
    if (rule.country !== '*' && rule.country !== ctx.country) return false;
    if (rule.buyerOrganizationId && rule.buyerOrganizationId !== ctx.buyerOrganizationId) return false;
    if (rule.ncmPrefix && !(ctx.ncm ?? '').replace(/\D/g, '').startsWith(rule.ncmPrefix.replace(/\D/g, ''))) return false;
    if (rule.processing?.length && !rule.processing.includes(ctx.processing)) return false;
    if (rule.transportModes?.length && !rule.transportModes.includes(ctx.transportMode)) return false;
    if (rule.paymentMethods?.length && (!ctx.paymentMethod || !rule.paymentMethods.includes(ctx.paymentMethod))) return false;
    return true;
  });
}

const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  pending: ['in_preparation', 'submitted', 'not_applicable'],
  in_preparation: ['pending', 'submitted', 'not_applicable'],
  submitted: ['verified', 'observed', 'in_preparation'],
  observed: ['in_preparation', 'submitted'],
  verified: ['observed'],
  not_applicable: ['pending'],
};

export function allowedTransitions(from: DocumentStatus): DocumentStatus[] {
  return TRANSITIONS[from];
}

export function validateDocumentTransition(
  from: DocumentStatus,
  to: DocumentStatus,
  ctx: { hasFile: boolean; note?: string | null },
): string | null {
  if (!TRANSITIONS[from].includes(to)) return `No se puede pasar de "${from}" a "${to}".`;
  if ((to === 'submitted' || to === 'verified') && !ctx.hasFile) {
    return 'Adjuntar el archivo del documento antes de marcarlo como presentado o verificado.';
  }
  if ((to === 'not_applicable' || to === 'observed') && !ctx.note?.trim()) {
    return to === 'observed' ? 'Indicar la observación.' : 'Justificar por qué no aplica.';
  }
  return null;
}

export interface DocumentProgress {
  total: number;
  applicable: number;
  verified: number;
  submitted: number;
  inPreparation: number;
  pending: number;
  observed: number;
  /** Avance: verificados + presentados (ponderado 0,5) sobre aplicables. */
  pct: number;
}

export function documentProgress(docs: { status: DocumentStatus }[]): DocumentProgress {
  const count = (s: DocumentStatus) => docs.filter((d) => d.status === s).length;
  const applicable = docs.filter((d) => d.status !== 'not_applicable').length;
  const verified = count('verified');
  const submitted = count('submitted');
  const pct = applicable === 0 ? 0 : Math.round(((verified + submitted * 0.5) / applicable) * 100);
  return {
    total: docs.length,
    applicable,
    verified,
    submitted,
    inPreparation: count('in_preparation'),
    pending: count('pending'),
    observed: count('observed'),
    pct,
  };
}
