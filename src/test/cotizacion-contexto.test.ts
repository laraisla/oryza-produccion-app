import { describe, expect, it } from "vitest";
import { conceptosIniciales } from "@/lib/comex";
import {
  construirCotizacion,
  construirCotizacionDesdeSimulacion,
  construirOperacion,
  type DatosCotizacionSimulacion,
} from "@/lib/recorrido";
import { PRODUCTOS_INICIALES, SOLICITUDES_INICIALES } from "@/data/demo";

function datos(): DatosCotizacionSimulacion {
  return {
    params: {
      producto: "Arroz",
      cantidadTn: 40,
      contenedores: 2,
      incoterm: "CFR",
      tipoCambioArs: 1000,
      margenPct: 12,
    },
    conceptos: conceptosIniciales(),
    vendedor: "Exportador",
    comprador: "Importador",
    calidad: "Según análisis",
    provinciaOrigen: "Corrientes",
    paisOrigen: "Argentina",
    paisDestino: "Chile",
    puertoSalida: "Rosario",
    puertoDestino: "San Antonio",
    fechaEmbarque: "2027-02-14",
    presentacion: "Bolsas de 25 kg",
    moneda: "USD",
    condiciones: "Costos explícitos",
    idsCotizaciones: [],
    solicitudId: "SOL-001",
    lotes: [{ loteId: "LOTE-A", tn: 40 }],
  };
}

describe("contexto comercial conservado", () => {
  it.each(["FOB", "CFR", "CIF"])(
    "conserva origen, destino, moneda, fecha y puertos al cotizar %s y aceptar",
    (incoterm) => {
      const d = datos();
      d.params.incoterm = incoterm;
      const c = construirCotizacionDesdeSimulacion(d);
      expect(c).toMatchObject({
        paisOrigen: "Argentina",
        provinciaOrigen: "Corrientes",
        paisDestino: "Chile",
        moneda: "USD",
        puertoSalida: "Rosario",
        puertoDestino: "San Antonio",
        fechaEmbarque: "2027-02-14",
        incoterm,
      });
      expect(c.lugarDesignado).toBe(
        incoterm === "FOB" ? "Rosario, Argentina" : "San Antonio, Chile",
      );
      expect(construirOperacion(c, [])).toMatchObject({
        puertoSalida: "Rosario",
        puertoDestino: "San Antonio",
        paisDestino: "Chile",
        fechaProgramada: "2027-02-14",
        incoterm,
        moneda: "USD",
      });
      expect(c.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );

  it("conserva ARS con conversión explícita y base USD separada", () => {
    const d = datos();
    d.moneda = "ARS";
    const c = construirCotizacionDesdeSimulacion(d);
    expect(c.moneda).toBe("ARS");
    expect(c.precioTn).toBe(c.precioTnUsd * 1000);
    expect(construirOperacion(c, [])).toMatchObject({
      moneda: "ARS",
      precioPactadoTn: c.precioTn,
      precioPactadoTnUsd: c.precioTnUsd,
    });
  });

  it("no cotiza en ARS sin cambio ni con simulación inválida", () => {
    const d = datos();
    d.moneda = "ARS";
    d.params.tipoCambioArs = 0;
    expect(() => construirCotizacionDesdeSimulacion(d)).toThrow("tipo de cambio");
    d.moneda = "USD";
    d.params.incoterm = "DESCONOCIDO";
    expect(() => construirCotizacionDesdeSimulacion(d)).toThrow("Incoterm");
    d.params.incoterm = "FOB";
    d.conceptos = [];
    expect(() => construirCotizacionDesdeSimulacion(d)).toThrow("mercadería");
  });

  it("guarda una copia del detalle de costos y de los parámetros", () => {
    const d = datos();
    const c = construirCotizacionDesdeSimulacion(d);
    d.conceptos[0]!.importe = 9999;
    d.params.contenedores = 99;
    d.lotes![0]!.tn = 1;
    expect(c.costosComex![0]!.importe).toBe(520);
    expect(c.parametrosComex!.contenedores).toBe(2);
    expect(c.lotes![0]!.tn).toBe(40);
    expect(c.pendientesVerificacion).toContain("Derechos de exportación");
  });

  it("matching no inventa USD 520 cuando un lote no tiene precio", () => {
    const sinPrecio = { ...PRODUCTOS_INICIALES[0]! };
    delete sinPrecio.precioTnUsd;
    expect(() =>
      construirCotizacion(
        SOLICITUDES_INICIALES[0]!,
        { lotes: [{ loteId: sinPrecio.id, tn: 40 }], totalTn: 40, cubreVolumen: true },
        [sinPrecio],
        [],
      ),
    ).toThrow("precio de todos los lotes");
  });

  it("matching identifica los costos precargados como demo y no inventa puertos ni fecha", () => {
    const c = construirCotizacion(
      SOLICITUDES_INICIALES[0]!,
      { lotes: [{ loteId: "LOTE-A", tn: 40 }], totalTn: 40, cubreVolumen: true },
      PRODUCTOS_INICIALES,
      [],
    );
    expect(c.condiciones).toContain("costos precargados de ejemplo");
    expect(c.costosComex).toHaveLength(25);
    expect(c.puertoSalida).toBe("");
    expect(c.puertoDestino).toBe("");
    expect(c.fechaEmbarque).toBe("");
  });
});
