// Seguridad del endpoint de firma: sin red ni transacciones reales.
// Las cuentas "registradas" se reemplazan por claves generadas al vuelo y las
// funciones que firman en Testnet se sustituyen por mocks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIP: vi.fn<(opts?: { xForwardedFor?: boolean }) => string | undefined>(),
  crearAcuerdo: vi.fn(),
  ejecutarEtapa: vi.fn(),
}));

const cuentas = await vi.hoisted(async () => {
  // Generadas en el test: nunca son cuentas reales del despliegue.
  const { Keypair } = await import("@stellar/stellar-sdk");
  return { buyer: Keypair.random(), seller: Keypair.random(), arbiter: Keypair.random() };
});

vi.mock("@tanstack/react-start/server", () => ({ getRequestIP: mocks.getRequestIP }));

vi.mock("@/lib/stellar/config", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stellar/config")>();
  return {
    ...real,
    STELLAR: {
      ...real.STELLAR,
      cuentas: {
        ...real.STELLAR.cuentas,
        buyer: cuentas.buyer.publicKey(),
        seller: cuentas.seller.publicKey(),
        arbiter: cuentas.arbiter.publicKey(),
      },
    },
  };
});

vi.mock("@/lib/stellar/stellar.server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stellar/stellar.server")>();
  return { ...real, crearAcuerdo: mocks.crearAcuerdo, ejecutarEtapa: mocks.ejecutarEtapa };
});

import { Route } from "@/routes/api/public/stellar/acuerdos";

type Handler = (ctx: { request: Request }) => Promise<Response>;
const handlers = (Route.options as unknown as { server: { handlers: { GET: Handler; POST: Handler } } })
  .server.handlers;

const URL_API = "http://localhost:8080/api/public/stellar/acuerdos";
const VARS = [
  "STELLAR_DEMO_SIGNING",
  "STELLAR_DEMO_BUYER_SECRET",
  "STELLAR_DEMO_SELLER_SECRET",
  "STELLAR_DEMO_ARBITER_SECRET",
];
const previas = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));

function post(headers: Record<string, string> = {}) {
  return handlers.POST({
    request: new Request(URL_API, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ etapa: "accept", id: 0 }),
    }),
  });
}

beforeEach(() => {
  process.env["STELLAR_DEMO_SIGNING"] = "1";
  process.env["STELLAR_DEMO_BUYER_SECRET"] = cuentas.buyer.secret();
  process.env["STELLAR_DEMO_SELLER_SECRET"] = cuentas.seller.secret();
  process.env["STELLAR_DEMO_ARBITER_SECRET"] = cuentas.arbiter.secret();
  mocks.ejecutarEtapa.mockResolvedValue({ hash: "b".repeat(64) });
});

afterEach(() => {
  for (const v of VARS) {
    if (previas[v] === undefined) delete process.env[v];
    else process.env[v] = previas[v];
  }
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("endpoint de firma Stellar", () => {
  it("rechaza un Host falsificado desde la red local (sin firmar)", async () => {
    mocks.getRequestIP.mockReturnValue("192.168.100.50");
    const r = await post({ host: "localhost:8080" });
    expect(r.status).toBe(503);
    expect(mocks.ejecutarEtapa).not.toHaveBeenCalled();
  });

  it("ignora X-Forwarded-For: solo cuenta la IP del socket", async () => {
    mocks.getRequestIP.mockReturnValue("10.0.0.7");
    const r = await post({ "x-forwarded-for": "127.0.0.1", host: "127.0.0.1:8080" });
    expect(r.status).toBe(503);
    expect(mocks.getRequestIP).toHaveBeenCalledWith();
    expect(mocks.ejecutarEtapa).not.toHaveBeenCalled();
  });

  it("rechaza por defecto si no se puede determinar la IP del cliente", async () => {
    mocks.getRequestIP.mockReturnValue(undefined);
    expect((await post()).status).toBe(503);
    mocks.getRequestIP.mockImplementation(() => {
      throw new Error("sin evento");
    });
    expect((await post()).status).toBe(503);
    expect(mocks.ejecutarEtapa).not.toHaveBeenCalled();
  });

  it("rechaza en producción aunque la IP sea loopback y las claves estén cargadas", async () => {
    mocks.getRequestIP.mockReturnValue("127.0.0.1");
    vi.stubEnv("NODE_ENV", "production");
    expect((await post()).status).toBe(503);
    expect(mocks.ejecutarEtapa).not.toHaveBeenCalled();
  });

  it("GET ?info=1 informa la firma deshabilitada ante un Host falsificado", async () => {
    mocks.getRequestIP.mockReturnValue("192.168.100.50");
    const r = await handlers.GET({
      request: new Request(`${URL_API}?info=1`, { headers: { host: "localhost:8080" } }),
    });
    expect(await r.json()).toMatchObject({ ok: true, firmaHabilitada: false });
  });

  it("la demo local legítima (loopback) sigue firmando, con la red simulada", async () => {
    mocks.getRequestIP.mockReturnValue("127.0.0.1");
    const r = await post();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, id: 0, hash: "b".repeat(64) });
    expect(mocks.ejecutarEtapa).toHaveBeenCalledWith("accept", 0);
  });

  it("acepta loopback IPv6", async () => {
    mocks.getRequestIP.mockReturnValue("::1");
    expect((await post()).status).toBe(200);
  });
});
