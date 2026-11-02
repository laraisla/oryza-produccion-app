// ============================================================
// AgroGlobal COMEX — Motor de interpretación y servicios de negocio
// compartidos entre el simulador y (futuro) el webhook de WhatsApp.
// La IA/interpretación solo PROPONE acciones estructuradas; la
// ejecución pasa siempre por estos servicios validados.
// ============================================================

import type { Producto, SolicitudCompra } from "@/data/demo";
import type { AccionPendiente, MovimientoInventario } from "@/data/whatsapp-demo";
import { analizarCompatibilidad, type ResultadoMatch } from "@/lib/matching";

// ---------- Tipos del intérprete ----------

export type Intencion =
  | "publicar_oferta"
  | "actualizar_stock"
  | "consultar_stock"
  | "buscar_compradores"
  | "consultar_operaciones"
  | "ayuda"
  | "desconocida";

export interface DatosOferta {
  tipoArroz?: string | undefined;
  variedad?: string | undefined;
  cantidadTn?: number | undefined;
  quebradoPct?: number | undefined;
  humedadPct?: number | undefined;
  presentacion?: string | undefined;
  precioTnUsd?: number | undefined;
}

export interface Interpretacion {
  intencion: Intencion;
  oferta?: DatosOferta | undefined;
  cantidadMovimientoTn?: number | undefined;
  camposFaltantes: string[];
  confianza: "alta" | "media" | "baja";
}

// ---------- Utilidades de parseo (español rioplatense) ----------

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function extraerCantidadTn(t: string): number | undefined {
  const m = normalizar(t).match(/(\d+(?:[.,]\d+)?)\s*(?:toneladas?|tn\b|tons?\b)/);
  if (!m) return undefined;
  return parseFloat(m[1]!.replace(",", "."));
}

