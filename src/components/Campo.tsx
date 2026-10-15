type Props = {
  etiqueta: string;
  /** El id del input que está adentro, para que tocar la etiqueta lo active. */
  htmlFor: string;
  /** Texto de ayuda gris debajo del campo. */
  ayuda?: string;
  /** Mensaje de error en rojo (reemplaza a la ayuda). */
  error?: string;
  children: React.ReactNode;
};

/** Envuelve un input con su etiqueta, su ayuda y su mensaje de error. */
export function Campo({ etiqueta, htmlFor, ayuda, error, children }: Props) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block font-semibold">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : (
        ayuda && <p className="mt-1.5 text-sm text-stone-500">{ayuda}</p>
      )}
    </div>
  );
}

/** Muestra una unidad (kg, ha) dentro del borde derecho de un input. */
export function ConUnidad({ unidad, children }: { unidad: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-lg text-stone-500">
        {unidad}
      </span>
    </div>
  );
}
