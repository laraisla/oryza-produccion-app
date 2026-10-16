import { dec, type Dec, type DecimalInput } from './decimal';

export type MassUnit = 'kg' | 't';

export function toTons(value: DecimalInput, unit: MassUnit): Dec {
  return unit === 't' ? dec(value) : dec(value).div(1000);
}

export function toKg(value: DecimalInput, unit: MassUnit): Dec {
  return unit === 'kg' ? dec(value) : dec(value).times(1000);
}

export type Currency = 'USD' | 'EUR' | 'ARS' | 'BRL';
export const CURRENCIES: Currency[] = ['USD', 'EUR', 'ARS', 'BRL'];

/**
 * Tipo de cambio documentado: `rate` unidades de `quote` por 1 unidad de `base`.
 * Ej.: base USD, quote ARS, rate 1180 => 1 USD = 1180 ARS.
 */
export interface FxQuote {
  id?: string;
  base: Currency;
  quote: Currency;
  rate: string;
  date: string;
  source: string;
  sourceUrl?: string;
}

export class MissingFxRateError extends Error {
  constructor(
    readonly from: Currency,
    readonly to: Currency,
  ) {
    super(`Falta tipo de cambio documentado ${from}→${to}`);
    this.name = 'MissingFxRateError';
  }
}

export interface Conversion {
  amount: Dec;
  /** Tipo de cambio aplicado (null cuando no hubo conversión). */
  fx: FxQuote | null;
  /** Factor efectivo aplicado al importe original. */
  factor: Dec;
}

/** Convierte usando solo cotizaciones explícitas (directa o inversa); nunca inventa tasas. */
export function convert(amount: DecimalInput, from: Currency, to: Currency, rates: FxQuote[]): Conversion {
  if (from === to) return { amount: dec(amount), fx: null, factor: dec(1) };
  const direct = rates.find((r) => r.base === from && r.quote === to);
  if (direct) {
    const factor = dec(direct.rate);
    return { amount: dec(amount).times(factor), fx: direct, factor };
  }
  const inverse = rates.find((r) => r.base === to && r.quote === from);
  if (inverse) {
    if (dec(inverse.rate).isZero()) throw new MissingFxRateError(from, to);
    const factor = dec(1).div(dec(inverse.rate));
    return { amount: dec(amount).times(factor), fx: inverse, factor };
  }
  throw new MissingFxRateError(from, to);
}
