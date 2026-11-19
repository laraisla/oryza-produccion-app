// @vitest-environment node
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { HorizonAnchorTransport, ANCHOR_HORIZON } from "@/lib/stellar/anchor/transport.server";
import { AnchorSigner, buildAnchorTransaction } from "@/lib/stellar/anchor/signer.server";
import { ANCHOR_NETWORK } from "@/lib/stellar/anchor/types";

const key = Keypair.random();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

describe("Horizon transport with mocked fetch only", () => {
  it("defaults to disabled and forbids arbitrary providers/Mainnet", async () => {
    const f = vi.fn();
    const t = new HorizonAnchorTransport(key.publicKey(), { fetch: f as typeof fetch });
    await expect(t.submit("anything")).rejects.toMatchObject({ code: "DISABLED" });
    expect(f).not.toHaveBeenCalled();
    expect(
      () =>
        new HorizonAnchorTransport(key.publicKey(), { horizonUrl: "https://horizon.stellar.org" }),
    ).toThrow();
    expect(
      () => new HorizonAnchorTransport(key.publicKey(), { horizonUrl: "http://localhost" }),
    ).toThrow();
  });
  it("checks provider network and submits only the signed XDR form to Testnet", async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/transactions")
        ? json({ hash: "a".repeat(64) })
        : json({ network_passphrase: ANCHOR_NETWORK }),
    );
    const t = new HorizonAnchorTransport(key.publicKey(), {
      fetch: f as typeof fetch,
      allowSending: true,
    });
    const digest = "a".repeat(64),
      now = Math.floor(Date.now() / 1000);
    const xdr = new AnchorSigner({ publicKey: key.publicKey(), secret: key.secret() }).sign(
      buildAnchorTransaction({ publicKey: key.publicKey(), digest, sequence: "10", now }),
      digest,
      now,
    );
    await t.submit(xdr);
    expect(f).toHaveBeenCalledTimes(2);
    const call = (f.mock.calls as unknown as [string, RequestInit][])[1]!;
    expect(call[0]).toBe(`${ANCHOR_HORIZON}/transactions`);
    expect(new URLSearchParams(call[1].body as string).get("tx")).toBe(xdr);
    expect(JSON.stringify(call)).not.toContain(key.secret());
    expect(call[1].redirect).toBe("error");
  });
  it("fails closed for wrong network, malformed account and incomplete transaction", async () => {
    let body: unknown = { network_passphrase: "Public Global Stellar Network ; September 2015" };
    const f = vi.fn(async () => json(body));
    const t = new HorizonAnchorTransport(key.publicKey(), { fetch: f });
    await expect(t.network()).rejects.toMatchObject({ code: "NETWORK" });
    body = { sequence: "10", account_id: "other" };
    await expect(t.account(key.publicKey())).rejects.toMatchObject({ code: "REMOTE" });
    body = { successful: true };
    await expect(t.lookup("a".repeat(64))).rejects.toMatchObject({ code: "REMOTE" });
    await expect(t.lookup("bad")).rejects.toMatchObject({ code: "POLICY" });
  });
  it("distinguishes a missing transaction from network failure and reads latest ledger", async () => {
    const f = vi.fn(async () => json({}, 404));
    const t = new HorizonAnchorTransport(key.publicKey(), { fetch: f });
    expect(await t.lookup("a".repeat(64))).toBeNull();
    f.mockImplementation(async () =>
      json({ _embedded: { records: [{ closed_at: "2026-11-18T00:00:00Z" }] } }),
    );
    expect(await t.latestLedgerTime()).toBe(Date.parse("2026-11-18T00:00:00Z") / 1000);
    f.mockImplementation(async () => json({}, 503));
    await expect(t.lookup("a".repeat(64))).rejects.toMatchObject({ code: "REMOTE" });
  });
  it("bounds time even when fetch ignores abort, limits bodies and sanitizes thrown errors", async () => {
    const never = vi.fn(() => new Promise<Response>(() => undefined));
    await expect(
      new HorizonAnchorTransport(key.publicKey(), { fetch: never, timeoutMs: 5 }).network(),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    const huge = vi.fn(async () => new Response("x".repeat(2 * 1024 * 1024 + 1)));
    await expect(
      new HorizonAnchorTransport(key.publicKey(), { fetch: huge }).network(),
    ).rejects.toMatchObject({ code: "REMOTE" });
    const bad = vi.fn(async () => {
      throw new Error(key.secret());
    });
    await expect(
      new HorizonAnchorTransport(key.publicKey(), { fetch: bad }).network(),
    ).rejects.not.toThrow(key.secret());
  });
});
