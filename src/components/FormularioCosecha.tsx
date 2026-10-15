"use client";

import type { Lote } from "@/lib/tipos";
import { Campo, ConUnidad } from "./Campo";
import { estilos } from "./estilos";

type Props = {
  lotes: Pick<Lote, "id" | "nombre">[];
  /** Lote ya elegido cuando se llega desde la pantalla de un lote. */
  loteInicial?: string;
  /** Fecha de hoy (AAAA-MM-DD): valor sugerido y fecha máxima permitida. */
  hoy: string;
};

export function FormularioCosecha({ lotes, loteInicial, hoy }: Props) {
  return (
    // ETAPA 2: el formulario todavía no guarda. En la etapa 3 lo conectamos
    // con el servidor.
    <form onSubmit={(evento) => evento.preventDefault()} className="space-y-5">
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Vista previa: este formulario todavía no guarda.
      </p>

      <Campo etiqueta="Lote" htmlFor="lote">
        <select id="lote" name="loteId" defaultValue={loteInicial ?? ""} className={estilos.campo}>
          <option value="" disabled>
            Elegí un lote
          </option>
          {lotes.map((lote) => (
            <option key={lote.id} value={lote.id}>
              {lote.nombre}
            </option>
          ))}
        </select>
      </Campo>

      <Campo etiqueta="Fecha de cosecha" htmlFor="fecha">
        <input id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} className={estilos.campo} />
      </Campo>

      <Campo etiqueta="Kilos cosechados" htmlFor="kilos" ayuda="Ej: 32500">
        <ConUnidad unidad="kg">
          <input
            id="kilos"
            name="kilos"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={`${estilos.campo} pr-14`}
          />
        </ConUnidad>
      </Campo>

      <Campo etiqueta="Notas (opcional)" htmlFor="notas">
        <textarea
          id="notas"
          name="notas"
          rows={3}
          maxLength={200}
          placeholder="Ej: humedad alta, se cortó por lluvia"
          className={`${estilos.campo} h-auto py-3`}
        />
      </Campo>

      <button type="submit" className={estilos.botonPrincipal}>
        Guardar cosecha
      </button>
    </form>
  );
}
