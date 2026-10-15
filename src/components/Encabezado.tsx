import Link from "next/link";
import { estilos } from "./estilos";

type Props = {
  titulo: string;
  subtitulo?: string;
  /** Si se indica, muestra una flecha para volver a esa dirección. */
  volverA?: string;
};

export function Encabezado({ titulo, subtitulo, volverA }: Props) {
  return (
    <header className="bg-green-700 text-white">
      <div className={`${estilos.contenedor} flex min-h-16 items-center gap-1 py-3`}>
        {volverA && (
          <Link
            href={volverA}
            aria-label="Volver"
            className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-green-800 focus-visible:outline-3 focus-visible:outline-white"
          >
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight">{titulo}</h1>
          {subtitulo && <p className="text-sm text-green-100">{subtitulo}</p>}
        </div>
      </div>
    </header>
  );
}
