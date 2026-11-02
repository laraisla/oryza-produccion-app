import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Check,
  CheckCheck,
  CircleAlert,
  FileUp,
  Headphones,
  Inbox,
  Link2Off,
  MessageSquareText,
  Mic,
  Phone,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fmtTn } from "@/data/demo";
import {
  PRODUCTOR_DEMO,
  type AccionPendiente,
  type BotonMensaje,
  type Conversacion,
  type EstadoAudio,
  type MensajeChat,
} from "@/data/whatsapp-demo";
import {
  actualizarInventario,
  crearOferta,
  findMatchingRequests,
  interpretMessage,
  nuevaAccion,
  resumirOferta,
} from "@/lib/agent";
import { pageHead } from "@/lib/seo";
import { useAppStore } from "@/lib/store";
import { Card, DemoBadge, PageHeader, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/asistente")({
  head: () =>
    pageHead(
      "Asistente WhatsApp",
      "Simulador del asistente conversacional de AgroGlobal COMEX: publicación de ofertas, actualización de stock, búsqueda de compradores y oportunidades comerciales desde un chat.",
    ),
  component: AsistenteWhatsApp,
});

const inp = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";
let msgSeq = 1;
const nuevoId = (p: string) => `${p}-${Date.now().toString(36)}-${msgSeq++}`;