function extraerPorcentaje(t: string, clave: string): number | undefined {
  const n = normalizar(t);
  // "5% de quebrado" | "quebrado 5%" | "con 5 por ciento de quebrado"
  const m =
    n.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*%\\s*(?:de\\s*)?${clave}`)) ??
    n.match(new RegExp(`${clave}\\s*(?:de|del)?\\s*(\\d+(?:[.,]\\d+)?)\\s*%`));
  return m ? parseFloat(m[1]!.replace(",", ".")) : undefined;
}

function extraerVariedad(t: string): string | undefined {
  const n = normalizar(t);
  if (n.includes("largo fino")) return "Largo fino";
  if (n.includes("jazmin")) return "Jazmín";
  if (n.includes("largo ancho")) return "Largo ancho";
  if (n.includes("mediano")) return "Mediano";
  return undefined;
}

function extraerTipo(t: string): string | undefined {
  const n = normalizar(t);
  if (n.includes("integral")) return "Integral";
  if (n.includes("jazmin") || n.includes("aromatico")) return "Aromático";
  if (n.includes("blanco")) return "Blanco";
  if (n.includes("parboil")) return "Parboil";
  if (n.includes("arroz")) return "Blanco"; // default comercial del NEA
  return undefined;
}

function extraerPresentacion(t: string): string | undefined {
  const n = normalizar(t);
  if (n.includes("big bag")) return "Big bags de 1.000 kg";
  const m = n.match(/bolsas?\s*de\s*(\d+)\s*(?:kilos?|kg)/);
  if (m) return `Bolsas de ${m[1]} kg`;
  const e = n.match(/envases?\s*de\s*(\d+)\s*(?:kilos?|kg)/);
  if (e) return `Envases de ${e[1]} kg`;
  if (n.includes("granel")) return "A granel";
  return undefined;
}

// ---------- interpretMessage ----------

export function interpretMessage(texto: string): Interpretacion {
  const n = normalizar(texto);

  const esVenta =
    /vendi|vendimos|se fue|salieron?|despache|entregue/.test(n) && extraerCantidadTn(texto) != null;
  if (esVenta) {
    return {
      intencion: "actualizar_stock",
      cantidadMovimientoTn: extraerCantidadTn(texto),
      camposFaltantes: [],
      confianza: "alta",
    };
  }

  if (/cuanto stock|que stock|stock tengo|cuanto me queda|consultar stock/.test(n)) {
    return { intencion: "consultar_stock", camposFaltantes: [], confianza: "alta" };
  }

  if (/comprador|quien busca|hay demanda|buscan|interesado/.test(n)) {
    return { intencion: "buscar_compradores", camposFaltantes: [], confianza: "alta" };
  }

  if (/operacion|embarque|envio|como va|estado de/.test(n) && !/comprador/.test(n)) {
    return { intencion: "consultar_operaciones", camposFaltantes: [], confianza: "media" };
  }

  if (/ayuda|ayudame|no entiendo|operador|humano|persona/.test(n)) {
    return { intencion: "ayuda", camposFaltantes: [], confianza: "alta" };
  }

  // Publicación de oferta: menciona arroz/producto con cantidad
  const cantidad = extraerCantidadTn(texto);
  if (/arroz|tengo|ofrezco|publicar|disponible/.test(n) && (cantidad != null || /arroz/.test(n))) {
    const oferta: DatosOferta = {
      tipoArroz: extraerTipo(texto),
      variedad: extraerVariedad(texto),
      cantidadTn: cantidad,
      quebradoPct: extraerPorcentaje(texto, "quebrado"),
      humedadPct: extraerPorcentaje(texto, "humedad"),
      presentacion: extraerPresentacion(texto),
    };
    // Solo se piden los campos indispensables para publicar
    const faltantes: string[] = [];
    if (oferta.cantidadTn == null) faltantes.push("cantidad en toneladas");
    if (!oferta.variedad) faltantes.push("variedad (por ejemplo: largo fino, jazmín)");
    return {
      intencion: "publicar_oferta",
      oferta,
      camposFaltantes: faltantes,
      confianza: faltantes.length ? "media" : "alta",
    };
  }

  return { intencion: "desconocida", camposFaltantes: [], confianza: "baja" };
}

// ---------- Servicios de negocio (validados, sin IA libre) ----------

let secuenciaOferta = 1;
export function crearOferta(
  datos: DatosOferta,
  empresa: string,
  provincia: string,
  existentes: Producto[],
): Producto {
  const correlativo = existentes.filter((p) => p.id.startsWith("OF-")).length + secuenciaOferta;
  const id = `OF-${String(correlativo).padStart(4, "0")}`;
  return {
    id,
    nombre: `Arroz ${(datos.tipoArroz ?? "blanco").toLowerCase()} ${(datos.variedad ?? "").toLowerCase()} — ${id} (Demo)`,
    tipoArroz: datos.tipoArroz ?? "Blanco",
    variedad: datos.variedad ?? "Largo fino",
    empresa,
    provincia,
    pais: "Argentina",
    cantidadTn: datos.cantidadTn ?? 0,
    quebradoPct: datos.quebradoPct ?? 0,
    humedadPct: datos.humedadPct ?? 0,
    presentacion: datos.presentacion ?? "A definir",
    ...(datos.precioTnUsd ? { precioTnUsd: datos.precioTnUsd } : {}),
    estado: "Disponible",
    certificaciones: [],
    documentos: ["Declaración del oferente (demo)"],
    gradoElaboracion: datos.tipoArroz === "Integral" ? "Cargo" : "Blanqueado",
    propio: true,
  };
}

/** Descuento de stock con validación e idempotencia por accionId. */
export function actualizarInventario(
  producto: Producto,
  cantidadTn: number,
  accionId: string,
  movimientos: MovimientoInventario[],
): { ok: boolean; error?: string; movimiento?: MovimientoInventario; producto?: Producto } {
  if (movimientos.some((m) => m.accionId === accionId)) {
    return { ok: false, error: "Esta actualización ya fue procesada (movimiento duplicado evitado)." };
  }
  if (cantidadTn <= 0) return { ok: false, error: "La cantidad debe ser mayor a cero." };
  if (cantidadTn > producto.cantidadTn) {
    return {
      ok: false,
      error: `No se puede descontar ${cantidadTn} tn: el stock disponible es ${producto.cantidadTn} tn.`,
    };
  }
  const nuevo = producto.cantidadTn - cantidadTn;
  const movimiento: MovimientoInventario = {
    id: `MOV-${Date.now().toString(36).toUpperCase()}`,
    productoId: producto.id,
    tipo: "egreso",
    cantidadTn,
    stockAnteriorTn: producto.cantidadTn,
    stockNuevoTn: nuevo,
    origen: "chat",
    accionId,
    fecha: new Date().toISOString(),
  };
  return {
    ok: true,
    movimiento,
    producto: { ...producto, cantidadTn: nuevo, estado: nuevo === 0 ? "Agotado" : producto.estado },
  };
}

/** Matching real contra solicitudes registradas. Nunca inventa compradores. */
export function findMatchingRequests(
  oferta: Pick<Producto, "tipoArroz" | "variedad" | "cantidadTn" | "quebradoPct" | "humedadPct" | "presentacion" | "certificaciones">,
  solicitudes: SolicitudCompra[],
): { solicitud: SolicitudCompra; resultado: ResultadoMatch; motivos: string[] }[] {
  const producto: Producto = {
    id: "OF-CHAT",
    nombre: "Oferta del chat",
    empresa: "",
    provincia: "",
    pais: "Argentina",
    estado: "Disponible",
    documentos: [],
    gradoElaboracion: "Blanqueado",
    ...oferta,
  };
  return solicitudes
    .filter((s) => s.estado !== "Cerrada")
    .map((s) => {
      const a = analizarCompatibilidad(s, producto);
      const motivos =
        a.resultado === "incompatible"
          ? a.incumplimientos
          : a.resultado === "condicional"
            ? a.diferencias
            : ["Cumple los requisitos principales"];
      return { solicitud: s, resultado: a.resultado, motivos };
    })
    .filter((r) => r.resultado !== "incompatible" || r.solicitud.variedad === oferta.variedad);
}

export function resumirOferta(d: DatosOferta): string {
  const lineas = [
    `Producto: Arroz ${(d.tipoArroz ?? "blanco").toLowerCase()} ${(d.variedad ?? "").toLowerCase()}`.trim(),
    d.cantidadTn != null ? `Cantidad: ${d.cantidadTn} toneladas` : null,
    d.quebradoPct != null ? `Quebrado: ${d.quebradoPct}%` : null,
    d.humedadPct != null ? `Humedad: ${d.humedadPct}%` : null,
    d.presentacion ? `Presentación: ${d.presentacion}` : null,
  ].filter(Boolean);
  return lineas.join("\n");
}

export function nuevaAccion(
  tipo: AccionPendiente["tipo"],
  conversacionId: string,
  productorId: string,
  datos: Record<string, string | number | undefined>,
  resumen: string,
): AccionPendiente {
  return {
    id: `ACC-${Date.now().toString(36).toUpperCase()}`,
    tipo,
    conversacionId,
    productorId,
    datos,
    estado: "pendiente",
    creadaEn: new Date().toISOString(),
    resumen,
  };
}
