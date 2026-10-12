/**
 * Cliente del navegador para el modo API. No conoce claves ni modelos: llama
 * al endpoint del propio servidor y vuelve a validar la respuesta.
 */
import { appearsIn } from "./finalize";
import {
  EXTRACTION_LABEL,
  ExtractionError,
  extractionResultSchema,
  type DraftField,
  type ExtractionResult,
  type Extractor,
} from "./types";

const CLIENT_TIMEOUT_MS = 30_000;

export async function isApiExtractionAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/extraer", { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { enabled?: unknown };
    return body.enabled === true;
  } catch {
    return false;
  }
}

export const apiExtractor: Extractor = {
  mode: "api",
  label: EXTRACTION_LABEL.api,
  async extract(text, signal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
    signal?.addEventListener("abort", () => ctrl.abort());
    let res: Response;
    try {
      res = await fetch("/api/extraer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cobro-claro": "1" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
    } catch {
      throw new ExtractionError("No hubo respuesta del servidor a tiempo. El texto se conserva: completá los campos manualmente.");
    } finally {
      clearTimeout(timer);
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Error ${res.status}.`;
      throw new ExtractionError(msg);
    }
    const parsed = extractionResultSchema.safeParse(body);
    if (!parsed.success) throw new ExtractionError("La respuesta del servidor no tiene el formato esperado. Completá manualmente.");
    // Defensa adicional: cada valor debe estar respaldado por el texto original.
    const result = parsed.data as ExtractionResult;
    for (const [field, v] of Object.entries(result.draft) as Array<[DraftField, { value: string; evidence: string }]>) {
      if (!appearsIn(text, v.evidence)) {
        delete result.draft[field];
        result.discarded.push({ field, value: v.value, reason: "No aparece en el mensaje original." });
      }
    }
    return result;
  },
};
