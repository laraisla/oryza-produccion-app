// ============================================================
// Identidad de marca: derivación de tema desde una detección
// automática y paletas para gráficos.
// Nunca inventa activos: si la detección no trajo logo o
// colores, el tema queda incompleto y la interfaz lo informa.
// ============================================================

import { useMemo } from "react";
import type { TemaMarca } from "@/data/organizaciones";
import { useOrganizacionActiva } from "@/lib/store";
import { aclarar, luminancia, oscurecer, textoSobre, tonalidades } from "@/lib/tema";

export { tonalidades };

export interface DeteccionMarca {
  nombre?: string | undefined;
  faviconUrl?: string | undefined;
  logoUrl?: string | undefined;
  colores: string[];
  tipografia?: string | undefined;
  faltantes: string[];
}

/** Color de marca por defecto cuando la detección no encontró nada. */
export const COLOR_FALLBACK = "#1d4ed8";

/**
 * Convierte una detección en un TemaMarca. Solo usa colores reales
 * detectados; completa los faltantes con derivaciones del primario
 * (nunca con colores inventados ajenos a la marca).
 */
export function temaDesdeDeteccion(d: DeteccionMarca, urlAnalizada: string): TemaMarca {
  const primario = d.colores[0] ?? COLOR_FALLBACK;
  const secundario = d.colores[1] ?? oscurecer(primario, 0.25);
  const acento = d.colores[2] ?? aclarar(primario, 0.2);
  return {
    primario,
    secundario,
    acento,
    ...(d.logoUrl ?? d.faviconUrl ? { logoUrl: (d.logoUrl ?? d.faviconUrl)! } : {}),
    ...(d.faviconUrl ? { faviconUrl: d.faviconUrl } : {}),
    ...(d.tipografia ? { tipografia: d.tipografia } : {}),
    urlAnalizada,
    fechaAnalisis: new Date().toISOString(),
  };
}

/**
 * Colores de gráficos de la organización activa: si tiene tema de
 * marca, deriva series del color principal; si no, usa los colores
 * predeterminados de AgroGlobal (tokens CSS).
 */
export function useChartColores(n = 4): string[] {
  const org = useOrganizacionActiva();
  return useMemo(() => {
    if (!org.tema)
      return ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)"].slice(0, n);
    const tonales = tonalidades(org.tema.primario, n);
    return tonales.map((t, i) => (i % 2 === 0 ? t : org.tema!.secundario));
  }, [org.tema, n]);
}

/** Texto legible sobre el color primario de marca (para botones). */
export function textoSobreMarca(tema: TemaMarca): string {
  return textoSobre(tema.primario);
}

/** Legibilidad mínima: avisa si el primario es demasiado claro/oscuro. */
export function advertenciaLegibilidad(tema: TemaMarca): string | null {
  const lum = luminancia(tema.primario);
  if (lum > 0.85) return "El color principal es muy claro: los botones pueden perder visibilidad.";
  if (lum < 0.02) return "El color principal es muy oscuro: puede confundirse con el fondo.";
  return null;
}
