/** ABM de maestros, usuarios, objetivos y cierres de jornada. */
import type { AppSettings, CatalogBase, CatalogKey, Database, DailyClosure, ID, Targets, User } from '@/types/domain';
import { repository } from './storage/repository';
import { appendAudit } from './auditService';
import { BusinessError } from './errors';
import { uid } from '@/utils/id';
import { normalize } from '@/utils/format';
import { aggregate } from '@/utils/calc';
import { fmtDate } from '@/utils/format';

export const CATALOG_LABEL: Record<CatalogKey, { singular: string; plural: string }> = {
  products: { singular: 'producto', plural: 'Productos' },
  varieties: { singular: 'variedad', plural: 'Variedades' },
  presentations: { singular: 'presentación', plural: 'Presentaciones' },
  lines: { singular: 'línea', plural: 'Líneas' },
  shifts: { singular: 'turno', plural: 'Turnos' },
  downtimeCategories: { singular: 'tipo de parada', plural: 'Tipos de parada' },
};

/** Campo del registro de producción que referencia a cada maestro (para impedir borrar datos en uso). */
function usageCount(db: Database, key: CatalogKey, id: ID): number {
  switch (key) {
    case 'products':
      return db.records.filter((r) => r.productId === id).length;
    case 'varieties':
      return db.records.filter((r) => r.varietyId === id).length;
    case 'presentations':
      return db.records.filter((r) => r.presentationId === id).length;
    case 'lines':
      return db.records.filter((r) => r.lineId === id).length;
    case 'shifts':
      return db.records.filter((r) => r.shiftId === id).length;
    case 'downtimeCategories':
      return db.records.reduce((a, r) => a + r.downtimes.filter((d) => d.categoryId === id).length, 0);
  }
}

export async function upsertCatalogItem<T extends CatalogBase>(key: CatalogKey, item: T, user: User): Promise<T> {
  return repository.transaction((db) => {
    const list = db[key] as unknown as T[];
    if (!item.name.trim()) throw new BusinessError('El nombre es obligatorio.');
    const clash = list.find((x) => x.id !== item.id && normalize(x.name) === normalize(item.name));
    if (clash) throw new BusinessError(`Ya existe un/a ${CATALOG_LABEL[key].singular} con el nombre "${item.name}".`);
    const clean = { ...item, name: item.name.trim() };
    const idx = list.findIndex((x) => x.id === item.id);
    let changes: { field: string; label: string; from: string; to: string }[] = [];
    if (idx >= 0) {
      const before = list[idx] as unknown as Record<string, unknown>;
      changes = Object.keys(clean)
        .filter((k) => k !== 'id' && String(before[k] ?? '') !== String((clean as unknown as Record<string, unknown>)[k] ?? ''))
        .map((k) => ({ field: k, label: k, from: String(before[k] ?? '—'), to: String((clean as unknown as Record<string, unknown>)[k] ?? '—') }));
      list[idx] = clean;
    } else {
      clean.id = clean.id || uid(key.slice(0, 3));
      list.push(clean);
    }
    appendAudit(db, {
      userId: user.id,
      action: idx >= 0 ? 'config' : 'create',
      entity: key,
      entityId: clean.id,
      entityLabel: `${CATALOG_LABEL[key].plural}: ${clean.name}`,
      changes,
    });
    return clean;
  });
}

export async function deleteCatalogItem(key: CatalogKey, id: ID, user: User): Promise<void> {
  return repository.transaction((db) => {
    const list = db[key] as unknown as CatalogBase[];
    const item = list.find((x) => x.id === id);
    if (!item) return;
    const used = usageCount(db, key, id);
    if (used > 0)
      throw new BusinessError(
        `"${item.name}" se utiliza en ${used} registro(s) y no puede eliminarse sin perder trazabilidad. Puedes desactivarlo para que no aparezca en nuevas cargas.`,
      );
    (db[key] as unknown as CatalogBase[]) = list.filter((x) => x.id !== id);
    appendAudit(db, { userId: user.id, action: 'delete', entity: key, entityId: id, entityLabel: `${CATALOG_LABEL[key].plural}: ${item.name}` });
  });
}

