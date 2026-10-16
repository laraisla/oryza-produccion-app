import { SCHEMA_VERSION, type Database } from './model';
import { buildSeed, SEED_VERSION } from './seed';

export const STORAGE_KEY = 'agromatch-comex:db:v1';
export const SESSION_KEY = 'agromatch-comex:session:v1';

const REQUIRED_COLLECTIONS: (keyof Database)[] = [
  'organizations',
  'users',
  'facilities',
  'products',
  'lots',
  'inventoryMovements',
  'requests',
  'costCatalog',
  'scenarios',
  'quotations',
  'quotationVersions',
  'operations',
  'documents',
  'traceEvents',
  'auditLog',
];

export type LoadResult =
  | { status: 'loaded'; db: Database }
  | { status: 'seeded'; db: Database; reason: 'empty' | 'invalid' | 'outdated' };

function isValid(value: unknown): value is Database {
  if (!value || typeof value !== 'object') return false;
  const db = value as Partial<Database>;
  return db.schemaVersion === SCHEMA_VERSION && REQUIRED_COLLECTIONS.every((key) => Array.isArray(db[key]));
}

/** Lee la base persistida; si falta, está corrupta o es de otra versión, carga el seed demo. */
export function loadDatabase(storage: Pick<Storage, 'getItem'> | null = safeStorage()): LoadResult {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (!raw) return { status: 'seeded', db: buildSeed(), reason: 'empty' };
  try {
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return { status: 'seeded', db: buildSeed(), reason: 'invalid' };
    if (parsed.seedVersion !== SEED_VERSION) return { status: 'seeded', db: buildSeed(), reason: 'outdated' };
    return { status: 'loaded', db: parsed };
  } catch {
    return { status: 'seeded', db: buildSeed(), reason: 'invalid' };
  }
}

export function saveDatabase(db: Database, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
