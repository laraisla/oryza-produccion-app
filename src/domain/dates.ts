/**
 * Fechas de calendario como texto `AAAA-MM-DD`. No se usa la fecha de hoy en
 * las reglas: los resultados dependen solo de los datos cargados.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const AR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isIsoDate(value: string): boolean {
  const m = ISO.exec(value);
  if (!m) return false;
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

export type DateParseResult = { ok: true; iso: string } | { ok: false; error: string };

/** Acepta `AAAA-MM-DD` o `DD/MM/AAAA` (día primero, formato argentino). */
export function parseDate(raw: string): DateParseResult {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "Falta la fecha." };
  const iso = ISO.exec(text);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (isRealDate(y, m, d)) return { ok: true, iso: text };
    return { ok: false, error: `La fecha "${text}" no existe.` };
  }
  const ar = AR.exec(text);
  if (ar) {
    const [d, m, y] = [Number(ar[1]), Number(ar[2]), Number(ar[3])];
    if (isRealDate(y, m, d)) return { ok: true, iso: `${y}-${pad(m)}-${pad(d)}` };
    return { ok: false, error: `La fecha "${text}" no existe.` };
  }
  return { ok: false, error: `Fecha "${text}" inválida: usá AAAA-MM-DD o DD/MM/AAAA.` };
}

/** `2026-09-15` → `15/09/2026`. */
export function formatDate(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Fecha y hora local para metadatos (p. ej. fecha de importación). */
export function formatDateTime(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return isoDateTime;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Fecha local de hoy (`AAAA-MM-DD`). Solo para proponer un valor por defecto
 * editable en formularios; las reglas de conciliación nunca la usan.
 */
export function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
