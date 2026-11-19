// @vitest-environment node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Account,
  Keypair,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  runProcess,
  signerEnvironment,
  StellarCliSigner,
  type ProcessResult,
  type ProcessRunner,
} from "@/lib/stellar/anchor/cli-signer.server";
import { LocalAnchorRepository } from "@/lib/stellar/anchor/repository.server";
import { buildAnchorTransaction } from "@/lib/stellar/anchor/signer.server";
import { inspectEnvelope } from "@/lib/stellar/anchor/verify.server";
import { sha256 } from "@/lib/stellar/anchor/digest";
import { ANCHOR_DATA_KEY, ANCHOR_NETWORK, AnchorError } from "@/lib/stellar/anchor/types";
import { demoRequest, fixture } from "./anchor-fixtures";

// Ephemeral keys only: never funded, saved, printed or sent to any network.
const key = Keypair.random();
const other = Keypair.random();
const now = 1_800_000_000;
const IDENTITY = "agroglobal-anchor-test-identity";

interface Call {
  executable: string;
  args: readonly string[];
  input: string;
  env: NodeJS.ProcessEnv;
}
const ok = (stdout: string): ProcessResult => ({
  code: 0,
  stdout,
  timedOut: false,
  overflow: false,
  spawnError: false,
});

/** Simulates `stellar tx sign` / `stellar keys public-key` holding `signingKey` in its store. */
function fakeCli(
  signingKey: Keypair = key,
  respond?: (unsigned: Transaction) => string | ProcessResult,
) {
  const calls: Call[] = [];
  const run: ProcessRunner = async (executable, args, input, options) => {
    calls.push({ executable, args, input, env: options.env });
    if (args[0] === "keys") return ok(`${signingKey.publicKey()}\n`);
    const tx = TransactionBuilder.fromXDR(input, ANCHOR_NETWORK) as Transaction;
    if (respond) {
      const r = respond(tx);
      return typeof r === "string" ? ok(r) : r;
    }
    tx.sign(signingKey);
    return ok(`${tx.toXDR()}\n`);
  };
  return { run, calls };
}

async function unsignedFor(sequence = "10") {
  const digest = await sha256(new TextEncoder().encode("external signer sample"));
  return {
    digest,
    unsigned: buildAnchorTransaction({ publicKey: key.publicKey(), sequence, digest, now }),
  };
}

/** A policy-valid anchor transaction with selectable deviations, signed by `by`. */
function variant(
  digest: string,
  patch: { sequence?: string; fee?: string; min?: number; max?: number; memo?: string } = {},
  by: Keypair = key,
) {
  const tx = new TransactionBuilder(new Account(key.publicKey(), patch.sequence ?? "10"), {
    networkPassphrase: ANCHOR_NETWORK,
    fee: patch.fee ?? "100",
  })
    .addMemo(Memo.hash(Buffer.from(patch.memo ?? digest, "hex")))
    .addOperation(
      Operation.manageData({ name: ANCHOR_DATA_KEY, value: Buffer.from(digest, "hex") }),
    )
    .setTimebounds(patch.min ?? now - 5, patch.max ?? now + 120)
    .build();
  tx.sign(by);
  return tx.toXDR();
}

const signerWith = (run: ProcessRunner, extra: Partial<{ env: NodeJS.ProcessEnv }> = {}) =>
  new StellarCliSigner({ publicKey: key.publicKey(), identity: IDENTITY, run, ...extra });

