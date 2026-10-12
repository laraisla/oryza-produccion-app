/**
 * Coincidencia explícita de referencias. Una referencia (p. ej. `PED-101`) se
 * convierte en tokens (`PED`, `101`) y se busca como secuencia contigua de
 * tokens dentro del texto. Así `ped 101`, `PED101` y `PED-101` coinciden, pero
 * `PED-1010` no coincide con `PED-101`.
 */

export function tokenize(text: string): string[] {
  const upper = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return upper
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .flatMap((chunk) => chunk.match(/[A-Z]+|[0-9]+/g) ?? []);
}

/** Clave canónica: tokens unidos con guion. `ped 101` → `PED-101`. */
export function referenceKey(reference: string): string {
  return tokenize(reference).join("-");
}

/**
 * Una referencia de pedido válida tiene entre 3 y 30 caracteres, al menos una
 * letra y un dígito, y solo letras, dígitos, espacios, guiones, puntos, barras
 * o guiones bajos. Se exige letra y dígito para evitar coincidencias triviales.
 */
export function validateOrderReference(reference: string): string | null {
  const text = reference.trim();
  if (text.length < 3) return "La referencia debe tener al menos 3 caracteres.";
  if (text.length > 30) return "La referencia no puede superar 30 caracteres.";
  if (!/^[A-Za-z0-9][A-Za-z0-9 _./-]*$/.test(text)) {
    return "La referencia solo admite letras, números, espacios, guiones, puntos o barras.";
  }
  if (!/[A-Za-z]/.test(text) || !/[0-9]/.test(text)) {
    return "La referencia debe incluir letras y números (ej.: PED-101).";
  }
  return null;
}

interface Span {
  key: string;
  start: number;
  length: number;
}

function findSpans(haystack: string[], needle: string[]): number[] {
  const starts: number[] = [];
  if (needle.length === 0 || needle.length > haystack.length) return starts;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) starts.push(i);
  }
  return starts;
}

/**
 * Devuelve las claves de referencia (de `candidateKeys`) mencionadas en el
 * texto. Si una coincidencia queda contenida en otra más larga (p. ej.
 * `PED-101` dentro de `PED-101-2`), se descarta la más corta.
 */
export function findMentionedKeys(text: string, candidateKeys: Iterable<string>): string[] {
  const hay = tokenize(text);
  if (hay.length === 0) return [];
  const spans: Span[] = [];
  for (const key of candidateKeys) {
    const needle = key.split("-").filter(Boolean);
    for (const start of findSpans(hay, needle)) {
      spans.push({ key, start, length: needle.length });
    }
  }
  const kept = spans.filter(
    (s) =>
      !spans.some(
        (o) =>
          o !== s &&
          o.length > s.length &&
          o.start <= s.start &&
          o.start + o.length >= s.start + s.length,
      ),
  );
  return [...new Set(kept.map((s) => s.key))];
}

/**
 * Tokens con forma de referencia de pedido (letras seguidas de números) que no
 * corresponden a ningún pedido cargado. Solo informativo.
 */
export function findReferenceLikeTokens(text: string): string[] {
  const out = new Set<string>();
  const upper = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  for (const m of upper.matchAll(/\b([A-Z]{2,6})[\s-]?(\d{2,8})\b/g)) {
    out.add(`${m[1]}-${m[2]}`);
  }
  return [...out];
}
