// Inteligencia de Mercados — datos comerciales verificables y reglas documentales.
// Regla del proyecto: NO inventar oportunidades, estadísticas, impuestos, tarifas
// ni requisitos oficiales. Todo dato lleva fuente, año y fecha de actualización.

export interface ExportacionHistorica {
  pais: string;
  toneladas: number;
}

export interface ProductoExportacion {
  hs: string;
  descripcion: string;
  anio: number;
  unidad: "toneladas";
  fuente: string;
  fuenteUrl: string;
  fechaActualizacion: string;
  datos: ExportacionHistorica[];
}

export const EXPORTACIONES_ARGENTINA: ProductoExportacion[] = [
  {
    hs: "100630",
    descripcion: "Arroz semiblanqueado o blanqueado",
    anio: 2025,
    unidad: "toneladas",
    fuente: "WITS / UN Comtrade",
    fuenteUrl:
      "https://wits.worldbank.org/trade/comtrade/en/country/ARG/year/2025/tradeflow/Exports/partner/ALL/product/100630",
    fechaActualizacion: "2026-10-16",
    datos: [
      { pais: "Chile", toneladas: 88937.8 },
      { pais: "Brasil", toneladas: 48151.4 },
      { pais: "Turquía", toneladas: 42995.3 },
      { pais: "Estados Unidos", toneladas: 8102.65 },
      { pais: "Bolivia", toneladas: 6836.23 },
      { pais: "Costa Rica", toneladas: 539.18 },
    ],
  },
  {
    hs: "100620",
    descripcion: "Arroz descascarillado (cargo o cargo pulido)",
    anio: 2025,
    unidad: "toneladas",
    fuente: "WITS / UN Comtrade",
    fuenteUrl:
      "https://wits.worldbank.org/trade/comtrade/en/country/ARG/year/2025/tradeflow/Exports/partner/ALL/product/100620",
    fechaActualizacion: "2026-10-16",
    datos: [
      { pais: "España", toneladas: 19683.7 },
      { pais: "Países Bajos", toneladas: 12468.9 },
      { pais: "Brasil", toneladas: 5352.8 },
      { pais: "Estados Unidos", toneladas: 266.882 },
      { pais: "Canadá", toneladas: 57.15 },
    ],
  },
];

export const REFERENCIA_SECTORIAL = {
  titulo: "Exportaciones argentinas de arroz 2025",
  toneladas: 502000,
  usdMillones: 259,
  fuente: "Bolsa de Comercio de Rosario",
  fuenteUrl:
    "https://www.bcr.com.ar/es/mercados/investigacion-y-desarrollo/informativo-semanal/noticias-informativo-semanal/arroz",
  fechaActualizacion: "2026-10-16",
};

export type ClasificacionMercado = "documentado" | "prospeccion";

export interface Mercado {
  pais: string;
  clasificacion: ClasificacionMercado;
  /** Volumen solo si hay dato estadístico cargado; nunca inventado. */
  volumenTn?: { hs: string; toneladas: number; anio: number }[];
  notas: string;
}

