import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

// Pantalla "Dashboard" de AgroLocal Gestión: la renderiza el layout /gestion.
export const Route = createFileRoute("/gestion/")({
  head: () =>
    pageHead("Dashboard · AgroLocal Gestión (demo)", "Prototipo demo con datos ficticios."),
  component: () => null,
});
