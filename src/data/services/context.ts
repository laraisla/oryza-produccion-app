import type { Database, ID, TraceEvent, User } from '../model';

export interface ServiceContext {
  user: User;
  now: () => string;
  today: () => string;
  newId: () => string;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [message],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} no encontrado.`);
    this.name = 'NotFoundError';
  }
}

export function systemContext(user: User): ServiceContext {
  return {
    user,
    now: () => new Date().toISOString(),
    today: () => new Date().toISOString().slice(0, 10),
    newId: () => globalThis.crypto.randomUUID(),
  };
}

/** Aplica una mutación sobre una copia profunda: el estado anterior nunca se modifica. */
export function mutate<T>(db: Database, fn: (draft: Database) => T): { db: Database; value: T } {
  const draft = structuredClone(db);
  const value = fn(draft);
  return { db: draft, value };
}

export function find<T extends { id: string }>(items: T[], id: ID | null | undefined, entity: string): T {
  const item = id ? items.find((i) => i.id === id) : undefined;
  if (!item) throw new NotFoundError(entity);
  return item;
}

export function audit(
  db: Database,
  ctx: ServiceContext,
  entity: string,
  entityId: ID,
  action: string,
  summary: string,
  changes?: { field: string; before: unknown; after: unknown }[],
): void {
  db.auditLog.push({
    id: ctx.newId(),
    at: ctx.now(),
    actorUserId: ctx.user.id,
    organizationId: ctx.user.organizationId,
    entity,
    entityId,
    action,
    summary,
    changes,
  });
}

export function trace(
  db: Database,
  ctx: ServiceContext,
  event: Omit<TraceEvent, 'id' | 'at' | 'actorUserId' | 'organizationId'> & { organizationId?: ID; at?: string },
): void {
  db.traceEvents.push({
    ...event,
    id: ctx.newId(),
    at: event.at ?? ctx.now(),
    actorUserId: ctx.user.id,
    organizationId: event.organizationId ?? ctx.user.organizationId,
  });
}

export function diff<T extends object>(before: T, after: T, fields: (keyof T)[]) {
  return fields
    .filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]))
    .map((f) => ({ field: String(f), before: before[f], after: after[f] }));
}

/** Próximo código legible por organización: PREFIJO-AAAA-NNN. */
export function nextCode(
  existing: { code: string; organizationId?: string }[],
  prefix: string,
  year: string,
  organizationId?: string,
  width = 3,
): string {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = existing
    .filter((e) => !organizationId || !e.organizationId || e.organizationId === organizationId)
    .map((e) => e.code.match(pattern)?.[1])
    .filter((n): n is string => Boolean(n))
    .reduce((acc, n) => Math.max(acc, Number(n)), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(width, '0')}`;
}
