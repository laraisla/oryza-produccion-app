/**
 * Matriz de permisos por rol y estado del registro.
 * Centralizada para que la UI y los servicios apliquen exactamente las mismas reglas.
 */
import type { ProductionRecord, Role, User } from '@/types/domain';

export const ROLE_LABEL: Record<Role, string> = {
  operator: 'Operador',
  supervisor: 'Supervisor',
  admin: 'Administrador',
};

const isSup = (u: User) => u.role === 'supervisor' || u.role === 'admin';
const isOwner = (u: User, r: ProductionRecord) => r.operatorId === u.id || r.createdBy === u.id;

export const can = {
  viewAllRecords: (u: User) => isSup(u),
  viewRecord: (u: User, r: ProductionRecord) => isSup(u) || isOwner(u, r),
  createRecord: (_u: User) => true,
  /** Borrador o rechazado: lo edita su autor o un supervisor. Pendiente/aprobado: bloqueado. */
  editRecord: (u: User, r: ProductionRecord) =>
    (r.status === 'draft' || r.status === 'rejected') && (isOwner(u, r) || isSup(u)),
  submitRecord: (u: User, r: ProductionRecord) =>
    (r.status === 'draft' || r.status === 'rejected') && (isOwner(u, r) || isSup(u)),
  withdrawRecord: (u: User, r: ProductionRecord) => r.status === 'pending' && (isOwner(u, r) || isSup(u)),
  reviewRecord: (u: User, r: ProductionRecord) => r.status === 'pending' && isSup(u),
  /** Solo administración puede reabrir un aprobado (queda auditado con motivo). */
  reopenRecord: (u: User, r: ProductionRecord) => r.status === 'approved' && u.role === 'admin',
  deleteRecord: (u: User, r: ProductionRecord) =>
    r.status !== 'approved' && ((r.status === 'draft' && isOwner(u, r)) || u.role === 'admin'),
  duplicateRecord: (_u: User, _r: ProductionRecord) => true,
  viewDashboard: (_u: User) => true,
  closeDay: (u: User) => isSup(u),
  viewReports: (u: User) => isSup(u),
  viewAlerts: (_u: User) => true,
  admin: (u: User) => u.role === 'admin',
  exportData: (u: User) => isSup(u),
  viewAudit: (u: User) => isSup(u),
};

/** Motivo legible por el cual una acción no está permitida (para tooltips). */
export function editBlockReason(u: User, r: ProductionRecord): string | null {
  if (can.editRecord(u, r)) return null;
  if (r.status === 'approved') return 'El registro está aprobado y bloqueado. Solo un administrador puede reabrirlo.';
  if (r.status === 'pending') return 'El registro está pendiente de aprobación. Retira el envío para editarlo.';
  return 'Solo el autor o un supervisor pueden editar este registro.';
}
