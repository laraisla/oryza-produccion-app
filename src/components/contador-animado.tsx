// ============================================================
// Número que asciende hasta su valor real (solo presentación).
// Anima una única vez al montar —esperando a que termine la
// intro en video—; después sigue al valor sin volver a animar.
// Respeta prefers-reduced-motion.
// ============================================================

import { useEffect, useRef, useState } from "react";

function introActiva(): boolean {
  // También espera mientras el selector de espacio de trabajo tapa la pantalla.
  if (document.querySelector("[data-selector-modo]")) return true;
  return (
    !document.documentElement.hasAttribute("data-intro-omitida") &&
    !!document.querySelector('#intro-splash[data-fase="pendiente"], #intro-splash[data-fase="reproduciendo"]')
  );
}

/** true cuando la intro en video ya no tapa la aplicación. */
export function useIntroTerminada(): boolean {
  const [lista, setLista] = useState(false);
  useEffect(() => {
    if (!introActiva()) {
      setLista(true);
      return;
    }
    const id = window.setInterval(() => {
      if (!introActiva()) {
        setLista(true);
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  return lista;
}

export function ContadorAnimado({
  valor,
  retrasoMs = 0,
  duracionMs = 900,
}: {
  valor: number;
  retrasoMs?: number;
  duracionMs?: number;
}) {
  const lista = useIntroTerminada();
  const [mostrado, setMostrado] = useState(0);
  const objetivo = useRef(valor);
  objetivo.current = valor;
  const terminado = useRef(false);

  useEffect(() => {
    if (!lista || terminado.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      terminado.current = true;
      setMostrado(objetivo.current);
      return;
    }
    let raf = 0;
    let previo: number | null = null;
    let transcurrido = 0;
    const paso = (ahora: number) => {
      // Si el selector de espacio (o la intro) tapa la pantalla, el conteo espera.
      if (previo !== null && !introActiva()) transcurrido += ahora - previo;
      previo = ahora;
      const p = Math.min(1, transcurrido / duracionMs);
      const suavizado = 1 - Math.pow(1 - p, 3);
      setMostrado(Math.round(objetivo.current * suavizado));
      if (p < 1) raf = window.requestAnimationFrame(paso);
      else terminado.current = true;
    };
    const t = window.setTimeout(() => {
      raf = window.requestAnimationFrame(paso);
    }, retrasoMs);
    // Salvaguarda: si no llegan cuadros (pestaña en segundo plano), se muestra el valor real.
    let marca = -1;
    const respaldo = window.setInterval(() => {
      if (terminado.current || introActiva()) return;
      if (transcurrido === marca) {
        terminado.current = true;
        window.cancelAnimationFrame(raf);
        setMostrado(objetivo.current);
      }
      marca = transcurrido;
    }, retrasoMs + duracionMs + 400);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(respaldo);
      window.cancelAnimationFrame(raf);
    };
  }, [lista, retrasoMs, duracionMs]);

  // Una vez terminada la animación, los cambios de datos se muestran directo.
  useEffect(() => {
    if (terminado.current) setMostrado(valor);
  }, [valor]);

  return <span className="tabular-nums">{mostrado}</span>;
}
