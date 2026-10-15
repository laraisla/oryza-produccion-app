import Link from "next/link";
import { formatearHectareas, formatearKilos, formatearRendimiento } from "@/lib/formato";
import type { ResumenLote } from "@/lib/tipos";
import { Dato } from "./Dato";

export function TarjetaLote({ lote }: { lote: ResumenLote }) {
  return (
    <Link
      href={`/lotes/${lote.id}`}
      className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-green-700 active:bg-stone-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-green-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{lote.nombre}</h3>
          <p className="text-sm text-stone-500">{formatearHectareas(lote.superficieHa)}</p>
        </div>
        <svg viewBox="0 0 24 24" className="mt-1 size-6 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {lote.rendimientoKgHa === null ? (
        <p className="mt-3 text-stone-500">Sin cosechas todavía</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Dato etiqueta="Rendimiento" valor={formatearRendimiento(lote.rendimientoKgHa)} destacado />
          <Dato etiqueta="Total cosechado" valor={formatearKilos(lote.totalKilos)} />
        </dl>
      )}
    </Link>
  );
}
