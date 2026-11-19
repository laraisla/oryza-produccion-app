// @vitest-environment node
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  AnchorSigner,
  buildAnchorTransaction,
  validateTechnicalAccount,
} from "@/lib/stellar/anchor/signer.server";
import { inspectEnvelope, verifyObserved } from "@/lib/stellar/anchor/verify.server";
import { sha256 } from "@/lib/stellar/anchor/digest";
import { ANCHOR_DATA_KEY, ANCHOR_NETWORK } from "@/lib/stellar/anchor/types";

const now = 1_800_000_000;
const bytes = new TextEncoder().encode("sample");
const key = Keypair.random();
const other = Keypair.random();

async function normal() {
  const digest = await sha256(bytes);
  const signer = new AnchorSigner({ publicKey: key.publicKey(), secret: key.secret() });
  const unsigned = buildAnchorTransaction({
    publicKey: key.publicKey(),
    sequence: "10",
    digest,
    now,
  });
  return { digest, signer, unsigned, signed: signer.sign(unsigned, digest, now) };
}

describe("classic Testnet anchor policy", () => {
  it("checks memo and operation independently instead of trusting any successful hash", async () => {
    const { digest } = await normal();
    const expected = { signer: key.publicKey(), digest };
    for (const mode of ["memo", "operation", "signature"] as const) {
      const tx = new TransactionBuilder(new Account(key.publicKey(), "10"), {
        fee: "100",
        networkPassphrase: ANCHOR_NETWORK,
      })
        .addMemo(Memo.hash(mode === "memo" ? Buffer.alloc(32) : Buffer.from(digest, "hex")))
        .addOperation(
          Operation.manageData({
            name: ANCHOR_DATA_KEY,
            value: mode === "operation" ? Buffer.alloc(32) : Buffer.from(digest, "hex"),
          }),
        )
        .setTimebounds(now - 5, now + 120)
        .build();
      tx.sign(mode === "signature" ? other : key);
      const verified = await verifyObserved(
        {
          hash: Buffer.from(tx.hash()).toString("hex"),
          xdr: tx.toXdr(),
          successful: true,
          ledger: 7,
          createdAt: new Date(now * 1000).toISOString(),
        },
        expected,
        ANCHOR_NETWORK,
        { kind: "document", bytes },
      );
      expect(verified.result).toBe("mismatch");
      expect(verified.checks[mode]).toBe(false);
    }
  });

  it("rejects a fee-bump envelope even when its inner transaction is an anchor", async () => {
    const { signed, digest } = await normal();
    const inner = TransactionBuilder.fromXDR(signed, ANCHOR_NETWORK) as Transaction;
    const outer = TransactionBuilder.buildFeeBumpTransaction(
      other.publicKey(),
      "100",
      inner,
      ANCHOR_NETWORK,
    );
    outer.sign(other);
    expect(() => inspectEnvelope(outer.toXdr(), { signer: key.publicKey(), digest })).toThrow();
  });
  it("builds exact binary memo and ManageData, with bounded fee and time", async () => {
    const { signed, digest } = await normal();
    const tx = inspectEnvelope(signed, { signer: key.publicKey(), digest });
    expect(tx.memo.type).toBe("hash");
    expect(Buffer.from(tx.memo.value as Uint8Array)).toHaveLength(32);
    expect(tx.sequence).toBe("11");
    expect(tx.fee).toBe("100");
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0]).toMatchObject({ type: "manageData", name: ANCHOR_DATA_KEY });
    expect(signed).not.toContain(key.secret());
  });
  it("requires the new account's matching secret and refuses legacy accounts", () => {
    expect(() => AnchorSigner.fromEnvironment({})).toThrow();
    expect(() => new AnchorSigner({ publicKey: key.publicKey(), secret: "invalid" })).toThrow();
    expect(
      () => new AnchorSigner({ publicKey: key.publicKey(), secret: other.secret() }),
    ).toThrow();
    expect(() =>
      validateTechnicalAccount("GBP57FLASGVQ5GAPHFSOU27IOPT6ONVATESTSEJKP4EGFGGKQ5GDFDXR"),
    ).toThrow();
    expect(() => validateTechnicalAccount("not-an-account")).toThrow();
  });
  it("rejects Mainnet configuration and signatures over the Mainnet passphrase", async () => {
    const { digest } = await normal();
    expect(
      () =>
        new AnchorSigner({
          publicKey: key.publicKey(),
          secret: key.secret(),
          networkPassphrase: Networks.PUBLIC,
        }),
    ).toThrow();
    expect(() =>
      buildAnchorTransaction({
        publicKey: key.publicKey(),
        sequence: "10",
        digest,
        now,
        networkPassphrase: Networks.PUBLIC,
      }),
    ).toThrow();
    const mainnet = new TransactionBuilder(new Account(key.publicKey(), "10"), {
      fee: "100",
      networkPassphrase: Networks.PUBLIC,
    })
      .addMemo(Memo.hash(Buffer.from(digest, "hex")))
      .addOperation(
        Operation.manageData({ name: ANCHOR_DATA_KEY, value: Buffer.from(digest, "hex") }),
      )
      .setTimebounds(now - 5, now + 120)
      .build();
    mainnet.sign(key);
    expect(() => inspectEnvelope(mainnet.toXdr(), { signer: key.publicKey(), digest })).toThrow();
  });
  it("refuses payments, additional operations, removal and wrong operation source", async () => {
    const { digest, signer } = await normal();
    const build = (ops: Parameters<TransactionBuilder["addOperation"]>[0][]) => {
      const b = new TransactionBuilder(new Account(key.publicKey(), "10"), {
        fee: "100",
        networkPassphrase: ANCHOR_NETWORK,
      })
        .addMemo(Memo.hash(Buffer.from(digest, "hex")))
        .setTimebounds(now - 5, now + 120);
      for (const op of ops) b.addOperation(op);
      return b.build().toXdr();
    };
    const op = Operation.manageData({ name: ANCHOR_DATA_KEY, value: Buffer.from(digest, "hex") });
    for (const ops of [
      [Operation.payment({ destination: other.publicKey(), amount: "1", asset: Asset.native() })],
      [op, op],
      [Operation.manageData({ name: ANCHOR_DATA_KEY, value: null })],
      [
        Operation.manageData({
          name: ANCHOR_DATA_KEY,
          value: Buffer.from(digest, "hex"),
          source: other.publicKey(),
        }),
      ],
      [Operation.manageData({ name: "private-business-info", value: Buffer.from(digest, "hex") })],
    ]) {
      expect(() => signer.sign(build(ops), digest, now)).toThrow();
    }
  });
  it("rejects missing/wrong memo, wrong issuer, existing signatures, expiration and excess fees", async () => {
    const { digest, signer, unsigned, signed } = await normal();
    const custom = (memo: Memo, source = key.publicKey()) =>
      new TransactionBuilder(new Account(source, "10"), {
        fee: "100",
        networkPassphrase: ANCHOR_NETWORK,
      })
        .addMemo(memo)
        .addOperation(
          Operation.manageData({ name: ANCHOR_DATA_KEY, value: Buffer.from(digest, "hex") }),
        )
        .setTimebounds(now - 5, now + 120)
        .build()
        .toXdr();
    expect(() => signer.sign(custom(Memo.text("not-a-hash")), digest, now)).toThrow();
    expect(() => signer.sign(custom(Memo.hash(Buffer.alloc(32))), digest, now)).toThrow();
    expect(() =>
      signer.sign(custom(Memo.hash(Buffer.from(digest, "hex")), other.publicKey()), digest, now),
    ).toThrow();
    expect(() => signer.sign(signed, digest, now)).toThrow();
    expect(() => signer.sign(unsigned, digest, now + 121)).toThrow();
    expect(() =>
      buildAnchorTransaction({
        publicKey: key.publicKey(),
        digest,
        sequence: "0",
        now,
        fee: 10001,
      }),
    ).toThrow();
  });
  it("independently verifies every required field and detects altered bytes", async () => {
    const { signed, digest } = await normal();
    const hash = Buffer.from(TransactionBuilder.fromXDR(signed, ANCHOR_NETWORK).hash()).toString(
      "hex",
    );
    const observed = {
      hash,
      xdr: signed,
      successful: true,
      ledger: 7,
      createdAt: new Date(now * 1000).toISOString(),
    };
    expect(
      (
        await verifyObserved(observed, { signer: key.publicKey(), digest }, ANCHOR_NETWORK, {
          kind: "document",
          bytes,
        })
      ).result,
    ).toBe("matches");
    expect(
      (
        await verifyObserved(observed, { signer: key.publicKey(), digest }, ANCHOR_NETWORK, {
          kind: "document",
          bytes: new TextEncoder().encode("altered"),
        })
      ).checks.content,
    ).toBe(false);
    expect(
      (
        await verifyObserved(
          { ...observed, hash: "f".repeat(64) },
          { signer: key.publicKey(), digest },
          ANCHOR_NETWORK,
          { kind: "document", bytes },
        )
      ).checks.hash,
    ).toBe(false);
    expect(
      (
        await verifyObserved(observed, { signer: other.publicKey(), digest }, ANCHOR_NETWORK, {
          kind: "document",
          bytes,
        })
      ).checks.issuer,
    ).toBe(false);
    expect(
      (
        await verifyObserved(observed, { signer: key.publicKey(), digest }, Networks.PUBLIC, {
          kind: "document",
          bytes,
        })
      ).checks.network,
    ).toBe(false);
    expect(
      (
        await verifyObserved(
          { ...observed, successful: false },
          { signer: key.publicKey(), digest },
          ANCHOR_NETWORK,
          { kind: "document", bytes },
        )
      ).result,
    ).toBe("mismatch");
  });
});
