// @vitest-environment node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoRequest, fixture } from "./anchor-fixtures";
import { LocalAnchorRepository } from "@/lib/stellar/anchor/repository.server";
import { ANCHOR_MAX_BYTES, AnchorError } from "@/lib/stellar/anchor/types";

const active: Awaited<ReturnType<typeof fixture>>[] = [];
async function setup(enabled = true) {
  const f = await fixture(enabled);
  active.push(f);
  return f;
}
afterEach(async () => {
  for (const f of active.splice(0)) await f.cleanup();
  vi.restoreAllMocks();
});

describe("durable local anchor service, no network", () => {
  it("keeps a maximum-size document idempotent and immutable despite Base64 expansion", async () => {
    const f = await setup();
    const input = demoRequest({
      content: { kind: "document", bytes: new Uint8Array(ANCHOR_MAX_BYTES).fill(65) },
    });
    const r = await f.service.request(input);
    expect(r.snapshot.bytesBase64.length).toBeGreaterThan(ANCHOR_MAX_BYTES);
    expect((await f.service.request(input)).id).toBe(r.id);
    expect((await f.service.request({ ...input, idempotencyKey: "large-alias" })).id).toBe(r.id);
    const prepared = await f.service.prepare(r.id, "operator");
    expect(prepared.state).toBe("prepared");
    const changed = {
      ...prepared,
      snapshot: {
        ...prepared.snapshot,
        bytesBase64: prepared.snapshot.bytesBase64.replace(/^Q/, "R"),
      },
    };
    await expect(f.repo.save(changed, prepared.revision)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await f.service.submit(r.id, "operator")).state).toBe("confirmed");
    expect((await f.service.verify(r.id, "operator")).result).toBe("matches");
    await f.repo.close();
    const reopened = await LocalAnchorRepository.open(f.directory);
    try {
      expect((await reopened.get(r.id))!.snapshot.digest).toBe(r.snapshot.digest);
    } finally {
      await reopened.close();
    }
  });
  it("recovers a dead writer only with explicit stale-lock recovery", async () => {
    const f = await setup();
    const r = await f.service.request(demoRequest());
    await f.repo.close();
    // Child writes its own PID and exits; it never reads/generates credentials or accesses network.
    execFileSync(
      process.execPath,
      [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({pid:process.pid,token:require('node:crypto').randomUUID()}))",
        join(f.directory, "writer.lock"),
      ],
      { windowsHide: true },
    );
    await expect(LocalAnchorRepository.open(f.directory)).rejects.toMatchObject({ code: "LOCKED" });
    const reopened = await LocalAnchorRepository.open(f.directory, { recoverStaleLock: true });
    try {
      expect((await reopened.get(r.id))!.snapshot.digest).toBe(r.snapshot.digest);
    } finally {
      await reopened.close();
    }
  });

  it("serializes simultaneous idempotent requests and refuses operations after closing starts", async () => {
    const f = await setup();
    const requests = await Promise.all(
      Array.from({ length: 5 }, () => f.service.request(demoRequest())),
    );
    expect(new Set(requests.map((r) => r.id)).size).toBe(1);
    const close = f.repo.close();
    await expect(f.repo.list()).rejects.toMatchObject({ code: "STORAGE" });
    await close;
  });

  it("bounds repeated submissions and never embeds business content in the envelope", async () => {
    const f = await setup();
    f.behavior.confirm = false;
    const r = await f.service.request(
      demoRequest({
        content: {
          kind: "agreement",
          conditions: { company: "PRIVATE-COMPANY-DEMO", price: "12345.67", currency: "USD" },
        },
      }),
    );
    const p = await f.service.prepare(r.id, "operator");
    const xdrBytes = Buffer.from(p.attempts[0]!.xdr, "base64").toString("latin1");
    expect(xdrBytes).not.toContain("PRIVATE-COMPANY-DEMO");
    expect(xdrBytes).not.toContain("12345.67");
    for (let i = 0; i < 7; i++) {
      await f.service.submit(r.id, "operator");
      f.behavior.time += 16;
    }
    expect(f.transport.submit).toHaveBeenCalledTimes(5);
  });
  it("creates an immutable snapshot, idempotency aliases and a recoverable signed attempt", async () => {
    const f = await setup();
    const request = demoRequest();
    const r = await f.service.request(request);
    if (request.content.kind === "document") request.content.bytes.fill(0);
    const same = await f.service.request(demoRequest());
    expect(same.id).toBe(r.id);
    const alias = await f.service.request(demoRequest({ idempotencyKey: "alias" }));
    expect(alias.id).toBe(r.id);
    const prepared = await f.service.prepare(r.id, "operator");
    expect(prepared.state).toBe("prepared");
    expect(prepared.attempts[0]!.submissions).toBe(0);
    expect(f.transport.submit).not.toHaveBeenCalled();
    const disk = await readFile(join(f.directory, "evidence.json"), "utf8");
    expect(disk).toContain(prepared.attempts[0]!.hash);
    expect(disk).not.toContain(f.key.secret());
    const obtained = await f.repo.get(r.id);
    obtained!.snapshot.digest = "f".repeat(64);
    expect((await f.repo.get(r.id))!.snapshot.digest).toBe(r.snapshot.digest);
    await expect(
      f.repo.save(
        { ...prepared, snapshot: { ...prepared.snapshot, digest: "f".repeat(64) } },
        prepared.revision,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("conflicts on changed content or identity using a previous key/version", async () => {
    const f = await setup();
    await f.service.request(demoRequest());
    await expect(
      f.service.request(
        demoRequest({
          content: { kind: "document", bytes: new TextEncoder().encode("different") },
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(f.service.request(demoRequest({ entityId: "other" }))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      f.service.request(
        demoRequest({
          idempotencyKey: "new-key",
          content: { kind: "document", bytes: new TextEncoder().encode("different") },
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const v2 = await f.service.request(demoRequest({ version: "2", idempotencyKey: "v2" }));
    expect(v2.identity.version).toBe("2");
  });
  it("sending is disabled without opt-in and authorization fails closed", async () => {
    const f = await setup(false);
    const r = await f.service.request(demoRequest());
    await f.service.prepare(r.id, "operator");
    await expect(f.service.submit(r.id, "operator")).rejects.toMatchObject({ code: "DISABLED" });
    expect(f.transport.submit).not.toHaveBeenCalled();
    await expect(f.service.get(r.id, "stranger")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(f.service.request(demoRequest({ actorId: "stranger" }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const denied = f.makeService(f.repo, { authorize: async () => false });
    await expect(denied.prepare(r.id, "operator")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("persists the attempt BEFORE submission, confirms and avoids resending", async () => {
    const f = await setup();
    const r = await f.service.request(demoRequest());
    const prepared = await f.service.prepare(r.id, "operator");
    const original = f.transport.submit.getMockImplementation()!;
    f.transport.submit.mockImplementation(async (xdr) => {
      const disk = JSON.parse(await readFile(join(f.directory, "evidence.json"), "utf8"));
      expect(disk.records[0].state).toBe("submitted");
      expect(disk.records[0].attempts[0].xdr).toBe(xdr);
      await original(xdr);
    });
    const result = await f.service.submit(r.id, "operator");
    expect(result.state).toBe("confirmed");
    expect(result.attempts[0]!.hash).toBe(prepared.attempts[0]!.hash);
    expect((await f.service.verify(r.id, "operator")).result).toBe("matches");
    await f.service.submit(r.id, "operator");
    expect(f.transport.submit).toHaveBeenCalledTimes(1);
  });
  it("reconciles a timeout AFTER network acceptance without duplicating", async () => {
    const f = await setup();
    f.behavior.failAfter = true;
    const r = await f.service.request(demoRequest());
    await f.service.prepare(r.id, "operator");
    expect((await f.service.submit(r.id, "operator")).state).toBe("confirmed");
    await f.service.submit(r.id, "operator");
    expect(f.transport.submit).toHaveBeenCalledTimes(1);
  });
  it("recovers unknown results after restart and retries the EXACT same envelope with backoff", async () => {
    const f = await setup();
    f.behavior.failBefore = true;
    const r = await f.service.request(demoRequest());
    const prepared = await f.service.prepare(r.id, "operator");
    expect((await f.service.submit(r.id, "operator")).state).toBe("unknown");
    await f.repo.close();
    const reopened = await LocalAnchorRepository.open(f.directory);
    try {
      const service = f.makeService(reopened);
      f.behavior.failBefore = false;
      await service.submit(r.id, "operator");
      expect(f.transport.submit).toHaveBeenCalledTimes(1);
      f.behavior.time += 2;
      expect((await service.submit(r.id, "operator")).state).toBe("confirmed");
      expect(f.transport.submit.mock.calls[1]![0]).toBe(prepared.attempts[0]!.xdr);
    } finally {
      await reopened.close();
    }
  });
  it("recovers prepared and submitted states, independent of browser state", async () => {
    const f = await setup();
    f.behavior.confirm = false;
    const r = await f.service.request(demoRequest());
    const prepared = await f.service.prepare(r.id, "operator");
    await f.repo.close();
    let reopened = await LocalAnchorRepository.open(f.directory);
    try {
      expect((await f.makeService(reopened).get(r.id, "operator")).state).toBe("prepared");
      expect((await f.makeService(reopened).submit(r.id, "operator")).state).toBe("submitted");
    } finally {
      await reopened.close();
    }
    reopened = await LocalAnchorRepository.open(f.directory);
    try {
      expect((await f.makeService(reopened).get(r.id, "operator")).attempts[0]!.hash).toBe(
        prepared.attempts[0]!.hash,
      );
    } finally {
      await reopened.close();
    }
  });
  it("blocks another account sequence while a result is unresolved; expiry never builds a replacement", async () => {
    const f = await setup();
    f.behavior.confirm = false;
    const r = await f.service.request(demoRequest());
    const prepared = await f.service.prepare(r.id, "operator");
    const next = await f.service.request(demoRequest({ entityId: "next", idempotencyKey: "next" }));
    await expect(f.service.prepare(next.id, "operator")).rejects.toMatchObject({ code: "PENDING" });
    f.behavior.time = prepared.attempts[0]!.maxTime + 1;
    const expired = await f.service.submit(r.id, "operator");
    expect(expired.state).toBe("expired");
    expect(f.transport.submit).not.toHaveBeenCalled();
    expect((await f.service.prepare(r.id, "operator")).attempts[0]!.hash).toBe(
      prepared.attempts[0]!.hash,
    );
    await expect(f.service.prepare(next.id, "operator")).rejects.toMatchObject({ code: "PENDING" });
  });
  it("records confirmed failures without claiming the digest was registered", async () => {
    const f = await setup();
    const r = await f.service.request(demoRequest());
    const p = await f.service.prepare(r.id, "operator");
    f.chain.set(p.attempts[0]!.hash, {
      hash: p.attempts[0]!.hash,
      xdr: p.attempts[0]!.xdr,
      successful: false,
      ledger: 8,
      createdAt: new Date(f.behavior.time * 1000).toISOString(),
    });
    expect((await f.service.reconcile(r.id, "operator")).state).toBe("rejected");
    expect((await f.service.verify(r.id, "operator")).result).toBe("mismatch");
    await f.service.submit(r.id, "operator");
    expect(f.transport.submit).not.toHaveBeenCalled();
  });
  it("rejects wrong network and successful unrelated transactions, and distinguishes outages", async () => {
    const f = await setup();
    const r = await f.service.request(demoRequest());
    const p = await f.service.prepare(r.id, "operator");
    f.transport.network.mockResolvedValue("Public Global Stellar Network ; September 2015");
    await expect(f.service.submit(r.id, "operator")).rejects.toMatchObject({ code: "NETWORK" });
    expect(f.transport.submit).not.toHaveBeenCalled();
    f.transport.network.mockRejectedValue(new Error("offline"));
    expect((await f.service.verify(r.id, "operator")).result).toBe("unverifiable");
    f.transport.network.mockResolvedValue("Test SDF Network ; September 2015");
    f.transport.lookup.mockResolvedValue({
      hash: "f".repeat(64),
      xdr: p.attempts[0]!.xdr,
      successful: true,
      ledger: 1,
      createdAt: new Date(f.behavior.time * 1000).toISOString(),
    });
    await expect(f.service.reconcile(r.id, "operator")).rejects.toMatchObject({ code: "POLICY" });
    expect((await f.service.verify(r.id, "operator")).result).toBe("mismatch");
  });
  it("verifies agreement snapshots and detects a changed commercial condition", async () => {
    const f = await setup();
    const conditions = { price: "520.00", currency: "USD", acceptedVersion: "1" };
    const r = await f.service.request(demoRequest({ content: { kind: "agreement", conditions } }));
    conditions.price = "999.00";
    await f.service.prepare(r.id, "operator");
    await f.service.submit(r.id, "operator");
    expect((await f.service.verify(r.id, "operator")).result).toBe("matches");
    expect(
      (await f.service.verify(r.id, "operator", { kind: "agreement", conditions })).checks.content,
    ).toBe(false);
  });
  it("does not transmit when durable save fails; remote error bodies never enter the journal", async () => {
    const f = await setup();
    const r = await f.service.request(demoRequest());
    await f.service.prepare(r.id, "operator");
    const save = vi
      .spyOn(f.repo, "save")
      .mockRejectedValueOnce(new AnchorError("STORAGE", "Simulated storage failure"));
    await expect(f.service.submit(r.id, "operator")).rejects.toMatchObject({ code: "STORAGE" });
    expect(f.transport.submit).not.toHaveBeenCalled();
    save.mockRestore();
    f.transport.submit.mockRejectedValue(new Error(`Sensitive body ${f.key.secret()}`));
    expect((await f.service.submit(r.id, "operator")).state).toBe("unknown");
    expect(await readFile(join(f.directory, "evidence.json"), "utf8")).not.toContain(
      f.key.secret(),
    );
  });
  it("locks out another process/instance, enforces CAS and refuses a corrupt journal", async () => {
    const f = await setup();
    const r = await f.service.request(demoRequest());
    await expect(LocalAnchorRepository.open(f.directory)).rejects.toMatchObject({ code: "LOCKED" });
    await expect(
      LocalAnchorRepository.open(f.directory, { recoverStaleLock: true }),
    ).rejects.toMatchObject({ code: "LOCKED" });
    await expect(f.repo.save(r, r.revision + 1)).rejects.toMatchObject({ code: "CONFLICT" });
    await f.repo.close();
    await writeFile(join(f.directory, "evidence.json"), "not JSON");
    await expect(LocalAnchorRepository.open(f.directory)).rejects.toMatchObject({
      code: "CORRUPT",
    });
    expect(await readFile(join(f.directory, "evidence.json"), "utf8")).toBe("not JSON");
  });
});
