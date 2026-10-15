"use client";

import { Campo, ConUnidad } from "./Campo";
import { estilos } from "./estilos";

export function FormularioLote() {
  return (
    // ETAPA 2: el formulario todavía no guarda. En la etapa 3 lo conectamos
    // con el servidor.
    <form onSubmit={(evento) => evento.preventDefault()} className="space-y-5">
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Vista previa: este formulario todavía no guarda.
      </p>

      <Campo etiqueta="Nombre del lote" htmlFor="nombre" ayuda="Como lo llaman en el campo. Ej: El Bajo">
        <input id="nombre" name="nombre" type="text" autoComplete="off" maxLength={60} className={estilos.campo} />
      </Campo>

      <Campo etiqueta="Superficie" htmlFor="superficie" ayuda="En hectáreas. Podés usar coma: 27,5">
        <ConUnidad unidad="ha">
          <input
            id="superficie"
            name="superficieHa"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={`${estilos.campo} pr-14`}
          />
        </ConUnidad>
      </Campo>

      <button type="submit" className={estilos.botonPrincipal}>
        Guardar lote
      </button>
    </form>
  );
}
