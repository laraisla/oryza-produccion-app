import "@tanstack/react-start/server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { contentBytes, sha256 } from "./digest";
import { buildAnchorTransaction, validateTechnicalAccount } from "./signer.server";
import { inspectEnvelope, verifyObserved, verifyOnNetwork } from "./verify.server";
import {
  ANCHOR_NETWORK,
  AnchorError,
  type AnchorContent,
  type AnchorEvidence,
  type AnchorRepository,
  type AnchorRequest,
  type AnchorTransactionSigner,
  type AnchorTransport,
  type EvidenceState,
  type Verification,
} from "./types";

export interface AuthorizationContext {
  action: "request" | "prepare" | "submit" | "read" | "verify";
  actorId: string;
  entityId: string;
  version: string;
  kind: AnchorContent["kind"];
}
export interface AnchorServiceOptions {
  repository: AnchorRepository;
  transport: AnchorTransport;
  publicKey: string;
  epoch: string;
  /** Deliberate opt-in; this adapter must never be used as serverless storage. */
  runtime: "local-single-process";
  authorize: (context: AuthorizationContext) => Promise<boolean>;
  signer?: AnchorTransactionSigner;
  allowSending?: boolean;
  now?: () => number;
}
const identifier = z.string().trim().min(1).max(200);

