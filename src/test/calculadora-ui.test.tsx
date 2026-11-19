import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "@/lib/store";
import { initialState } from "@/lib/store";
import { ORGANIZACIONES_DEMO } from "@/data/organizaciones";

const mocks = vi.hoisted(() => ({
  state: undefined as unknown as AppState,
  dispatch: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/store", async (original) => ({
  ...(await original<typeof import("@/lib/store")>()),
  useAppStore: () => ({ state: mocks.state, dispatch: mocks.dispatch, hidratado: true }),
  useOrganizacionActiva: () => ORGANIZACIONES_DEMO[1],
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));
import { Route } from "@/routes/calculadora";

beforeEach(() => {
  mocks.state = structuredClone(initialState);
  vi.clearAllMocks();
  vi.spyOn(Route, "useSearch").mockReturnValue({ lote: "LOTE-B", solicitud: "SOL-001" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const Calculadora = Route.options.component as ComponentType;

describe("calculadora: entradas → cotización", () => {
  it("preserva las selecciones de la pantalla y el precio del lote", () => {
    render(<Calculadora />);
    fireEvent.change(screen.getByLabelText("Puerto de salida"), { target: { value: "Rosario" } });
    fireEvent.change(screen.getByLabelText("País de destino"), { target: { value: "Chile" } });
    fireEvent.change(screen.getByLabelText("Puerto de destino"), {
      target: { value: "Valparaíso" },
    });
    fireEvent.change(screen.getByLabelText("Incoterm"), { target: { value: "CFR" } });
    fireEvent.change(screen.getByLabelText("Fecha estimada de embarque"), {
      target: { value: "2027-03-01" },
    });
    fireEvent.change(screen.getByLabelText("Moneda de la cotización"), {
      target: { value: "ARS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generar cotización" }));
    const action = mocks.dispatch.mock.calls[0]![0];
    expect(action.cotizacion).toMatchObject({
      puertoSalida: "Rosario",
      puertoDestino: "Valparaíso",
      paisDestino: "Chile",
      fechaEmbarque: "2027-03-01",
      moneda: "ARS",
      incoterm: "CFR",
      lugarDesignado: "Valparaíso, Chile",
      lotes: [{ loteId: "LOTE-B", tn: 40 }],
    });
    expect(action.cotizacion.costosComex[0].importe).toBe(560);
    expect(action.cotizacion.precioTn).toBe(action.cotizacion.precioTnUsd * 1050);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/cotizaciones",
      search: { ver: action.cotizacion.id },
    });
  });

  it("un lote sin precio muestra el error y no ofrece una cotización engañosa", () => {
    delete mocks.state.productos.find((p) => p.id === "LOTE-B")!.precioTnUsd;
    render(<Calculadora />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ingresá el precio del arroz");
    expect(screen.queryByRole("button", { name: "Generar cotización" })).toBeNull();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
