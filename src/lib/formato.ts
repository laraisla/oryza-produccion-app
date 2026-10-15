// Funciones para mostrar números y fechas como se leen en Argentina:
// punto para los miles (356.600) y coma para los decimales (32,5).

const enteros = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const conDecimales = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatearKilos(kilos: number): string {
  return `${enteros.format(kilos)} kg`;
}

export function formatearHectareas(hectareas: number): string {
  return `${conDecimales.format(hectareas)} ha`;
}

export function formatearRendimiento(kgPorHa: number): string {
  return `${enteros.format(kgPorHa)} kg/ha`;
}

/** "2026-03-14" → "14 mar 2026" */
export function formatearFecha(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  return `${dia} ${MESES[mes - 1]} ${anio}`;
}
