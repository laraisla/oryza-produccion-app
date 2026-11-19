import { createFileRoute, Outlet } from "@tanstack/react-router";
import gestionCss from "@/gestion/gestion.css?url";
import { GestionModulo } from "@/gestion/GestionModulo";
import { pageHead } from "@/lib/seo";

// Layout de AgroLocal Gestión (prototipo demo). Monta el módulo una sola vez para las
// cinco pantallas; las rutas hijas solo registran las URL (recarga directa y 404 propios).
export const Route = createFileRoute("/gestion")({
  head: () => ({
    ...pageHead(
      "AgroLocal Gestión (demo)",
      "Prototipo demo de gestión de acopio: depósitos, lotes, movimientos e inventario con datos ficticios guardados en el navegador.",
    ),
    links: [{ rel: "stylesheet", href: gestionCss }],
  }),
  component: GestionLayout,
});

function GestionLayout() {
  return (
    <>
      <GestionModulo />
      <Outlet />
    </>
  );
}
