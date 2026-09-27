import type { AuditAction, AuditEntry, Database, FieldChange, ID } from '@/types/domain';
import { uid } from '@/utils/id';

export function appendAudit(
  db: Database,
  e: { userId: ID; action: AuditAction; entity: string; entityId: ID; entityLabel: string; changes?: FieldChange[]; comment?: string },
): AuditEntry {
  const entry: AuditEntry = { id: uid('a'), at: new Date().toISOString(), changes: [], ...e };
  db.audit.push(entry);
  return entry;
}

export const ACTION_LABEL: Record<AuditAction, string> = {
  create: 'Creó',
  update: 'Modificó',
  submit: 'Envió a aprobación',
  withdraw: 'Retiró el envío de',
  approve: 'Aprobó',
  reject: 'Rechazó',
  reopen: 'Reabrió',
  delete: 'Eliminó',
  duplicate: 'Duplicó',
  import: 'Importó',
  close_day: 'Generó',
  config: 'Modificó configuración',
  reset: 'Restableció',
};
