// ============================================================
// Tema de marca por organización.
// Aplica los colores corporativos sobre las variables CSS del
// design system (nunca modifica los estilos globales: solo pisa
// variables en :root mientras la organización está activa).
// Restablecer = quitar las variables inline y volver a AgroGlobal.
// ============================================================

import type { TemaMarca } from "@/data/organizaciones";

const VARS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--accent",
  "--accent-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

// ---- Utilidades de color (hex) ----

function hexA_rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbA_hex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function aclarar(hex: string, factor: number): string {
  const [r, g, b] = hexA_rgb(hex);
  return rgbA_hex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}

export function oscurecer(hex: string, factor: number): string {
  const [r, g, b] = hexA_rgb(hex);
  return rgbA_hex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

/**
 * Tonalidades compatibles de un color corporativo para series de
 * gráficos. Mantiene el tono de marca variando la luminosidad;
 * los colores de estado (éxito/advertencia/error) no se tocan.
 */
export function tonalidades(base: string, n: number): string[] {
  const factores = [0, 0.25, 0.45, 0.62, 0.78];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = factores[i % factores.length]!;
    out.push(i % 2 === 0 ? aclarar(base, f) : oscurecer(base, f * 0.8));
  }
  return out;
}

/** Luminancia relativa aproximada (WCAG) de un color #rrggbb. */
export function luminancia(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return 0;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}

/** Contraste WCAG entre dos colores hex. */
export function contrasteRatio(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Texto legible (claro u oscuro) sobre un color de marca. */
export function textoSobre(hex: string): string {
  return contrasteRatio(hex, "#ffffff") >= contrasteRatio(hex, "#16202e") ? "#ffffff" : "#16202e";
}

/** true si el color mantiene contraste AA (4.5:1) con texto blanco. */
export function contrasteSuficiente(hex: string): boolean {
  return contrasteRatio(hex, "#ffffff") >= 4.5 || contrasteRatio(hex, "#16202e") >= 4.5;
}

export function aplicarTema(tema: TemaMarca | null | undefined): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!tema) {
    for (const v of VARS) root.style.removeProperty(v);
    return;
  }
  root.style.setProperty("--primary", tema.primario);
  root.style.setProperty("--primary-foreground", textoSobre(tema.primario));
  root.style.setProperty("--ring", tema.primario);
  root.style.setProperty("--accent", `${tema.secundario}14`);
  root.style.setProperty("--accent-foreground", tema.primario);
  root.style.setProperty("--sidebar-primary", tema.acento);
  root.style.setProperty("--sidebar-primary-foreground", textoSobre(tema.acento));
  root.style.setProperty("--sidebar-ring", tema.acento);
  root.style.setProperty("--chart-1", tema.primario);
  root.style.setProperty("--chart-2", tema.secundario);
  // Series adicionales: tonalidades de la marca (gráficos multiserie).
  const tonos = tonalidades(tema.primario, 3);
  root.style.setProperty("--chart-3", tonos[1]!);
  root.style.setProperty("--chart-4", tema.acento);
  root.style.setProperty("--chart-5", tonos[2]!);
}

export function restablecerTema(): void {
  aplicarTema(null);
}
