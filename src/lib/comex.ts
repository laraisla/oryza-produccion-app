// ============================================================
// Calculadora COMEX — lógica de costos de exportación (demo)
// Clasificación de gastos coherente con Incoterms 2020.
// No usa tasas impositivas ni aranceles: los campos normativos
// quedan como "pendientes de verificación" y se cargan a mano.
// ============================================================

export type UnidadCosto =
  "por_tonelada" | "por_contenedor" | "por_operacion" | "por_dia" | "porcentaje";
export type TipoDato = "estimado" | "cotizado" | "verificado" | "pendiente";
export type ResponsablePago = "vendedor" | "comprador" | "segun_incoterm";

export interface ConceptoCosto {
  id: string;
  grupo: string;
  concepto: string;
  importe: number;
  moneda: "USD" | "ARS";
  unidad: UnidadCosto;
  cantidad: number;
  responsable: ResponsablePago;
  incluidoEnOtraTarifa: boolean;
  tipoDato: TipoDato;
  nota?: string;
  naturaleza?: "seguro_internacional";
}

export const GRUPOS_COSTO = [
  "A. Mercadería",
  "B. Logística nacional",
  "C. Gastos portuarios",
  "D. Aduana y certificaciones",
  "E. Transporte internacional",
  "F. Gastos comerciales y financieros",
] as const;

