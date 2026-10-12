/**
 * Extracción asistida de pedidos a partir de mensajes. La salida es SIEMPRE un
 * borrador para que una persona lo revise: nunca crea pedidos, nunca decide
 * pagos y nunca cambia estados.
 */
import { z } from "zod";

export const MAX_MESSAGE_CHARS = 2000;

export type ExtractionMode = "reglas" | "api";

export const EXTRACTION_LABEL: Record<ExtractionMode, string> = {
  reglas: "Asistencia por reglas",
  api: "Asistencia con IA (API)",
};

/**
 * Fragmentos LITERALES del mensaje. Tanto el parser por reglas como el modelo
 * devuelven esta forma; luego `finalizeDraft` verifica que cada fragmento
 * exista en el texto y lo convierte (importes y fechas los convierte el código,
 * nunca el modelo).
 */
export const literalSpansSchema = z.object({
  cliente: z.string().nullable(),
  total_texto: z.string().nullable(),
  referencia: z.string().nullable(),
  detalle: z.string().nullable(),
  entrega: z.string().nullable(),
  fecha_texto: z.string().nullable(),
  importes_mencionados: z.array(z.string()),
});
export type LiteralSpans = z.infer<typeof literalSpansSchema>;

export type DraftField = "reference" | "customerName" | "total" | "detail" | "delivery" | "deliveryDate";

export interface DraftValue {
  value: string;
  /** Fragmento del mensaje que respalda el valor. */
  evidence: string;
}

export interface ExtractionResult {
  mode: ExtractionMode;
  draft: Partial<Record<DraftField, DraftValue>>;
  /** Campos obligatorios que el mensaje no trae. */
  missing: DraftField[];
  /** Datos ambiguos que la persona debe confirmar. */
  confirm: Array<{ field: DraftField; message: string }>;
  /** Avisos generales (instrucciones incrustadas, menciones de pago…). */
  notices: string[];
  /** Valores propuestos que se descartaron por no aparecer en el texto. */
  discarded: Array<{ field: DraftField; value: string; reason: string }>;
}

export const extractionResultSchema = z.object({
  mode: z.enum(["reglas", "api"]),
  draft: z.record(
    z.enum(["reference", "customerName", "total", "detail", "delivery", "deliveryDate"]),
    z.object({ value: z.string().max(300), evidence: z.string().max(MAX_MESSAGE_CHARS) }),
  ),
  missing: z.array(z.enum(["reference", "customerName", "total", "detail", "delivery", "deliveryDate"])),
  confirm: z.array(z.object({ field: z.enum(["reference", "customerName", "total", "detail", "delivery", "deliveryDate"]), message: z.string().max(500) })),
  notices: z.array(z.string().max(500)),
  discarded: z.array(z.object({ field: z.enum(["reference", "customerName", "total", "detail", "delivery", "deliveryDate"]), value: z.string().max(300), reason: z.string().max(300) })),
});

export interface Extractor {
  mode: ExtractionMode;
  label: string;
  extract(text: string, signal?: AbortSignal): Promise<ExtractionResult>;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}
