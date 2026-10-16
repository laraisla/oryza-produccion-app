import { PACKAGING_TYPES, PROCESSING, RICE_TYPES } from '@/domain/catalogs';
import { fmtNum } from '@/domain/format';
import { daysUntil, effectiveStatus, expiryAlerts } from '@/domain/verification';
import {
  can,
  canViewDocument,
  canViewFinance,
  canViewLot,
  canViewOperation,
  canViewQuotation,
  canViewQuotationCosts,
  canViewRequest,
  canViewScenario,
  canViewTraceEvent,
  redactVersion,
  type BuyerVersionView,
} from './access';
import { byId } from './derive';
import type { Database, Lot, Presentation, Product, QuotationVersion, TraceEvent, User } from './model';

export function orgName(db: Database, id: string | null | undefined): string {
  return byId(db.organizations, id)?.name ?? '—';
}

export function userName(db: Database, id: string | null | undefined): string {
  return byId(db.users, id)?.name ?? 'Sistema';
}

export function portName(db: Database, id: string | null | undefined): string {
  const port = byId(db.ports, id);
  return port ? `${port.name}${port.code ? ` (${port.code})` : ''}` : '—';
}

export function productLabel(product: Product | undefined): string {
  if (!product) return '—';
  return `${product.name} · ${RICE_TYPES[product.commercialType]} · ${PROCESSING[product.processing]}`;
}

export function presentationLabel(p: Presentation | undefined): string {
  if (!p) return '—';
  return p.packaging === 'bulk' ? PACKAGING_TYPES.bulk : `${PACKAGING_TYPES[p.packaging]} ${fmtNum(p.netWeightKg)} kg`;
}

export const COUNTRY_NAMES: Record<string, string> = {
  AR: 'Argentina',
  PE: 'Perú',
  IL: 'Israel',
  CL: 'Chile',
  BR: 'Brasil',
  UY: 'Uruguay',
  PY: 'Paraguay',
  BO: 'Bolivia',
  CO: 'Colombia',
  MX: 'México',
  ES: 'España',
  SN: 'Senegal',
  IQ: 'Irak',
  '*': 'Todo destino',
};

export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  return COUNTRY_NAMES[code] ?? code;
}

export function visibleLots(db: Database, user: User): Lot[] {
  return db.lots.filter((l) => canViewLot(user, l));
}

export function ownLots(db: Database, user: User): Lot[] {
  return db.lots.filter((l) => l.organizationId === user.organizationId);
}

export function visibleRequests(db: Database, user: User) {
  return db.requests.filter((r) => canViewRequest(user, r));
}

export function visibleQuotations(db: Database, user: User) {
  return db.quotations.filter((q) => {
    if (!canViewQuotation(user, q)) return false;
    if (q.sellerOrganizationId === user.organizationId) return can(user, 'quotation.manage') || can(user, 'operation.view');
    // El comprador solo ve cotizaciones con al menos una versión enviada.
    return db.quotationVersions.some((v) => v.quotationId === q.id && v.status !== 'draft');
  });
}

export type VersionView = QuotationVersion | BuyerVersionView;

export function visibleVersions(db: Database, user: User, quotationId: string): VersionView[] {
  const quotation = byId(db.quotations, quotationId);
  if (!quotation || !canViewQuotation(user, quotation)) return [];
  const versions = db.quotationVersions.filter((v) => v.quotationId === quotationId).sort((a, b) => a.version - b.version);
  if (canViewQuotationCosts(user, quotation)) return versions;
  return versions.filter((v) => v.status !== 'draft').map(redactVersion);
}

export function hasCosts(version: VersionView): version is QuotationVersion {
  return version.result !== null;
}

export function visibleOperations(db: Database, user: User) {
  return db.operations.filter((o) => canViewOperation(user, o));
}

export function visibleDocuments(db: Database, user: User, operationId: string) {
  const op = byId(db.operations, operationId);
  if (!op) return [];
  return db.documents.filter((d) => d.operationId === operationId && canViewDocument(user, d, op));
}

export function visibleScenarios(db: Database, user: User) {
  return db.scenarios.filter((s) => canViewScenario(user, s) && s.status !== 'archived');
}

