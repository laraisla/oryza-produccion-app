import Decimal from 'decimal.js';

/**
 * Aritmética decimal para importes, cantidades y porcentajes. Los valores se
 * persisten como strings decimales y se operan con decimal.js (precisión 40):
 * nunca se usan floats para dinero. Se redondea solo al presentar o al fijar
 * un precio de cotización, no en cálculos intermedios.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type DecimalInput = Dec | string | number;

export type RoundingMode = 'half_up' | 'up' | 'down' | 'half_even';

const MODE: Record<RoundingMode, Decimal.Rounding> = {
  half_up: Decimal.ROUND_HALF_UP,
  up: Decimal.ROUND_UP,
  down: Decimal.ROUND_DOWN,
  half_even: Decimal.ROUND_HALF_EVEN,
};

export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function isDecimalString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value.trim());
}

export function dec(value: DecimalInput | null | undefined): Dec {
  if (value === null || value === undefined || value === '') return new D(0);
  return value instanceof D ? value : new D(value);
}

export function sum(values: Iterable<DecimalInput>): Dec {
  let total = new D(0);
  for (const value of values) total = total.plus(dec(value));
  return total;
}

export function roundTo(value: DecimalInput, decimals: number, mode: RoundingMode = 'half_up'): Dec {
  return dec(value).toDecimalPlaces(decimals, MODE[mode]);
}

/** Serializa con una cantidad fija de decimales (para persistir importes ya redondeados). */
export function toFixed(value: DecimalInput, decimals = 2, mode: RoundingMode = 'half_up'): string {
  return roundTo(value, decimals, mode).toFixed(decimals);
}

/** Serializa sin perder precisión (para persistir resultados intermedios). */
export function toPlain(value: DecimalInput): string {
  return dec(value).toFixed();
}

export function max(a: DecimalInput, b: DecimalInput): Dec {
  return D.max(dec(a), dec(b));
}

export function min(a: DecimalInput, b: DecimalInput): Dec {
  return D.min(dec(a), dec(b));
}

export function pct(part: DecimalInput, whole: DecimalInput): Dec | null {
  const w = dec(whole);
  return w.isZero() ? null : dec(part).div(w).times(100);
}
