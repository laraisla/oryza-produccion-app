import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BarraAccion } from "@/components/BarraAccion";
import { Dato } from "@/components/Dato";
import { Encabezado } from "@/components/Encabezado";
import { Esqueleto } from "@/components/Esqueleto";
import { estilos } from "@/components/estilos";
import { resumirLote } from "@/lib/calculos";
import { listarCosechasDeLote, obtenerLote } from "@/lib/datos";
import {
  formatearFecha,
  formatearHectareas,
  formatearKilos,
  formatearRendimiento,
} from "@/lib/formato";

export default function PaginaLote({ params }: PageProps<"/lotes/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <Encabezado titulo="Cargando lote…" volverA="/" />
          <main className={`${estilos.contenedor} flex-1 pt-5`}>
            <Esqueleto filas={2} />
          </main>
        </>
      }
    >
      <DetalleLote params={params} />
    </Suspense>
  );
}

async function DetalleLote({ params }: Pick<PageProps<"/lotes/[id]">, "params">) {
  const { id } = await params;
  const lote = await obtenerLote(id);
  if (!lote) notFound();

  const cosechas = await listarCosechasDeLote(id);
  const resumen = resumirLote(lote, cosechas);

  return (
    <>
      <Encabezado
        titulo={lote.nombre}
        subtitulo={cosechas.length === 1 ? "1 cosecha cargada" : `${cosechas.length} cosechas cargadas`}
        volverA="/"
      />

      <main className={`${estilos.contenedor} flex-1 pt-5 pb-28`}>
        <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="col-span-2">
            <Dato
              etiqueta="Rendimiento"
              valor={resumen.rendimientoKgHa === null ? "Sin cosechas" : formatearRendimiento(resumen.rendimientoKgHa)}
              destacado
            />
          </div>
          <Dato etiqueta="Total cosechado" valor={formatearKilos(resumen.totalKilos)} />
          <Dato etiqueta="Superficie" valor={formatearHectareas(lote.superficieHa)} />
        </dl>

        <h2 className="mt-6 text-lg font-semibold">Historial</h2>
        {cosechas.length === 0 ? (
          <p className="mt-2 text-stone-600">Todavía no hay cosechas en este lote.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
            {cosechas.map((cosecha) => (
              <li key={cosecha.id} className="flex items-baseline justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{formatearFecha(cosecha.fecha)}</p>
                  {cosecha.notas && <p className="text-sm text-stone-600">{cosecha.notas}</p>}
                </div>
                <p className="shrink-0 text-lg font-semibold">{formatearKilos(cosecha.kilos)}</p>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BarraAccion>
        <Link href={`/cosechas/nueva?lote=${lote.id}`} className={estilos.botonPrincipal}>
          Cargar cosecha en este lote
        </Link>
      </BarraAccion>
    </>
  );
}
