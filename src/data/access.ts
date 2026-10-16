import type { Role } from '@/domain/catalogs';
import type {
  BuyerRequest,
  CostScenario,
  Database,
  Lot,
  OperationDocument,
  Quotation,
  QuotationVersion,
  TraceEvent,
  TradeOperation,
  User,
} from './model';

export type Action =
  | 'product.manage'
  | 'lot.manage'
  | 'facility.manage'
  | 'request.manage'
  | 'scenario.manage'
  | 'quotation.manage'
  | 'quotation.respond'
  | 'operation.manage'
  | 'operation.view'
  | 'document.manage'
  | 'document.verify'
  | 'finance.view'
  | 'finance.manage'
  | 'verification.manage'
  | 'catalog.manage'
  | 'settings.manage'
  | 'blockchain.sign';

const ALL: Action[] = [
  'product.manage',
  'lot.manage',
  'facility.manage',
  'request.manage',
  'scenario.manage',
  'quotation.manage',
  'quotation.respond',
  'operation.manage',
  'operation.view',
  'document.manage',
  'document.verify',
  'finance.view',
  'finance.manage',
  'verification.manage',
  'catalog.manage',
  'settings.manage',
  'blockchain.sign',
];

export const ROLE_ACTIONS: Record<Role, Action[]> = {
  producer: [
    'product.manage',
    'lot.manage',
    'facility.manage',
    'scenario.manage',
    'quotation.manage',
    'operation.view',
    'document.manage',
    'blockchain.sign',
  ],
  exporter: [
    'product.manage',
    'facility.manage',
    'scenario.manage',
    'quotation.manage',
    'operation.manage',
    'operation.view',
    'document.manage',
    'document.verify',
    'finance.view',
    'finance.manage',
    'verification.manage',
    'catalog.manage',
    'blockchain.sign',
  ],
  buyer: ['request.manage', 'quotation.respond', 'operation.view', 'document.manage', 'blockchain.sign'],
  admin: ALL,
};

export class AccessDeniedError extends Error {
  constructor(message = 'No tenés permisos para esta acción.') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export function can(user: User, action: Action): boolean {
  return ROLE_ACTIONS[user.role].includes(action);
}

/** Verifica el permiso del rol y, si se indica, que el recurso pertenezca a su organización. */
export function assertCan(user: User, action: Action, organizationId?: string): void {
  if (!can(user, action)) throw new AccessDeniedError();
  if (organizationId && organizationId !== user.organizationId) {
    throw new AccessDeniedError('El recurso pertenece a otra organización.');
  }
}

export function isParticipant(user: User, op: Pick<TradeOperation, 'sellerOrganizationId' | 'buyerOrganizationId'>): boolean {
  return op.sellerOrganizationId === user.organizationId || op.buyerOrganizationId === user.organizationId;
}

export function canViewLot(user: User, lot: Lot): boolean {
  return lot.organizationId === user.organizationId || (lot.published && lot.status === 'active');
}

export function canViewRequest(user: User, request: BuyerRequest): boolean {
  if (request.buyerOrganizationId === user.organizationId) return true;
  if (request.status === 'draft' || request.status === 'cancelled') return false;
  return request.visibility === 'public' || request.invitedOrganizationIds.includes(user.organizationId);
}

export function canViewQuotation(user: User, q: Quotation): boolean {
  return q.sellerOrganizationId === user.organizationId || q.buyerOrganizationId === user.organizationId;
}

/** Costos, márgenes y escenario de una cotización: solo el vendedor con rol comercial. */
export function canViewQuotationCosts(user: User, q: Quotation): boolean {
  return q.sellerOrganizationId === user.organizationId && can(user, 'quotation.manage');
}

export function canViewScenario(user: User, s: CostScenario): boolean {
  return s.organizationId === user.organizationId && can(user, 'scenario.manage');
}

export function canViewOperation(user: User, op: TradeOperation): boolean {
  return isParticipant(user, op) && can(user, 'operation.view');
}

export function canViewFinance(user: User, op: TradeOperation): boolean {
  return op.sellerOrganizationId === user.organizationId && can(user, 'finance.view');
}

export function canViewDocument(user: User, doc: OperationDocument, op: TradeOperation): boolean {
  if (!isParticipant(user, op)) return false;
  if (doc.organizationId === user.organizationId) return !doc.isFinancial || can(user, 'finance.view');
  return doc.sharedWithCounterparty && !doc.isFinancial;
}

export function canViewTraceEvent(user: User, ev: TraceEvent, db: Database): boolean {
  if (ev.organizationId === user.organizationId) return true;
  if (!ev.shared) return false;
  if (!ev.operationId) return true;
  const op = db.operations.find((o) => o.id === ev.operationId);
  return Boolean(op && isParticipant(user, op));
}

export type BuyerVersionView = Omit<QuotationVersion, 'scenario' | 'costingInput' | 'result'> & {
  scenario: null;
  costingInput: null;
  result: null;
};

/** Vista de una versión para el comprador: términos y precio, sin costos ni márgenes del vendedor. */
export function redactVersion(version: QuotationVersion): BuyerVersionView {
  return { ...version, scenario: null, costingInput: null, result: null };
}
