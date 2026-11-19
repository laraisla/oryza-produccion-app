// @vitest-environment node
// Local read-only query: no network (simulated transport), ephemeral keys only.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  accesoLocal,
  configConsulta,
  detalleEvidencia,
  listarEvidencias,
  verificarDocumento,
} from "@/lib/stellar/anchor/consulta.server";
import { ReadOnlyAnchorRepository } from "@/lib/stellar/anchor/repository.server";
import { demoRequest, fixture } from "./anchor-fixtures";

const active: Awaited<ReturnType<typeof fixture>>[] = [];
afterEach(async () => {
  for (const f of active.splice(0)) await f.cleanup();
});

const base = {
  dev: true,
  ip: "127.0.0.1",
  url: "http://localhost:8080/api/public/stellar/anclaje",
  host: "localhost:8080",
  origin: null,
  secFetchSite: "same-origin",
  conCuerpo: false,
};

describe("local-only access", () => {
  it("allows the dev server from loopback with a local Host", () => {
    expect(accesoLocal(base)).toBe(true);
    expect(accesoLocal({ ...base, ip: "::1" })).toBe(true);
    expect(accesoLocal({ ...base, ip: "::ffff:127.0.0.1" })).toBe(true);
    expect(accesoLocal({ ...base, secFetchSite: null })).toBe(true);
    expect(
      accesoLocal({
        ...base,
        url: "http://127.0.0.1:8080/x",
        host: "127.0.0.1:8080",
        origin: "http://127.0.0.1:8080",
        conCuerpo: true,
      }),
    ).toBe(true);
  });

  it("denies builds, remote sockets, rebinding hosts and cross-site requests", () => {
    expect(accesoLocal({ ...base, dev: false })).toBe(false);
    for (const ip of [undefined, "", "192.168.1.5", "10.0.0.2", "8.8.8.8", "localhost"])
      expect(accesoLocal({ ...base, ip })).toBe(false);
    // DNS rebinding: socket is loopback but the browser addressed another name.
    expect(
      accesoLocal({ ...base, url: "http://evil.example:8080/x", host: "evil.example:8080" }),
    ).toBe(false);
    expect(accesoLocal({ ...base, host: null })).toBe(false);
    expect(accesoLocal({ ...base, host: "localhost:9999" })).toBe(false);
    expect(accesoLocal({ ...base, origin: "https://evil.example" })).toBe(false);
    expect(accesoLocal({ ...base, secFetchSite: "cross-site" })).toBe(false);
    expect(accesoLocal({ ...base, secFetchSite: "same-site" })).toBe(false);
    // Requests with a body must prove same-origin.
    expect(accesoLocal({ ...base, conCuerpo: true })).toBe(false);
    expect(
      accesoLocal({
        ...base,
        conCuerpo: true,
        origin: "http://localhost:8080",
        secFetchSite: null,
      }),
    ).toBe(false);
    expect(
      accesoLocal({
        ...base,
        conCuerpo: true,
        origin: "http://localhost:8080",
        secFetchSite: "same-origin",
      }),
    ).toBe(true);
  });
});

describe("configuration opt-in", () => {
  const key = "GA2JCDRU5Q3TPN4VZOQ5WBFNVGXSHTL5ZXKFVNLDANOUCLK34DTD6YNX";
  const env = {
    STELLAR_ANCHOR_DEMO: "1",
    STELLAR_ANCHOR_PUBLIC_KEY: key,
    STELLAR_ANCHOR_EPOCH: "testnet-primera-prueba-20261119",
    STELLAR_ANCHOR_DIRECTORY: join(process.cwd(), "anchor-demo.local"),
  };
  it("is disabled unless explicitly enabled outside production/serverless", () => {
    expect(configConsulta(env)?.publicKey).toBe(key);
    expect(configConsulta({ ...env, STELLAR_ANCHOR_DEMO: undefined })).toBeNull();
    expect(configConsulta({ ...env, NODE_ENV: "production" })).toBeNull();
    expect(configConsulta({ ...env, VERCEL: "1" })).toBeNull();
    expect(configConsulta({ ...env, CF_PAGES: "1" })).toBeNull();
    expect(configConsulta({ ...env, STELLAR_ANCHOR_PUBLIC_KEY: "invalid" })).toBeNull();
    expect(configConsulta({ ...env, STELLAR_ANCHOR_EPOCH: "" })).toBeNull();
    expect(
      configConsulta({
        ...env,
        STELLAR_ANCHOR_PUBLIC_KEY: "GA5QCSNSWBZBWVRYVMCTTDKIOWIRAEJG237FWFID2P273AJLMYGXLTIN",
      }),
    ).toBeNull();
  });
});

