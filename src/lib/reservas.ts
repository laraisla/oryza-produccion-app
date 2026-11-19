import type { Cotizacion, Producto } from "@/data/demo";

// Precisión del stock demo: milésimas de tonelada. No es una transacción de backend.
function unidades(tn: number): number | null {
  const n = Math.round(tn * 1000);
  return Number.isFinite(tn) && Number.isSafeInteger(n) && Math.abs(tn * 1000 - n) < 1e-7
    ? n
    : null;
}

export type ReservaLocal = { ok: true; productos: Producto[] } | { ok: false; error: string };

/** Valida TODAS las asignaciones y prepara un único estado, sin mutar el original. */
export function prepararReservaCotizacion(c: Cotizacion, productos: Producto[]): ReservaLocal {
  const total = unidades(c.cantidadTn);
  if (total === null || total <= 0)
    return { ok: false, error: "Cantidad de la cotización inválida (máximo 3 decimales)" };
  if (!c.lotes?.length)
    return { ok: false, error: "Asigná lotes a la cotización antes de aceptar y reservar stock" };
  const pedidos = new Map<string, number>();
  for (const l of c.lotes) {
    const n = unidades(l.tn);
    if (n === null || n <= 0)
      return { ok: false, error: `Cantidad inválida para el lote ${l.loteId}` };
    const suma = (pedidos.get(l.loteId) ?? 0) + n;
    if (!Number.isSafeInteger(suma)) return { ok: false, error: "Cantidad fuera de rango" };
    pedidos.set(l.loteId, suma);
  }
  if ([...pedidos.values()].reduce((a, b) => a + b, 0) !== total) {
    return { ok: false, error: "La asignación de lotes no coincide con la cantidad cotizada" };
  }
  const restantes = new Map<string, number>();
  for (const [id, pedido] of pedidos) {
    const p = productos.find((x) => x.id === id);
    const stock = p ? unidades(p.cantidadTn) : null;
    if (!p || p.estado !== "Disponible" || stock === null || stock < pedido) {
      return {
        ok: false,
        error: `Stock insuficiente o lote no disponible: ${id}. No se reservó ningún lote`,
      };
    }
    restantes.set(id, (stock - pedido) / 1000);
  }
  return {
    ok: true,
    productos: productos.map((p) => {
      const resto = restantes.get(p.id);
      return resto === undefined
        ? p
        : { ...p, cantidadTn: resto, estado: resto === 0 ? "Reservado" : p.estado };
    }),
  };
}
