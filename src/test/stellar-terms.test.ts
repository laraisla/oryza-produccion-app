import { describe, expect, it } from "vitest";

import {
  ACUERDOS_REFERENCIA,
  STELLAR,
  fmtActivo,
  montoAUnidades,
  unidadesAMonto,
} from "@/lib/stellar/config";
import {
  canonical,
  hashCondiciones,
  validarCondiciones,
  type CondicionesOrden,
} from "@/lib/stellar/terms";

describe("hash de condiciones comerciales", () => {
  it("es independiente del orden de las claves", () => {
    expect(canonical({ b: 1, a: { d: [2, 1], c: "x" } })).toBe(
      canonical({ a: { c: "x", d: [2, 1] }, b: 1 }),
    );
    expect(canonical({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("coincide con el hash registrado en Testnet por demo-flow.sh", async () => {
    expect(ACUERDOS_REFERENCIA.length).toBeGreaterThanOrEqual(2);
    for (const a of ACUERDOS_REFERENCIA) {
      expect(await hashCondiciones(a.condiciones)).toBe(a.termsHash);
    }
  });

  it("cambia si se altera cualquier condición", async () => {
    const a = ACUERDOS_REFERENCIA[0]!;
    const alterado = { ...a.condiciones, precioTnUsd: a.condiciones.precioTnUsd + 1 };
    expect(await hashCondiciones(alterado)).not.toBe(a.termsHash);
  });
});

describe("reglas por tipo de operación", () => {
  const base: CondicionesOrden = {
    orden: "OC-T",
    tipo: "local",
    vendedor: "V",
    comprador: "C",
    producto: {
      tipoArroz: "Blanco",
      variedad: "Largo fino",
      quebradoMaxPct: 5,
      humedadMaxPct: 14,
      presentacion: "Bolsas de 25 kg",
    },
    cantidadTn: 10,
    precioTnUsd: 500,
    totalUsd: 5000,
    lugarEntrega: "Planta",
    condicionPago: "Garantía",
    nota: "Demo",
  };

  it("venta local no exige Incoterm y lo rechaza si viene", () => {
    expect(validarCondiciones(base)).toEqual([]);
    expect(validarCondiciones({ ...base, incoterm: "FOB" })).toContain(
      "Una venta local no lleva Incoterm",
    );
  });

  it("exportación exige Incoterm y lugar designado", () => {
    const exp: CondicionesOrden = {
      ...base,
      tipo: "exportacion",
      lugarEntrega: undefined as unknown as string,
    };
    expect(validarCondiciones(exp)).toEqual(
      expect.arrayContaining([
        "Una exportación requiere Incoterm",
        "Una exportación requiere lugar designado",
      ]),
    );
    expect(
      validarCondiciones({ ...exp, incoterm: "FOB", lugarDesignado: "Puerto de Buenos Aires" }),
    ).toEqual([]);
  });

  it("rechaza totales inconsistentes y cantidades no positivas", () => {
    expect(validarCondiciones({ ...base, totalUsd: 1 })).toContain(
      "El total no coincide con cantidad × precio",
    );
    expect(validarCondiciones({ ...base, cantidadTn: 0, totalUsd: 0 })).toContain(
      "La cantidad debe ser mayor a 0",
    );
  });
});

describe("conversión de montos del activo de prueba", () => {
  it("usa 7 decimales", () => {
    expect(STELLAR.decimales).toBe(7);
    expect(montoAUnidades(20800)).toBe("208000000000");
    expect(unidadesAMonto("208000000000")).toBe(20800);
    expect(montoAUnidades(0.01)).toBe("100000");
    expect(fmtActivo("52000000000")).toContain("AGROUSD");
  });
});