async function confirmed() {
  const f = await fixture();
  active.push(f);
  const content = new TextEncoder().encode("Fictitious demo content");
  const r = await f.service.request(demoRequest({ content: { kind: "document", bytes: content } }));
  await f.service.prepare(r.id, "operator");
  await f.service.submit(r.id, "operator");
  const config = { publicKey: f.key.publicKey(), epoch: "test-epoch", directory: f.directory };
  return { f, r, config, content };
}

const digestOf = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

describe("read-only journal view", () => {
  it("reads while the CLI writer holds the lock, never writes, and rejects mutations", async () => {
    const { f, r } = await confirmed();
    const before = await readdir(f.directory);
    const journalBefore = await digestOf(join(f.directory, "evidence.json"));
    const ro = await ReadOnlyAnchorRepository.read(f.directory);
    expect((await ro.get(r.id))?.state).toBe("confirmed");
    await expect(ro.save()).rejects.toMatchObject({ code: "DISABLED" });
    await expect(ro.createOrGet()).rejects.toMatchObject({ code: "DISABLED" });
    expect(await readdir(f.directory)).toEqual(before);
    expect(await digestOf(join(f.directory, "evidence.json"))).toBe(journalBefore);
  });

  it("treats a missing directory as empty without creating it, and a corrupt journal as an error", async () => {
    const f = await fixture();
    active.push(f);
    const missing = join(f.directory, "no-existe");
    expect(await (await ReadOnlyAnchorRepository.read(missing)).list()).toEqual([]);
    await expect(readdir(missing)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(ReadOnlyAnchorRepository.read("relative/dir")).rejects.toMatchObject({
      code: "CONFIG",
    });
    await writeFile(join(f.directory, "evidence.json"), '{"format":1,"records":[],"checksum":"0"}');
    await expect(ReadOnlyAnchorRepository.read(f.directory)).rejects.toMatchObject({
      code: "CORRUPT",
    });
  });

  it("lists and details only public metadata, confirmed against the (simulated) network", async () => {
    const { f, r, config } = await confirmed();
    const journalBefore = await digestOf(join(f.directory, "evidence.json"));
    const submitsBefore = f.transport.submit.mock.calls.length;
    const lista = await listarEvidencias(config, f.transport);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: r.id,
      estadoLocal: "confirmed",
      digest: r.snapshot.digest,
    });
    const detalle = await detalleEvidencia(config, r.id, f.transport);
    expect(detalle.red.esTestnet).toBe(true);
    expect(detalle.red.transaccion).toMatchObject({ encontrada: true, exitosa: true, ledger: 7 });
    expect(detalle.verificacion?.result).toBe("matches");
    expect(Object.values(detalle.verificacion!.checks).every(Boolean)).toBe(true);
    // Nothing private leaves the server.
    const salida = JSON.stringify([lista, detalle]);
    const stored = (await (await ReadOnlyAnchorRepository.read(f.directory)).get(r.id))!;
    expect(salida).not.toContain(stored.snapshot.bytesBase64);
    expect(salida).not.toContain(stored.attempts[0]!.xdr);
    expect(salida).not.toContain(stored.idempotencyKeys[0]!);
    expect(salida).not.toContain(f.key.secret());
    // Read-only: no transmission and no journal change.
    expect(f.transport.submit.mock.calls.length).toBe(submitsBefore);
    expect(await digestOf(join(f.directory, "evidence.json"))).toBe(journalBefore);
  });

  it("verifies the original document and detects a one-byte alteration", async () => {
    const { f, r, config, content } = await confirmed();
    const ok = await verificarDocumento(config, r.id, content, f.transport);
    expect(ok.verificacion.result).toBe("matches");
    expect(ok.digestArchivo).toBe(r.snapshot.digest);
    const altered = Uint8Array.from(content);
    altered[0] = altered[0]! ^ 1;
    const bad = await verificarDocumento(config, r.id, altered, f.transport);
    expect(bad.verificacion.result).toBe("mismatch");
    expect(bad.verificacion.checks.content).toBe(false);
    expect(bad.verificacion.checks.signature).toBe(true);
    await expect(
      verificarDocumento(config, r.id, new Uint8Array(), f.transport),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT" });
  });

  it("does not reveal evidence of another account or epoch", async () => {
    const { f, r, config } = await confirmed();
    expect(await listarEvidencias({ ...config, epoch: "otra-epoca" }, f.transport)).toEqual([]);
    await expect(
      detalleEvidencia({ ...config, epoch: "otra-epoca" }, r.id, f.transport),
    ).rejects.toMatchObject({ code: "CONFIG" });
    await expect(
      detalleEvidencia(config, "00000000-0000-4000-8000-000000000000", f.transport),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
