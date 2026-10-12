/**
 * Endpoint opcional de extracción con IA. Desactivado por defecto.
 * - Solo acepta pedidos del mismo origen con el encabezado x-cobro-claro.
 * - Limita tamaño, frecuencia y uso diario; tiempo de espera configurable.
 * - No registra el texto de los mensajes.
 * No es una protección suficiente para publicar en internet: un despliegue
 * público requiere autenticación y control de gasto (ver docs/LIMITACIONES.md).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extractWithAnthropic, readApiConfig } from "@/extraction/server/anthropic";
import { createRateLimiter } from "@/extraction/server/rate-limit";
import { ExtractionError, MAX_MESSAGE_CHARS } from "@/extraction/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_000;
const limiter = createRateLimiter(
  Number(process.env.EXTRACTION_RATE_PER_MINUTE) || 10,
  Number(process.env.EXTRACTION_DAILY_CAP) || 200,
);
const bodySchema = z.object({ text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }).strict();

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const config = readApiConfig();
  return NextResponse.json({ enabled: config.enabled }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const config = readApiConfig();
  if (!config.enabled) {
    return error(503, "La extracción con IA no está habilitada en este servidor. Usá la asistencia por reglas o el formulario.");
  }
  if (req.headers.get("x-cobro-claro") !== "1") return error(403, "Solicitud no permitida.");
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return error(403, "Solicitud de otro origen no permitida.");
    } catch {
      return error(403, "Origen inválido.");
    }
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return error(413, "El mensaje es demasiado largo.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return error(400, "Cuerpo inválido.");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return error(400, `El texto debe tener entre 1 y ${MAX_MESSAGE_CHARS} caracteres.`);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const allowed = limiter.check(ip);
  if (!allowed.ok) return error(429, allowed.message);

  try {
    const result = await extractWithAnthropic(parsed.data.text, config);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ExtractionError) return error(502, e.message);
    console.error("Extracción con IA: error inesperado", e instanceof Error ? e.name : typeof e);
    return error(500, "Error inesperado. Completá los campos manualmente.");
  }
}
