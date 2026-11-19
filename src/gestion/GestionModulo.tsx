// ============================================================
// Adaptador de AgroLocal Gestión para AgroGlobal (TanStack Router + SSR).
// - La pantalla activa sale del router (navegación sin recargar y recarga directa).
// - El servicio y localStorage se crean SOLO en el navegador (useEffect): el
//   renderizado del servidor nunca toca window ni localStorage.
// - Datos ficticios locales; sin Supabase, Marketplace ni autenticación propia.
// ============================================================

import { Link, useLocation } from "@tanstack/react-router";
import { Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { browserPersistence } from "./browserPersistence";
import { COMPANY, createGestionService, type GestionService } from "./domain";
import { GestionApp, type GestionLinkProps } from "./GestionApp";

export const GESTION_BASE = "/gestion";

function RouterLink({ href, children, ...rest }: GestionLinkProps) {
  // Las cinco rutas existen en el árbol de TanStack Router (src/routes/gestion*.tsx).
  return (
    // Coincidencia exacta: "/gestion" (Dashboard) no debe marcarse activo en sus subpantallas;
    // el estado activo visible lo decide GestionApp.
    <Link to={href as typeof GESTION_BASE} activeOptions={{ exact: true }} {...rest}>
      {children}
    </Link>
  );
}

function Aviso({ children }: { children?: React.ReactNode }) {
  return (
    <div className="ag-app ag-embedded">
      <div className="ag-demo-banner" role="note">
        <Sprout size={18} />
        <div>
          <strong>AgroLocal Gestión — PROTOTIPO DEMO</strong>
          <span>
            {COMPANY} es una empresa ficticia. Los datos de demostración se guardan solo en este
            navegador y no representan inventario empresarial real.
          </span>
        </div>
      </div>
      <main className="ag-main">{children}</main>
    </div>
  );
}

export function GestionModulo() {
  const { pathname } = useLocation();
  const [service, setService] = useState<GestionService | null>(null);
  const [bloqueado, setBloqueado] = useState(false);

  useEffect(() => {
    try {
      setService(createGestionService(browserPersistence(window.localStorage)));
    } catch {
      setBloqueado(true);
    }
  }, []);

  if (bloqueado)
    return (
      <Aviso>
        <p role="alert">
          El almacenamiento del navegador está bloqueado. Habilitá localStorage para este sitio y
          recargá para usar la demo.
        </p>
      </Aviso>
    );
  if (!service)
    return (
      <Aviso>
        <p className="ag-empty">Cargando datos locales de la demo…</p>
      </Aviso>
    );
  return (
    <GestionApp
      service={service}
      basePath={GESTION_BASE}
      pathname={pathname}
      Link={RouterLink}
      embedded
    />
  );
}
