import { ANCHOR_MAX_BYTES, AnchorError, type AnchorContent } from "./types";

/** Strict JSON, not a coercion of JS objects. Commercial decimals must be strings. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  let encodedBytes = 0;
  function encode(v: unknown, depth: number): string {
    if (++nodes > 100_000 || depth > 64)
      throw new AnchorError("INVALID_CONTENT", "JSON demasiado complejo");
    if (v === null || typeof v === "boolean" || typeof v === "string") {
      if (typeof v === "string" && v.length > ANCHOR_MAX_BYTES)
        throw new AnchorError("INVALID_CONTENT", "Texto demasiado grande");
      if (typeof v === "string" && /[\uD800-\uDFFF]/u.test(v))
        throw new AnchorError("INVALID_CONTENT", "Texto Unicode inválido");
      const encoded = JSON.stringify(v);
      encodedBytes += new TextEncoder().encode(encoded).length;
      if (encodedBytes > ANCHOR_MAX_BYTES)
        throw new AnchorError("INVALID_CONTENT", "Contenido demasiado grande");
      return encoded;
    }
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v) || Object.is(v, -0))
        throw new AnchorError(
          "INVALID_CONTENT",
          "Usá cadenas para decimales; solo se admiten enteros seguros",
        );
      return JSON.stringify(v);
    }
    if (typeof v !== "object" || v === undefined)
      throw new AnchorError("INVALID_CONTENT", "Valor no JSON");
    if (ancestors.has(v)) throw new AnchorError("INVALID_CONTENT", "JSON circular");
    if (
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      throw new AnchorError("INVALID_CONTENT", "Se requiere un objeto JSON plano");
    if (Object.getOwnPropertySymbols(v).length)
      throw new AnchorError("INVALID_CONTENT", "No se admiten símbolos");
    ancestors.add(v);
    let result: string;
    if (Array.isArray(v)) {
      if (
        Object.keys(v).length !== v.length ||
        Object.getOwnPropertyNames(v).length !== v.length + 1
      )
        throw new AnchorError("INVALID_CONTENT", "Array disperso o con propiedades extra");
      result = `[${Array.from({ length: v.length }, (_, i) => {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        if (!d || !("value" in d)) throw new AnchorError("INVALID_CONTENT", "Array no JSON");
        return encode(d.value, depth + 1);
      }).join(",")}]`;
    } else {
      result = `{${Object.getOwnPropertyNames(v)
        .sort()
        .map((key) => {
          const d = Object.getOwnPropertyDescriptor(v, key)!;
          if (!d.enumerable || !("value" in d))
            throw new AnchorError(
              "INVALID_CONTENT",
              "No se admiten getters ni propiedades ocultas",
            );
          return `${encode(key, depth + 1)}:${encode(d.value, depth + 1)}`;
        })
        .join(",")}}`;
    }
    ancestors.delete(v);
    return result;
  }
  const result = encode(value, 0);
  if (new TextEncoder().encode(result).length > ANCHOR_MAX_BYTES)
    throw new AnchorError("INVALID_CONTENT", "Contenido demasiado grande");
  return result;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}

export function contentBytes(content: AnchorContent): Uint8Array {
  let bytes: Uint8Array;
  if (content.kind === "document" && content.bytes instanceof Uint8Array) {
    if (!content.bytes.length || content.bytes.length > ANCHOR_MAX_BYTES)
      throw new AnchorError("INVALID_CONTENT", "Contenido vacío o demasiado grande");
    bytes = new Uint8Array(content.bytes);
  } else if (
    content.kind === "agreement" &&
    content.conditions &&
    typeof content.conditions === "object" &&
    !Array.isArray(content.conditions) &&
    Object.keys(content.conditions).length
  ) {
    bytes = new TextEncoder().encode(canonicalJson(content.conditions));
  } else throw new AnchorError("INVALID_CONTENT", "Documento o condiciones ausentes");
  if (!bytes.length || bytes.length > ANCHOR_MAX_BYTES)
    throw new AnchorError("INVALID_CONTENT", "Contenido vacío o demasiado grande");
  return bytes;
}
