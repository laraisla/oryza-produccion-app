import Link from "next/link";
import { Suspense } from "react";
import { BarraAccion } from "@/components/BarraAccion";
import { Encabezado } from "@/components/Encabezado";
import { Esqueleto } from "@/components/Esqueleto";
import { TarjetaLote } from "@/components/TarjetaLote";
import { estilos } from "@/components/estilos";
import { listarResumenLotes } from "@/lib/datos";

export default function Inicio() {
  return (
    <>
      <Encabezado titulo="Oryza" subtitulo="Cosechas de arroz por lote" />

      <main className={`${estilos.contenedor} flex-1 pt-5 pb-28`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lotes</h2>
          <Link
            href="/lotes/nuevo"
            className="-mr-2 rounded-lg px-2 py-2 font-semibold text-green-800 hover:bg-green-50"
          >
            + Agregar lote
          </Link>
        </div>

        <div className="mt-3">
          {/* Mientras llegan los datos se ve el esqueleto; el resto ya aparece. */}
          <Suspense fallback={<Esqueleto />}>
            <ListaLotes />
          </Suspense>
        </div>
      </main>

      <BarraAccion>
        <Link href="/cosechas/nueva" className={estilos.botonPrincipal}>
          Cargar cosecha
        </Link>
      </BarraAccion>
    </>
  );
}

async function ListaLotes() {
  const lotes = await listarResumenLotes();

  if (lotes.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center">
        <p className="text-lg font-semibold">Todavía no hay lotes</p>
        <p className="mt-1 text-stone-600">Agregá tu primer lote para empezar a cargar cosechas.</p>
        <Link href="/lotes/nuevo" className={`${estilos.botonSecundario} mt-4`}>
          Agregar lote
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {lotes.map((lote) => (
        <li key={lote.id}>
          <TarjetaLote lote={lote} />
        </li>
      ))}
    </ul>
  );
}
