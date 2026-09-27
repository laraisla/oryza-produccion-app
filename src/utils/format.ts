import { parseISODate } from './time';

const nf = (digits: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const nf0 = nf(0);
const nf1 = nf(1);
const nf2 = nf(2);

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (digits === 0) return nf0.format(n);
  if (digits === 1) return nf1.format(n);
  if (digits === 2) return nf2.format(n);
  return nf(digits).format(n);
}

export const fmtKg = (kg: number | null | undefined) => `${fmtNum(kg)} kg`;

export function fmtTn(kg: number | null | undefined, digits = 1): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return '—';
  return `${fmtNum(kg / 1000, digits)} tn`;
}

export function fmtPct(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  return `${fmtNum(p, digits)} %`;
}

/** 460 -> "7 h 40 min" */
export function fmtDuration(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = parseISODate(iso.slice(0, 10));
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateShort(iso: string): string {
  const d = parseISODate(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export function fmtDateLong(iso: string): string {
  const d = parseISODate(iso);
  const s = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Normaliza texto para búsquedas y comparación de encabezados (sin acentos, minúsculas). */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
