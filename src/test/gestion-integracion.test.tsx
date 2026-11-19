// @vitest-environment node
// Integración de AgroLocal Gestión en AgroGlobal: rutas registradas y SSR sin almacenamiento.
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GestionApp } from "@/gestion/GestionApp";
import { createGestionService } from "@/gestion/domain";
import { NAV_POR_MODO } from "@/data/organizaciones";
import { routeTree } from "@/routeTree.gen";

const PANTALLAS = [
  "/gestion",
  "/gestion/depositos",
  "/gestion/lotes",
  "/gestion/movimientos",
  "/gestion/inventario",
];

describe("AgroLocal Gestión dentro de AgroGlobal", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it("registra las cinco pantallas como rutas reales (recarga directa)", () => {
    for (const path of PANTALLAS) {
      const leaf = router.matchRoutes(path).at(-1);
      expect(leaf?.routeId, path).not.toBe(rootRouteId);
      expect(leaf?.fullPath.replace(/\/$/, ""), path).toBe(path);
    }
  });

  it("no inventa pantallas: una subruta desconocida no coincide con Gestión", () => {
    const leaf = router.matchRoutes("/gestion/no-existe").at(-1);
    expect(leaf?.fullPath).not.toBe("/gestion/no-existe");
  });

  it("aparece en la navegación de todos los modos de trabajo", () => {
    for (const items of Object.values(NAV_POR_MODO))
      expect(items.some((i) => i.to === "/gestion")).toBe(true);
  });

  it("el renderizado de servidor no accede al almacenamiento y muestra el aviso de demo", () => {
    expect(typeof window).toBe("undefined");
    const read = vi.fn(() => {
      throw new Error("El servidor no debe leer el almacenamiento");
    });
    const write = vi.fn();
    const service = createGestionService({ read, write });
    for (const path of PANTALLAS) {
      const html = renderToString(<GestionApp service={service} pathname={path} embedded />);
      expect(html).toContain("AgroLocal Gestión — PROTOTIPO DEMO");
      expect(html).toContain("no representan inventario empresarial real");
    }
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("selecciona la pantalla desde la ruta del router", () => {
    const service = createGestionService({ read: () => null, write: () => undefined });
    const html = renderToString(
      <GestionApp service={service} pathname="/gestion/inventario" embedded />,
    );
    expect(html).toMatch(/<h1[^>]*>Inventario<\/h1>/);
    expect(html).toContain('aria-current="page"');
  });
});
