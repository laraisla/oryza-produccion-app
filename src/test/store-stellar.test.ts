import { describe, expect, it } from "vitest";

import { initialState, reducer } from "@/lib/store";
import { ACUERDOS_REFERENCIA } from "@/lib/stellar/config";

const disponible = initialState.productos.find(
  (p) => p.estado === "Disponible" && p.cantidadTn > 0,
)!;

describe("reserva de stock", () => {
  it("descuenta la cantidad reservada", () => {
    const s = reducer(initialState, {
      type: "reservarStock",
      productoId: disponible.id,
      cantidadTn: 1,
    });
    expect(s.productos.find((p) => p.id === disponible.id)!.cantidadTn).toBe(
      disponible.cantidadTn - 1,
    );
  });

  it("nunca deja stock negativo: rechaza reservas mayores al disponible", () => {
    const s = reducer(initialState, {
      type: "reservarStock",
      productoId: disponible.id,
      cantidadTn: disponible.cantidadTn + 1,
    });
    expect(s).toBe(initialState);
  });

  it("rechaza cantidades no positivas y productos inexistentes", () => {
    expect(
      reducer(initialState, { type: "reservarStock", productoId: disponible.id, cantidadTn: 0 }),
    ).toBe(initialState);
    expect(
      reducer(initialState, { type: "reservarStock", productoId: disponible.id, cantidadTn: -5 }),
    ).toBe(initialState);
    expect(
      reducer(initialState, { type: "reservarStock", productoId: "NO-EXISTE", cantidadTn: 1 }),
    ).toBe(initialState);
  });

  it("al agotarse pasa a Reservado y no admite nuevas reservas", () => {
    const s = reducer(initialState, {
      type: "reservarStock",
      productoId: disponible.id,
      cantidadTn: disponible.cantidadTn,
    });
    const p = s.productos.find((x) => x.id === disponible.id)!;
    expect(p.cantidadTn).toBe(0);
    expect(p.estado).toBe("Reservado");
    expect(reducer(s, { type: "reservarStock", productoId: disponible.id, cantidadTn: 1 })).toBe(s);
  });

  it("dos reservas sucesivas no superan el stock", () => {
    const mitad = Math.ceil(disponible.cantidadTn / 2) + 1;
    const s1 = reducer(initialState, {
      type: "reservarStock",
      productoId: disponible.id,
      cantidadTn: mitad,
    });
    const s2 = reducer(s1, { type: "reservarStock", productoId: disponible.id, cantidadTn: mitad });
    expect(s2).toBe(s1);
    expect(s2.productos.find((p) => p.id === disponible.id)!.cantidadTn).toBeGreaterThanOrEqual(0);
  });
});

describe("registro local de acuerdos Stellar", () => {
  it("incluye los acuerdos de referencia de Testnet", () => {
    expect(initialState.acuerdosStellar).toEqual(ACUERDOS_REFERENCIA);
  });

  it("no duplica un acuerdo ni una transacción ya registrados", () => {
    const a = ACUERDOS_REFERENCIA[0]!;
    expect(reducer(initialState, { type: "addAcuerdoStellar", acuerdo: a })).toBe(initialState);
    const hash = a.transacciones[0]!.hash;
    const s = reducer(initialState, {
      type: "addTxAcuerdoStellar",
      id: a.id,
      etapa: "create",
      hash,
    });
    expect(s.acuerdosStellar.find((x) => x.id === a.id)!.transacciones).toHaveLength(
      a.transacciones.length,
    );
  });

  it("agrega una nueva transacción a un acuerdo", () => {
    const a = ACUERDOS_REFERENCIA[0]!;
    const s = reducer(initialState, {
      type: "addTxAcuerdoStellar",
      id: a.id,
      etapa: "refund",
      hash: "f".repeat(64),
    });
    expect(s.acuerdosStellar.find((x) => x.id === a.id)!.transacciones).toHaveLength(
      a.transacciones.length + 1,
    );
  });
});
