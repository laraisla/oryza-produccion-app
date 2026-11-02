// ============================================================
// Animaciones de entrada por sección (solo presentación).
// La entrada completa ocurre una vez por sección y por sesión de
// pestaña; al volver (navegando o recargando) se marca
// <html data-seccion-vista> y el CSS la reduce a un fade breve.
// El id de cada sección es el primer segmento de su ruta, así el
// script previo a la hidratación lo resuelve sin parpadeos.
// ============================================================

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";

const CLAVE = "agroglobal-secciones-vistas";

/** Script inline en <head>: marca la sección como vista antes del primer pintado. */
export const SECCIONES_SCRIPT = `try{var s=location.pathname.split("/")[1];if(s&&(" "+(sessionStorage.getItem("${CLAVE}")||"")+" ").indexOf(" "+s+" ")>=0)document.documentElement.setAttribute("data-seccion-vista","")}catch(e){}`;

const useEfectoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

function leerVistas(): string[] {
  try {
    return (window.sessionStorage.getItem(CLAVE) ?? "").split(" ").filter(Boolean);
  } catch {
    return [];
  }
}

/** Registra la sección y decide (una vez por montaje) si va entrada completa o breve. */
export function useSeccionAnimada(id: string): void {
  const vista = useRef<boolean | null>(null);
  useEfectoLayout(() => {
    const html = document.documentElement;
    const vistas = leerVistas();
    if (vista.current === null) vista.current = vistas.includes(id);
    html.toggleAttribute("data-seccion-vista", vista.current);
    if (!vistas.includes(id)) {
      try {
        window.sessionStorage.setItem(CLAVE, [...vistas, id].join(" "));
      } catch {
        // sin almacenamiento: la sección conserva la entrada completa
      }
    }
    return () => html.removeAttribute("data-seccion-vista");
  }, [id]);
}

/** Retraso de entrada (variable CSS --am-delay). */
export const retraso = (ms: number) => ({ "--am-delay": `${ms}ms` }) as CSSProperties;

/** Retraso escalonado con tope, para que listas largas no alarguen la entrada. */
export const escalonado = (i: number, base = 0, paso = 60, max = 8) => retraso(base + Math.min(i, max) * paso);
