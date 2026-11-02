// ============================================================
// AgroGlobal COMEX — Motor del asistente WhatsApp (lado servidor).
// Reutiliza el intérprete determinístico de src/lib/agent.ts y
// ejecuta las acciones confirmadas contra la base de datos.
// Nunca inventa datos: solo actúa sobre filas reales.
// ============================================================

import { interpretMessage, resumirOferta, type DatosOferta } from "@/lib/agent";
import type { Json } from "@/integrations/supabase/types";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

type Admin = Awaited<ReturnType<typeof getAdmin>>;

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Envía un mensaje de texto por WhatsApp y guarda el registro saliente. */
export async function enviarWhatsApp(telefono: string, cuerpo: string): Promise<void> {
  const admin = await getAdmin();
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const WHATSAPP_API_KEY = process.env["WHATSAPP_API_KEY"];
  if (!LOVABLE_API_KEY || !WHATSAPP_API_KEY) {
    throw new Error("Credenciales del conector WhatsApp no configuradas");
  }

  const response = await fetch(`${GATEWAY_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": WHATSAPP_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono.replace(/\D/g, ""),
      type: "text",
      text: { body: cuerpo },
    }),
  });
  const texto = await response.text();
  if (!response.ok) {
    await admin.from("whatsapp_mensajes").insert({
      direccion: "saliente",
      telefono,
      contenido: cuerpo,
      estado: "failed",
    });
    throw new Error(`Envío WhatsApp falló (${response.status}): ${texto}`);
  }

  let waId: string | null = null;
  try {
    const json = JSON.parse(texto) as { messages?: { id?: string }[] };
    waId = json.messages?.[0]?.id ?? null;
  } catch {
    /* cuerpo no JSON: igualmente fue aceptado */
  }
  await admin.from("whatsapp_mensajes").insert({
    wa_message_id: waId,
    direccion: "saliente",
    telefono,
    contenido: cuerpo,
    estado: "accepted",
  });
}

const AYUDA =
  "Soy el asistente de AgroGlobal COMEX. Puedo ayudarte con:\n" +
  "• Publicar una oferta: «Tengo 80 toneladas de arroz largo fino, 5% de quebrado, en bolsas de 25 kilos»\n" +
  "• Actualizar stock: «Vendí 10 toneladas»\n" +
  "• Consultar tu stock: «¿Cuánto stock tengo?»\n" +
  "Nada se ejecuta sin tu confirmación.";

async function listarStock(admin: Admin, telefono: string): Promise<string> {
  const { data } = await admin
    .from("whatsapp_ofertas")
    .select("codigo,tipo_arroz,variedad,cantidad_tn,estado")
    .eq("telefono", telefono)
    .gt("cantidad_tn", 0)
    .order("created_at", { ascending: false });
  if (!data?.length) return "No tenés ofertas con stock disponible publicadas desde WhatsApp.";
  const lineas = data.map(
    (o) => `• ${o.codigo}: ${o.cantidad_tn} tn de arroz ${o.tipo_arroz} ${o.variedad} (${o.estado})`,
  );
  return `Tu stock publicado:\n${lineas.join("\n")}`;
}

async function confirmarAccion(admin: Admin, telefono: string): Promise<string> {
  const { data: accion } = await admin
    .from("whatsapp_acciones")
    .select("*")
    .eq("telefono", telefono)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!accion) return "No tenés ninguna acción pendiente de confirmación.";

  if (accion.tipo === "publicar_oferta") {
    const d = accion.datos as DatosOferta;
    const { count } = await admin
      .from("whatsapp_ofertas")
      .select("id", { count: "exact", head: true });
    const codigo = `OF-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const { error } = await admin.from("whatsapp_ofertas").insert({
      codigo,
      telefono,
      tipo_arroz: d.tipoArroz ?? "Blanco",
      variedad: d.variedad ?? "Largo fino",
      cantidad_tn: d.cantidadTn ?? 0,
      quebrado_pct: d.quebradoPct ?? null,
      humedad_pct: d.humedadPct ?? null,
      presentacion: d.presentacion ?? null,
      accion_id: accion.id,
    });
    if (error) throw new Error(`No se pudo publicar la oferta: ${error.message}`);
    await admin
      .from("whatsapp_acciones")
      .update({ estado: "confirmada", resuelta_at: new Date().toISOString() })
      .eq("id", accion.id);
    return `✅ Oferta ${codigo} publicada correctamente. Ya está visible para los compradores de la plataforma.`;
  }

  if (accion.tipo === "actualizar_stock") {
    const d = accion.datos as { ofertaId?: string; cantidadTn?: number };
    if (!d.ofertaId || !d.cantidadTn) throw new Error("Acción de stock incompleta.");
    // Idempotencia: si ya existe un movimiento para esta acción, no repetir.
    const { data: movExistente } = await admin
      .from("whatsapp_movimientos")
      .select("id")
      .eq("accion_id", accion.id)
      .maybeSingle();
    if (movExistente) {
      await admin
        .from("whatsapp_acciones")
        .update({ estado: "confirmada", resuelta_at: new Date().toISOString() })
        .eq("id", accion.id);
      return "Esta actualización de stock ya había sido aplicada (duplicado evitado).";
    }
    const { data: oferta } = await admin
      .from("whatsapp_ofertas")
      .select("id,codigo,cantidad_tn")
      .eq("id", d.ofertaId)
      .single();
    if (!oferta) throw new Error("No se encontró la oferta asociada.");
    if (d.cantidadTn > Number(oferta.cantidad_tn)) {
      return `No se puede descontar ${d.cantidadTn} tn: el stock disponible de ${oferta.codigo} es ${oferta.cantidad_tn} tn. La acción sigue pendiente.`;
    }
    const nuevo = Number(oferta.cantidad_tn) - d.cantidadTn;
    const { error: errMov } = await admin.from("whatsapp_movimientos").insert({
      oferta_id: oferta.id,
      accion_id: accion.id,
      cantidad_tn: d.cantidadTn,
      stock_anterior_tn: oferta.cantidad_tn,
      stock_nuevo_tn: nuevo,
    });
    if (errMov) throw new Error(`No se pudo registrar el movimiento: ${errMov.message}`);
    await admin
      .from("whatsapp_ofertas")
      .update({ cantidad_tn: nuevo, estado: nuevo === 0 ? "Agotado" : "Disponible" })
      .eq("id", oferta.id);
    await admin
      .from("whatsapp_acciones")
      .update({ estado: "confirmada", resuelta_at: new Date().toISOString() })
      .eq("id", accion.id);
    return `✅ Stock actualizado: ${oferta.codigo} pasó de ${oferta.cantidad_tn} tn a ${nuevo} tn.`;
  }

  return "Tipo de acción no reconocido.";
}