function AsistenteWhatsApp() {
  return (
    <div>
      <PageHeader
        titulo="Asistente WhatsApp"
        descripcion="Probá el chatbot exactamente como funcionará en WhatsApp Business. Las acciones se confirman antes de ejecutarse y actualizan la plataforma en tiempo real."
        acciones={<DemoBadge />}
      />
      <Tabs defaultValue="simulador">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="simulador"><MessageSquareText className="mr-1.5 h-4 w-4" />Simulador</TabsTrigger>
          <TabsTrigger value="conversaciones"><Inbox className="mr-1.5 h-4 w-4" />Conversaciones</TabsTrigger>
          <TabsTrigger value="acciones"><CheckCheck className="mr-1.5 h-4 w-4" />Acciones pendientes</TabsTrigger>
          <TabsTrigger value="oportunidades"><Sparkles className="mr-1.5 h-4 w-4" />Oportunidades</TabsTrigger>
          <TabsTrigger value="configuracion"><Settings2 className="mr-1.5 h-4 w-4" />Configuración</TabsTrigger>
        </TabsList>
        <TabsContent value="simulador"><Simulador /></TabsContent>
        <TabsContent value="conversaciones"><ConversacionesTab /></TabsContent>
        <TabsContent value="acciones"><AccionesTab /></TabsContent>
        <TabsContent value="oportunidades"><OportunidadesTab /></TabsContent>
        <TabsContent value="configuracion"><ConfiguracionTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ================= SIMULADOR (3 columnas) =================

function Simulador() {
  const { state, dispatch } = useAppStore();
  const navigate = useNavigate();
  const [convId, setConvId] = useState(state.conversaciones[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "nueva" | "pendiente" | "resuelta">("todas");
  const [grabando, setGrabando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);

  const conv = state.conversaciones.find((c) => c.id === convId) ?? state.conversaciones[0];
  const mensajes = state.mensajes.filter((m) => m.conversacionId === conv?.id);
  const propios = state.productos.filter((p) => p.propio || p.empresa.includes("Litoral"));
  const accionesConv = state.acciones.filter((a) => a.conversacionId === conv?.id && a.estado === "pendiente");
  const intereses = state.intereses.filter((i) => i.productorId === PRODUCTOR_DEMO.id);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes.length, procesando]);

  const pushMensaje = (m: Omit<MensajeChat, "id" | "conversacionId" | "fecha"> & { conversacionId?: string }) => {
    const mensaje: MensajeChat = {
      id: nuevoId("MSG"),
      conversacionId: m.conversacionId ?? conv!.id,
      fecha: new Date().toISOString(),
      ...m,
    };
    dispatch({ type: "addMensaje", mensaje });
    dispatch({
      type: "updateConversacion",
      id: mensaje.conversacionId,
      patch: { ultimoMensaje: mensaje.texto.slice(0, 80), ultimaActividad: mensaje.fecha },
    });
    return mensaje;
  };

  const responderAgente = (textoAgente: string, botones?: BotonMensaje[]) => {
    pushMensaje({ remitente: "agente", texto: textoAgente, ...(botones?.length ? { botones } : {}) });
  };

  // ---- Flujo principal: mensaje → interpretación → propuesta → confirmación ----
  const procesarMensaje = (raw: string) => {
    const textoUsuario = raw.trim();
    if (!textoUsuario || !conv) return;
    pushMensaje({ remitente: "productor", texto: textoUsuario });
    setTexto("");
    setProcesando(true);

    window.setTimeout(() => {
      const interp = interpretMessage(textoUsuario);

      switch (interp.intencion) {
        case "publicar_oferta": {
          if (interp.camposFaltantes.length) {
            responderAgente(
              `Entendí que querés publicar una oferta, pero me faltan datos indispensables:\n\n${interp.camposFaltantes.map((f) => `• ${f}`).join("\n")}\n\n¿Me los podés completar?`,
            );
            break;
          }
          const accion = nuevaAccion(
            "publicar_oferta",
            conv.id,
            PRODUCTOR_DEMO.id,
            { ...interp.oferta },
            `Publicar oferta: ${resumirOferta(interp.oferta ?? {}).replaceAll("\n", " · ")}`,
          );
          dispatch({ type: "addAccion", accion });
          responderAgente(
            `Encontré estos datos para tu publicación:\n\n${resumirOferta(interp.oferta ?? {})}\n\n¿Querés publicar esta oferta?`,
            [
              { id: nuevoId("BTN"), label: "Confirmar publicación", tipo: "confirmar", accionId: accion.id },
              { id: nuevoId("BTN"), label: "Corregir información", tipo: "corregir", accionId: accion.id },
              { id: nuevoId("BTN"), label: "Cancelar", tipo: "cancelar", accionId: accion.id },
            ],
          );
          break;
        }
        case "actualizar_stock": {
          const cantidad = interp.cantidadMovimientoTn ?? 0;
          const candidatos = propios.filter((p) => p.estado !== "Agotado");
          if (!candidatos.length) {
            responderAgente("No encontré lotes propios con stock disponible para modificar.");
            break;
          }
          const lote = candidatos[0]!;
          if (cantidad > lote.cantidadTn) {
            responderAgente(
              `Encontré el lote ${lote.id}, pero su stock disponible es ${fmtTn(lote.cantidadTn)}. No puedo descontar ${fmtTn(cantidad)}. ¿Querés ajustar la cantidad?`,
            );
            break;
          }
          const accion = nuevaAccion(
            "actualizar_stock",
            conv.id,
            PRODUCTOR_DEMO.id,
            { productoId: lote.id, cantidadTn: cantidad },
            `Descontar ${fmtTn(cantidad)} del lote ${lote.id}`,
          );
          dispatch({ type: "addAccion", accion });
          responderAgente(
            `Encontré el lote ${lote.id}.\n\nStock anterior: ${fmtTn(lote.cantidadTn)}.\nCantidad a descontar: ${fmtTn(cantidad)}.\nNuevo stock disponible: ${fmtTn(lote.cantidadTn - cantidad)}.\n\n¿Confirmás la actualización?`,
            [
              { id: nuevoId("BTN"), label: "Confirmar", tipo: "confirmar", accionId: accion.id },
              { id: nuevoId("BTN"), label: "Cambiar cantidad", tipo: "corregir", accionId: accion.id },
              { id: nuevoId("BTN"), label: "Cancelar", tipo: "cancelar", accionId: accion.id },
            ],
          );
          break;
        }
        case "consultar_stock": {
          if (!propios.length) {
            responderAgente("Todavía no tenés lotes publicados. Escribime, por ejemplo: “Tengo 50 toneladas de arroz blanco largo fino”.");
            break;
          }
          const detalle = propios
            .map((p) => `• ${p.id}: ${p.nombre.split("—")[0]?.trim()} — ${fmtTn(p.cantidadTn)} (${p.estado.toLowerCase()})`)
            .join("\n");
          responderAgente(`Este es tu stock actual:\n\n${detalle}`);
          break;
        }
        case "buscar_compradores": {
          const base = propios.find((p) => p.estado === "Disponible") ?? propios[0];
          if (!base) {
            responderAgente("Primero publicá una oferta para poder buscar compradores compatibles.");
            break;
          }
          const resultados = findMatchingRequests(base, state.solicitudes);
          if (!resultados.length) {
            responderAgente("Por ahora no hay solicitudes de compra relacionadas con tu producto. Te aviso cuando aparezca una oportunidad.");
            break;
          }
          const lineas = resultados.map((r, i) => {
            const estadoTxt =
              r.resultado === "compatible"
                ? "compatible"
                : r.resultado === "condicional"
                  ? `condicional: ${r.motivos[0] ?? "diferencias negociables"}`
                  : `no compatible: ${r.motivos[0] ?? "incumple requisitos"}`;
            return `Solicitud ${i + 1} (${r.solicitud.id}):\nProducto: Arroz ${r.solicitud.tipoArroz.toLowerCase()} ${r.solicitud.variedad.toLowerCase()}.\nCantidad: ${fmtTn(r.solicitud.volumenTn)}.\nQuebrado máximo: ${r.solicitud.quebradoMaxPct}%.\nResultado: ${estadoTxt}.`;
          });
          const botones: BotonMensaje[] = resultados.slice(0, 3).map((r, i) => ({
            id: nuevoId("BTN"),
            label: `Ver solicitud ${i + 1}`,
            tipo: "navegar",
            destino: `/matching?solicitud=${r.solicitud.id}`,
          }));
          responderAgente(
            `Encontré ${resultados.length} solicitud(es) relacionadas con tu producto.\n\n${lineas.join("\n\n")}\n\n¿Querés ver los detalles de alguna?`,
            botones,
          );
          break;
        }
        case "consultar_operaciones": {
          const ops = state.operaciones.filter((o) => o.vendedor.includes("Litoral"));
          if (!ops.length) {
            responderAgente("No tenés operaciones en curso registradas a tu nombre.");
            break;
          }
          responderAgente(
            `Tus operaciones:\n\n${ops.map((o) => `• ${o.id}: ${o.producto}, ${fmtTn(o.cantidadContratadaTn)} — ${o.estadoLogistico}`).join("\n")}`,
            [{ id: nuevoId("BTN"), label: "Ver operaciones", tipo: "navegar", destino: "/operaciones" }],
          );
          break;
        }
        case "ayuda": {
          responderAgente(
            "Puedo ayudarte con:\n\n• Publicar una oferta: “Tengo 80 toneladas de arroz blanco largo fino, 5% de quebrado, en bolsas de 25 kilos”.\n• Actualizar stock: “Vendí 10 toneladas del arroz que publiqué”.\n• Consultar stock: “¿Cuánto stock tengo?”.\n• Buscar compradores: “¿Hay compradores buscando arroz largo fino?”.\n\nSi necesitás hablar con una persona, escribí “operador” y escalamos tu consulta al equipo comercial.",
          );
          break;
        }
        default: {
          responderAgente(
            "No pude interpretar tu mensaje. Podés publicar una oferta, actualizar stock, consultar compradores o pedir ayuda. Escribí “ayuda” para ver ejemplos.",
          );
        }
      }
      setProcesando(false);
    }, 700);
  };

  // ---- Confirmación / cancelación de acciones pendientes ----
  const ejecutarBoton = (boton: BotonMensaje) => {
    if (boton.tipo === "navegar" && boton.destino) {
      void navigate({ to: boton.destino as never });
      return;
    }
    const accion = state.acciones.find((a) => a.id === boton.accionId);
    if (!accion || accion.estado !== "pendiente") {
      toast.info("Esta acción ya fue procesada.");
      return;
    }
    if (boton.tipo === "cancelar") {
      dispatch({ type: "updateAccion", id: accion.id, patch: { estado: "cancelada" } });
      responderAgente("Acción cancelada. No se modificó ningún dato.");
      return;
    }
    if (boton.tipo === "corregir") {
      dispatch({ type: "updateAccion", id: accion.id, patch: { estado: "cancelada" } });
      responderAgente("Perfecto, reescribime el mensaje con los datos corregidos y lo vuelvo a analizar.");
      return;
    }
    // confirmar
    if (accion.tipo === "publicar_oferta") {
      const oferta = crearOferta(
        {
          tipoArroz: accion.datos["tipoArroz"] as string | undefined,
          variedad: accion.datos["variedad"] as string | undefined,
          cantidadTn: accion.datos["cantidadTn"] as number | undefined,
          quebradoPct: accion.datos["quebradoPct"] as number | undefined,
          humedadPct: accion.datos["humedadPct"] as number | undefined,
          presentacion: accion.datos["presentacion"] as string | undefined,
        },
        PRODUCTOR_DEMO.empresa,
        PRODUCTOR_DEMO.provincia,
        state.productos,
      );
      dispatch({ type: "addProducto", producto: oferta });
      dispatch({ type: "updateAccion", id: accion.id, patch: { estado: "confirmada", resultado: oferta.id } });
      dispatch({
        type: "addNotificacion",
        notificacion: {
          id: nuevoId("NOT"),
          titulo: "Oferta publicada desde el chat",
          detalle: `${oferta.id}: ${oferta.nombre}`,
          fecha: new Date().toISOString(),
          leida: false,
          canal: "plataforma",
        },
      });
      responderAgente(
        `Tu oferta fue publicada correctamente.\n\nCódigo: ${oferta.id}\nProducto: Arroz ${oferta.tipoArroz.toLowerCase()} ${oferta.variedad.toLowerCase()}\nCantidad: ${fmtTn(oferta.cantidadTn)}\n\nYa podés recibir oportunidades de compra compatibles.`,
        [{ id: nuevoId("BTN"), label: "Ver en el marketplace", tipo: "navegar", destino: "/marketplace" }],
      );
      toast.success(`Oferta ${oferta.id} publicada y visible en el marketplace`);
    }
    if (accion.tipo === "actualizar_stock") {
      const productoId = accion.datos["productoId"] as string;
      const cantidad = accion.datos["cantidadTn"] as number;
      const producto = state.productos.find((p) => p.id === productoId);
      if (!producto) {
        responderAgente("No encontré el lote. La acción quedó sin efecto.");
        dispatch({ type: "updateAccion", id: accion.id, patch: { estado: "cancelada" } });
        return;
      }
      const r = actualizarInventario(producto, cantidad, accion.id, state.movimientos);
      if (!r.ok) {
        responderAgente(`No pude actualizar el stock: ${r.error}`);
        dispatch({ type: "updateAccion", id: accion.id, patch: { estado: "cancelada" } });
        return;
      }
      dispatch({ type: "updateProducto", id: producto.id, patch: { cantidadTn: r.producto!.cantidadTn, estado: r.producto!.estado } });
      dispatch({ type: "addMovimiento", movimiento: r.movimiento! });
      dispatch({ type: "updateAccion", id: accion.id, patch: { estado: "confirmada", resultado: `Stock: ${fmtTn(r.movimiento!.stockNuevoTn)}` } });
      responderAgente(
        `Stock actualizado correctamente.\n\nLote: ${producto.id}\nStock anterior: ${fmtTn(r.movimiento!.stockAnteriorTn)}\nNuevo stock: ${fmtTn(r.movimiento!.stockNuevoTn)}\n\nEl marketplace y tu inventario ya reflejan el cambio.`,
      );
      toast.success(`Stock del lote ${producto.id} actualizado`);
    }
  };

  // ---- Audio: grabación real si el navegador lo permite; transcripción pendiente de configuración ----
  const alternarGrabacion = async () => {
    if (grabando) {
      mediaRef.current?.stop();
      setGrabando(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;
      rec.start();
      setGrabando(true);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        registrarAudio(8);
      };
    } catch {
      toast.error("El navegador no concedió acceso al micrófono. El chat de texto sigue disponible.");
    }
  };

  const registrarAudio = (duracionSeg: number) => {
    pushMensaje({
      remitente: "productor",
      texto: "Nota de voz",
      audio: { duracionSeg, estado: "Audio recibido" as EstadoAudio },
    });
    setProcesando(true);
    window.setTimeout(() => {
      responderAgente(
        "Recibí tu audio, pero el servicio de transcripción todavía no está configurado en esta demostración, así que no puedo interpretarlo sin inventar datos. Escribime el contenido en texto y lo proceso de inmediato.",
      );
      setProcesando(false);
    }, 1200);
  };

  // ---- Documentos adjuntos ----
  const adjuntarDocumento = (file: File) => {
    pushMensaje({
      remitente: "productor",
      texto: `Documento enviado: ${file.name}`,
      adjunto: { nombre: file.name, tipo: file.type || "archivo", estado: "Recibido (demo)" },
    });
    setProcesando(true);
    window.setTimeout(() => {
      const accion = nuevaAccion(
        "asociar_documento",
        conv!.id,
        PRODUCTOR_DEMO.id,
        { documento: file.name },
        `Asociar documento ${file.name} a un lote`,
      );
      dispatch({ type: "addAccion", accion });
      responderAgente(
        `Recibí el documento “${file.name}”. La lectura automática de documentos está pendiente de configuración, así que no extraje datos. ¿Querés asociarlo a un lote? La asociación se confirma desde Acciones pendientes.`,
      );
      setProcesando(false);
    }, 900);
  };

  const conversacionesFiltradas = state.conversaciones.filter(
    (c) =>
      (filtro === "todas" || c.estado === filtro) &&
      (!busqueda || PRODUCTOR_DEMO.nombre.toLowerCase().includes(busqueda.toLowerCase())),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_300px]">
      {/* COLUMNA IZQUIERDA: conversaciones */}
      <Card className="flex h-[640px] flex-col p-0">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input className={cn(inp, "pl-8")} placeholder="Buscar conversación" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <div className="mt-2 flex gap-1">
            {(["todas", "nueva", "pendiente", "resuelta"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                  filtro === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {f === "todas" ? "Todas" : f === "nueva" ? "Nuevas" : f === "pendiente" ? "Pendientes" : "Resueltas"}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-warning" /> Canal simulador — WhatsApp pendiente de configuración
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversacionesFiltradas.map((c) => (
            <button
              key={c.id}
              onClick={() => setConvId(c.id)}
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-3 text-left hover:bg-muted/50",
                conv?.id === c.id && "bg-muted",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-muted text-success">
                <User className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{PRODUCTOR_DEMO.nombre}</span>
                <span className="block truncate text-xs text-muted-foreground">{PRODUCTOR_DEMO.empresa}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.ultimoMensaje}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* COLUMNA CENTRAL: chat */}
      <Card className="flex h-[640px] flex-col p-0">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-muted text-success">
            <Phone className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">{PRODUCTOR_DEMO.nombre}</p>
            <p className="text-xs text-muted-foreground">{PRODUCTOR_DEMO.telefono} · Simulador (no es una app oficial de Meta)</p>
          </div>
          <StatusBadge tono="warning">Demo</StatusBadge>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-4 py-4">
          {mensajes.map((m) => (
            <Burbuja key={m.id} mensaje={m} onBoton={ejecutarBoton} />
          ))}
          {procesando && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-3.5 w-3.5" /></span>
              <span className="animate-pulse">El asistente está procesando…</span>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) adjuntarDocumento(f); e.target.value = ""; }} />
            <Button size="icon" variant="ghost" title="Adjuntar documento" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={grabando ? "destructive" : "ghost"} title={grabando ? "Detener grabación" : "Grabar nota de voz"} onClick={() => void alternarGrabacion()}>
              {grabando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <input
              className={cn(inp, "flex-1")}
              placeholder={grabando ? "Grabando… tocá el botón para detener" : "Escribí un mensaje como lo harías por WhatsApp"}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && procesarMensaje(texto)}
              disabled={grabando}
            />
            <Button size="icon" onClick={() => procesarMensaje(texto)} disabled={!texto.trim() || procesando}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Nada se ejecuta sin tu confirmación. Los datos interpretados nunca se inventan: si falta algo indispensable, el asistente pregunta.
          </p>
        </div>
      </Card>

      {/* COLUMNA DERECHA: contexto del productor */}
      <Card className="h-[640px] space-y-4 overflow-y-auto">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Productor</h3>
          <dl className="space-y-1 text-xs">
            <Fila k="Nombre" v={PRODUCTOR_DEMO.nombre} />
            <Fila k="Empresa" v={PRODUCTOR_DEMO.empresa} />
            <Fila k="Establecimiento" v={PRODUCTOR_DEMO.establecimiento} />
            <Fila k="Identidad" v="Verificada (demo)" />
          </dl>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Stock disponible</h3>
          {propios.length ? (
            <ul className="space-y-1.5 text-xs">
              {propios.map((p) => (
                <li key={p.id} className="rounded-md border border-border px-2 py-1.5">
                  <span className="font-medium">{p.id}</span> — {fmtTn(p.cantidadTn)} · {p.estado}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sin lotes propios todavía.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Acciones pendientes</h3>
          {accionesConv.length ? (
            <ul className="space-y-1.5 text-xs">
              {accionesConv.map((a) => (
                <li key={a.id} className="rounded-md border border-warning/40 bg-warning-muted/40 px-2 py-1.5">{a.resumen}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nada pendiente de confirmación.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Intereses manifestados</h3>
          {intereses.length ? (
            <ul className="space-y-1.5 text-xs">
              {intereses.map((i) => (
                <li key={i.id} className="rounded-md border border-border px-2 py-1.5">{i.solicitudId} — {i.estado}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Todavía no manifestaste interés en ninguna solicitud.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Burbuja({ mensaje, onBoton }: { mensaje: MensajeChat; onBoton: (b: BotonMensaje) => void }) {
  const esProductor = mensaje.remitente === "productor";
  return (
    <div className={cn("flex", esProductor ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
          esProductor
            ? "rounded-br-sm bg-success-muted text-foreground"
            : "rounded-bl-sm border border-border bg-card",
        )}
      >
        {mensaje.audio && (
          <div className="mb-1.5 flex items-center gap-2 rounded-md bg-background/60 px-2 py-1.5 text-xs">
            <Headphones className="h-4 w-4 text-primary" />
            <span>Nota de voz · {mensaje.audio.duracionSeg}s</span>
            <StatusBadge tono={mensaje.audio.estado === "Error" ? "danger" : "info"}>{mensaje.audio.estado}</StatusBadge>
          </div>
        )}
        {mensaje.adjunto && (
          <div className="mb-1.5 flex items-center gap-2 rounded-md bg-background/60 px-2 py-1.5 text-xs">
            <FileUp className="h-4 w-4 text-primary" />
            <span>{mensaje.adjunto.nombre}</span>
            <StatusBadge tono="info">{mensaje.adjunto.estado}</StatusBadge>
          </div>
        )}
        <p className="whitespace-pre-line">{mensaje.texto}</p>
        {mensaje.botones && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mensaje.botones.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={b.tipo === "confirmar" ? "default" : b.tipo === "cancelar" ? "outline" : "secondary"}
                onClick={() => onBoton(b)}
              >
                {b.tipo === "confirmar" && <Check className="mr-1 h-3.5 w-3.5" />}
                {b.tipo === "cancelar" && <X className="mr-1 h-3.5 w-3.5" />}
                {b.label}
              </Button>
            ))}
          </div>
        )}
        <p className="mt-1 text-right text-[10px] text-muted-foreground">
          {new Date(mensaje.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

// ================= CONVERSACIONES =================

function ConversacionesTab() {
  const { state } = useAppStore();
  return (
    <Card className="p-0">
      <div className="divide-y divide-border/60">
        {state.conversaciones.map((c: Conversacion) => {
          const cant = state.mensajes.filter((m) => m.conversacionId === c.id).length;
          return (
            <div key={c.id} className="flex items-center gap-4 px-5 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-muted text-success"><User className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="text-sm font-medium">{PRODUCTOR_DEMO.nombre} · {PRODUCTOR_DEMO.empresa}</p>
                <p className="text-xs text-muted-foreground">{c.ultimoMensaje}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{cant} mensajes</p>
                <p>Canal: {c.canal === "simulador" ? "Simulador" : "WhatsApp"}</p>
              </div>
              <StatusBadge tono={c.estado === "resuelta" ? "success" : c.estado === "pendiente" ? "warning" : "info"}>
                {c.estado === "resuelta" ? "Resuelta" : c.estado === "pendiente" ? "Pendiente" : "Nueva"}
              </StatusBadge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ================= ACCIONES PENDIENTES =================

function AccionesTab() {
  const { state, dispatch } = useAppStore();
  const pendientes = state.acciones.filter((a) => a.estado === "pendiente");
  const historial = state.acciones.filter((a) => a.estado !== "pendiente");
  return (
    <div className="space-y-6">
      <Card className="p-0">
        <h3 className="border-b border-border px-5 py-3 text-sm font-semibold">Pendientes de confirmación ({pendientes.length})</h3>
        {pendientes.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">No hay acciones pendientes. Las propuestas del asistente aparecen acá antes de ejecutarse.</p>}
        <div className="divide-y divide-border/60">
          {pendientes.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-5 py-3.5">
              <CircleAlert className="h-5 w-5 shrink-0 text-warning-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{a.resumen}</p>
                <p className="text-xs text-muted-foreground">{a.id} · {new Date(a.creadaEn).toLocaleString("es-AR")} · vía {a.conversacionId}</p>
              </div>
              <StatusBadge tono="warning">Pendiente</StatusBadge>
              <Button size="sm" variant="outline" onClick={() => dispatch({ type: "updateAccion", id: a.id, patch: { estado: "cancelada" } })}>Cancelar</Button>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-0">
        <h3 className="border-b border-border px-5 py-3 text-sm font-semibold">Historial de acciones</h3>
        {historial.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Todavía no se confirmó ni canceló ninguna acción.</p>}
        <div className="divide-y divide-border/60">
          {historial.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-5 py-3.5">
              <CheckCheck className={cn("h-5 w-5 shrink-0", a.estado === "confirmada" ? "text-success" : "text-muted-foreground")} />
              <div className="flex-1">
                <p className="text-sm font-medium">{a.resumen}</p>
                <p className="text-xs text-muted-foreground">{a.id}{a.resultado ? ` · Resultado: ${a.resultado}` : ""}</p>
              </div>
              <StatusBadge tono={a.estado === "confirmada" ? "success" : "neutral"}>{a.estado === "confirmada" ? "Confirmada" : "Cancelada"}</StatusBadge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ================= OPORTUNIDADES =================

function OportunidadesTab() {
  const { state, dispatch } = useAppStore();
  const propios = state.productos.filter((p) => p.propio || p.empresa.includes("Litoral"));

  const oportunidades = useMemo(() => {
    return propios.flatMap((p) =>
      findMatchingRequests(p, state.solicitudes)
        .filter((r) => r.resultado !== "incompatible")
        .map((r) => ({ producto: p, ...r })),
    );
  }, [propios, state.solicitudes]);

  const manifestarInteres = (solicitudId: string, ofertaId: string) => {
    if (state.intereses.some((i) => i.solicitudId === solicitudId && i.productorId === PRODUCTOR_DEMO.id)) {
      toast.info("Ya manifestaste interés en esta solicitud.");
      return;
    }
    dispatch({
      type: "addInteres",
      interes: {
        id: nuevoId("INT"),
        solicitudId,
        productorId: PRODUCTOR_DEMO.id,
        ofertaId,
        fecha: new Date().toISOString(),
        estado: "Manifestado",
        nota: "Manifestación de interés comercial. No compromete stock ni acepta un contrato.",
      },
    });
    dispatch({
      type: "addNotificacion",
      notificacion: {
        id: nuevoId("NOT"),
        titulo: "Interés comercial registrado",
        detalle: `${PRODUCTOR_DEMO.nombre} manifestó interés en ${solicitudId}`,
        fecha: new Date().toISOString(),
        leida: false,
        canal: "whatsapp",
        estadoEnvio: "Pendiente de configuración de WhatsApp",
      },
    });
    toast.success("Interés registrado. El equipo comercial puede dar seguimiento desde la plataforma.");
  };

  return (
    <div className="space-y-4">
      <Card className="border-info/40 bg-info-muted/40">
        <p className="flex items-start gap-2 text-sm">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <span>Las oportunidades se calculan con el motor de matching real sobre las solicitudes registradas. Manifestar interés no compromete stock ni acepta contratos: crea una manifestación de interés comercial.</span>
        </p>
      </Card>
      {oportunidades.length === 0 && (
        <Card><p className="text-sm text-muted-foreground">No hay oportunidades compatibles en este momento. Publicá una oferta desde el simulador para ver coincidencias.</p></Card>
      )}
      {oportunidades.map((o) => (
        <Card key={`${o.producto.id}-${o.solicitud.id}`} className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{o.solicitud.id} — {o.solicitud.comprador}</p>
            <p className="text-xs text-muted-foreground">
              Arroz {o.solicitud.tipoArroz.toLowerCase()} {o.solicitud.variedad.toLowerCase()} · {fmtTn(o.solicitud.volumenTn)} · quebrado máx. {o.solicitud.quebradoMaxPct}% · {o.solicitud.paisDestino} · {o.solicitud.incoterm}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Tu oferta: {o.producto.id} ({fmtTn(o.producto.cantidadTn)} disponibles)</p>
          </div>
          <StatusBadge tono={o.resultado === "compatible" ? "success" : "warning"}>
            {o.resultado === "compatible" ? "Compatible" : "Condicional"}
          </StatusBadge>
          <Button size="sm" onClick={() => manifestarInteres(o.solicitud.id, o.producto.id)}>Me interesa</Button>
        </Card>
      ))}
      {state.intereses.length > 0 && (
        <Card className="p-0">
          <h3 className="border-b border-border px-5 py-3 text-sm font-semibold">Intereses registrados</h3>
          <div className="divide-y divide-border/60">
            {state.intereses.map((i) => (
              <div key={i.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="flex-1">{i.solicitudId} · oferta {i.ofertaId ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{i.nota}</span>
                <StatusBadge tono="info">{i.estado}</StatusBadge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ================= CONFIGURACIÓN DE INTEGRACIÓN =================

function ConfiguracionTab() {
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const probarWebhook = async () => {
    setProbando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/public/whatsapp/webhook", { method: "POST", body: "{}" });
      setResultado(`Estado del endpoint: HTTP ${r.status}. ${r.status === 401 ? "El endpoint está activo y rechazó correctamente una entrega sin firma válida." : r.status === 503 ? "Falta la credencial del servidor (WHATSAPP_API_KEY)." : "Revisá la configuración."}`);
    } catch {
      setResultado("No se pudo alcanzar el endpoint del webhook en este entorno.");
    }
    setProbando(false);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4 text-primary" /> WhatsApp Business (integración oficial de Meta)</h3>
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Estado de conexión</dt><dd><StatusBadge tono="success">Conectado</StatusBadge></dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Número empresarial</dt><dd>+54 9 362 407-0201</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Webhook</dt><dd><StatusBadge tono="success">Activo con verificación de firma</StatusBadge></dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Proveedor</dt><dd>Lovable Labs (Tech Provider verificado por Meta)</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Credenciales del servidor</dt><dd className="text-muted-foreground">Configuradas como secreto (no se muestran valores)</dd></div>
        </dl>
        <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Cómo probar la conexión:</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Enviá un mensaje desde tu app de WhatsApp Business al número conectado (o escribite a tu propio número).</li>
            <li>Las respuestas dentro de la ventana de 24 horas son de texto libre y sin costo.</li>
            <li>Para iniciar conversaciones fuera de esa ventana hacen falta plantillas aprobadas por Meta (la aprobación puede tardar hasta 48 hs).</li>
            <li>Los mensajes entrantes llegan al endpoint <code className="rounded bg-muted px-1">/api/public/whatsapp/webhook</code> con firma verificada.</li>
          </ol>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => void probarWebhook()} disabled={probando}>
            {probando ? "Probando…" : "Probar endpoint del webhook"}
          </Button>
          {resultado && <p className="text-xs text-muted-foreground">{resultado}</p>}
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Link2Off className="h-4 w-4 text-primary" /> Evidencias verificables (Hedera Testnet)</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Preparado para registrar en Hedera Consensus Service solo eventos relevantes: acuerdos confirmados, versiones aceptadas de cotizaciones y hashes de documentación crítica. Nunca conversaciones, datos personales ni precios confidenciales.
        </p>
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Estado</dt><dd><StatusBadge tono="neutral">Pendiente de integración</StatusBadge></dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Red</dt><dd>Hedera Testnet (sin conexión)</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Topic ID</dt><dd className="text-muted-foreground">—</dd></div>
        </dl>
        <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          No se inventan transacciones blockchain: los registros aparecerán acá únicamente cuando exista una conexión real verificada. Mientras tanto, la trazabilidad interna sigue disponible en la sección Trazabilidad.
        </p>
      </Card>
    </div>
  );
}