export class AnchorService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: AnchorServiceOptions) {
    validateTechnicalAccount(options.publicKey);
    if (
      options.runtime !== "local-single-process" ||
      !identifier.safeParse(options.epoch).success ||
      typeof options.authorize !== "function" ||
      (options.signer && options.signer.publicKey !== options.publicKey)
    )
      throw new AnchorError("CONFIG", "Servicio demo mal configurado");
  }
  private now(): number {
    return this.options.now?.() ?? Math.floor(Date.now() / 1000);
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async authorize(context: AuthorizationContext): Promise<void> {
    if (
      ![context.actorId, context.entityId, context.version].every(
        (v) => identifier.safeParse(v).success,
      )
    )
      throw new AnchorError("INVALID_CONTENT", "Identificadores incompletos");
    if (!(await this.options.authorize(context)))
      throw new AnchorError("UNAUTHORIZED", "Actor no autorizado para esta versión");
  }
  private async load(
    id: string,
    actorId: string,
    action: AuthorizationContext["action"],
  ): Promise<AnchorEvidence> {
    const r = await this.options.repository.get(id);
    if (!r) throw new AnchorError("NOT_FOUND", "Evidencia inexistente");
    if (
      r.identity.signer !== this.options.publicKey ||
      r.identity.network !== "testnet" ||
      r.identity.epoch !== this.options.epoch
    )
      throw new AnchorError("CONFIG", "Cuenta o época de red distinta de la evidencia");
    await this.authorize({
      action,
      actorId,
      entityId: r.identity.entityId,
      version: r.identity.version,
      kind: r.identity.kind,
    });
    return r;
  }
  private snapshotContent(r: AnchorEvidence): AnchorContent {
    const bytes = Buffer.from(r.snapshot.bytesBase64, "base64");
    return r.identity.kind === "document"
      ? { kind: "document", bytes }
      : {
          kind: "agreement",
          conditions: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<
            string,
            import("./types").Json
          >,
        };
  }
  private async checkNetwork(): Promise<void> {
    if ((await this.options.transport.network()) !== ANCHOR_NETWORK)
      throw new AnchorError("NETWORK", "Solo Stellar Testnet");
  }
  private async saveState(
    r: AnchorEvidence,
    state: EvidenceState,
    patch: Partial<AnchorEvidence["attempts"][number]> = {},
  ): Promise<AnchorEvidence> {
    const a = r.attempts[0];
    if (!a || state === "pending") throw new AnchorError("CONFLICT", "Intento ausente");
    return this.options.repository.save(
      {
        ...r,
        state,
        updatedAt: new Date(this.now() * 1000).toISOString(),
        attempts: [{ ...a, ...patch, state }],
      },
      r.revision,
    );
  }

  request(input: AnchorRequest): Promise<AnchorEvidence> {
    // Copy before any asynchronous callback: caller mutation cannot change an authorized snapshot.
    let captured: AnchorRequest;
    try {
      const bytes = contentBytes(input.content);
      captured = {
        ...input,
        content:
          input.content.kind === "document"
            ? { kind: "document", bytes }
            : { kind: "agreement", conditions: JSON.parse(new TextDecoder().decode(bytes)) },
      };
    } catch {
      return Promise.reject(
        new AnchorError("INVALID_CONTENT", "Contenido no JSON o documento inválido"),
      );
    }
    return this.exclusive(async () => {
      await this.authorize({
        action: "request",
        actorId: captured.actorId,
        entityId: captured.entityId,
        version: captured.version,
        kind: captured.content.kind,
      });
      if (!identifier.safeParse(captured.idempotencyKey).success)
        throw new AnchorError("INVALID_CONTENT", "Clave idempotente ausente");
      const bytes = contentBytes(captured.content);
      const date = new Date(this.now() * 1000).toISOString();
      return this.options.repository.createOrGet({
        id: randomUUID(),
        revision: 0,
        identity: {
          network: "testnet",
          epoch: this.options.epoch,
          signer: this.options.publicKey,
          entityId: captured.entityId,
          version: captured.version,
          kind: captured.content.kind,
        },
        snapshot: {
          algorithm: "sha256",
          serialization: captured.content.kind === "document" ? "bytes-v1" : "agroglobal-json-v1",
          digest: await sha256(bytes),
          bytesBase64: Buffer.from(bytes).toString("base64"),
          size: bytes.length,
        },
        actorId: captured.actorId,
        idempotencyKeys: [captured.idempotencyKey],
        state: "pending",
        attempts: [],
        createdAt: date,
        updatedAt: date,
      });
    });
  }

  prepare(id: string, actorId: string): Promise<AnchorEvidence> {
    return this.exclusive(async () => {
      const r = await this.load(id, actorId, "prepare");
      if (r.attempts.length) return r;
      if (!this.options.signer) throw new AnchorError("CONFIG", "Falta el firmante servidor");
      const unresolved = (await this.options.repository.list()).some(
        (other) =>
          other.id !== r.id &&
          other.identity.signer === r.identity.signer &&
          other.attempts.length &&
          !["confirmed", "rejected"].includes(other.state),
      );
      if (unresolved)
        throw new AnchorError(
          "PENDING",
          "Reconciliá el intento anterior de la cuenta antes de preparar otro",
        );
      await this.checkNetwork();
      const { sequence } = await this.options.transport.account(this.options.publicKey);
      const now = this.now();
      const unsigned = buildAnchorTransaction({
        publicKey: this.options.publicKey,
        sequence,
        digest: r.snapshot.digest,
        now,
      });
      const expected = { signer: r.identity.signer, digest: r.snapshot.digest };
      const unsignedHash = Buffer.from(inspectEnvelope(unsigned, expected, false).hash());
      const xdr = await this.options.signer.sign(unsigned, r.snapshot.digest, now);
      const tx = inspectEnvelope(xdr, expected);
      // Any signer (including an external process) may only append the signature: fee,
      // sequence, time bounds, memo and operation must be byte-identical to what was built.
      if (!Buffer.from(tx.hash()).equals(unsignedHash))
        throw new AnchorError("POLICY", "El firmante devolvió una transacción distinta");
      if (this.now() >= Number(tx.timeBounds!.maxTime))
        throw new AnchorError("POLICY", "La firma terminó fuera de la ventana de vigencia");
      return this.options.repository.save(
        {
          ...r,
          state: "prepared",
          updatedAt: new Date(now * 1000).toISOString(),
          attempts: [
            {
              id: randomUUID(),
              state: "prepared",
              xdr,
              hash: Buffer.from(tx.hash()).toString("hex"),
              sequence: tx.sequence,
              minTime: Number(tx.timeBounds!.minTime),
              maxTime: Number(tx.timeBounds!.maxTime),
              submissions: 0,
              nextRetryAt: 0,
              lastErrorCode: null,
              ledger: null,
              confirmedAt: null,
            },
          ],
        },
        r.revision,
      );
    });
  }

  private async reconcileRecord(r: AnchorEvidence): Promise<AnchorEvidence> {
    const a = r.attempts[0];
    if (!a || r.state === "confirmed" || r.state === "rejected") return r;
    await this.checkNetwork();
    const observed = await this.options.transport.lookup(a.hash);
    if (!observed) return r;
    if (observed.hash !== a.hash)
      throw new AnchorError("POLICY", "La respuesta no corresponde al intento");
    const verified = await verifyObserved(
      observed,
      { signer: r.identity.signer, digest: r.snapshot.digest },
      ANCHOR_NETWORK,
      this.snapshotContent(r),
    );
    const { successful: _successful, ...structural } = verified.checks;
    if (!Object.values(structural).every(Boolean))
      throw new AnchorError("POLICY", "La transacción consultada no corresponde a esta evidencia");
    return this.saveState(r, observed.successful ? "confirmed" : "rejected", {
      ledger: observed.ledger,
      confirmedAt: observed.createdAt,
      lastErrorCode: observed.successful ? null : "TRANSACTION_FAILED",
    });
  }

  reconcile(id: string, actorId: string): Promise<AnchorEvidence> {
    return this.exclusive(async () => this.reconcileRecord(await this.load(id, actorId, "read")));
  }

  submit(id: string, actorId: string): Promise<AnchorEvidence> {
    return this.exclusive(async () => {
      if (this.options.allowSending !== true)
        throw new AnchorError("DISABLED", "Envío deshabilitado por defecto");
      let r = await this.load(id, actorId, "submit");
      if (!r.attempts.length)
        throw new AnchorError("CONFLICT", "Prepará y persistí el intento antes de enviar");
      r = await this.reconcileRecord(r);
      if (["confirmed", "rejected", "expired"].includes(r.state)) return r;
      const a = r.attempts[0]!;
      inspectEnvelope(a.xdr, { signer: r.identity.signer, digest: r.snapshot.digest });
      if (this.now() >= a.maxTime) {
        if ((await this.options.transport.latestLedgerTime()) > a.maxTime)
          return this.saveState(r, "expired", { lastErrorCode: "EXPIRED_UNRESOLVED" });
        return r;
      }
      if (this.now() < a.minTime || this.now() < a.nextRetryAt || a.submissions >= 5) return r;
      // Persist before the uncertain external effect, even when retrying the same envelope.
      r = await this.saveState(r, "submitted", {
        submissions: a.submissions + 1,
        nextRetryAt: this.now() + Math.min(30, 2 ** a.submissions),
        lastErrorCode: null,
      });
      try {
        await this.options.transport.submit(a.xdr);
      } catch (error) {
        r = await this.saveState(r, "unknown", {
          lastErrorCode: error instanceof AnchorError ? error.code : "REMOTE",
        });
        // The remote side may have accepted the envelope before the connection failed.
        try {
          return await this.reconcileRecord(r);
        } catch {
          return r;
        }
      }
      try {
        return await this.reconcileRecord(r);
      } catch (error) {
        return this.saveState(r, "unknown", {
          lastErrorCode: error instanceof AnchorError ? error.code : "REMOTE",
        });
      }
    });
  }

  async get(id: string, actorId: string): Promise<AnchorEvidence> {
    return this.load(id, actorId, "read");
  }
  async verify(id: string, actorId: string, content?: AnchorContent): Promise<Verification> {
    const r = await this.load(id, actorId, "verify");
    const attempt = r.attempts[0];
    if (!attempt) throw new AnchorError("NOT_FOUND", "Evidencia sin transacción preparada");
    if (content && content.kind !== r.identity.kind)
      throw new AnchorError("INVALID_CONTENT", "Tipo de contenido distinto");
    return verifyOnNetwork(
      this.options.transport,
      r.identity,
      r.snapshot.digest,
      attempt.hash,
      content ?? this.snapshotContent(r),
    );
  }
}
