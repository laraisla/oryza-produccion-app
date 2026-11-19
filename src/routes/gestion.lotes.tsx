import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

// Pantalla "Lotes" de AgroLocal Gestión: la renderiza el layout /gestion.
export const Route = createFileRoute("/gestion/lotes")({
  head: () => pageHead("Lotes · AgroLocal Gestión (demo)", "Prototipo demo con datos ficticios."),
  component: () => null,
});