export const MERCADOS: Mercado[] = [
  {
    pais: "Chile",
    clasificacion: "documentado",
    volumenTn: [{ hs: "100630", toneladas: 88937.8, anio: 2025 }],
    notas: "Principal destino del arroz blanqueado argentino en 2025. Marco: ACE 35 y controles SAG.",
  },
  {
    pais: "Brasil",
    clasificacion: "documentado",
    volumenTn: [
      { hs: "100630", toneladas: 48151.4, anio: 2025 },
      { hs: "100620", toneladas: 5352.8, anio: 2025 },
    ],
    notas: "Socio Mercosur. Marco: normativa MAPA y requisitos específicos para arroz.",
  },
  {
    pais: "Turquía",
    clasificacion: "documentado",
    volumenTn: [{ hs: "100630", toneladas: 42995.3, anio: 2025 }],
    notas: "Tercer destino del blanqueado en 2025. Controles de importación de alimentos.",
  },
  {
    pais: "Estados Unidos",
    clasificacion: "documentado",
    volumenTn: [
      { hs: "100630", toneladas: 8102.65, anio: 2025 },
      { hs: "100620", toneladas: 266.882, anio: 2025 },
    ],
    notas: "Marco: FDA, Prior Notice y FSVP.",
  },
  {
    pais: "Costa Rica",
    clasificacion: "documentado",
    volumenTn: [{ hs: "100630", toneladas: 539.18, anio: 2025 }],
    notas: "Marco: Servicio Fitosanitario del Estado (SFE).",
  },
  {
    pais: "España",
    clasificacion: "documentado",
    volumenTn: [{ hs: "100620", toneladas: 19683.7, anio: 2025 }],
    notas: "Principal destino del descascarillado en 2025. Marco: normativa alimentaria y aduanera de la UE.",
  },
  {
    pais: "Países Bajos",
    clasificacion: "documentado",
    volumenTn: [{ hs: "100620", toneladas: 12468.9, anio: 2025 }],
    notas: "Segundo destino del descascarillado. Marco: normativa alimentaria y aduanera de la UE.",
  },
  {
    pais: "Portugal",
    clasificacion: "prospeccion",
    notas: "Sin estadística de exportación cargada. Aplica normativa UE. Mercado de prospección.",
  },
  {
    pais: "México",
    clasificacion: "prospeccion",
    notas: "Sin estadística de exportación cargada. Mercado de prospección.",
  },
  {
    pais: "Israel",
    clasificacion: "prospeccion",
    notas: "Sin estadística de exportación cargada. Mercado de prospección.",
  },
];

export type CaracterRequisito = "legal" | "operativo" | "contractual";
export type EstadoRequisito = "Verificado" | "Pendiente de verificación" | "Vencido";

export interface RequisitoMercado {
  id: string;
  pais: string;
  hs: string;
  tipoArroz: string;
  gradoElaboracion: string;
  presentacion: string;
  uso: string;
  condicionesContractuales: string;
  comprador: string;
  nombre: string;
  descripcion: string;
  autoridad: string;
  caracter: CaracterRequisito;
  documentoNecesario: string;
  fuenteOficial: string;
  ultimaComprobacion: string;
  vigencia: string;
  estado: EstadoRequisito;
  costo: string; // "No verificado" si no hay dato
  responsable: string;
}

let seq = 0;
function req(p: Omit<RequisitoMercado, "id">): RequisitoMercado {
  seq += 1;
  return { id: `REQ-${String(seq).padStart(3, "0")}`, ...p };
}

const HOY = "2026-10-16";

