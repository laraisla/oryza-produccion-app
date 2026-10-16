/**
 * Serialización canónica y hashes de acuerdos.
 *
 * El hash de términos se calcula sobre un JSON canónico: claves ordenadas,
 * sin espacios, sin valores `undefined`. Los importes viajan como strings
 * decimales para no depender de la representación binaria de los números.
 * Funciona igual en navegador y en Node 22 (WebCrypto global).
 */

export type CanonicalValue =
  | string
  | boolean
  | number
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue | undefined };

export function canonicalJson(value: CanonicalValue | undefined): string {
  if (value === undefined) {
    throw new Error('canonicalJson: valor undefined en la raíz');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`canonicalJson: solo se admiten enteros seguros; usar string para ${value}`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Hex inválido');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export const DEAL_KEY_PREFIX = 'agromatch:deal:v1:';

/** Clave on-chain de una operación: no revela el identificador interno. */
export function dealKeyFor(operationId: string): Promise<string> {
  return sha256Hex(`${DEAL_KEY_PREFIX}${operationId}`);
}

export function termsHashFor(terms: CanonicalValue): Promise<string> {
  return sha256Hex(canonicalJson(terms));
}
