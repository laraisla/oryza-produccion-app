import type { Cotizacion, Operacion, Producto, SolicitudCompra } from "@/data/demo";
import { conceptosIniciales, simular } from "@/lib/comex";

/** Siguiente id correlativo con el formato `${prefijo}NNN` (usa el máximo existente, no la cantidad). */
export function siguienteId(prefijo: string, ids: string[]): string {
  const n = ids.reduce((max, id) => {
    const m = id.startsWith(prefijo) ? Number.parseInt(id.slice(prefijo.length), 10) : Number.NaN;
    return Number.isFinite(m) && m > max ? m : max;
  }, 0);
  return `${prefijo}${String(n + 1).padStart(3, "0")}`;
}

export interface AsignacionLotes {
  lotes: { loteId: string; tn: number }[];
  totalTn: number;
  cubreVolumen: boolean;
}

/** Reparte el volumen pedido entre 1 o 2 lotes, en el orden elegido. */
export function asignarLotes(solicitud: SolicitudCompra, elegidos: Producto[]): AsignacionLotes {
  let restante = solicitud.volumenTn;
  const lotes: { loteId: string; tn: number }[] = [];
  for (const p of elegidos.slice(0, 2)) {
    const tn = Math.min(p.cantidadTn, restante);
    if (tn <= 0) continue;
    lotes.push({ loteId: p.id, tn });
    restante = +(restante - tn).toFixed(3);
  }
  const totalTn = +lotes.reduce((a, l) => a + l.tn, 0).toFixed(3);
  return { lotes, totalTn, cubreVolumen: restante <= 0 };
}

/**
 * Arma la cotización a partir del matching: precio con `comex.ts` (sin redondear;
 * el redondeo a 2 decimales se hace solo al mostrar).
 */
export function construirCotizacion(
  solicitud: SolicitudCompra,
  asignacion: AsignacionLotes,
  productos: Producto[],
  idsCotizaciones: string[],
  margenPct = 12,
): Cotizacion {
  const usados = asignacion.lotes.map((l) => ({ ...l, p: productos.find((x) => x.id === l.loteId) }));
  const total = asignacion.totalTn;
  const precioMercaderia = total > 0 ? usados.reduce((a, l) => a + l.tn * (l.p?.precioTnUsd ?? 520), 0) / total : 520;
  const conceptos = conceptosIniciales().map((c) => {
    if (c.id === "c1") return { ...c, importe: precioMercaderia };
    return c.unidad === "por_contenedor" ? { ...c, cantidad: 1 } : c;
  });
  const sim = simular(conceptos, {
    producto: `${solicitud.tipoArroz} ${solicitud.variedad.toLowerCase()}`,
    cantidadTn: total,
    contenedores: Math.max(1, Math.ceil(total / 25)),
    incoterm: solicitud.incoterm,
    tipoCambioArs: 1050,
    margenPct,
  });
  const precioTnUsd = total > 0 ? (sim.costoVendedorUsd / total) * (1 + margenPct / 100) : 0;
  const vendedores = [...new Set(usados.map((l) => l.p?.empresa ?? l.loteId))].join(" + ");
  return {
    id: siguienteId("COT-2026-", idsCotizaciones),
    vendedor: vendedores,
    comprador: solicitud.comprador,
    producto: `Arroz ${solicitud.tipoArroz.toLowerCase()} ${solicitud.variedad.toLowerCase()}`,
    calidad: `Quebrado ≤ ${solicitud.quebradoMaxPct}% · Humedad ≤ ${solicitud.humedadMaxPct}% (demo)`,
    cantidadTn: total,
    precioTnUsd,
    incoterm: solicitud.incoterm,
    lugarDesignado: "Buenos Aires, Argentina",
    paisDestino: solicitud.paisDestino,
    presentacion: solicitud.presentacion,
    fecha: new Date().toISOString().slice(0, 10),
    moneda: "USD",
    condiciones: `Generada desde el matching de ${solicitud.id} con ${usados.map((l) => `${l.loteId} (${l.tn} tn)`).join(" + ")}. Condiciones de pago a definir.`,
    validezDias: 15,
    estado: "Borrador",
    margenPct,
    solicitudId: solicitud.id,
    lotes: asignacion.lotes,
  };
}

