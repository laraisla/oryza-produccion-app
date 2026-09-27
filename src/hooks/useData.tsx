import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Database, User } from '@/types/domain';
import { repository } from '@/services/storage/repository';

interface DataContextValue {
  db: Database;
  user: User;
  setUserId: (id: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);
const SESSION_KEY = 'oryza.session.user';

/**
 * Provee la instantánea de la base y el usuario actual (sesión simulada).
 * Cualquier mutación en los servicios dispara un re-render automático.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSyncExternalStore(
    (l) => repository.subscribe(l),
    () => repository.snapshot(),
  );
  const [userId, setUserIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(SESSION_KEY) ?? 'u-jperez';
    } catch {
      return 'u-jperez';
    }
  });
  const setUserId = useCallback((id: string) => {
    setUserIdState(id);
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch {
      /* sin persistencia de sesión */
    }
  }, []);
  const user = useMemo(
    () => db.users.find((u) => u.id === userId && u.active) ?? db.users.find((u) => u.active)!,
    [db.users, userId],
  );
  const value = useMemo(() => ({ db, user, setUserId }), [db, user, setUserId]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fuera de DataProvider');
  return ctx;
}

/** Lookups memoizados por id para las vistas. */
export function useLookups() {
  const { db } = useData();
  return useMemo(() => {
    const m = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]));
    const products = m(db.products);
    const varieties = m(db.varieties);
    const presentations = m(db.presentations);
    const lines = m(db.lines);
    const shifts = m(db.shifts);
    const users = m(db.users);
    const categories = m(db.downtimeCategories);
    const n = (map: Map<string, { name: string }>, id?: string) => (id ? map.get(id)?.name ?? '—' : '—');
    return {
      products,
      varieties,
      presentations,
      lines,
      shifts,
      users,
      categories,
      productName: (id?: string) => n(products, id),
      varietyName: (id?: string) => n(varieties, id),
      presentationName: (id?: string) => n(presentations, id),
      lineName: (id?: string) => n(lines, id),
      lineCode: (id?: string) => (id ? lines.get(id)?.code ?? lines.get(id)?.name ?? '—' : '—'),
      shiftName: (id?: string) => n(shifts, id),
      userName: (id?: string) => n(users, id),
      categoryName: (id?: string) => n(categories, id),
    };
  }, [db]);
}
