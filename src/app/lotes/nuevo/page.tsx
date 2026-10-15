import type { Metadata } from "next";
import { Encabezado } from "@/components/Encabezado";
import { FormularioLote } from "@/components/FormularioLote";
import { estilos } from "@/components/estilos";

export const metadata: Metadata = { title: "Agregar lote" };

export default function PaginaNuevoLote() {
  return (
    <>
      <Encabezado titulo="Agregar lote" volverA="/" />
      <main className={`${estilos.contenedor} flex-1 py-5`}>
        <FormularioLote />
      </main>
    </>
  );
}
