// El servidor puede estar en otro país (y en otro horario). Calculamos "hoy"
// siempre en el horario de Argentina para que la fecha sugerida sea la del campo.
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/** La fecha de hoy en formato AAAA-MM-DD. */
export function hoyIso(): string {
  // El formato "en-CA" devuelve justo AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date());
}
