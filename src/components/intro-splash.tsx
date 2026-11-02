// ============================================================
// Introducción en video (una vez por sesión de pestaña).
// El SSR renderiza el fondo oscuro para evitar destellos; un
// script inline en <head> marca <html data-intro-omitida> antes
// del primer pintado si la intro ya se vio en esta pestaña o el
// usuario prefiere movimiento reducido (ver __root.tsx).
// Nunca bloquea la app: error de video, autoplay rechazado o
// timeout de seguridad la cierran.
// ============================================================

import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const INTRO_CLAVE = "agroglobal-intro-vista";
const VIDEO_SRC = "/agroglobal-intro.mp4";
const TIMEOUT_SEGURIDAD_MS = 12_000;
const FADE_MS = 500;

/** Script previo a la hidratación: decide si omitir la intro sin parpadeo. */
export const INTRO_SCRIPT = `try{if(sessionStorage.getItem("${INTRO_CLAVE}")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.setAttribute("data-intro-omitida","")}catch(e){document.documentElement.setAttribute("data-intro-omitida","")}`;

type Fase = "pendiente" | "reproduciendo" | "saliendo" | "terminada";

export function IntroSplash() {
  const [fase, setFase] = useState<Fase>("pendiente");
  const [conSonido, setConSonido] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const salir = useCallback((inmediato = false) => {
    setFase((f) => (f === "terminada" ? f : inmediato ? "terminada" : "saliendo"));
  }, []);

  useEffect(() => {
    if (document.documentElement.hasAttribute("data-intro-omitida")) {
      setFase("terminada");
      return;
    }
    try {
      window.sessionStorage.setItem(INTRO_CLAVE, "1");
    } catch {
      // sin almacenamiento: la intro se muestra igual
    }
    setFase("reproduciendo");
  }, []);

  // Autoplay silenciado; si el navegador lo rechaza, se entra directo.
  useEffect(() => {
    if (fase !== "reproduciendo") return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play()?.catch(() => salir(true));
    const t = window.setTimeout(() => salir(), TIMEOUT_SEGURIDAD_MS);
    return () => window.clearTimeout(t);
  }, [fase, salir]);

  useEffect(() => {
    if (fase !== "saliendo") return;
    const t = window.setTimeout(() => setFase("terminada"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [fase]);

  if (fase === "terminada") return null;

  const alternarSonido = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setConSonido(!video.muted);
  };

  return (
    <div
      id="intro-splash"
      data-fase={fase}
      role="dialog"
      aria-modal="true"
      aria-label="Introducción de AgroGlobal COMEX"
      className={cn(
        "fixed inset-0 z-[100] bg-[#0d1a17] transition-opacity duration-500 ease-out motion-reduce:transition-none",
        fase === "saliendo" && "pointer-events-none opacity-0",
      )}
    >
      {fase !== "pendiente" && (
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => salir()}
          onError={() => salir(true)}
          className="h-full w-full object-contain"
        />
      )}
      {fase === "reproduciendo" && (
        <div className="absolute bottom-5 right-5 flex items-center gap-2">
          <button
            type="button"
            onClick={alternarSonido}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D5B36B]"
          >
            {conSonido ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {conSonido ? "Silenciar" : "Activar sonido"}
          </button>
          <button
            type="button"
            onClick={() => salir()}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D5B36B]"
          >
            Saltar introducción
          </button>
        </div>
      )}
    </div>
  );
}
