/**
 * Validación semántica común a todos los modos. Un JSON bien formado puede
 * contener errores: por eso cada valor propuesto debe aparecer literalmente en
 * el mensaje, y los importes y fechas los interpreta este código, no el modelo.
 */
import { parseDate } from "@/domain/dates";
import { formatArsInput, parseArsText } from "@/domain/money";
import { findMentionedKeys, referenceKey, validateOrderReference } from "@/domain/references";
import { LIMITS } from "@/domain/schemas";
import type { DraftField, ExtractionMode, ExtractionResult, LiteralSpans } from "./types";

function norm(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** ¿El fragmento aparece tal cual en el texto (ignorando mayúsculas y espacios)? */
export function appearsIn(text: string, fragment: string): boolean {
  const f = norm(fragment);
  return f.length > 0 && norm(text).includes(f);
}

const MONEY_IN_SPAN = /\$\s*\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\$\s*\d+(?:,\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g;

/**
 * Interpreta el importe dentro de un fragmento como "total de $45.000". Si el
 * fragmento tiene más de un número y no queda claro cuál es el importe, no
 * adivina: devuelve null.
 */
export function moneyFromSpan(span: string): number | null {
  const all = [...span.matchAll(MONEY_IN_SPAN)].map((m) => m[0]);
  const withSign = all.filter((a) => a.includes("$"));
  const pick = withSign.length === 1 ? withSign[0] : withSign.length === 0 && all.length === 1 ? all[0] : undefined;
  if (!pick) return null;
  const parsed = parseArsText(pick);
  return parsed.ok ? parsed.minor : null;
}

/** Límites de palabra que reconocen letras acentuadas (`\b` de JS no lo hace). */
const L = "(?<![\\p{L}\\p{N}_])";
const R = "(?![\\p{L}\\p{N}_])";
const words = (body: string) => new RegExp(`${L}(?:${body})${R}`, "iu");

const RELATIVE_DATE = new RegExp(
  `${L}(?:hoy|mañana|pasado mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|la semana que viene|el finde|fin de semana|pr[oó]xima semana)${R}|${L}\\d{1,2}/\\d{1,2}(?!/\\d)${R}`,
  "iu",
);

const INSTRUCTION_LIKE = new RegExp(
  [
    `${L}(?:ignor[aá]\\p{L}*|olvid[aá]\\p{L}*|omit[ií]\\p{L}*)${R}.{0,40}${L}(?:reglas?|instrucciones?|indicaciones?|sistema)${R}`,
    `${L}marc[aá](?:lo|la|r)?${R}.{0,30}${L}como${R}.{0,15}${L}(?:pagad[oa]|conciliad[oa]|aprobad[oa])${R}`,
    `${L}(?:aprob[aá]|concili[aá])${R}.{0,30}${L}(?:pago|pedido|todo)${R}`,
  ].join("|"),
  "iu",
);

const PAYMENT_MENTION = words("(?:ya )?(?:pagu[eé]|transfer[ií]|deposit[eé]|abon[eé]|te (?:pas[eé]|mand[eé]) el comprobante|comprobante)");

export function textNotices(text: string): string[] {
  const notices: string[] = [];
  const instr = INSTRUCTION_LIKE.exec(text);
  if (instr) {
    notices.push(
      `El mensaje contiene una frase con forma de instrucción («${instr[0].slice(0, 80)}»). Se trata como texto del cliente: no cambia reglas, permisos ni estados.`,
    );
  }
  if (PAYMENT_MENTION.test(text)) {
    notices.push(
      "El mensaje menciona un pago. Una afirmación del cliente no concilia nada: después de guardar el pedido podés registrarla como declaración de pago.",
    );
  }
  return notices;
}

export function finalizeDraft(spans: LiteralSpans, text: string, mode: ExtractionMode): ExtractionResult {
  const result: ExtractionResult = { mode, draft: {}, missing: [], confirm: [], notices: textNotices(text), discarded: [] };
  const discard = (field: DraftField, value: string, reason = "No aparece literalmente en el mensaje.") =>
    result.discarded.push({ field, value: value.slice(0, 120), reason });

  // Cliente
  if (spans.cliente) {
    const v = spans.cliente.trim();
    if (!appearsIn(text, v) || !/\p{L}/u.test(v)) discard("customerName", v);
    else result.draft.customerName = { value: v.slice(0, LIMITS.customerName), evidence: v };
  }

  // Referencia
  if (spans.referencia) {
    const v = spans.referencia.trim();
    const key = referenceKey(v);
    if (validateOrderReference(v) !== null) discard("reference", v, "No tiene formato de referencia (letras y números).");
    else if (findMentionedKeys(text, [key]).length === 0) discard("reference", v);
    else result.draft.reference = { value: v.toUpperCase(), evidence: v };
  }

  // Importe total: el código interpreta el número, nunca el modelo.
  const amounts = [...new Set(spans.importes_mencionados.map((s) => s.trim()).filter((s) => appearsIn(text, s)))];
  if (spans.total_texto) {
    const v = spans.total_texto.trim();
    const minor = appearsIn(text, v) ? moneyFromSpan(v) : null;
    if (!appearsIn(text, v)) discard("total", v);
    else if (minor === null) result.confirm.push({ field: "total", message: `No se pudo interpretar «${v}» como importe en pesos. Completá el total.` });
    else {
      result.draft.total = { value: formatArsInput(minor), evidence: v };
      const others = amounts.filter((a) => moneyFromSpan(a) !== minor);
      if (others.length > 0) {
        result.confirm.push({ field: "total", message: `El mensaje también menciona ${others.map((a) => `«${a}»`).join(", ")}. Verificá que el total sea el correcto.` });
      }
    }
  } else if (amounts.length === 1) {
    const only = amounts[0]!;
    const minor = moneyFromSpan(only);
    if (minor !== null) {
      result.draft.total = { value: formatArsInput(minor), evidence: only };
      result.confirm.push({ field: "total", message: `Es el único importe del mensaje («${only}»), pero no dice que sea el total. Confirmalo.` });
    }
  } else if (amounts.length > 1) {
    result.confirm.push({
      field: "total",
      message: `El mensaje menciona varios importes (${amounts.map((a) => `«${a}»`).join(", ")}) y no está claro cuál es el total. Completalo vos.`,
    });
  }

  // Detalle y entrega: texto tal cual.
  if (spans.detalle) {
    const v = spans.detalle.trim();
    if (!appearsIn(text, v)) discard("detail", v);
    else result.draft.detail = { value: v.slice(0, LIMITS.detail), evidence: v };
  }
  if (spans.entrega) {
    const v = spans.entrega.trim();
    if (!appearsIn(text, v)) discard("delivery", v);
    else result.draft.delivery = { value: v.slice(0, LIMITS.delivery), evidence: v };
  }

  // Fecha: solo se completa si es explícita y completa; si no, se pide confirmación.
  const relative = RELATIVE_DATE.exec(text);
  if (spans.fecha_texto && appearsIn(text, spans.fecha_texto)) {
    const parsed = parseDate(spans.fecha_texto.trim());
    if (parsed.ok) {
      result.draft.deliveryDate = { value: parsed.iso, evidence: spans.fecha_texto.trim() };
      result.confirm.push({ field: "deliveryDate", message: `Fecha tomada del mensaje («${spans.fecha_texto.trim()}»). Verificala.` });
    } else {
      result.confirm.push({
        field: "deliveryDate",
        message: `El mensaje menciona «${spans.fecha_texto.trim()}». No se calcula una fecha automáticamente: confirmá la fecha exacta con el cliente si hace falta.`,
      });
    }
  } else if (spans.fecha_texto) {
    discard("deliveryDate", spans.fecha_texto);
  }
  if (relative && !result.confirm.some((c) => c.field === "deliveryDate")) {
    result.confirm.push({
      field: "deliveryDate",
      message: `El mensaje menciona «${relative[0]}». No se calcula una fecha automáticamente: confirmá la fecha exacta con el cliente si hace falta.`,
    });
  }

  for (const f of ["reference", "customerName", "total"] as const) {
    if (!result.draft[f] && !result.confirm.some((c) => c.field === f)) result.missing.push(f);
  }
  return result;
}
