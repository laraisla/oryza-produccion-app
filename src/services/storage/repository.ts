/**
 * Capa de persistencia.
 *
 * Toda la aplicación accede a los datos a través de `DataRepository`. La
 * implementación actual (`LocalStorageRepository`) guarda la base completa en
 * el navegador. Para migrar a PostgreSQL/Supabase o a una API REST solo hay
 * que implementar esta interfaz (o reemplazar los servicios por llamadas HTTP):
 * la UI no conoce el mecanismo de almacenamiento.
 */
import type { Database } from '@/types/domain';
import { buildDemoDatabase, SCHEMA_VERSION } from '@/data/seed';

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export interface DataRepository {
  /** Instantánea actual de la base (solo lectura para la UI). */
  snapshot(): Database;
  /** Ejecuta una mutación atómica y persiste. Si falla, no se aplica ningún cambio. */
  transaction<T>(fn: (db: Database) => T): Promise<T>;
  /** Restaura la base con datos de demostración. */
  reset(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = 'oryza.mes.db';

export class LocalStorageRepository implements DataRepository {
  private db: Database;
  private listeners = new Set<() => void>();

  constructor() {
    this.db = this.loadOrSeed();
    if (typeof window !== 'undefined') {
      // Sincroniza cambios hechos en otra pestaña del mismo navegador.
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            this.db = JSON.parse(e.newValue) as Database;
            this.emit();
          } catch {
            /* ignorar */
          }
        }
      });
    }
  }

  private loadOrSeed(): Database {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Database;
        if (parsed.schemaVersion === SCHEMA_VERSION) return parsed;
      }
    } catch {
      /* datos corruptos o almacenamiento no disponible: se regeneran */
    }
    const db = buildDemoDatabase();
    this.persist(db, true);
    return db;
  }

  private persist(db: Database, silent = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      if (silent) return;
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
      throw new PersistenceError(
        quota
          ? 'No hay espacio suficiente para guardar los datos en este dispositivo. Exporta y depura información antigua.'
          : 'No se pudieron guardar los cambios en este dispositivo. Verifica que el navegador permita almacenamiento local.',
      );
    }
  }

  snapshot(): Database {
    return this.db;
  }

  async transaction<T>(fn: (db: Database) => T): Promise<T> {
    const draft = structuredClone(this.db);
    const result = fn(draft);
    this.persist(draft);
    this.db = draft;
    this.emit();
    return result;
  }

  async reset(): Promise<void> {
    const db = buildDemoDatabase();
    this.persist(db);
    this.db = db;
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const repository: DataRepository = new LocalStorageRepository();
