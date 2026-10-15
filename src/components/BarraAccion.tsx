import { estilos } from "./estilos";

/**
 * Barra fija abajo de la pantalla con la acción principal. Queda siempre a
 * mano del pulgar, aunque la lista sea larga.
 */
export function BarraAccion({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
      <div className={`${estilos.contenedor} py-3`}>{children}</div>
    </div>
  );
}
