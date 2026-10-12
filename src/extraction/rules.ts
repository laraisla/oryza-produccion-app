/**
 * «Asistencia por reglas»: parser sencillo, sin red y sin IA, para formatos de
 * mensaje documentados (docs/PRODUCTO.md → Extracción). No pretende entender
 * texto libre: si no reconoce un dato, lo deja vacío para que la persona lo
 * complete.
 */
import { finalizeDraft } from "./finalize";
import { EXTRACTION_LABEL, ExtractionError, MAX_MESSAGE_CHARS, type ExtractionResult, type Extractor, type LiteralSpans } from "./types";

const NAME = /\b(?:[Ss]oy|[Mm]e llamo|[Mm]i nombre es|[Hh]abla)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)?)/;
// Sin espacio entre letras y números: "pedido de 3 productos" no es una referencia.
const REF_LABELED = /\b(?:referencia|ref\.?|pedido)\s*(?:n[°º]\.?|nro\.?|:)?\s*([A-Za-z]{2,6}-?\d{1,8})\b/i;
const REF_TOKEN = /\b([A-Z]{2,6}-\d{1,8})\b/g;
const TOTAL = /\btotal\b\s*(?:de|es|:)?\s*(\$\s*\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\$\s*\d+(?:,\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s*pesos|\d+\s*pesos)/i;
const AMOUNTS = /\$\s*\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\$\s*\d+(?:,\d{1,2})?|\b\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s*(?:pesos|ARS)\b|\b\d+(?:,\d{1,2})?\s*(?:pesos|ARS)\b/gi;
const DETAIL = /\b\d{1,4}\s+(?:productos?|unidades?|art[ií]culos?|[ií]tems?|cajas?|docenas?|paquetes?|bolsas?|kilos?|kg)(?![\p{L}\p{N}_])/iu;
const DELIVERY = /\b(?:retiro|retira|retiramos|paso a buscar|pasamos a buscar|env[ií]o|entrega|enviar a|envi[aá]melo)\b[^.!?\n]{0,80}/i;
const FULL_DATE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/;

export function spansByRules(text: string): LiteralSpans {
  const name = NAME.exec(text)?.[1] ?? null;
  const labeled = REF_LABELED.exec(text)?.[1] ?? null;
  const tokens = [...new Set([...text.matchAll(REF_TOKEN)].map((m) => m[1]!))];
  const reference = labeled ?? (tokens.length === 1 ? tokens[0]! : null);
  const total = TOTAL.exec(text)?.[1]?.trim() ?? null;
  const amounts = [...new Set([...text.matchAll(AMOUNTS)].map((m) => m[0].trim()))];
  const detail = DETAIL.exec(text)?.[0] ?? null;
  const delivery = DELIVERY.exec(text)?.[0]?.trim() ?? null;
  const date = FULL_DATE.exec(text)?.[0] ?? null;
  return {
    cliente: name,
    total_texto: total,
    referencia: reference,
    detalle: detail,
    entrega: delivery,
    fecha_texto: date,
    importes_mencionados: amounts,
  };
}

export function extractByRules(text: string): ExtractionResult {
  if (text.length > MAX_MESSAGE_CHARS) {
    throw new ExtractionError(`El mensaje supera ${MAX_MESSAGE_CHARS} caracteres. Acortalo o completá el formulario.`);
  }
  // Si no hay referencia reconocible, queda en "missing": no se inventa una.
  return finalizeDraft(spansByRules(text), text, "reglas");
}

export const rulesExtractor: Extractor = {
  mode: "reglas",
  label: EXTRACTION_LABEL.reglas,
  extract: async (text) => extractByRules(text),
};

// ---------------------------------------------------------------------------
// Declaraciones de pago

const OPERATION = /\b(?:operaci[oó]n|op\.?|comprobante|transacci[oó]n|transferencia|n[°º]|nro\.?)\s*(?:n[°º]\.?|nro\.?|:|#)?\s*([A-Za-z]{0,6}-?\d{3,20})\b/i;
const MOV_TOKEN = /\b([A-Z]{2,6}-\d{2,10})\b/g;

export interface ClaimSuggestion {
  amountText?: string;
  operation?: string;
  notes: string[];
}

/** Sugiere importe declarado y operación mencionada; solo si son inequívocos. */
export function suggestClaimFields(text: string, orderReference?: string): ClaimSuggestion {
  const notes: string[] = [];
  const amounts = [...new Set([...text.matchAll(AMOUNTS)].map((m) => m[0].trim()))];
  const out: ClaimSuggestion = { notes };
  if (amounts.length === 1) out.amountText = amounts[0]!.replace(/\s*(pesos|ARS)$/i, "").replace(/^\$\s*/, "");
  else if (amounts.length > 1) notes.push(`Menciona varios importes (${amounts.join(", ")}): completá el declarado.`);

  const labeled = OPERATION.exec(text)?.[1];
  const tokens = [...new Set([...text.matchAll(MOV_TOKEN)].map((m) => m[1]!))].filter(
    (t) => !orderReference || t.toUpperCase() !== orderReference.toUpperCase(),
  );
  if (labeled && (!orderReference || labeled.toUpperCase() !== orderReference.toUpperCase())) out.operation = labeled;
  else if (tokens.length === 1) out.operation = tokens[0]!;
  else if (tokens.length > 1) notes.push(`Menciona varios identificadores (${tokens.join(", ")}): completá la operación.`);
  return out;
}
