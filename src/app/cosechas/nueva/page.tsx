import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Encabezado } from "@/components/Encabezado";
import { Esqueleto } from "@/components/Esqueleto";
import { FormularioCosecha } from "@/components/FormularioCosecha";
import { estilos } from "@/components/estilos";
import { listarLotes } from "@/lib/datos";
import { hoyIso } from "@/lib/fechas";

export const metadata: Metadata = { title: "Cargar cosecha" };

export default function PaginaNuevaCosecha({ searchParams }: PageProps<"/cosechas/nueva">) {
  return (
    <>
      <Encabezado titulo="Cargar cosecha" volverA="/" />
      <main className={`${estilos.contenedor} flex-1 py-5`}>
        <Suspense fallback={<Esqueleto filas={4} alto="h-16" />}>
          <FormularioConDatos searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function FormularioConDatos({ searchParams }: Pick<PageProps<"/cosechas/nueva">, "searchParams">) {
  // "Hoy" cambia todos los días: le pedimos a Next.js que lo calcule en cada
  // visita y no una sola vez al compilar.
  await connection();
  const [{ lote }, lotes] = await Promise.all([searchParams, listarLotes()]);

  if (lotes.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center">
        <p className="text-lg font-semibold">Primero agregá un lote</p>
        <p className="mt-1 text-stone-600">Cada cosecha se carga en un lote.</p>
        <Link href="/lotes/nuevo" className={`${estilos.botonSecundario} mt-4`}>
          Agregar lote
        </Link>
      </div>
    );
  }

  // Si llegamos desde la pantalla de un lote, ese lote ya viene elegido.
  const loteInicial = typeof lote === "string" && lotes.some((l) => l.id === lote) ? lote : undefined;

  return (
    <FormularioCosecha
      lotes={lotes.map(({ id, nombre }) => ({ id, nombre }))}
      loteInicial={loteInicial}
      hoy={hoyIso()}
    />
  );
}