describe("Stellar CLI external signer (secure store, no secret in this process)", () => {
  it("sends only the unsigned XDR on stdin with fixed Testnet argv and returns a verified envelope", async () => {
    const { digest, unsigned } = await unsignedFor();
    const cli = fakeCli();
    const signed = await signerWith(cli.run).sign(unsigned, digest, now);
    expect(cli.calls).toHaveLength(1);
    const [call] = cli.calls;
    expect(call!.executable).toBe("stellar");
    expect(call!.args).toEqual([
      "tx",
      "sign",
      "--sign-with-key",
      IDENTITY,
      "--network-passphrase",
      "Test SDF Network ; September 2015",
      "--quiet",
    ]);
    expect(call!.input).toBe(unsigned);
    const tx = inspectEnvelope(signed, { signer: key.publicKey(), digest });
    const before = inspectEnvelope(unsigned, { signer: key.publicKey(), digest }, false);
    expect(Buffer.from(tx.hash()).equals(Buffer.from(before.hash()))).toBe(true);
    expect(tx.signatures).toHaveLength(1);
    expect(tx.fee).toBe("100");
    expect(tx.sequence).toBe("11");
    expect(Number(tx.timeBounds!.maxTime) - Number(tx.timeBounds!.minTime)).toBe(125);
  });

  it("checks that the CLI identity resolves to the configured account (public key only)", async () => {
    const cli = fakeCli();
    await signerWith(cli.run).checkIdentity();
    expect(cli.calls[0]!.args).toEqual(["keys", "public-key", IDENTITY, "--quiet"]);
    expect(cli.calls[0]!.input).toBe("");
    await expect(signerWith(fakeCli(other).run).checkIdentity()).rejects.toMatchObject({
      code: "CONFIG",
    });
  });

  it("rejects any envelope the CLI returns that differs from the built transaction", async () => {
    const { digest, unsigned } = await unsignedFor();
    const cases: Array<(tx: Transaction) => string> = [
      // Policy-valid but different: only the hash comparison can catch these.
      () => variant(digest, { sequence: "11" }),
      () => variant(digest, { fee: "200" }),
      () => variant(digest, { max: now + 119 }),
      () => variant(digest, { min: now - 4 }),
      // Policy violations.
      () => variant(digest, { memo: "00".repeat(32) }),
      () => variant(digest, {}, other),
      () => variant(digest, { fee: "100000" }),
      (tx) => tx.toXDR(), // returned unsigned
      (tx) => {
        tx.sign(key);
        tx.sign(other);
        return tx.toXDR();
      },
      (tx) => {
        const extra = new TransactionBuilder(new Account(key.publicKey(), "10"), {
          networkPassphrase: ANCHOR_NETWORK,
          fee: "100",
        })
          .addMemo(tx.memo)
          .addOperation(
            Operation.manageData({ name: ANCHOR_DATA_KEY, value: Buffer.from(digest, "hex") }),
          )
          .addOperation(Operation.manageData({ name: "extra", value: "x" }))
          .setTimebounds(now - 5, now + 120)
          .build();
        extra.sign(key);
        return extra.toXDR();
      },
      () => "not base64 !",
      () => "",
      () => "AAAA",
    ];
    for (const respond of cases) {
      const error = await signerWith(fakeCli(key, respond).run)
        .sign(unsigned, digest, now)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AnchorError);
      expect(["POLICY", "SIGNER"]).toContain((error as AnchorError).code);
    }
  });

  it("maps CLI failures to sanitized errors without surfacing CLI output", async () => {
    const { digest, unsigned } = await unsignedFor();
    const leaky = "SBLEAKYSECRETVALUEMUSTNEVERAPPEARINANYERRORMESSAGEXXXXX";
    const failures: Array<[ProcessResult, string]> = [
      [{ code: 1, stdout: leaky, timedOut: false, overflow: false, spawnError: false }, "SIGNER"],
      [{ code: null, stdout: "", timedOut: false, overflow: false, spawnError: true }, "SIGNER"],
      [
        { code: null, stdout: leaky, timedOut: true, overflow: false, spawnError: false },
        "TIMEOUT",
      ],
      [{ code: null, stdout: "", timedOut: false, overflow: true, spawnError: false }, "SIGNER"],
    ];
    for (const [result, code] of failures) {
      const error = (await signerWith(fakeCli(key, () => result).run)
        .sign(unsigned, digest, now)
        .catch((e: unknown) => e)) as AnchorError;
      expect(error).toBeInstanceOf(AnchorError);
      expect(error.code).toBe(code);
      expect(error.message).not.toContain(leaky);
      expect(JSON.stringify(error)).not.toContain(leaky);
    }
  });

  it("refuses to sign outside the time window without invoking the CLI", async () => {
    const { digest, unsigned } = await unsignedFor();
    const cli = fakeCli();
    await expect(signerWith(cli.run).sign(unsigned, digest, now + 121)).rejects.toMatchObject({
      code: "POLICY",
    });
    await expect(signerWith(cli.run).sign(unsigned, "ab".repeat(32), now)).rejects.toMatchObject({
      code: "POLICY",
    });
    expect(cli.calls).toHaveLength(0);
  });

  it("accepts only a named identity, never a raw secret or seed phrase, and only the stellar binary", () => {
    const { run } = fakeCli();
    for (const identity of [
      key.secret(),
      "kite urban seed phrase words",
      "--sign-with-lab",
      "-x",
      "",
      "a".repeat(65),
      "name;rm",
    ])
      expect(() => new StellarCliSigner({ publicKey: key.publicKey(), identity, run })).toThrow(
        AnchorError,
      );
    for (const executable of ["stellar.exe", "./stellar", "C:/Windows/System32/cmd.exe", "/bin/sh"])
      expect(
        () =>
          new StellarCliSigner({ publicKey: key.publicKey(), identity: IDENTITY, executable, run }),
      ).toThrow(AnchorError);
    expect(
      () =>
        new StellarCliSigner({
          publicKey: key.publicKey(),
          identity: IDENTITY,
          executable: "C:/Program Files (x86)/Stellar CLI/stellar.exe",
          run,
        }),
    ).not.toThrow();
    expect(
      () =>
        new StellarCliSigner({
          publicKey: "GA5QCSNSWBZBWVRYVMCTTDKIOWIRAEJG237FWFID2P273AJLMYGXLTIN",
          identity: IDENTITY,
          run,
        }),
    ).toThrow(AnchorError);
  });

  it("requires explicit configuration and refuses an environment secret in external mode", () => {
    const { run } = fakeCli();
    const base = {
      STELLAR_ANCHOR_PUBLIC_KEY: key.publicKey(),
      STELLAR_ANCHOR_CLI_IDENTITY: IDENTITY,
    };
    expect(StellarCliSigner.fromEnvironment(base, run).identity).toBe(IDENTITY);
    expect(() =>
      StellarCliSigner.fromEnvironment({ ...base, STELLAR_ANCHOR_CLI_IDENTITY: "" }, run),
    ).toThrow(AnchorError);
    expect(() =>
      StellarCliSigner.fromEnvironment({ ...base, STELLAR_ANCHOR_SECRET: key.secret() }, run),
    ).toThrow(AnchorError);
  });

  it("strips every Stellar/anchor variable from the child environment", async () => {
    const { digest, unsigned } = await unsignedFor();
    const cli = fakeCli();
    const parent = {
      PATH: "/usr/bin",
      STELLAR_ANCHOR_SECRET: key.secret(),
      STELLAR_SIGN_WITH_KEY: key.secret(),
      STELLAR_NETWORK: "mainnet",
      STELLAR_NETWORK_PASSPHRASE: "Public Global Stellar Network ; September 2015",
      STELLAR_RPC_URL: "https://example.invalid",
      stellar_account: "x",
      RUST_LOG: "trace",
    };
    await signerWith(cli.run, { env: parent }).sign(unsigned, digest, now);
    expect(cli.calls[0]!.env).toEqual({ PATH: "/usr/bin" });
    expect(signerEnvironment(parent)).toEqual({ PATH: "/usr/bin" });
    const everything = JSON.stringify(cli.calls) + JSON.stringify(signerWith(cli.run));
    expect(everything).not.toContain(key.secret());
  });
});

