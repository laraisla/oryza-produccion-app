import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { estilos } from "@/components/estilos";

export default function NoEncontrado() {
  return (
    <>
      <Encabezado titulo="No encontrado" volverA="/" />
      <main className={`${estilos.contenedor} flex-1 py-8`}>
        <p className="text-lg font-semibold">No encontramos esta página.</p>
        <p className="mt-1 text-stone-600">Puede que el enlace esté mal escrito o que el lote ya no exista.</p>
        <Link href="/" className={`${estilos.botonPrincipal} mt-6`}>
          Volver al inicio
        </Link>
      </main>
    </>
  );
}