export async function upsertUser(u: User, actor: User): Promise<User> {
  return repository.transaction((db) => {
    if (!u.name.trim()) throw new BusinessError('El nombre del usuario es obligatorio.');
    const idx = db.users.findIndex((x) => x.id === u.id);
    if (idx >= 0 && db.users[idx]!.id === actor.id && (u.role !== 'admin' || !u.active))
      throw new BusinessError('No puedes quitarte el rol de administrador ni desactivar tu propio usuario.');
    const clean = { ...u, name: u.name.trim() };
    if (idx >= 0) db.users[idx] = clean;
    else {
      clean.id = uid('u');
      db.users.push(clean);
    }
    appendAudit(db, { userId: actor.id, action: idx >= 0 ? 'config' : 'create', entity: 'users', entityId: clean.id, entityLabel: `Usuario: ${clean.name}` });
    return clean;
  });
}

export async function updateSettings(patch: Partial<AppSettings> & { targets?: Targets }, actor: User) {
  return repository.transaction((db) => {
    const t = patch.targets;
    if (t) {
      const bad = Object.entries(t).find(([, v]) => !Number.isFinite(v) || (v as number) < 0);
      if (bad) throw new BusinessError('Los objetivos deben ser números mayores o iguales a cero.');
      if (t.maxScrapPct > 100 || t.maxDowntimePct > 100) throw new BusinessError('Los porcentajes no pueden superar 100 %.');
      const changes = (Object.keys(t) as (keyof Targets)[])
        .filter((k) => db.settings.targets[k] !== t[k])
        .map((k) => ({ field: k, label: k, from: String(db.settings.targets[k]), to: String(t[k]) }));
      appendAudit(db, { userId: actor.id, action: 'config', entity: 'settings', entityId: 'targets', entityLabel: 'Objetivos y parámetros', changes });
    }
    db.settings = { ...db.settings, ...patch };
  });
}

export async function closeDay(date: string, notes: string, actor: User): Promise<DailyClosure> {
  return repository.transaction((db) => {
    if (actor.role === 'operator') throw new BusinessError('Solo un supervisor puede cerrar la jornada.');
    if (db.closures.some((c) => c.date === date)) throw new BusinessError(`La jornada del ${fmtDate(date)} ya está cerrada.`);
    const dayRecs = db.records.filter((r) => r.date === date && r.status !== 'draft' && r.status !== 'rejected');
    if (!dayRecs.length) throw new BusinessError('No hay registros enviados para esa fecha. No es posible generar el cierre.');
    const agg = aggregate(dayRecs, new Map(db.shifts.map((s) => [s.id, s])));
    const closure: DailyClosure = {
      id: uid('cl'),
      date,
      closedBy: actor.id,
      closedAt: new Date().toISOString(),
      notes: notes.trim(),
      summary: {
        totalKg: agg.totalKg,
        records: agg.records,
        pending: db.records.filter((r) => r.date === date && r.status === 'pending').length,
        productiveMin: agg.productiveMin,
        downtimeMin: agg.downtimeMin,
        scrapKg: agg.scrapKg,
        scrapPct: agg.scrapPct ?? 0,
        incidents: dayRecs.filter((r) => r.quality.hasIncident).length,
      },
    };
    db.closures.push(closure);
    appendAudit(db, { userId: actor.id, action: 'close_day', entity: 'daily_closure', entityId: closure.id, entityLabel: `Cierre ${fmtDate(date)}`, comment: closure.notes || undefined });
    return closure;
  });
}

export async function resetDemo(actor: User) {
  await repository.reset();
  await repository.transaction((db) => {
    appendAudit(db, { userId: actor.id, action: 'reset', entity: 'database', entityId: 'db', entityLabel: 'Datos de demostración' });
  });
}
