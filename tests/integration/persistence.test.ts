import { describe, expect, it } from 'vitest';
import { loadDatabase, saveDatabase, STORAGE_KEY } from '@/data/persistence';
import { buildSeed, IDS } from '@/data/seed';
import { createFacility } from '@/data/services/catalog';
import { ctxFor } from '../helpers';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('persistencia', () => {
  it('los cambios sobreviven a una recarga (guardar y volver a leer)', () => {
    const storage = memoryStorage();
    const first = loadDatabase(storage);
    expect(first.status).toBe('seeded');
    const { db } = createFacility(first.db, ctxFor(first.db, IDS.userMartin), {
      name: 'Depósito Zárate (demo)', type: 'warehouse', country: 'AR', province: 'Buenos Aires', city: 'Zárate', address: 'Calle demo 123',
    });
    expect(saveDatabase(db, storage)).toBe(true);
    const reloaded = loadDatabase(storage);
    expect(reloaded.status).toBe('loaded');
    expect(reloaded.db.facilities.some((f) => f.name === 'Depósito Zárate (demo)')).toBe(true);
  });

  it('si el almacenamiento está corrupto vuelve al seed sin romper la aplicación', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{no-json');
    const r = loadDatabase(storage);
    expect(r.status).toBe('seeded');
    expect(r.status === 'seeded' && r.reason).toBe('invalid');
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 999 }));
    expect(loadDatabase(storage).status).toBe('seeded');
  });

  it('funciona sin almacenamiento disponible (modo privado)', () => {
    expect(loadDatabase(null).status).toBe('seeded');
    expect(saveDatabase(buildSeed(), null)).toBe(true);
  });
});