export function conceptosIniciales(): ConceptoCosto[] {
  const conceptos: ConceptoCosto[] = [
    // A. Mercadería
    {
      id: "c1",
      grupo: "A. Mercadería",
      concepto: "Costo del arroz (por tonelada)",
      importe: 520,
      moneda: "USD",
      unidad: "por_tonelada",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    {
      id: "c2",
      grupo: "A. Mercadería",
      concepto: "Procesamiento y clasificación",
      importe: 18,
      moneda: "USD",
      unidad: "por_tonelada",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c3",
      grupo: "A. Mercadería",
      concepto: "Secado",
      importe: 8,
      moneda: "USD",
      unidad: "por_tonelada",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c4",
      grupo: "A. Mercadería",
      concepto: "Envasado en bolsas de 25 kg",
      importe: 12,
      moneda: "USD",
      unidad: "por_tonelada",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    {
      id: "c5",
      grupo: "A. Mercadería",
      concepto: "Almacenamiento",
      importe: 3,
      moneda: "USD",
      unidad: "por_tonelada",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c6",
      grupo: "A. Mercadería",
      concepto: "Controles de calidad",
      importe: 90,
      moneda: "USD",
      unidad: "por_operacion",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    // B. Logística nacional
    {
      id: "c7",
      grupo: "B. Logística nacional",
      concepto: "Transporte terrestre al puerto",
      importe: 28,
      moneda: "USD",
      unidad: "por_tonelada",
      cantidad: 1,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    {
      id: "c8",
      grupo: "B. Logística nacional",
      concepto: "Carga y descarga",
      importe: 6,
      moneda: "USD",
      unidad: "por_tonelada",
      cantidad: 1,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c9",
      grupo: "B. Logística nacional",
      concepto: "Peajes",
      importe: 40,
      moneda: "USD",
      unidad: "por_contenedor",
      cantidad: 2,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c10",
      grupo: "B. Logística nacional",
      concepto: "Seguro local",
      importe: 0.4,
      moneda: "USD",
      unidad: "porcentaje",
      cantidad: 1,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c11",
      grupo: "B. Logística nacional",
      concepto: "Consolidación de contenedores",
      importe: 120,
      moneda: "USD",
      unidad: "por_contenedor",
      cantidad: 2,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    // C. Gastos portuarios
    {
      id: "c12",
      grupo: "C. Gastos portuarios",
      concepto: "THC / manipulación de terminal",
      importe: 260,
      moneda: "USD",
      unidad: "por_contenedor",
      cantidad: 2,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    {
      id: "c13",
      grupo: "C. Gastos portuarios",
      concepto: "Posicionamiento y pesaje",
      importe: 60,
      moneda: "USD",
      unidad: "por_contenedor",
      cantidad: 2,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c14",
      grupo: "C. Gastos portuarios",
      concepto: "Documentación naviera",
      importe: 75,
      moneda: "USD",
      unidad: "por_operacion",
      cantidad: 1,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    {
      id: "c15",
      grupo: "C. Gastos portuarios",
      concepto: "Demurrage / detention (previsión)",
      importe: 0,
      moneda: "USD",
      unidad: "por_dia",
      cantidad: 0,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "pendiente",
      nota: "Solo si aplica; cargar días e importe según tarifa de la naviera",
    },
    // D. Aduana y certificaciones
    {
      id: "c16",
      grupo: "D. Aduana y certificaciones",
      concepto: "Honorarios de despachante",
      importe: 350,
      moneda: "USD",
      unidad: "por_operacion",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    {
      id: "c17",
      grupo: "D. Aduana y certificaciones",
      concepto: "Derechos de exportación",
      importe: 0,
      moneda: "USD",
      unidad: "porcentaje",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "pendiente",
      nota: "Pendiente de verificación normativa — cargar manualmente la alícuota vigente",
    },
    {
      id: "c18",
      grupo: "D. Aduana y certificaciones",
      concepto: "Certificado fitosanitario",
      importe: 120,
      moneda: "USD",
      unidad: "por_operacion",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c19",
      grupo: "D. Aduana y certificaciones",
      concepto: "Certificado de origen",
      importe: 60,
      moneda: "USD",
      unidad: "por_operacion",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    // E. Transporte internacional
    {
      id: "c20",
      grupo: "E. Transporte internacional",
      concepto: "Flete internacional",
      importe: 1450,
      moneda: "USD",
      unidad: "por_contenedor",
      cantidad: 2,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "cotizado",
    },
    {
      id: "c21",
      grupo: "E. Transporte internacional",
      concepto: "Recargos navieros (BAF/CAF)",
      importe: 180,
      moneda: "USD",
      unidad: "por_contenedor",
      cantidad: 2,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c22",
      grupo: "E. Transporte internacional",
      concepto: "Seguro internacional",
      importe: 0.5,
      moneda: "USD",
      unidad: "porcentaje",
      cantidad: 1,
      responsable: "segun_incoterm",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    // F. Gastos comerciales y financieros
    {
      id: "c23",
      grupo: "F. Gastos comerciales y financieros",
      concepto: "Comisión de intermediario / broker",
      importe: 1.5,
      moneda: "USD",
      unidad: "porcentaje",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c24",
      grupo: "F. Gastos comerciales y financieros",
      concepto: "Comisiones bancarias y transferencia",
      importe: 150,
      moneda: "USD",
      unidad: "por_operacion",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "estimado",
    },
    {
      id: "c25",
      grupo: "F. Gastos comerciales y financieros",
      concepto: "Gastos por carta de crédito",
      importe: 0.8,
      moneda: "USD",
      unidad: "porcentaje",
      cantidad: 1,
      responsable: "vendedor",
      incluidoEnOtraTarifa: false,
      tipoDato: "pendiente",
      nota: "Confirmar con el banco interviniente",
    },
  ];
  // `cantidad` es un multiplicador adicional, no el número de contenedores.
  return conceptos.map((c) => ({
    ...c,
    ...(c.unidad === "por_contenedor" ? { cantidad: 1 } : {}),
    ...(c.id === "c22" ? { naturaleza: "seguro_internacional" as const } : {}),
  }));
}

export interface ParametrosSimulacion {
  producto: string;
  cantidadTn: number;
  contenedores: number;
  incoterm: string;
  tipoCambioArs: number; // ARS por USD
  margenPct: number;
}

// Grupos que el vendedor asume según Incoterm 2020 (regla simplificada y editable)
const GRUPOS_VENDEDOR_POR_INCOTERM: Record<string, string[]> = {
  EXW: ["A. Mercadería"],
  FCA: ["A. Mercadería", "B. Logística nacional", "D. Aduana y certificaciones"],
  FAS: ["A. Mercadería", "B. Logística nacional", "D. Aduana y certificaciones"],
  FOB: [
    "A. Mercadería",
    "B. Logística nacional",
    "C. Gastos portuarios",
    "D. Aduana y certificaciones",
  ],
  CFR: [
    "A. Mercadería",
    "B. Logística nacional",
    "C. Gastos portuarios",
    "D. Aduana y certificaciones",
    "E. Transporte internacional",
  ],
  CIF: [
    "A. Mercadería",
    "B. Logística nacional",
    "C. Gastos portuarios",
    "D. Aduana y certificaciones",
    "E. Transporte internacional",
  ],
  CPT: [
    "A. Mercadería",
    "B. Logística nacional",
    "C. Gastos portuarios",
    "D. Aduana y certificaciones",
    "E. Transporte internacional",
  ],
  CIP: [
    "A. Mercadería",
    "B. Logística nacional",
    "C. Gastos portuarios",
    "D. Aduana y certificaciones",
    "E. Transporte internacional",
  ],
  DAP: GRUPOS_COSTO_DESDE("A", "E"),
  DPU: GRUPOS_COSTO_DESDE("A", "E"),
  DDP: GRUPOS_COSTO_DESDE("A", "E"),
};

function GRUPOS_COSTO_DESDE(a: string, b: string): string[] {
  return GRUPOS_COSTO.filter((grupo) => grupo[0]! >= a && grupo[0]! <= b);
}

export function costoConceptoUsd(
  c: ConceptoCosto,
  params: ParametrosSimulacion,
  baseValorMercaderia: number,
): number {
  if (c.incluidoEnOtraTarifa) return 0;
  if (![c.importe, c.cantidad, baseValorMercaderia].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error(`Importe, cantidad o base inválidos: ${c.concepto}`);
  }
  if (c.moneda !== "USD" && c.moneda !== "ARS") throw new Error(`Moneda no soportada: ${c.moneda}`);
  if (c.moneda === "ARS" && !(Number.isFinite(params.tipoCambioArs) && params.tipoCambioArs > 0)) {
    throw new Error("Ingresá un tipo de cambio ARS/USD mayor a cero");
  }
  let total: number;
  switch (c.unidad) {
    case "por_tonelada":
      total = c.importe * params.cantidadTn * c.cantidad;
      break;
    case "por_contenedor":
      total = c.importe * params.contenedores * c.cantidad;
      break;
    case "por_operacion":
      total = c.importe * c.cantidad;
      break;
    case "por_dia":
      total = c.importe * c.cantidad;
      break;
    case "porcentaje":
      total = (c.importe / 100) * baseValorMercaderia * c.cantidad;
      break;
  }
  if (!Number.isFinite(total)) throw new Error(`Costo no finito: ${c.concepto}`);
  if (c.moneda === "ARS") total /= params.tipoCambioArs;
  return total;
}

export interface ResultadoSimulacion {
  porGrupo: {
    grupo: string;
    totalUsd: number;
    asumidoVendedor: boolean;
    costoVendedorUsd: number;
    costoCompradorUsd: number;
  }[];
  costoMercaderiaUsd: number;
  costoVendedorUsd: number;
  costoTotalUsd: number;
  costoPorTnUsd: number;
  precioMinimoTnUsd: number;
  precioFobTnUsd: number;
  precioCfrTnUsd: number;
  precioCifTnUsd: number;
  margenPct: number;
  pendientesVerificacion: string[];
  errores: string[];
}

/** La asignación explícita prevalece sobre la regla simplificada por Incoterm. */
function pagaVendedor(c: ConceptoCosto, incoterm: string): boolean {
  if (c.responsable !== "segun_incoterm") return c.responsable === "vendedor";
  if (c.naturaleza === "seguro_internacional") return incoterm === "CIF" || incoterm === "CIP";
  return c.grupo === GRUPOS_COSTO[5] || GRUPOS_VENDEDOR_POR_INCOTERM[incoterm]!.includes(c.grupo);
}

export function simular(
  conceptos: ConceptoCosto[],
  params: ParametrosSimulacion,
): ResultadoSimulacion {
  const errores: string[] = [];
  if (!(Number.isFinite(params.cantidadTn) && params.cantidadTn > 0))
    errores.push("Ingresá una cantidad de toneladas mayor a cero");
  if (!(Number.isInteger(params.contenedores) && params.contenedores >= 0))
    errores.push("Ingresá un número de contenedores entero no negativo");
  if (!(Number.isFinite(params.margenPct) && params.margenPct >= 0))
    errores.push("El margen debe ser finito y no negativo");
  if (!Object.hasOwn(GRUPOS_VENDEDOR_POR_INCOTERM, params.incoterm))
    errores.push("Incoterm no soportado");
  for (const c of conceptos) {
    if (c.incluidoEnOtraTarifa) continue;
    if (!GRUPOS_COSTO.some((g) => g === c.grupo)) errores.push(`Grupo no soportado: ${c.concepto}`);
    if (!["vendedor", "comprador", "segun_incoterm"].includes(c.responsable))
      errores.push(`Responsable inválido: ${c.concepto}`);
    if (c.id === "c1" && !(c.importe > 0))
      errores.push("Ingresá el precio del arroz; los gastos de procesamiento no lo sustituyen");
    if (c.unidad === "por_contenedor" && c.importe > 0 && params.contenedores === 0)
      errores.push(`Falta la cantidad de contenedores: ${c.concepto}`);
    try {
      costoConceptoUsd(c, params, 0);
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  const pendientesVerificacion = conceptos
    .filter((c) => !c.incluidoEnOtraTarifa && c.tipoDato === "pendiente")
    .map((c) => c.concepto);
  const vacio: ResultadoSimulacion = {
    porGrupo: [],
    costoMercaderiaUsd: 0,
    costoVendedorUsd: 0,
    costoTotalUsd: 0,
    costoPorTnUsd: 0,
    precioMinimoTnUsd: 0,
    precioFobTnUsd: 0,
    precioCfrTnUsd: 0,
    precioCifTnUsd: 0,
    margenPct: params.margenPct,
    pendientesVerificacion,
    errores,
  };
  if (errores.length) return vacio;
  const baseMercaderia = conceptos
    .filter((c) => c.grupo === "A. Mercadería" && !c.incluidoEnOtraTarifa)
    .reduce((acc, c) => acc + costoConceptoUsd(c, params, 0), 0);
  if (!(Number.isFinite(baseMercaderia) && baseMercaderia > 0)) {
    errores.push("Ingresá el costo de la mercadería; no se aplica un precio alternativo");
    return vacio;
  }
  const costos = new Map<ConceptoCosto, number>();
  for (const c of conceptos) {
    try {
      costos.set(c, costoConceptoUsd(c, params, baseMercaderia));
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (errores.length) return vacio;

  const porGrupo = GRUPOS_COSTO_DESDE("A", "F").map((grupo) => {
    const items = conceptos.filter((c) => c.grupo === grupo);
    const totalUsd = items.reduce((acc, c) => {
      // Los porcentajes se calculan sobre el valor de la mercadería
      return acc + costos.get(c)!;
    }, 0);
    const costoVendedorUsd = items
      .filter((c) => pagaVendedor(c, params.incoterm))
      .reduce((acc, c) => acc + costos.get(c)!, 0);
    return {
      grupo,
      totalUsd,
      asumidoVendedor: costoVendedorUsd > 0,
      costoVendedorUsd,
      costoCompradorUsd: totalUsd - costoVendedorUsd,
    };
  });

  const costoMercaderiaUsd = porGrupo.find((g) => g.grupo === "A. Mercadería")?.totalUsd ?? 0;
  const costoVendedorUsd = porGrupo.reduce((a, g) => a + g.costoVendedorUsd, 0);
  const costoTotalUsd = porGrupo.reduce((a, g) => a + g.totalUsd, 0);

  const costoPorTnUsd = params.cantidadTn > 0 ? costoVendedorUsd / params.cantidadTn : 0;
  const precioMinimoTnUsd = costoPorTnUsd;

  // Escenarios de referencia: precio por tn asumiendo cada estructura de costos
  const precioEscenario = (incoterm: string) =>
    (conceptos.filter((c) => pagaVendedor(c, incoterm)).reduce((a, c) => a + costos.get(c)!, 0) /
      params.cantidadTn) *
    (1 + params.margenPct / 100);
  if (
    ![
      costoTotalUsd,
      costoVendedorUsd,
      costoPorTnUsd * (1 + params.margenPct / 100),
      precioEscenario("FOB"),
      precioEscenario("CFR"),
      precioEscenario("CIF"),
    ].every(Number.isFinite)
  ) {
    errores.push("Los costos exceden el rango numérico permitido");
    return vacio;
  }

  return {
    porGrupo,
    costoMercaderiaUsd,
    costoVendedorUsd,
    costoTotalUsd,
    costoPorTnUsd,
    precioMinimoTnUsd,
    precioFobTnUsd: precioEscenario("FOB"),
    precioCfrTnUsd: precioEscenario("CFR"),
    precioCifTnUsd: precioEscenario("CIF"),
    margenPct: params.margenPct,
    pendientesVerificacion,
    errores,
  };
}