export const REQUISITOS_INICIALES: RequisitoMercado[] = [
  req({
    pais: "Chile", hs: "100630", tipoArroz: "Todos", gradoElaboracion: "Blanqueado/semiblanqueado",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Preferencia arancelaria ACE 35",
    descripcion: "Acceso preferencial bajo el Acuerdo de Complementación Económica N.º 35 (Mercosur–Chile). Requiere certificado de origen.",
    autoridad: "Aduana de Chile / ALADI", caracter: "legal",
    documentoNecesario: "Certificado de origen ACE 35",
    fuenteOficial: "https://www.aladi.org", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación de texto actualizado)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador / Despachante",
  }),
  req({
    pais: "Chile", hs: "100630", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Control fitosanitario SAG",
    descripcion: "Inspección del Servicio Agrícola y Ganadero de Chile a la importación de productos vegetales.",
    autoridad: "SAG Chile", caracter: "legal",
    documentoNecesario: "Certificado fitosanitario de exportación",
    fuenteOficial: "https://www.sag.gob.cl", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador",
  }),
  req({
    pais: "Brasil", hs: "100630/100620", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Marco Mercosur y registro MAPA",
    descripcion: "Comercio intrazona Mercosur; el MAPA exige registros y requisitos específicos para arroz (clasificación, envases, rotulado).",
    autoridad: "MAPA (Ministério da Agricultura e Pecuária)", caracter: "legal",
    documentoNecesario: "Certificado de origen Mercosur + registros MAPA aplicables",
    fuenteOficial: "https://www.gov.br/agricultura", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador / Importador",
  }),
  req({
    pais: "Costa Rica", hs: "100630", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Requisitos fitosanitarios SFE",
    descripcion: "Control del Servicio Fitosanitario del Estado para la importación de granos.",
    autoridad: "Servicio Fitosanitario del Estado (SFE)", caracter: "legal",
    documentoNecesario: "Certificado fitosanitario",
    fuenteOficial: "https://www.sfe.go.cr", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador",
  }),
  req({
    pais: "España", hs: "100620", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Normativa alimentaria y aduanera UE",
    descripcion: "Reglamentos alimentarios de la Unión Europea (seguridad alimentaria, LMR de plaguicidas, rotulado) y formalidades aduaneras de importación.",
    autoridad: "Comisión Europea / AESAN / Aduanas UE", caracter: "legal",
    documentoNecesario: "Documentación aduanera UE + cumplimiento de LMR",
    fuenteOficial: "https://food.ec.europa.eu", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador / Importador UE",
  }),
  req({
    pais: "Países Bajos", hs: "100620", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Normativa alimentaria y aduanera UE",
    descripcion: "Mismo marco UE; controles en puerto de entrada (Rotterdam) por NVWA.",
    autoridad: "NVWA / Aduanas UE", caracter: "legal",
    documentoNecesario: "Documentación aduanera UE + cumplimiento de LMR",
    fuenteOficial: "https://english.nvwa.nl", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador / Importador UE",
  }),
  req({
    pais: "Portugal", hs: "100620", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Normativa alimentaria y aduanera UE",
    descripcion: "Mismo marco UE; autoridad nacional DGAV.",
    autoridad: "DGAV / Aduanas UE", caracter: "legal",
    documentoNecesario: "Documentación aduanera UE + cumplimiento de LMR",
    fuenteOficial: "https://www.dgav.pt", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador / Importador UE",
  }),
  req({
    pais: "Turquía", hs: "100630", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Controles de importación de alimentos",
    descripcion: "Controles del Ministerio de Agricultura y Forestalería de Turquía para importación de alimentos.",
    autoridad: "Ministry of Agriculture and Forestry (Türkiye)", caracter: "legal",
    documentoNecesario: "Certificado sanitario/fitosanitario según producto",
    fuenteOficial: "https://www.tarimorman.gov.tr", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador",
  }),
  req({
    pais: "Estados Unidos", hs: "100630/100620", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Todos",
    nombre: "Registro de establecimiento FDA + Prior Notice",
    descripcion: "Registro de la planta elaboradora ante la FDA y notificación previa (Prior Notice) de cada embarque de alimentos.",
    autoridad: "FDA", caracter: "legal",
    documentoNecesario: "Registro FDA de establecimiento + confirmación de Prior Notice",
    fuenteOficial: "https://www.fda.gov/food", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Exportador",
  }),
  req({
    pais: "Estados Unidos", hs: "100630/100620", tipoArroz: "Todos", gradoElaboracion: "Todos",
    presentacion: "Todas", uso: "Consumo humano", condicionesContractuales: "Todas", comprador: "Importador de EE. UU.",
    nombre: "FSVP (Foreign Supplier Verification Program)",
    descripcion: "El importador estadounidense debe verificar que el proveedor extranjero cumple los estándares de inocuidad de la FDA.",
    autoridad: "FDA / Importador de EE. UU.", caracter: "contractual",
    documentoNecesario: "Documentación de verificación FSVP del importador",
    fuenteOficial: "https://www.fda.gov/food", ultimaComprobacion: HOY,
    vigencia: "Vigente (pendiente de verificación)", estado: "Pendiente de verificación",
    costo: "No verificado", responsable: "Importador (con colaboración del exportador)",
  }),
];

export function fmtTn(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}
