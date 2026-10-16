import { dec, type DecimalInput } from './decimal';

const numberFormatters = new Map<string, Intl.NumberFormat>();

function formatter(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = numberFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', { minimumFractionDigits: min, maximumFractionDigits: max });
    numberFormatters.set(key, f);
  }
  return f;
}

/** Formatea con separadores es-AR sin pasar por float los dígitos significativos. */
export function fmtNum(value: DecimalInput | null | undefined, maxDecimals = 2, minDecimals = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  const rounded = dec(value).toDecimalPlaces(maxDecimals);
  return formatter(minDecimals, maxDecimals).format(Number(rounded.toFixed(maxDecimals)));
}

export function fmtMoney(value: DecimalInput | null | undefined, currency = 'USD', decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${currency} ${fmtNum(value, decimals, decimals)}`;
}

export function fmtTons(value: DecimalInput | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${fmtNum(value, decimals)} t`;
}

export function fmtPct(value: DecimalInput | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${fmtNum(value, decimals)} %`;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : value;
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
