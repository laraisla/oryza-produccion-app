// ============================================================
// Webhook público de WhatsApp Business (conector oficial Meta).
// Lovable reenvía acá cada mensaje y estado que Meta entrega
// para el número conectado. Flujo:
//   1. Verificar firma (WHATSAPP_API_KEY) — 401 si falla.
//   2. Persistir la entrega en la bandeja durable — 5xx si falla.
//   3. Procesar de forma idempotente: guardar mensajes entrantes,
//      responder con el motor del asistente y reconciliar estados
//      de entrega de los mensajes salientes.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest, WebhookError } from "@lovable.dev/webhooks-js";
import { responderMensaje, enviarWhatsApp } from "@/lib/agent-server";
import type { Json } from "@/integrations/supabase/types";

interface CambioWhatsApp {
  field?: string;
  value?: {
    messages?: { id: string; from: string; type: string; text?: { body: string } }[];
    statuses?: { id: string; status: string; recipient_id: string }[];
  };
}

interface PayloadWhatsApp {
  entry?: { changes?: CambioWhatsApp[] }[];
}

// Orden de avance de estados: un "sent" viejo nunca pisa "delivered"/"read".
const ORDEN_ESTADO: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3 };

async function procesarEntrega(payload: PayloadWhatsApp): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cambios = payload.entry?.flatMap((e) => e.changes ?? []) ?? [];

  for (const cambio of cambios) {
    // ---- Mensajes entrantes ----
    for (const msg of cambio.value?.messages ?? []) {
      // Dedupe por id de mensaje de Meta.
      const { data: existente } = await supabaseAdmin
        .from("whatsapp_mensajes")
        .select("id")
        .eq("wa_message_id", msg.id)
        .maybeSingle();
      if (existente) continue;

      const cuerpo = msg.type === "text" ? (msg.text?.body ?? "") : "";
      const { error: errIns } = await supabaseAdmin.from("whatsapp_mensajes").insert({
        wa_message_id: msg.id,
        direccion: "entrante",
        telefono: msg.from,
        tipo: msg.type,
        contenido: cuerpo || `[${msg.type}]`,
        estado: "recibido",
      });
      if (errIns) throw new Error(`No se pudo guardar el mensaje entrante: ${errIns.message}`);

      if (msg.type === "text" && cuerpo.trim()) {
        const respuesta = await responderMensaje(msg.from, cuerpo);
        await enviarWhatsApp(msg.from, respuesta);
      } else {
        await enviarWhatsApp(
          msg.from,
          "Recibí tu archivo/audio, pero la transcripción y lectura de documentos todavía no están configuradas. " +
            "Escribime el dato en texto (por ejemplo: «Tengo 80 toneladas de arroz largo fino») o AYUDA.",
        );
      }
      await supabaseAdmin
        .from("whatsapp_mensajes")
        .update({ estado: "procesado" })
        .eq("wa_message_id", msg.id);
    }

    // ---- Estados de entrega de mensajes salientes ----
    for (const st of cambio.value?.statuses ?? []) {
      const { data: saliente } = await supabaseAdmin
        .from("whatsapp_mensajes")
        .select("id,estado")
        .eq("wa_message_id", st.id)
        .maybeSingle();
      if (!saliente) continue; // puede llegar antes de guardar el envío; se reintenta con la entrega
      const actual = ORDEN_ESTADO[saliente.estado] ?? -1;
      const nuevo = ORDEN_ESTADO[st.status] ?? -1;
      if (nuevo > actual) {
        await supabaseAdmin
          .from("whatsapp_mensajes")
          .update({ estado: st.status })
          .eq("id", saliente.id);
      }
    }
  }
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) {
          return Response.json(
            { estado: "Pendiente de configuración", detalle: "Falta WHATSAPP_API_KEY en el servidor." },
            { status: 503 },
          );
        }

        // 1. Verificación de firma obligatoria.
        let verificado;
        try {
          verificado = await verifyWebhookRequest<PayloadWhatsApp>({
            req: request,
            secret,
            maxBodyBytes: 4 * 1024 * 1024,
          });
        } catch (error) {
          if (error instanceof WebhookError) {
            return Response.json({ error: "Firma inválida", codigo: error.code }, { status: 401 });
          }
          throw error;
        }

        const deliveryId = request.headers.get("x-lovable-delivery");
        const evento = request.headers.get("x-lovable-event") ?? "desconocido";
        if (!deliveryId || !evento) {
          return Response.json({ error: "Faltan encabezados de entrega" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 2. Persistencia durable de la entrega (idempotente por delivery_id).
        const { data: fila, error: errInbox } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .upsert(
            { delivery_id: deliveryId, event: evento, payload: verificado.payload as unknown as Json },
            { onConflict: "delivery_id" },
          )
          .select("id, processed_at")
          .single();
        if (errInbox || !fila) {
          return Response.json(
            { error: `No se pudo registrar la entrega: ${errInbox?.message ?? "desconocido"}` },
            { status: 500 },
          );
        }

        // Entrega duplicada ya procesada: ack sin reprocesar.
        if (fila.processed_at) {
          return Response.json({ recibido: true, entrega: deliveryId, duplicada: true }, { status: 200 });
        }

        // 3. Procesamiento. Un fallo devuelve 5xx para que el gateway reintente.
        try {
          await procesarEntrega(verificado.payload);
        } catch (error) {
          const detalle = error instanceof Error ? error.message : String(error);
          await supabaseAdmin
            .from("whatsapp_webhook_events")
            .update({ processing_error: detalle })
            .eq("id", fila.id);
          return Response.json({ error: detalle }, { status: 500 });
        }

        await supabaseAdmin
          .from("whatsapp_webhook_events")
          .update({ processed_at: new Date().toISOString(), processing_error: null })
          .eq("id", fila.id);

        return Response.json({ recibido: true, entrega: deliveryId, evento }, { status: 200 });
      },
    },
  },
});
