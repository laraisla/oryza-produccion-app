import type { VerificationStatus } from './catalogs';

export interface VerifiableLike {
  status: VerificationStatus;
  validUntil?: string | null;
}

/** El vencimiento se evalúa por fecha: un dato verificado o cotizado vencido pasa a "Vencido". */
export function effectiveStatus(record: VerifiableLike, asOf: string): VerificationStatus {
  if (record.status !== 'pending' && record.validUntil && record.validUntil < asOf) return 'expired';
  return record.status;
}

export function daysUntil(date: string, asOf: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export interface VerificationChange {
  to: VerificationStatus;
  source: string;
  evidence?: string | null;
  responsible: string;
  validUntil?: string | null;
}

/**
 * Valida un cambio de estado manual. Nunca se pasa a "Verificado" sin fuente,
 * evidencia (URL o documento) y responsable identificados.
 */
export function validateVerificationChange(change: VerificationChange): string[] {
  const errors: string[] = [];
  if (!change.responsible.trim()) errors.push('Indicar el responsable del cambio.');
  if (change.to === 'verified' || change.to === 'quoted') {
    if (!change.source.trim()) errors.push('Indicar la fuente que respalda el dato.');
  }
  if (change.to === 'verified' && !change.evidence?.trim()) {
    errors.push('Para verificar se requiere una URL o un documento de respaldo.');
  }
  if (change.to === 'quoted' && !change.validUntil) {
    errors.push('Una cotización debe tener fecha de vencimiento.');
  }
  return errors;
}

export interface ExpiryAlert {
  id: string;
  label: string;
  status: 'expired' | 'expiring';
  validUntil: string;
  days: number;
}

export function expiryAlerts(
  records: { id: string; label: string; status: VerificationStatus; validUntil?: string | null }[],
  asOf: string,
  warnDays = 15,
): ExpiryAlert[] {
  const alerts: ExpiryAlert[] = [];
  for (const r of records) {
    if (!r.validUntil || r.status === 'pending') continue;
    const days = daysUntil(r.validUntil, asOf);
    if (days < 0) alerts.push({ id: r.id, label: r.label, status: 'expired', validUntil: r.validUntil, days });
    else if (days <= warnDays) alerts.push({ id: r.id, label: r.label, status: 'expiring', validUntil: r.validUntil, days });
  }
  return alerts.sort((a, b) => a.days - b.days);
}
