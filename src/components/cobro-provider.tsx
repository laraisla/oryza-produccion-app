"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { evaluate, type Evaluation } from "@/domain/reconcile";
import type { Dataset } from "@/domain/schemas";
import { getDb, type CobroDB } from "@/storage/db";
import { loadDataset, toUserError } from "@/storage/repository";

interface CobroState {
  db: CobroDB | null;
  /** Abre una base nueva (después de eliminar los datos locales). */
  reopen: () => void;
  /** undefined mientras carga. */
  data: Dataset | undefined;
  ev: Evaluation | undefined;
  loadError: string | null;
}

const CobroContext = createContext<CobroState | null>(null);

type Loaded = { ok: true; data: Dataset } | { ok: false; error: string };

export function CobroProvider({ children }: { children: ReactNode }) {
  // IndexedDB solo existe en el navegador; en el render del servidor queda en null.
  const [db, setDb] = useState<CobroDB | null>(() => (typeof window === "undefined" ? null : getDb()));
  const reopen = useCallback(() => setDb(getDb()), []);
  const loaded = useLiveQuery<Loaded | undefined>(async () => {
    if (!db) return undefined;
    try {
      return { ok: true, data: await loadDataset(db) };
    } catch (e) {
      return { ok: false, error: toUserError(e).message };
    }
  }, [db]);

  const value = useMemo<CobroState>(() => {
    if (!loaded) return { db, reopen, data: undefined, ev: undefined, loadError: null };
    if (!loaded.ok) return { db, reopen, data: undefined, ev: undefined, loadError: loaded.error };
    return { db, reopen, data: loaded.data, ev: evaluate(loaded.data), loadError: null };
  }, [db, loaded, reopen]);

  return <CobroContext.Provider value={value}>{children}</CobroContext.Provider>;
}

export function useCobro(): CobroState {
  const ctx = useContext(CobroContext);
  if (!ctx) throw new Error("useCobro debe usarse dentro de CobroProvider");
  return ctx;
}

/** Devuelve la base o lanza un error claro si el almacenamiento no está disponible. */
export function requireDb(db: CobroDB | null): CobroDB {
  if (!db) throw new Error("El almacenamiento local todavía no está disponible.");
  return db;
}
