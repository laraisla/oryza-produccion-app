import "@tanstack/react-start/server-only";
import { Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { contentBytes, sha256 } from "./digest";
import {
  ANCHOR_DATA_KEY,
  ANCHOR_MAX_FEE,
  ANCHOR_MAX_LIFETIME,
  ANCHOR_NETWORK,
  AnchorError,
  type AnchorContent,
  type AnchorIdentity,
  type AnchorTransport,
  type ChainTransaction,
  type Verification,
} from "./types";

export interface ExpectedAnchor {
  signer: string;
  digest: string;
}

/** Policy checked both before signing and independently when reading a confirmed XDR. */
export function inspectEnvelope(xdr: string, expected: ExpectedAnchor, signed = true): Transaction {
  try {
    if (!/^[0-9a-f]{64}$/.test(expected.digest) || xdr.length > 16_384) throw new Error();
    const tx = TransactionBuilder.fromXDR(xdr, ANCHOR_NETWORK);
    if (
      !(tx instanceof Transaction) ||
      tx.source !== expected.signer ||
      tx.networkPassphrase !== ANCHOR_NETWORK
    )
      throw new Error();
    const fee = Number(tx.fee);
    if (!Number.isSafeInteger(fee) || fee < 100 || fee > ANCHOR_MAX_FEE) throw new Error();
    const bounds = tx.timeBounds;
    if (!bounds) throw new Error();
    const min = Number(bounds.minTime),
      max = Number(bounds.maxTime);
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min <= 0 ||
      max <= min ||
      max - min > ANCHOR_MAX_LIFETIME
    )
      throw new Error();
    if (
      tx.extraSigners?.length ||
      tx.ledgerBounds ||
      tx.minAccountSequence ||
      tx.minAccountSequenceAge ||
      tx.minAccountSequenceLedgerGap
    )
      throw new Error();
    const memo = tx.memo;
    if (
      memo.type !== "hash" ||
      !(memo.value instanceof Uint8Array) ||
      Buffer.from(memo.value).toString("hex") !== expected.digest
    )
      throw new Error();
    const op = tx.operations[0];
    if (
      tx.operations.length !== 1 ||
      !op ||
      op.type !== "manageData" ||
      op.name !== ANCHOR_DATA_KEY ||
      !op.value ||
      Buffer.from(op.value).toString("hex") !== expected.digest ||
      (op.source !== undefined && op.source !== expected.signer)
    )
      throw new Error();
    if (signed) {
      const signature = tx.signatures[0];
      const publicKey = Keypair.fromPublicKey(expected.signer);
      if (
        tx.signatures.length !== 1 ||
        !signature ||
        !Buffer.from(signature.hint.toXdrObject()).equals(Buffer.from(publicKey.signatureHint())) ||
        !publicKey.verify(tx.hash(), signature.signature.toXdrObject())
      )
        throw new Error();
    } else if (tx.signatures.length) throw new Error();
    return tx;
  } catch {
    throw new AnchorError("POLICY", "Sobre rechazado: red, firma, cuenta o contenido no permitido");
  }
}

export async function verifyObserved(
  observed: ChainTransaction,
  expected: ExpectedAnchor,
  networkPassphrase: string,
  content: AnchorContent,
): Promise<Verification> {
  const checks = {
    network: networkPassphrase === ANCHOR_NETWORK,
    envelope: false,
    issuer: false,
    signature: false,
    memo: false,
    operation: false,
    hash: false,
    successful:
      observed.successful === true &&
      Number.isSafeInteger(observed.ledger) &&
      observed.ledger > 0 &&
      Number.isFinite(Date.parse(observed.createdAt)),
    content: false,
  };
  try {
    const tx = TransactionBuilder.fromXDR(observed.xdr, ANCHOR_NETWORK);
    if (tx instanceof Transaction) {
      checks.issuer = tx.source === expected.signer;
      checks.memo =
        tx.memo.type === "hash" &&
        tx.memo.value instanceof Uint8Array &&
        Buffer.from(tx.memo.value).toString("hex") === expected.digest;
      const op = tx.operations[0];
      checks.operation =
        tx.operations.length === 1 &&
        op?.type === "manageData" &&
        op.name === ANCHOR_DATA_KEY &&
        !!op.value &&
        Buffer.from(op.value).toString("hex") === expected.digest &&
        (!op.source || op.source === expected.signer);
      checks.hash = Buffer.from(tx.hash()).toString("hex") === observed.hash;
      try {
        inspectEnvelope(observed.xdr, expected);
        checks.signature = true;
        checks.envelope = true;
      } catch {
        /* Detailed checks stay false. */
      }
    }
    checks.content = (await sha256(contentBytes(content))) === expected.digest;
  } catch {
    /* Invalid data is a mismatch, never proof. */
  }
  return { result: Object.values(checks).every(Boolean) ? "matches" : "mismatch", checks };
}

/** Read-only and independent of the local attempt state. */
export async function verifyOnNetwork(
  transport: AnchorTransport,
  identity: AnchorIdentity,
  digest: string,
  hash: string,
  content: AnchorContent,
): Promise<Verification> {
  const unavailable: Verification = {
    result: "unverifiable",
    checks: {
      network: false,
      envelope: false,
      issuer: false,
      signature: false,
      memo: false,
      operation: false,
      hash: false,
      successful: false,
      content: false,
    },
  };
  try {
    if (identity.network !== "testnet" || !/^[0-9a-f]{64}$/.test(hash))
      return { ...unavailable, result: "mismatch" };
    const network = await transport.network();
    if (network !== ANCHOR_NETWORK) return { ...unavailable, result: "mismatch" };
    const observed = await transport.lookup(hash);
    if (!observed) return unavailable;
    if (observed.hash !== hash) return { ...unavailable, result: "mismatch" };
    return await verifyObserved(observed, { signer: identity.signer, digest }, network, content);
  } catch {
    return unavailable;
  }
}
