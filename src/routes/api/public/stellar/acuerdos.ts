// ============================================================
// API de evidencia Stellar TESTNET.
//
// GET  ?id=<n>&tx=<hash>,<hash>&hash=<terms>
//      Estado CONFIRMADO por la red: acuerdo (simulación de `get`),
//      verificación del hash de condiciones, eventos del contrato,
//      verificación de cada hash de transacción en Horizon y saldo
//      en custodia. No usa datos locales como prueba.
//
// POST { etapa: "create", condiciones } | { etapa, id }
//      Firma con cuentas de PRUEBA del servidor. Solo responde en
//      desarrollo local, para clientes cuya IP de socket es loopback,
//      con STELLAR_DEMO_SIGNING=1 y las claves configuradas; si no,
//      503 explícito (nunca simula una transacción). No confía en
//      `Host` ni en `X-Forwarded-For`.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { montoAUnidades } from "@/lib/stellar/config";
import { hashCondiciones, validarCondiciones, type CondicionesOrden } from "@/lib/stellar/terms";

const HEX64 = /^[0-9a-f]{64}$/;
const MONTO_MAXIMO_PRUEBA = 50_000; // AGROUSD de prueba por acuerdo

const condicionesSchema = z.object({
  orden: z.string().min(1).max(40),
  tipo: z.enum(["local", "exportacion"]),
  vendedor: z.string().min(1).max(120),
  comprador: z.string().min(1).max(120),
  producto: z.object({
    tipoArroz: z.string().max(40),
    variedad: z.string().max(40),
    quebradoMaxPct: z.number(),
    humedadMaxPct: z.number(),
    presentacion: z.string().max(60),
  }),
  cantidadTn: z.number().positive(),
  precioTnUsd: z.number().positive(),
  totalUsd: z.number().positive(),
  incoterm: z.string().max(10).optional(),
  lugarDesignado: z.string().max(120).optional(),
  lugarEntrega: z.string().max(120).optional(),
  condicionPago: z.string().max(200),
  nota: z.string().max(200),
});

const postSchema = z.discriminatedUnion("etapa", [
  z.object({ etapa: z.literal("create"), condiciones: condicionesSchema }),
  z.object({
    etapa: z.enum(["accept", "deposit", "release", "refund"]),
    id: z.number().int().nonnegative(),
  }),
]);

const error = (status: number, mensaje: string) =>
  Response.json({ ok: false, error: mensaje }, { status });

// Códigos de `Error` en blockchain/contracts/agroglobal-escrow/src/lib.rs
const ERRORES_CONTRATO: Record<string, string> = {
  "1": "El acuerdo no existe en el contrato",
  "2": "Monto inválido",
  "3": "El acuerdo no está en el estado requerido para este paso",
  "4": "La cuenta no está autorizada para este paso",
  "5": "El vencimiento debe ser futuro",
  "6": "El comprador solo puede pedir reembolso después del vencimiento",
  "7": "Comprador y vendedor deben ser distintos",
};

/** IP real del cliente según el socket; `undefined` si no se puede determinar (falla cerrada). */
async function ipCliente(): Promise<string | undefined> {
  try {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    return getRequestIP();
  } catch {
    return undefined;
  }
}

function mensajeRed(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  const codigo = /Error\(Contract, #(\d+)\)/.exec(texto)?.[1];
  if (codigo) return `Rechazado por el contrato: ${ERRORES_CONTRATO[codigo] ?? `error #${codigo}`}`;
  return texto.split("\n")[0]!.slice(0, 300);
}

export const Route = createFileRoute("/api/public/stellar/acuerdos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.has("info")) {
          const s = await import("@/lib/stellar/stellar.server");
          return Response.json({
            ok: true,
            red: "testnet",
            firmaHabilitada: s.firmaHabilitada(await ipCliente()),
          });
        }
        const id = Number(url.searchParams.get("id"));
        if (!Number.isInteger(id) || id < 0) return error(400, "id inválido");
        const txs = (url.searchParams.get("tx") ?? "").split(",").filter(Boolean);
        if (txs.length > 10 || !txs.every((h) => HEX64.test(h)))
          return error(400, "hashes de transacción inválidos");
        const termsHash = url.searchParams.get("hash") ?? "";
        if (termsHash && !HEX64.test(termsHash)) return error(400, "hash de condiciones inválido");

        const s = await import("@/lib/stellar/stellar.server");
        try {
          const [acuerdo, eventos, transacciones, custodia] = await Promise.all([
            s.leerAcuerdo(id),
            s.eventosDelAcuerdo(id),
            s.verificarTransacciones(txs),
            s.saldoEnCustodia(),
          ]);
          const condicionesVerificadas =
            acuerdo && termsHash ? await s.verificarHashCondiciones(id, termsHash) : null;
          return Response.json({
            ok: true,
            red: "testnet",
            consultadoEn: new Date().toISOString(),
            acuerdo,
            condicionesVerificadas,
            eventos: eventos.eventos,
            eventosDesdeLedger: eventos.desdeLedger,
            eventosFueraDeRetencion: eventos.fueraDeRetencion,
            transacciones,
            saldoCustodiaContrato: custodia,
            firmaHabilitada: s.firmaHabilitada(await ipCliente()),
          });
        } catch (e) {
          return error(
            502,
            `No se pudo consultar Stellar Testnet: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      },

      POST: async ({ request }) => {
        const s = await import("@/lib/stellar/stellar.server");
        if (!s.firmaHabilitada(await ipCliente())) {
          return error(
            503,
            "La firma con cuentas de prueba no está habilitada en este servidor. Solo lectura.",
          );
        }
        let body: z.infer<typeof postSchema>;
        try {
          body = postSchema.parse(await request.json());
        } catch {
          return error(400, "Pedido inválido");
        }
        try {
          if (body.etapa === "create") {
            const condiciones = body.condiciones as CondicionesOrden;
            const errores = validarCondiciones(condiciones);
            if (errores.length) return error(422, errores.join(". "));
            if (condiciones.totalUsd > MONTO_MAXIMO_PRUEBA) {
              return error(
                422,
                `El monto de prueba no puede superar ${MONTO_MAXIMO_PRUEBA} AGROUSD`,
              );
            }
            const termsHash = await hashCondiciones(condiciones);
            const montoUnidades = montoAUnidades(condiciones.totalUsd);
            const r = await s.crearAcuerdo({
              montoUnidades,
              termsHash,
              orderRef: condiciones.orden,
              plazoDias: 30,
            });
            return Response.json({ ok: true, id: r.id, hash: r.hash, termsHash, montoUnidades });
          }
          const r = await s.ejecutarEtapa(body.etapa, body.id);
          return Response.json({ ok: true, id: body.id, hash: r.hash });
        } catch (e) {
          const mensaje = mensajeRed(e);
          return error(mensaje.startsWith("Rechazado por el contrato") ? 409 : 502, mensaje);
        }
      },
    },
  },
});
