import { describe, expect, it } from "vitest";

import { SOLICITUDES_INICIALES, type SolicitudCompra } from "@/data/demo";
import { analizarCompatibilidad } from "@/lib/matching";
import { asignarLotes, construirCotizacion, estadoRecorrido } from "@/lib/recorrido";
import { initialState, reducer } from "@/lib/store";

const solicitud: SolicitudCompra = {
  id: "SOL-900", comprador: "Importadora Caribe Demo S.A. (ficticia)", paisDestino: "República Dominicana", producto: "Arroz",
  tipoArroz: "Blanco", variedad: "Largo fino", volumenTn: 50, quebradoMaxPct: 5, humedadMaxPct: 14,
  presentacion: "Bolsas de 25 kg", incoterm: "CFR", fechaRequerida: "2026-11-30", certificaciones: [], estado: "Activa",
};
const ids = SOLICITUDES_INICIALES.map((s) => s.id);

function recorrido() {
  let s = reducer(initialState, { type: "addSolicitud", solicitud });
  const lote = s.productos.find((p) => analizarCompatibilidad(solicitud, p).resultado === "compatible")!;
  const asignacion = asignarLotes(solicitud, [lote]);
  const cot = construirCotizacion(solicitud, asignacion, s.productos, s.cotizaciones.map((c) => c.id));
  s = reducer(s, { type: "addCotizacion", cotizacion: cot });
  s = reducer(s, { type: "aceptarCotizacion", id: cot.id });
  return { s, cot, lote };
}

describe("recorrido comercial", () => {
  it("solicitud → matching → cotización → aceptar crea la operación con el id de la cotización", () => {
    const { s, cot, lote } = recorrido();
    expect(cot.solicitudId).toBe("SOL-900");
    expect(cot.cantidadTn).toBe(50);
    const op = s.operaciones.find((o) => o.cotizacionId === cot.id)!;
    expect(op).toBeDefined();
    expect(op.solicitudId).toBe("SOL-900");
    expect(s.cotizaciones.find((c) => c.id === cot.id)!.operacionId).toBe(op.id);
    expect(s.productos.find((p) => p.id === lote.id)!.cantidadTn).toBe(lote.cantidadTn - 50);
    expect(estadoRecorrido(s, ids).filter((p) => p.hecho).map((p) => p.n)).toEqual([1, 2, 3, 4]);
  });

  it("aceptar dos veces no duplica la operación", () => {
    const { s, cot } = recorrido();
    const s2 = reducer(s, { type: "aceptarCotizacion", id: cot.id });
    expect(s2.operaciones.filter((o) => o.cotizacionId === cot.id)).toHaveLength(1);
  });

  it("combina dos lotes cuando ninguno cubre solo", () => {
    const [a, b] = initialState.productos.filter((p) => p.variedad === "Largo fino" && p.estado === "Disponible");
    const a2 = asignarLotes({ ...solicitud, volumenTn: a!.cantidadTn + 10 }, [a!, b!]);
    expect(a2.lotes).toHaveLength(2);
    expect(a2.cubreVolumen).toBe(true);
  });

  it("Reiniciar demo restaura lo comercial y conserva WhatsApp y Stellar", () => {
    const { s } = recorrido();
    const conAcuerdo = { ...s, mensajes: [...s.mensajes, { ...s.mensajes[0]!, id: "MSG-X" }] };
    const r = reducer(conAcuerdo, { type: "reiniciarDemoComercial" });
    expect(r.solicitudes).toEqual(initialState.solicitudes);
    expect(r.operaciones).toEqual(initialState.operaciones);
    expect(r.productos).toEqual(initialState.productos);
    expect(r.mensajes).toBe(conAcuerdo.mensajes);
    expect(r.acuerdosStellar).toBe(conAcuerdo.acuerdosStellar);
    expect(estadoRecorrido(r, ids).some((p) => p.hecho)).toBe(false);
  });
});
