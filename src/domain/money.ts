/**
 * Dinero en unidades menores enteras (centavos). Nunca se usan decimales
 * binarios para calcular: los importes se parsean desde texto a enteros y
 * las operaciones verifican que el resultado siga siendo un entero seguro.
 */

export const CURRENCY = "ARS" as const;
export type Currency = typeof CURRENCY;

/** Tope de prototipo: $ 100.000.000.000 (10^13 centavos). */
export const MAX_MINOR = 10_000_000_000_000;

export type MoneyParseResult =
  | { ok: true; minor: number }
  | { ok: false; error: string };

export function isValidMinor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_MINOR
  );
}

function fromParts(intDigits: string, fracDigits: string): MoneyParseResult {
  const intPart = intDigits.replace(/^0+(?=\d)/, "");
  if (intPart.length > 13) {
    return { ok: false, error: "El importe supera el máximo admitido por el prototipo." };
  }
  const frac = (fracDigits + "00").slice(0, 2);
  const minor = Number(intPart) * 100 + Number(frac);
  if (!Number.isSafeInteger(minor)) {
    return { ok: false, error: "El importe no es un entero seguro." };
  }
  if (minor <= 0) {
    return { ok: false, error: "El importe debe ser mayor que cero." };
  }
  if (minor > MAX_MINOR) {
    return { ok: false, error: "El importe supera el máximo admitido por el prototipo." };
  }
  return { ok: true, minor };
}

/**
 * Formato del CSV propio: dígitos y, opcionalmente, punto decimal con hasta
 * dos decimales. Sin separador de miles. Ej.: `45000`, `45000.5`, `45000.50`.
 */
export function parseCsvAmount(raw: string): MoneyParseResult {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "Falta el importe." };
  if (text.startsWith("-")) {
    return { ok: false, error: "El importe debe ser positivo (el formato solo admite ingresos)." };
  }
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    return {
      ok: false,
      error: `Importe "${text}" inválido: usá dígitos y punto decimal, sin separador de miles (ej.: 45000.00).`,
    };
  }
  return fromParts(match[1] ?? "", match[2] ?? "");
}

/**
 * Formato argentino escrito por personas: `$45.000`, `45.000,50`, `$ 45000`.
 * El punto solo se acepta como separador de miles en grupos de tres dígitos;
 * la coma es el separador decimal. `45.00` se rechaza por ambiguo.
 */
export function parseArsText(raw: string): MoneyParseResult {
  const text = raw.trim().replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (text === "") return { ok: false, error: "Falta el importe." };
  if (text.startsWith("-")) return { ok: false, error: "El importe debe ser positivo." };
  const grouped = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(text);
  if (grouped) return fromParts((grouped[1] ?? "").replace(/\./g, ""), grouped[2] ?? "");
  const plain = /^(\d{1,15})(?:,(\d{1,2}))?$/.exec(text);
  if (plain) return fromParts(plain[1] ?? "", plain[2] ?? "");
  return {
    ok: false,
    error: `No se pudo interpretar "${raw.trim()}" como importe en pesos (ej.: 45.000 o 45.000,50).`,
  };
}

function assertSafe(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Resultado monetario fuera del rango de enteros seguros.");
  }
  return value;
}

export function addMinor(a: number, b: number): number {
  return assertSafe(assertSafe(a) + assertSafe(b));
}

export function subMinor(a: number, b: number): number {
  return assertSafe(assertSafe(a) - assertSafe(b));
}

export function sumMinor(values: readonly number[]): number {
  return values.reduce((acc, v) => addMinor(acc, v), 0);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** `4500000` → `$ 45.000`; `4500050` → `$ 45.000,50`. Solo para mostrar. */
export function formatArs(minor: number): string {
  assertSafe(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const cents = abs % 100;
  const units = (abs - cents) / 100;
  const body = groupThousands(String(units)) + (cents === 0 ? "" : "," + String(cents).padStart(2, "0"));
  return `${negative ? "−" : ""}$ ${body}`;
}

/** Valor para inputs editables: `4500000` → `45.000`, `4500050` → `45.000,50`. */
export function formatArsInput(minor: number): string {
  return formatArs(minor).replace(/^\$ /, "");
}
