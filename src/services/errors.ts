import type { ValidationIssue } from '@/utils/validation';
import { PersistenceError } from './storage/repository';

/** Error de negocio con mensaje apto para mostrar al usuario. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class ValidationFailed extends BusinessError {
  constructor(public issues: ValidationIssue[]) {
    super(issues.find((i) => i.level === 'error')?.message ?? 'Revisa los datos del formulario.');
    this.name = 'ValidationFailed';
  }
}

/** Traduce cualquier error a un mensaje comprensible (nunca muestra detalles técnicos). */
export function friendlyMessage(e: unknown): string {
  if (e instanceof BusinessError || e instanceof PersistenceError) return e.message;
  console.error(e);
  return 'Ocurrió un problema inesperado. Intenta nuevamente; si persiste, avisa al administrador.';
}