export function visibleTraceEvents(db: Database, user: User, filter?: (e: TraceEvent) => boolean): TraceEvent[] {
  return db.traceEvents
    .filter((e) => canViewTraceEvent(user, e, db) && (!filter || filter(e)))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function financeVisible(db: Database, user: User, operationId: string): boolean {
  const op = byId(db.operations, operationId);
  return Boolean(op && canViewFinance(user, op));
}

export interface DashboardAlert {
  id: string;
  level: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  link?: string;
}

/** Alertas accionables según lo que el usuario puede ver. */
export function dashboardAlerts(db: Database, user: User, asOf: string): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const isSellerSide = can(user, 'quotation.manage');

  if (isSellerSide) {
    // Tarifas vencidas usadas en escenarios activos o cotizaciones enviadas.
    const usedKeys = new Map<string, string[]>();
    for (const s of visibleScenarios(db, user)) {
      for (const l of s.lines.filter((x) => x.enabled && x.catalogId)) {
        usedKeys.set(l.catalogId!, [...(usedKeys.get(l.catalogId!) ?? []), s.name]);
      }
    }
    for (const item of db.costCatalog.filter((c) => c.organizationId === user.organizationId)) {
      const status = effectiveStatus({ status: item.verificationStatus, validUntil: item.validUntil }, asOf);
      const usedIn = usedKeys.get(item.key);
      if (status === 'expired' && usedIn?.length) {
        alerts.push({
          id: `rate-${item.id}`,
          level: 'warning',
          title: `Tarifa vencida en uso: ${item.name}`,
          detail: `Venció el ${item.validUntil}; se usa en ${usedIn.length} escenario(s). Actualizarla en Verificación.`,
          link: '/verificacion',
        });
      }
    }
    for (const q of visibleQuotations(db, user).filter((x) => x.sellerOrganizationId === user.organizationId && x.status === 'sent')) {
      const v = byId(db.quotationVersions, q.currentVersionId);
      if (!v) continue;
      const days = daysUntil(v.validUntil, asOf);
      if (days < 0) {
        alerts.push({ id: `qexp-${q.id}`, level: 'warning', title: `Cotización ${q.code} vencida`, detail: `Venció el ${v.validUntil} sin respuesta del comprador.`, link: `/cotizaciones/${q.id}` });
      } else if (days <= 3) {
        alerts.push({ id: `qsoon-${q.id}`, level: 'info', title: `Cotización ${q.code} vence pronto`, detail: `Vigente hasta el ${v.validUntil}.`, link: `/cotizaciones/${q.id}` });
      }
    }
  }

  for (const op of visibleOperations(db, user)) {
    if (op.status === 'cancelled' || op.status === 'closed') continue;
    const docs = db.documents.filter((d) => d.operationId === op.id && canViewDocument(user, d, op));
    const overdue = docs.filter((d) => d.dueDate && d.dueDate < asOf && !['verified', 'not_applicable', 'submitted'].includes(d.status));
    if (overdue.length) {
      alerts.push({
        id: `docs-${op.id}`,
        level: 'warning',
        title: `${op.code}: ${overdue.length} documento(s) vencido(s)`,
        detail: overdue.map((d) => d.name).slice(0, 3).join(' · '),
        link: `/operaciones/${op.id}?tab=documentos`,
      });
    }
    const observed = docs.filter((d) => d.status === 'observed');
    if (observed.length) {
      alerts.push({ id: `obs-${op.id}`, level: 'warning', title: `${op.code}: documentos observados`, detail: observed.map((d) => d.name).join(' · '), link: `/operaciones/${op.id}?tab=documentos` });
    }
    if (canViewFinance(user, op)) {
      const rec = db.reconciliations.find((r) => r.operationId === op.id);
      if (rec?.status === 'difference_to_review') {
        const pending = rec.lastResult?.differences.filter((d) => d.status === 'needs_evidence' || d.status === 'to_review') ?? [];
        alerts.push({
          id: `rec-${op.id}`,
          level: 'warning',
          title: `${op.code}: diferencia de cobro a revisar`,
          detail: pending.map((d) => `${d.label} (${d.amount})`).join(' · ') || 'Revisar conciliación',
          link: `/conciliacion?op=${op.id}`,
        });
      }
    }
  }

  if (can(user, 'verification.manage')) {
    const records = db.verifications
      .filter((v) => v.organizationId === user.organizationId)
      .map((v) => ({ id: v.id, label: v.dataLabel, status: v.status, validUntil: v.validUntil }));
    for (const a of expiryAlerts(records, asOf, 10).filter((x) => x.status === 'expiring')) {
      alerts.push({ id: `exp-${a.id}`, level: 'info', title: `Vence pronto: ${a.label}`, detail: `Vigente hasta el ${a.validUntil} (${a.days} días).`, link: '/verificacion' });
    }
  }

  if (can(user, 'request.manage')) {
    for (const r of db.requests.filter((x) => x.buyerOrganizationId === user.organizationId && x.status === 'published')) {
      const offers = db.quotations.filter((q) => q.requestId === r.id && db.quotationVersions.some((v) => v.quotationId === q.id && v.status === 'sent'));
      if (offers.length) {
        alerts.push({ id: `offers-${r.id}`, level: 'info', title: `${r.code}: ${offers.length} cotización(es) recibida(s)`, detail: 'Revisar y responder.', link: '/cotizaciones' });
      }
    }
    for (const q of visibleQuotations(db, user).filter((x) => x.buyerOrganizationId === user.organizationId && x.status === 'sent')) {
      alerts.push({ id: `respond-${q.id}`, level: 'info', title: `Cotización ${q.code} pendiente de respuesta`, detail: `De ${orgName(db, q.sellerOrganizationId)}`, link: `/cotizaciones/${q.id}` });
    }
  }
  const order = { error: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
