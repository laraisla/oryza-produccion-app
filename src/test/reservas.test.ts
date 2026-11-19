import { describe, expect, it } from "vitest";
import type { Cotizacion } from "@/data/demo";
import { initialState, reducer } from "@/lib/store";

function estado(lotes: Cotizacion["lotes"], cantidadTn: number) {
  const cotizacion: Cotizacion = {
    ...initialState.cotizaciones[0]!,
    id: "COT-RESERVA",
    solicitudId: initialState.solicitudes[0]!.id,
    cantidadTn,
    ...(lotes ? { lotes } : {}),
  };
  // El fixture original no tiene lotes.
  return { ...initialState, cotizaciones: [cotizacion], operaciones: [] };
}
const aceptar = { type: "aceptarCotizacion", id: "COT-RESERVA" } as const;

describe("aceptación y reserva local indivisible", () => {
  it("rechaza stock insuficiente sin aceptar, cerrar solicitud ni crear operación", () => {
    const s = estado([{ loteId: "LOTE-A", tn: 81 }], 81);
    expect(reducer(s, aceptar)).toBe(s);
  });

  it("si falla el segundo lote no reserva parcialmente el primero", () => {
    const s = estado(
      [
        { loteId: "LOTE-A", tn: 60 },
        { loteId: "LOTE-B", tn: 61 },
      ],
      121,
    );
    const antes = structuredClone(s);
    expect(reducer(s, aceptar)).toBe(s);
    expect(s).toEqual(antes);
  });

  it("reserva todos los lotes, crea una operación y cierra la solicitud una sola vez", () => {
    const s = estado(
      [
        { loteId: "LOTE-A", tn: 80 },
        { loteId: "LOTE-B", tn: 20 },
      ],
      100,
    );
    const next = reducer(s, aceptar);
    expect(next.productos.find((p) => p.id === "LOTE-A")).toMatchObject({
      cantidadTn: 0,
      estado: "Reservado",
    });
    expect(next.productos.find((p) => p.id === "LOTE-B")!.cantidadTn).toBe(40);
    expect(next.cotizaciones[0]!.estado).toBe("Aceptada");
    expect(next.solicitudes[0]!.estado).toBe("Cerrada");
    expect(next.operaciones).toHaveLength(1);
    expect(s.productos.find((p) => p.id === "LOTE-A")!.cantidadTn).toBe(80);
    const otra = reducer(next, aceptar);
    expect(otra.operaciones).toHaveLength(1);
    expect(otra.productos).toBe(next.productos);
  });

  it("suma filas repetidas del mismo lote antes de comprobar disponibilidad", () => {
    const s = estado(
      [
        { loteId: "LOTE-A", tn: 41 },
        { loteId: "LOTE-A", tn: 41 },
      ],
      82,
    );
    expect(reducer(s, aceptar)).toBe(s);
    const valido = estado(
      [
        { loteId: "LOTE-A", tn: 30 },
        { loteId: "LOTE-A", tn: 20 },
      ],
      50,
    );
    expect(reducer(valido, aceptar).productos.find((p) => p.id === "LOTE-A")!.cantidadTn).toBe(30);
  });

  it.each([
    undefined,
    [],
    [{ loteId: "NO-EXISTE", tn: 1 }],
    [{ loteId: "LOTE-D", tn: 1 }],
    [{ loteId: "LOTE-A", tn: 0 }],
    [{ loteId: "LOTE-A", tn: -1 }],
    [{ loteId: "LOTE-A", tn: Number.NaN }],
    [{ loteId: "LOTE-A", tn: Number.POSITIVE_INFINITY }],
    [{ loteId: "LOTE-A", tn: 0.0001 }],
  ])("rechaza asignaciones ausentes o inválidas %j", (lotes) => {
    const s = estado(lotes, 1);
    expect(reducer(s, aceptar)).toBe(s);
  });

  it("rechaza una asignación parcial que no cubre el total cotizado", () => {
    const s = estado([{ loteId: "LOTE-A", tn: 10 }], 20);
    expect(reducer(s, aceptar)).toBe(s);
  });

  it("una segunda cotización usa el saldo actual del mismo reducer", () => {
    const s = estado([{ loteId: "LOTE-A", tn: 50 }], 50);
    s.cotizaciones.push({ ...s.cotizaciones[0]!, id: "COT-OTRA" });
    const next = reducer(s, aceptar);
    expect(reducer(next, { type: "aceptarCotizacion", id: "COT-OTRA" })).toBe(next);
  });

  it("maneja milésimas sin errores de redondeo", () => {
    const s = estado(
      [
        { loteId: "LOTE-A", tn: 0.1 },
        { loteId: "LOTE-B", tn: 0.2 },
      ],
      0.3,
    );
    const next = reducer(s, aceptar);
    expect(next.operaciones).toHaveLength(1);
    expect(next.productos.find((p) => p.id === "LOTE-A")!.cantidadTn).toBe(79.9);
    expect(next.productos.find((p) => p.id === "LOTE-B")!.cantidadTn).toBe(59.8);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "la reserva individual también rechaza %s",
    (cantidadTn) => {
      expect(
        reducer(initialState, { type: "reservarStock", productoId: "LOTE-A", cantidadTn }),
      ).toBe(initialState);
    },
  );
});
