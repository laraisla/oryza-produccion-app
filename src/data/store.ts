import { create } from 'zustand';
import { AccessDeniedError } from './access';
import type { Database, Organization, User } from './model';
import { loadDatabase, safeStorage, saveDatabase, SESSION_KEY, type LoadResult } from './persistence';
import { buildSeed } from './seed';
import { NotFoundError, systemContext, ValidationError, type ServiceContext } from './services/context';
import { IDS } from './seed';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

interface AppState {
  db: Database;
  userId: string;
  loadStatus: LoadResult['status'];
  loadReason?: string;
  persisted: boolean;
  toasts: Toast[];
  /** Ejecuta un servicio puro con el usuario actual y persiste el resultado. */
  run: <T>(fn: (db: Database, ctx: ServiceContext) => { db: Database; value: T }, success?: string) => T | undefined;
  switchUser: (userId: string) => void;
  resetDemo: () => void;
  notify: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

function initialUser(db: Database): string {
  try {
    const stored = safeStorage()?.getItem(SESSION_KEY);
    if (stored && db.users.some((u) => u.id === stored)) return stored;
  } catch {
    /* almacenamiento no disponible */
  }
  return IDS.userMartin;
}

const initial = loadDatabase();
let toastSeq = 0;

export function describeError(error: unknown): { title: string; detail?: string } {
  if (error instanceof ValidationError) {
    return { title: error.message, detail: error.issues.length > 1 ? error.issues.slice(1).join(' · ') : undefined };
  }
  if (error instanceof AccessDeniedError || error instanceof NotFoundError) return { title: error.message };
  if (error instanceof Error) return { title: error.message };
  return { title: 'Ocurrió un error inesperado.' };
}

export const useApp = create<AppState>((set, get) => ({
  db: initial.db,
  userId: initialUser(initial.db),
  loadStatus: initial.status,
  loadReason: initial.status === 'seeded' ? initial.reason : undefined,
  persisted: saveDatabase(initial.db),
  toasts: [],
  run: (fn, success) => {
    const state = get();
    const user = state.db.users.find((u) => u.id === state.userId);
    if (!user) return undefined;
    try {
      const { db, value } = fn(state.db, systemContext(user));
      const persisted = saveDatabase(db);
      set({ db, persisted });
      if (success) get().notify({ kind: 'success', title: success });
      if (!persisted) {
        get().notify({ kind: 'error', title: 'No se pudo guardar en el navegador', detail: 'Los cambios se perderán al recargar.' });
      }
      return value;
    } catch (error) {
      get().notify({ kind: 'error', ...describeError(error) });
      return undefined;
    }
  },
  switchUser: (userId) => {
    try {
      safeStorage()?.setItem(SESSION_KEY, userId);
    } catch {
      /* sin persistencia de sesión */
    }
    set({ userId });
  },
  resetDemo: () => {
    const db = buildSeed();
    saveDatabase(db);
    set({ db, loadStatus: 'seeded', loadReason: 'reset' });
    get().notify({ kind: 'info', title: 'Datos demo restablecidos' });
  },
  notify: (toast) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismiss(id), toast.kind === 'error' ? 8000 : 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function useDb(): Database {
  return useApp((s) => s.db);
}

export function useCurrentUser(): User {
  return useApp((s) => s.db.users.find((u) => u.id === s.userId) ?? s.db.users[0]);
}

export function useCurrentOrg(): Organization {
  return useApp((s) => {
    const user = s.db.users.find((u) => u.id === s.userId) ?? s.db.users[0];
    return s.db.organizations.find((o) => o.id === user.organizationId)!;
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