describe("AnchorService with the external signer", () => {
  const active: Awaited<ReturnType<typeof fixture>>[] = [];
  afterEach(async () => {
    for (const f of active.splice(0)) await f.cleanup();
  });

  it("prepares durably, stays idempotent, survives reopen and never stores a secret", async () => {
    const f = await fixture(false);
    active.push(f);
    const cli = fakeCli(f.key);
    const signer = new StellarCliSigner({
      publicKey: f.key.publicKey(),
      identity: IDENTITY,
      run: cli.run,
    });
    const service = f.makeService(f.repo, { signer });
    const r = await service.request(demoRequest());
    const prepared = await service.prepare(r.id, "operator");
    expect(prepared.state).toBe("prepared");
    const attempt = prepared.attempts[0]!;
    inspectEnvelope(attempt.xdr, { signer: f.key.publicKey(), digest: r.snapshot.digest });
    expect(attempt.sequence).toBe("11");
    // Idempotent: a second prepare returns the stored envelope without signing again.
    const again = await service.prepare(r.id, "operator");
    expect(again.attempts[0]!.hash).toBe(attempt.hash);
    expect(cli.calls.filter((c) => c.args[0] === "tx")).toHaveLength(1);
    // Reopen: the evidence and its envelope remain; reading needs no signer at all.
    await f.repo.close();
    const reopened = await LocalAnchorRepository.open(f.directory);
    try {
      const fresh = f.makeService(reopened);
      const loaded = await fresh.get(r.id, "operator");
      expect(loaded.attempts[0]!.hash).toBe(attempt.hash);
      const journal = await readFile(join(f.directory, "evidence.json"), "utf8");
      expect(journal).not.toContain(f.key.secret());
      expect(JSON.stringify(cli.calls)).not.toContain(f.key.secret());
    } finally {
      await reopened.close();
    }
  });

  it("rejects a signer that returns another valid transaction and stores nothing", async () => {
    const f = await fixture(false);
    active.push(f);
    const r = await f.service.request(demoRequest());
    // Signs a policy-valid transaction with a different sequence instead of the one given.
    const tampering = {
      publicKey: f.key.publicKey(),
      sign: async (_unsigned: string, digest: string, at?: number) => {
        const tx = buildAnchorTransaction({
          publicKey: f.key.publicKey(),
          sequence: "41",
          digest,
          now: at ?? now,
        });
        const t = TransactionBuilder.fromXDR(tx, ANCHOR_NETWORK) as Transaction;
        t.sign(f.key);
        return t.toXDR();
      },
    };
    const service = f.makeService(f.repo, { signer: tampering });
    await expect(service.prepare(r.id, "operator")).rejects.toMatchObject({ code: "POLICY" });
    const stored = await service.get(r.id, "operator");
    expect(stored.state).toBe("pending");
    expect(stored.attempts).toHaveLength(0);
  });

  it("rejects a signature that completes after the envelope expired", async () => {
    const f = await fixture(false);
    active.push(f);
    const r = await f.service.request(demoRequest());
    const slow = new StellarCliSigner({
      publicKey: f.key.publicKey(),
      identity: IDENTITY,
      run: fakeCli(f.key, (tx) => {
        f.behavior.time += 200; // the CLI "took" longer than the 120 s window
        tx.sign(f.key);
        return tx.toXDR();
      }).run,
    });
    const service = f.makeService(f.repo, { signer: slow });
    await expect(service.prepare(r.id, "operator")).rejects.toMatchObject({ code: "POLICY" });
    expect((await service.get(r.id, "operator")).attempts).toHaveLength(0);
  });
});

