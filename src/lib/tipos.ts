// Formas de los datos que usa la app. Coinciden con las tablas que vamos a
// crear en la base de datos (etapa 4).

export type Lote = {
  id: string;
  nombre: string;
  superficieHa: number;
};

export type Cosecha = {
  id: string;
  loteId: string;
  /** Fecha en formato AAAA-MM-DD, por ejemplo "2026-03-14". */
  fecha: string;
  kilos: number;
  notas: string | null;
};

/** Un lote con sus números ya calculados, listo para mostrar. */
export type ResumenLote = Lote & {
  totalKilos: number;
  cantidadCosechas: number;
  /** null cuando el lote todavía no tiene cosechas. */
  rendimientoKgHa: number | null;
};
