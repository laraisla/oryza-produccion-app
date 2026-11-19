import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "@/lib/store";
import { initialState } from "@/lib/store";

const mocks = vi.hoisted(() => ({
  state: undefined as unknown as AppState,
  dispatch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/store", async (original) => ({
  ...(await original<typeof import("@/lib/store")>()),
  useAppStore: () => ({ state: mocks.state, dispatch: mocks.dispatch, hidratado: true }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
import { Route } from "@/routes/cotizaciones";
const Cotizaciones = Route.options.component as ComponentType;

beforeEach(() => {
  mocks.state = structuredClone(initialState);
  vi.clearAllMocks();
  const c = mocks.state.cotizaciones[0]!;
  c.lotes = [{ loteId: "LOTE-A", tn: c.cantidadTn }];
  vi.spyOn(Route, "useSearch").mockReturnValue({ ver: c.id });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("pantalla de aceptación", () => {
  it("informa falta de stock sin despachar ni mostrar éxito", () => {
    mocks.state.productos[0]!.cantidadTn = 1;
    render(<Cotizaciones />);
    fireEvent.click(screen.getByRole("button", { name: "Aceptada" }));
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(
      "No se aceptó la cotización",
      expect.objectContaining({ description: expect.stringContaining("Stock insuficiente") }),
    );
  });

  it("informa la asignación faltante de una cotización antigua", () => {
    delete mocks.state.cotizaciones[0]!.lotes;
    render(<Cotizaciones />);
    fireEvent.click(screen.getByRole("button", { name: "Aceptada" }));
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(
      "No se aceptó la cotización",
      expect.objectContaining({ description: expect.stringContaining("Asigná lotes") }),
    );
  });

  it("permite aceptar cuando la asignación completa tiene stock", () => {
    render(<Cotizaciones />);
    fireEvent.click(screen.getByRole("button", { name: "Aceptada" }));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "aceptarCotizacion",
      id: mocks.state.cotizaciones[0]!.id,
    });
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