describe("runProcess (real child process, no shell)", () => {
  const node = process.execPath;
  const opts = { env: { PATH: process.env["PATH"] ?? "" }, timeoutMs: 10_000, maxOutput: 1_000 };

  it("passes stdin, returns stdout and drops stderr", async () => {
    const r = await runProcess(
      node,
      ["-e", "process.stdin.pipe(process.stdout); process.stderr.write('private-stderr')"],
      "unsigned-xdr",
      opts,
    );
    expect(r).toEqual({
      code: 0,
      stdout: "unsigned-xdr",
      timedOut: false,
      overflow: false,
      spawnError: false,
    });
    expect(JSON.stringify(r)).not.toContain("private-stderr");
  });

  it("reports exit codes, timeouts, oversized output and missing executables", async () => {
    expect((await runProcess(node, ["-e", "process.exit(3)"], "", opts)).code).toBe(3);
    const slow = await runProcess(node, ["-e", "setTimeout(() => {}, 30000)"], "", {
      ...opts,
      timeoutMs: 200,
    });
    expect(slow.timedOut).toBe(true);
    const big = await runProcess(node, ["-e", "process.stdout.write('x'.repeat(5000))"], "", opts);
    expect(big.overflow).toBe(true);
    expect(big.stdout).toBe("");
    const missing = await runProcess(
      join(process.cwd(), "does-not-exist-stellar.exe"),
      [],
      "",
      opts,
    );
    expect(missing.spawnError).toBe(true);
  });
});
