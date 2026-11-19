import { describe, expect, it } from "vitest";
import {
  conceptosIniciales,
  costoConceptoUsd,
  GRUPOS_COSTO,
  simular,
  type ConceptoCosto,
  type ParametrosSimulacion,
} from "@/lib/comex";

const params: ParametrosSimulacion = {
  producto: "Arroz",
  cantidadTn: 10,
  contenedores: 2,
  incoterm: "CFR",
  tipoCambioArs: 1000,
  margenPct: 20,
};
function costo(
  id: string,
  grupo: string,
  importe: number,
  patch: Partial<ConceptoCosto> = {},
): ConceptoCosto {
  return {
    id,
    concepto: id,
    grupo,
    importe,
    moneda: "USD",
    unidad: "por_operacion",
    cantidad: 1,
    responsable: "segun_incoterm",
    incluidoEnOtraTarifa: false,
    tipoDato: "cotizado",
    ...patch,
  };
}
const costos = [
  costo("arroz", GRUPOS_COSTO[0], 100, { unidad: "por_tonelada" }),
  costo("logistica", GRUPOS_COSTO[1], 200),
  costo("flete", GRUPOS_COSTO[4], 300),
  costo("seguro", GRUPOS_COSTO[4], 1, { unidad: "porcentaje", naturaleza: "seguro_internacional" }),
  costo("banco", GRUPOS_COSTO[5], 50),
];

describe("regresión COMEX", () => {
  it("incluye los seis grupos y los gastos financieros en los totales", () => {
    const r = simular(costos, params);
    expect(r.errores).toEqual([]);
    expect(r.porGrupo).toHaveLength(6);
    expect(r.costoTotalUsd).toBe(1560);
    expect(r.costoVendedorUsd).toBe(1550);
    expect(r.porGrupo[5]!.costoVendedorUsd).toBe(50);
  });

  it("calcula FOB, CFR y CIF independientes del escenario seleccionado", () => {
    for (const incoterm of ["FOB", "CFR", "CIF"]) {
      const r = simular(costos, { ...params, incoterm });
      expect(r.precioFobTnUsd).toBeCloseTo(150);
      expect(r.precioCfrTnUsd).toBeCloseTo(186);
      expect(r.precioCifTnUsd).toBeCloseTo(187.2);
      expect(r.costoVendedorUsd).toBe(incoterm === "FOB" ? 1250 : incoterm === "CFR" ? 1550 : 1560);
    }
  });

  it("respeta responsables por concepto dentro de un grupo mixto", () => {
    const cs = [
      ...costos,
      costo("logistica-comprador", GRUPOS_COSTO[1], 75, { responsable: "comprador" }),
      costo("flete-vendedor", GRUPOS_COSTO[4], 25, { responsable: "vendedor" }),
    ];
    const r = simular(cs, { ...params, incoterm: "FOB" });
    expect(r.costoVendedorUsd).toBe(1275);
    expect(r.porGrupo[1]).toMatchObject({
      totalUsd: 275,
      costoVendedorUsd: 200,
      costoCompradorUsd: 75,
    });
    expect(
      simular(
        costos.map((c) => ({ ...c, responsable: "comprador" })),
        params,
      ).costoVendedorUsd,
    ).toBe(0);
  });

  it("dos contenedores cuestan dos tarifas, sin duplicar su cantidad inicial", () => {
    const flete = conceptosIniciales().find((c) => c.id === "c20")!;
    expect(flete.cantidad).toBe(1);
    expect(costoConceptoUsd(flete, params, 1000)).toBe(2900);
    expect(
      conceptosIniciales()
        .filter((c) => c.unidad === "por_contenedor")
        .every((c) => c.cantidad === 1),
    ).toBe(true);
  });

  it("conserva multiplicadores explícitos y omite cargos incluidos en otra tarifa", () => {
    expect(
      costoConceptoUsd(
        costo("flete", GRUPOS_COSTO[4], 10, { unidad: "por_contenedor", cantidad: 3 }),
        params,
        1000,
      ),
    ).toBe(60);
    expect(
      simular(
        [...costos, costo("incluido", GRUPOS_COSTO[1], 900, { incluidoEnOtraTarifa: true })],
        params,
      ).costoVendedorUsd,
    ).toBe(1550);
  });

  it("no sustituye mercadería faltante por USD 500 ni por gastos de procesamiento", () => {
    expect(simular([], params).errores.join()).toContain("mercadería");
    const cs = conceptosIniciales().map((c) => (c.id === "c1" ? { ...c, importe: 0 } : c));
    expect(simular(cs, params).errores.join()).toContain("precio del arroz");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza ARS con cambio inválido %s en lugar de convertirlo a cero",
    (tipoCambioArs) => {
      const cs = [costo("arroz", GRUPOS_COSTO[0], 100, { moneda: "ARS" })];
      expect(simular(cs, { ...params, tipoCambioArs }).errores.join()).toContain("tipo de cambio");
      expect(() => costoConceptoUsd(cs[0]!, { ...params, tipoCambioArs }, 100)).toThrow();
    },
  );

  it("convierte costos ARS con el cambio explícito", () => {
    expect(
      simular([costo("arroz", GRUPOS_COSTO[0], 200_000, { moneda: "ARS" })], params)
        .costoMercaderiaUsd,
    ).toBe(200);
  });

  it.each(["", "DESCONOCIDO", "constructor", "__proto__"])(
    "no sustituye el Incoterm %s por FOB",
    (incoterm) => {
      expect(simular(costos, { ...params, incoterm }).errores).toContain("Incoterm no soportado");
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza volumen inválido %s",
    (cantidadTn) => {
      expect(simular(costos, { ...params, cantidadTn }).errores.length).toBeGreaterThan(0);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza importes inválidos %s",
    (importe) => {
      expect(
        simular([costo("arroz", GRUPOS_COSTO[0], importe)], params).errores.length,
      ).toBeGreaterThan(0);
    },
  );

  it("informa desbordamientos y conserva los conceptos pendientes sin inventar tarifas", () => {
    expect(
      simular(
        [
          costo("arroz", GRUPOS_COSTO[0], 1e308),
          costo("porcentaje", GRUPOS_COSTO[5], 1000, { unidad: "porcentaje" }),
        ],
        params,
      ).errores.length,
    ).toBeGreaterThan(0);
    const pendiente = costo("derechos", GRUPOS_COSTO[3], 0, { tipoDato: "pendiente" });
    expect(simular([...costos, pendiente], params).pendientesVerificacion).toEqual(["derechos"]);
    expect(pendiente.importe).toBe(0);
  });
});
