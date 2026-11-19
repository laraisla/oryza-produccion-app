import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

// Pantalla "Movimientos" de AgroLocal Gestión: la renderiza el layout /gestion.
export const Route = createFileRoute("/gestion/movimientos")({
  head: () =>
    pageHead("Movimientos · AgroLocal Gestión (demo)", "Prototipo demo con datos ficticios."),
  component: () => null,
});
