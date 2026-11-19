// @vitest-environment node
// HTTP boundary of the local read-only query. Query functions are mocked: no network,
// no journal. Access control and configuration checks are the real ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIP: vi.fn<() => string | undefined>(),
  listarEvidencias: vi.fn(),
  detalleEvidencia: vi.fn(),
  verificarDocumento: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({ getRequestIP: mocks.getRequestIP }));
vi.mock("@/lib/stellar/anchor/consulta.server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stellar/anchor/consulta.server")>();
  return {
    ...real,
    listarEvidencias: mocks.listarEvidencias,
    detalleEvidencia: mocks.detalleEvidencia,
    verificarDocumento: mocks.verificarDocumento,
  };
});

import { Route } from "@/routes/api/public/stellar/anclaje";
import { AnchorError } from "@/lib/stellar/anchor/types";

type Handler = (ctx: { request: Request }) => Promise<Response>;
const handlers = (
  Route.options as unknown as { server: { handlers: { GET: Handler; POST: Handler } } }
).server.handlers;

const ID = "4babc1ab-69d7-4238-81c6-c6e074386d53";
const URL_API = "http://localhost:8080/api/public/stellar/anclaje";
const VARS = {
  STELLAR_ANCHOR_DEMO: "1",
  STELLAR_ANCHOR_PUBLIC_KEY: "GA2JCDRU5Q3TPN4VZOQ5WBFNVGXSHTL5ZXKFVNLDANOUCLK34DTD6YNX",
  STELLAR_ANCHOR_EPOCH: "testnet-primera-prueba-20261119",
};
const previas = Object.fromEntries(Object.keys(VARS).map((k) => [k, process.env[k]]));

const get = (query = "", headers: Record<string, string> = {}) =>
  handlers.GET({
    request: new Request(`${URL_API}${query}`, {
      headers: { host: "localhost:8080", "sec-fetch-site": "same-origin", ...headers },
    }),
  });
const post = (headers: Record<string, string> = {}, body: BodyInit = "contenido") =>
  handlers.POST({
    request: new Request(`${URL_API}?id=${ID}`, {
      method: "POST",
      headers: {
        host: "localhost:8080",
        origin: "http://localhost:8080",
        "sec-fetch-site": "same-origin",
        "content-type": "application/octet-stream",
        ...headers,
      },
      body,
    }),
  });

beforeEach(() => {
  Object.assign(process.env, VARS);
  mocks.getRequestIP.mockReturnValue("127.0.0.1");
  mocks.listarEvidencias.mockResolvedValue([{ id: ID }]);
  mocks.detalleEvidencia.mockResolvedValue({ evidencia: { id: ID } });
  mocks.verificarDocumento.mockResolvedValue({ verificacion: { result: "matches" } });
});
afterEach(() => {
  for (const [k, v] of Object.entries(previas)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.clearAllMocks();
});

describe("GET /api/public/stellar/anclaje", () => {
  it("lists and details for a loopback local request, with no-store", async () => {
    const lista = await get();
    expect(lista.status).toBe(200);
    expect(lista.headers.get("cache-control")).toBe("no-store");
    expect(((await lista.json()) as { evidencias: unknown[] }).evidencias).toHaveLength(1);
    const detalle = await get(`?id=${ID}`);
    expect(detalle.status).toBe(200);
    expect(mocks.detalleEvidencia).toHaveBeenCalledWith(expect.anything(), ID);
  });

  it("refuses remote sockets, unknown IP, forged Host and cross-site callers before reading", async () => {
    for (const ip of ["192.168.0.10", undefined]) {
      mocks.getRequestIP.mockReturnValue(ip);
      expect((await get()).status).toBe(403);
    }
    mocks.getRequestIP.mockReturnValue("127.0.0.1");
    // X-Forwarded-For never establishes loopback; the socket IP does.
    mocks.getRequestIP.mockReturnValueOnce("203.0.113.9");
    expect((await get("", { "x-forwarded-for": "127.0.0.1" })).status).toBe(403);
    expect((await get("", { host: "evil.example" })).status).toBe(403);
    expect((await get("", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(mocks.listarEvidencias).not.toHaveBeenCalled();
  });

  it("reports missing configuration instead of showing sample data", async () => {
    delete process.env["STELLAR_ANCHOR_DEMO"];
    const r = await get();
    expect(r.status).toBe(503);
    expect(((await r.json()) as { codigo: string }).codigo).toBe("NO_CONFIGURADO");
    expect(mocks.listarEvidencias).not.toHaveBeenCalled();
  });

  it("validates ids and maps service errors without leaking internals", async () => {
    expect((await get("?id=../evidence.json")).status).toBe(400);
    mocks.detalleEvidencia.mockRejectedValueOnce(
      new AnchorError("NOT_FOUND", "Evidencia inexistente"),
    );
    expect((await get(`?id=${ID}`)).status).toBe(404);
    mocks.detalleEvidencia.mockRejectedValueOnce(new Error("socket hang up at C:\\secret\\path"));
    const r = await get(`?id=${ID}`);
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("secret");
  });
});

describe("POST /api/public/stellar/anclaje (document comparison)", () => {
  it("verifies the uploaded bytes for a same-origin local request", async () => {
    const r = await post();
    expect(r.status).toBe(200);
    const [, id, bytes] = mocks.verificarDocumento.mock.calls[0]!;
    expect(id).toBe(ID);
    expect(new TextDecoder().decode(bytes as Uint8Array)).toBe("contenido");
  });

  it("requires same origin, octet-stream and a bounded size", async () => {
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ "content-type": "text/plain" })).status).toBe(415);
    expect((await post({ "content-type": "multipart/form-data; boundary=x" })).status).toBe(415);
    expect((await post({}, new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(413);
    mocks.getRequestIP.mockReturnValue("10.1.1.1");
    expect((await post()).status).toBe(403);
    expect(mocks.verificarDocumento).not.toHaveBeenCalled();
  });

  it("exposes no signing, preparing or sending handler", () => {
    expect(Object.keys(handlers).sort()).toEqual(["GET", "POST"]);
  });
});
