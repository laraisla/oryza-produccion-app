/** Utilidades de fecha/hora. Las fechas se manejan como strings locales YYYY-MM-DD. */

export const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function nowHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isValidHHMM(s: string | undefined | null): s is string {
  return !!s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Minutos desde 00:00. */
export function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function minToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/**
 * Duración entre dos horas. Si `allowOvernight` y fin <= inicio, se asume que
 * finaliza el día siguiente (turno noche). Devuelve null si el intervalo es inválido.
 */
export function spanMinutes(start: string, end: string, allowOvernight: boolean): number | null {
  if (!isValidHHMM(start) || !isValidHHMM(end)) return null;
  const s = hhmmToMin(start);
  const e = hhmmToMin(end);
  if (e > s) return e - s;
  if (allowOvernight && e < s) return e + 1440 - s;
  return null;
}

/**
 * Convierte una hora al offset (min) relativo al inicio de un intervalo que
 * puede cruzar la medianoche.
 */
export function offsetFrom(start: string, time: string, overnight: boolean): number {
  const s = hhmmToMin(start);
  let t = hhmmToMin(time);
  if (overnight && t < s) t += 1440;
  return t - s;
}

export function shiftCrossesMidnight(shift: { start: string; end: string }): boolean {
  return hhmmToMin(shift.end) <= hhmmToMin(shift.start);
}

/** ¿La hora actual cae dentro del turno? */
export function isTimeInShift(time: string, shift: { start: string; end: string }): boolean {
  const t = hhmmToMin(time);
  const s = hhmmToMin(shift.start);
  const e = hhmmToMin(shift.end);
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export function startOfWeek(s: string): string {
  const d = parseISODate(s);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + '01';
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 1000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

export function isoWeekNumber(s: string): number {
  const d = parseISODate(s);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}