async function cancelarAccion(admin: Admin, telefono: string): Promise<string> {
  const { data: accion } = await admin
    .from("whatsapp_acciones")
    .select("id")
    .eq("telefono", telefono)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!accion) return "No tenés ninguna acción pendiente.";
  await admin
    .from("whatsapp_acciones")
    .update({ estado: "cancelada", resuelta_at: new Date().toISOString() })
    .eq("id", accion.id);
  return "Acción cancelada. No se aplicó ningún cambio.";
}

/** Procesa un mensaje entrante y devuelve el texto de respuesta. */
export async function responderMensaje(telefono: string, texto: string): Promise<string> {
  const admin = await getAdmin();
  const n = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // Confirmación / cancelación de acciones pendientes
  if (/^(si|sí|confirmo|confirmar|dale|ok|bueno|perfecto)\b/.test(n.trim())) {
    return confirmarAccion(admin, telefono);
  }
  if (/^(no|cancelar|cancela|deja|olvidate)\b/.test(n.trim())) {
    return cancelarAccion(admin, telefono);
  }

  const interp = interpretMessage(texto);

  switch (interp.intencion) {
    case "publicar_oferta": {
      if (interp.camposFaltantes.length > 0) {
        return (
          `Casi tengo tu oferta. Me falta: ${interp.camposFaltantes.join(" y ")}.\n` +
          "Contame esos datos y la preparamos."
        );
      }
      const resumen = resumirOferta(interp.oferta!);
      const { error } = await admin.from("whatsapp_acciones").insert({
        telefono,
        tipo: "publicar_oferta",
        datos: interp.oferta! as unknown as Json,
        resumen,
      });
      if (error) throw new Error(`No se pudo guardar la acción: ${error.message}`);
      return (
        `Entendí que querés publicar esta oferta:\n${resumen}\n\n` +
        "¿Confirmás la publicación? Respondé SÍ para publicar o NO para cancelar."
      );
    }

    case "actualizar_stock": {
      const { data: ofertas } = await admin
        .from("whatsapp_ofertas")
        .select("id,codigo,cantidad_tn")
        .eq("telefono", telefono)
        .gt("cantidad_tn", 0)
        .order("created_at", { ascending: false });
      if (!ofertas?.length) {
        return "No encontré ofertas con stock disponible publicadas desde WhatsApp. Primero publicá una oferta.";
      }
      const oferta = ofertas[0]!;
      const cantidad = interp.cantidadMovimientoTn!;
      const resumen = `Egreso de ${cantidad} tn de ${oferta.codigo} (stock actual: ${oferta.cantidad_tn} tn)`;
      const { error } = await admin.from("whatsapp_acciones").insert({
        telefono,
        tipo: "actualizar_stock",
        datos: { ofertaId: oferta.id, cantidadTn: cantidad },
        resumen,
      });
      if (error) throw new Error(`No se pudo guardar la acción: ${error.message}`);
      return (
        `Registro un egreso de ${cantidad} tn sobre ${oferta.codigo}.\n` +
        `Stock actual: ${oferta.cantidad_tn} tn → quedaría en ${Number(oferta.cantidad_tn) - cantidad} tn.\n\n` +
        "¿Confirmás? Respondé SÍ para aplicar o NO para cancelar."
      );
    }

    case "consultar_stock":
      return listarStock(admin, telefono);

    case "buscar_compradores":
      return (
        "La búsqueda de compradores con matching inteligente está disponible en la plataforma web " +
        "(sección Matching). Por WhatsApp todavía no está habilitada."
      );

    case "consultar_operaciones":
      return (
        "El seguimiento de operaciones y embarques está disponible en la plataforma web " +
        "(sección Operaciones). Por WhatsApp todavía no está habilitado."
      );

    case "ayuda":
      return AYUDA;

    default:
      return (
        "No entendí tu mensaje. " +
        "Podés publicar una oferta («Tengo 80 toneladas de arroz largo fino…»), " +
        "actualizar stock («Vendí 10 toneladas») o escribir AYUDA para ver todo lo que puedo hacer."
      );
  }
}
