// ============================================================
// Consulta LOCAL y de SOLO LECTURA del anclaje documental en Stellar Testnet.
//
// GET  (sin id)  → evidencias del diario local (solo metadatos públicos).
// GET  ?id=<uuid> → detalle: consulta Horizon y verificación independiente
//                   del snapshot (red, sobre, emisor, firma, memo, operación,
//                   hash, éxito y contenido).
// POST ?id=<uuid> con el documento (application/octet-stream) → compara ese
//                   archivo con la evidencia registrada. No firma ni envía.
//
// Solo responde en `vite dev`, a sockets loopback, con Host local y, si hay
// cuerpo, mismo origen. Requiere STELLAR_ANCHOR_DEMO=1 y la configuración
// pública de la cuenta. No hay ruta capaz de firmar, preparar ni enviar.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAXIMO = 4 * 1024 * 1024;

const respuesta = (status: number, cuerpo: object) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });
const error = (status: number, codigo: string, mensaje: string) =>
  respuesta(status, { ok: false, codigo, error: mensaje });

/** IP real del cliente según el socket; `undefined` si no se puede determinar (falla cerrada). */
async function ipCliente(): Promise<string | undefined> {
  try {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    return getRequestIP();
  } catch {
    return undefined;
  }
}

async function preparar(request: Request, conCuerpo: boolean) {
  const c = await import("@/lib/stellar/anchor/consulta.server");
  const permitido = c.accesoLocal({
    dev: import.meta.env.DEV === true,
    ip: await ipCliente(),
    url: request.url,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    conCuerpo,
  });
  if (!permitido)
    return {
      falla: error(
        403,
        "SOLO_LOCAL",
        "La consulta del diario solo está disponible en el servidor de desarrollo local (localhost).",
      ),
    };
  const config = c.configConsulta();
  if (!config)
    return {
      falla: error(
        503,
        "NO_CONFIGURADO",
        "Consulta local no configurada: iniciar el servidor con STELLAR_ANCHOR_DEMO=1, STELLAR_ANCHOR_PUBLIC_KEY y STELLAR_ANCHOR_EPOCH.",
      ),
    };
  return { c, config };
}

const ESTADOS: Record<string, number> = {
  NOT_FOUND: 404,
  INVALID_CONTENT: 422,
  LOCKED: 409,
  CORRUPT: 500,
  CONFIG: 409,
  STORAGE: 500,
  DISABLED: 403,
  UNAUTHORIZED: 403,
};

async function fallo(e: unknown): Promise<Response> {
  const { AnchorError } = await import("@/lib/stellar/anchor/types");
  if (e instanceof AnchorError)
    return error(ESTADOS[e.code] ?? 502, e.code, e.message.slice(0, 300));
  return error(502, "RED", "No se pudo consultar Stellar Testnet. Reintentar.");
}

export const Route = createFileRoute("/api/public/stellar/anclaje")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const p = await preparar(request, false);
        if ("falla" in p) return p.falla;
        const id = new URL(request.url).searchParams.get("id");
        try {
          if (id === null) {
            const evidencias = await p.c.listarEvidencias(p.config);
            return respuesta(200, { ok: true, cuenta: p.config.publicKey, evidencias });
          }
          if (!UUID.test(id)) return error(400, "ID", "Identificador de evidencia inválido");
          return respuesta(200, { ok: true, ...(await p.c.detalleEvidencia(p.config, id)) });
        } catch (e) {
          return fallo(e);
        }
      },

      POST: async ({ request }) => {
        const p = await preparar(request, true);
        if ("falla" in p) return p.falla;
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!UUID.test(id)) return error(400, "ID", "Identificador de evidencia inválido");
        // Tipo no "simple": un sitio ajeno no puede enviarlo sin preflight CORS (que no se responde).
        if (
          (request.headers.get("content-type") ?? "").split(";")[0] !== "application/octet-stream"
        )
          return error(415, "TIPO", "Enviar el documento como application/octet-stream");
        const declarado = Number(request.headers.get("content-length") ?? "0");
        if (declarado > MAXIMO) return error(413, "TAMANO", "El documento supera 4 MiB");
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await request.arrayBuffer());
        } catch {
          return error(400, "CUERPO", "No se pudo leer el documento");
        }
        if (bytes.byteLength > MAXIMO) return error(413, "TAMANO", "El documento supera 4 MiB");
        try {
          return respuesta(200, {
            ok: true,
            consultadoEn: new Date().toISOString(),
            ...(await p.c.verificarDocumento(p.config, id, bytes)),
          });
        } catch (e) {
          return fallo(e);
        }
      },
    },
  },
});
