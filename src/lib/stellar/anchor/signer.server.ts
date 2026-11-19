import "@tanstack/react-start/server-only";
import {
  Account,
  Keypair,
  Memo,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  ANCHOR_DATA_KEY,
  ANCHOR_MAX_FEE,
  ANCHOR_NETWORK,
  AnchorError,
  type AnchorTransactionSigner,
} from "./types";
import { inspectEnvelope } from "./verify.server";

// Public denylist only. No dependency on the escrow runtime or its private keys.
const LEGACY_ACCOUNTS = new Set([
  "GA5QCSNSWBZBWVRYVMCTTDKIOWIRAEJG237FWFID2P273AJLMYGXLTIN",
  "GBP57FLASGVQ5GAPHFSOU27IOPT6ONVATESTSEJKP4EGFGGKQ5GDFDXR",
  "GCR5OSQJKP6E4NPUQVD3GNUXVCHPEOK5UICHOWVPIOEEAPN6LN6VLQ6X",
  "GCBFSUYWNPZJJ7HVZMLLC7D43YDABUWCLNRNNMPDOPI6BSQY3ZFYXS3P",
]);

export function validateTechnicalAccount(publicKey: string): void {
  if (!StrKey.isValidEd25519PublicKey(publicKey) || LEGACY_ACCOUNTS.has(publicKey)) {
    throw new AnchorError(
      "CONFIG",
      "Se requiere una cuenta técnica nueva, distinta de las cuentas demo heredadas",
    );
  }
}

export function buildAnchorTransaction(input: {
  publicKey: string;
  sequence: string;
  digest: string;
  now: number;
  networkPassphrase?: string;
  fee?: number;
}): string {
  if ((input.networkPassphrase ?? ANCHOR_NETWORK) !== ANCHOR_NETWORK)
    throw new AnchorError("NETWORK", "Solo Stellar Testnet");
  validateTechnicalAccount(input.publicKey);
  const fee = input.fee ?? 100;
  if (
    !Number.isSafeInteger(input.now) ||
    input.now <= 10 ||
    !Number.isSafeInteger(fee) ||
    fee < 100 ||
    fee > ANCHOR_MAX_FEE ||
    !/^\d+$/.test(input.sequence) ||
    BigInt(input.sequence) > 9223372036854775806n ||
    !/^[0-9a-f]{64}$/.test(input.digest)
  )
    throw new AnchorError("POLICY", "Parámetros de transacción inválidos");
  const tx = new TransactionBuilder(new Account(input.publicKey, input.sequence), {
    networkPassphrase: ANCHOR_NETWORK,
    fee: String(fee),
  })
    .addMemo(Memo.hash(Buffer.from(input.digest, "hex")))
    .addOperation(
      Operation.manageData({ name: ANCHOR_DATA_KEY, value: Buffer.from(input.digest, "hex") }),
    )
    .setTimebounds(input.now - 5, input.now + 120)
    .build();
  inspectEnvelope(tx.toXdr(), { signer: input.publicKey, digest: input.digest }, false);
  return tx.toXdr();
}

/** Environment-secret signer, kept for tests and compatibility. Not for secure-store accounts. */
export class AnchorSigner implements AnchorTransactionSigner {
  readonly publicKey: string;
  #key: Keypair;

  constructor(config: { publicKey: string; secret: string; networkPassphrase?: string }) {
    if ((config.networkPassphrase ?? ANCHOR_NETWORK) !== ANCHOR_NETWORK)
      throw new AnchorError("NETWORK", "Solo Stellar Testnet");
    validateTechnicalAccount(config.publicKey);
    try {
      this.#key = Keypair.fromSecret(config.secret);
      if (this.#key.publicKey() !== config.publicKey) throw new Error();
    } catch {
      throw new AnchorError(
        "CONFIG",
        "Secreto ausente, inválido o no correspondiente a la cuenta técnica",
      );
    }
    this.publicKey = config.publicKey;
  }

  static fromEnvironment(env: Record<string, string | undefined> = process.env): AnchorSigner {
    const publicKey = env["STELLAR_ANCHOR_PUBLIC_KEY"],
      secret = env["STELLAR_ANCHOR_SECRET"];
    if (!publicKey || !secret)
      throw new AnchorError("CONFIG", "Falta configuración privada del firmante de anclaje");
    return new AnchorSigner({ publicKey, secret });
  }

  sign(unsignedXdr: string, digest: string, now = Math.floor(Date.now() / 1000)): string {
    const tx = inspectEnvelope(unsignedXdr, { signer: this.publicKey, digest }, false);
    if (
      !Number.isSafeInteger(now) ||
      Number(tx.timeBounds!.maxTime) <= now ||
      Number(tx.timeBounds!.minTime) > now
    )
      throw new AnchorError("POLICY", "Transacción fuera de su ventana de firma");
    tx.sign(this.#key);
    inspectEnvelope(tx.toXdr(), { signer: this.publicKey, digest });
    return tx.toXdr();
  }
}
