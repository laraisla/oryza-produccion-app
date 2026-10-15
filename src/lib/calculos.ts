import type { Cosecha, Lote, ResumenLote } from "./tipos";

/**
 * Suma las cosechas de un lote y calcula su rendimiento (kg por hectárea).
 * El rendimiento no se guarda en la base: se calcula siempre al mostrarlo,
 * así nunca queda desactualizado.
 */
export function resumirLote(lote: Lote, cosechas: Cosecha[]): ResumenLote {
  const totalKilos = cosechas.reduce((suma, cosecha) => suma + cosecha.kilos, 0);

  return {
    ...lote,
    totalKilos,
    cantidadCosechas: cosechas.length,
    rendimientoKgHa: cosechas.length > 0 ? totalKilos / lote.superficieHa : null,
  };
}