/** Operación vinculada que se crea al aceptar una cotización. */
export function construirOperacion(c: Cotizacion, idsOperaciones: string[]): Operacion {
  return {
    id: siguienteId("OP-2026-", idsOperaciones),
    comprador: c.comprador,
    vendedor: c.vendedor,
    producto: c.producto,
    cantidadContratadaTn: c.cantidadTn,
    cantidadEmbarcadaTn: 0,
    precioPactadoTnUsd: c.precioTnUsd,
    valorFacturadoUsd: 0,
    incoterm: c.incoterm,
    fechaProgramada: "2026-12-01",
    puertoSalida: c.lugarDesignado,
    puertoDestino: c.paisDestino,
    estadoDocumental: "En preparación",
    estadoLogistico: "Cotización aceptada",
    estadoFinanciero: "Pendiente de facturación",
    hitoActual: 1,
    ...(c.solicitudId ? { solicitudId: c.solicitudId } : {}),
    cotizacionId: c.id,
    ...(c.lotes ? { lotes: c.lotes } : {}),
  };
}

/** Requisitos de ejemplo por destino (demostrativos; requieren validación regulatoria). */
export const REQUISITOS_DESTINO: Record<string, string> = {
  Chile: "Ejemplo: certificado fitosanitario y de origen (preferencia ALADI). Validar con la autoridad.",
  "República Dominicana": "Ejemplo: certificado fitosanitario, certificado de origen y permiso de importación del comprador. Validar con la autoridad.",
  Brasil: "Ejemplo: certificado fitosanitario y de origen (Mercosur). Validar con la autoridad.",
  Perú: "Ejemplo: certificado fitosanitario y de origen. Validar con la autoridad.",
  México: "Ejemplo: certificado fitosanitario y permiso de importación. Validar con la autoridad.",
  Colombia: "Ejemplo: certificado fitosanitario y registro de importador. Validar con la autoridad.",
};

export interface PasoRecorrido {
  n: number;
  titulo: string;
  hecho: boolean;
  to: string;
  search?: Record<string, string>;
}

/** Recorrido de demostración derivado SOLO del estado del store comercial. */
export function estadoRecorrido(
  s: { solicitudes: SolicitudCompra[]; cotizaciones: Cotizacion[]; operaciones: Operacion[]; conciliaciones: { operacionId: string }[] },
  solicitudesIniciales: string[],
): PasoRecorrido[] {
  const op = s.operaciones.find((o) => o.cotizacionId && o.solicitudId);
  const cot = op ? s.cotizaciones.find((c) => c.id === op.cotizacionId) : s.cotizaciones.find((c) => c.solicitudId);
  const sol = (op ? s.solicitudes.find((x) => x.id === op.solicitudId) : undefined) ??
    (cot?.solicitudId ? s.solicitudes.find((x) => x.id === cot.solicitudId) : undefined) ??
    s.solicitudes.find((x) => !solicitudesIniciales.includes(x.id));
  const conc = op ? s.conciliaciones.some((c) => c.operacionId === op.id) : false;
  return [
    { n: 1, titulo: "Solicitud de compra", hecho: !!sol, to: "/matching", ...(sol ? { search: { solicitud: sol.id } } : {}) },
    { n: 2, titulo: "Matching y elección de lotes", hecho: !!cot, to: "/matching", ...(sol ? { search: { solicitud: sol.id } } : {}) },
    { n: 3, titulo: "Cotización generada", hecho: !!cot, to: "/cotizaciones", ...(cot ? { search: { ver: cot.id } } : {}) },
    { n: 4, titulo: "Cotización aceptada → operación", hecho: !!op, to: "/cotizaciones", ...(cot ? { search: { ver: cot.id } } : {}) },
    { n: 5, titulo: "Operación: hitos y documentos", hecho: !!op && op.hitoActual >= 4, to: "/operaciones", ...(op ? { search: { op: op.id } } : {}) },
    { n: 6, titulo: "Cobro y conciliación", hecho: conc, to: "/conciliacion", ...(op ? { search: { op: op.id } } : {}) },
    { n: 7, titulo: "Trazabilidad: expediente", hecho: !!op && op.hitoActual >= 7, to: "/trazabilidad", ...(op ? { search: { op: op.id } } : {}) },
  ];
}
