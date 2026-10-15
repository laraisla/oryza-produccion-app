// Acceso a los datos de la app.
//
// ETAPA 2: devuelve datos de ejemplo fijos para poder ver las pantallas.
// ETAPA 4: estas mismas funciones van a consultar Supabase. Como las páginas
// solo usan estas funciones, no van a tener que cambiar.

import { resumirLote } from "./calculos";
import type { Cosecha, Lote, ResumenLote } from "./tipos";

const LOTES_EJEMPLO: Lote[] = [
  { id: "7d1c3a52-1f0e-4b8e-9a51-0c2f4e6b8a01", nombre: "El Bajo", superficieHa: 48 },
  { id: "2b9e6f14-8c3d-4a7f-b2e0-5d1a9c3e7f02", nombre: "La Represa", superficieHa: 32.5 },
  { id: "c4a8d2e6-3b5f-4c9a-8e1d-7f0b2a4c6e03", nombre: "Potrero Norte", superficieHa: 27 },
];

const COSECHAS_EJEMPLO: Cosecha[] = [
  { id: "a1", loteId: LOTES_EJEMPLO[0].id, fecha: "2026-03-10", kilos: 112300, notas: null },
  { id: "a2", loteId: LOTES_EJEMPLO[0].id, fecha: "2026-03-11", kilos: 118900, notas: "Humedad alta a la mañana" },
  { id: "a3", loteId: LOTES_EJEMPLO[0].id, fecha: "2026-03-12", kilos: 125400, notas: null },
  { id: "b1", loteId: LOTES_EJEMPLO[1].id, fecha: "2026-03-18", kilos: 121500, notas: null },
  { id: "b2", loteId: LOTES_EJEMPLO[1].id, fecha: "2026-03-19", kilos: 113200, notas: "Se cortó por lluvia" },
];

/** Todos los lotes, ordenados por nombre. */
export async function listarLotes(): Promise<Lote[]> {
  return [...LOTES_EJEMPLO].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Un lote por su id, o null si no existe. */
export async function obtenerLote(id: string): Promise<Lote | null> {
  return LOTES_EJEMPLO.find((lote) => lote.id === id) ?? null;
}

/** Las cosechas de un lote, de la más reciente a la más vieja. */
export async function listarCosechasDeLote(loteId: string): Promise<Cosecha[]> {
  return COSECHAS_EJEMPLO.filter((cosecha) => cosecha.loteId === loteId).sort((a, b) =>
    b.fecha.localeCompare(a.fecha),
  );
}

/** Todos los lotes con sus totales y rendimiento calculados. */
export async function listarResumenLotes(): Promise<ResumenLote[]> {
  const lotes = await listarLotes();
  return Promise.all(
    lotes.map(async (lote) => resumirLote(lote, await listarCosechasDeLote(lote.id))),
  );
}
