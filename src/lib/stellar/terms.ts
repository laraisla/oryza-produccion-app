// ============================================================
// Condiciones comerciales de una orden y su hash SHA-256.
// Mismo algoritmo que blockchain/scripts/terms-hash.mjs: JSON
// canónico (claves ordenadas recursivamente, sin espacios).
// Solo el hash viaja a la cadena; las condiciones quedan en AgroGlobal.
// Funciona en navegador y servidor (Web Crypto).
// ============================================================

export type TipoOperacion = "local" | "exportacion";

export interface CondicionesOrden {
  orden: string;
  tipo: TipoOperacion;
  vendedor: string;
  comprador: string;
  producto: {
    tipoArroz: string;
    variedad: string;
    quebradoMaxPct: number;
    humedadMaxPct: number;
    presentacion: string;
  };
  cantidadTn: number;
  precioTnUsd: number;
  totalUsd: number;
  /** Solo exportación. */
  incoterm?: string;
  /** Solo exportación: lugar designado del Incoterm. */
  lugarDesignado?: string;
  /** Solo venta local. */
  lugarEntrega?: string;
  condicionPago: string;
  nota: string;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function hashCondiciones(condiciones: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonical(condiciones));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reglas por tipo: la venta local no exige Incoterm ni documentación de exportación. */
export function validarCondiciones(c: CondicionesOrden): string[] {
  const errores: string[] = [];
  if (!c.orden) errores.push("Falta la referencia de la orden");
  if (!(c.cantidadTn > 0)) errores.push("La cantidad debe ser mayor a 0");
  if (!(c.precioTnUsd > 0)) errores.push("El precio debe ser mayor a 0");
  if (Math.abs(c.totalUsd - c.cantidadTn * c.precioTnUsd) > 0.01)
    errores.push("El total no coincide con cantidad × precio");
  if (c.tipo === "exportacion") {
    if (!c.incoterm) errores.push("Una exportación requiere Incoterm");
    if (!c.lugarDesignado) errores.push("Una exportación requiere lugar designado");
  } else {
    if (c.incoterm) errores.push("Una venta local no lleva Incoterm");
    if (!c.lugarEntrega) errores.push("Una venta local requiere lugar de entrega");
  }
  return errores;
}
