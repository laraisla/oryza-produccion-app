import "@tanstack/react-start/server-only";
import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename, mkdir, unlink, lstat, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { canonicalJson } from "./digest";
import {
  ANCHOR_MAX_BYTES,
  AnchorError,
  type AnchorEvidence,
  type AnchorRepository,
  type ContentSnapshot,
} from "./types";
import { inspectEnvelope } from "./verify.server";
import { validateTechnicalAccount } from "./signer.server";

const text = z.string().min(1).max(200);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z.string().datetime();
const state = z.enum(["prepared", "submitted", "unknown", "confirmed", "rejected", "expired"]);
const evidenceSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative().safe(),
    identity: z
      .object({
        network: z.literal("testnet"),
        epoch: text,
        signer: text,
        entityId: text,
        version: text,
        kind: z.enum(["document", "agreement"]),
      })
      .strict(),
    snapshot: z
      .object({
        algorithm: z.literal("sha256"),
        serialization: z.enum(["bytes-v1", "agroglobal-json-v1"]),
        digest: hash,
        bytesBase64: z.string().max(Math.ceil(ANCHOR_MAX_BYTES / 3) * 4),
        size: z.number().int().positive().max(ANCHOR_MAX_BYTES),
      })
      .strict(),
    actorId: text,
    idempotencyKeys: z.array(text).min(1).max(100),
    state: z.enum(["pending", ...state.options]),
    attempts: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            state,
            xdr: z.string().max(16_384),
            hash,
            sequence: z.string().regex(/^\d+$/),
            minTime: z.number().int().positive().safe(),
            maxTime: z.number().int().positive().safe(),
            submissions: z.number().int().min(0).max(5),
            nextRetryAt: z.number().int().nonnegative().safe(),
            lastErrorCode: z.string().max(40).nullable(),
            ledger: z.number().int().positive().nullable(),
            confirmedAt: timestamp.nullable(),
          })
          .strict(),
      )
      .max(1),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const checksum = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sameIdentity = (a: AnchorEvidence, b: AnchorEvidence) =>
  canonicalJson(a.identity) === canonicalJson(b.identity);
// A valid 4 MiB document grows beyond 4 MiB in Base64. Compare its snapshot
// directly instead of applying the business JSON serializer's size limit again.
const sameSnapshot = (a: ContentSnapshot, b: ContentSnapshot) =>
  a.algorithm === b.algorithm &&
  a.serialization === b.serialization &&
  a.digest === b.digest &&
  a.bytesBase64 === b.bytesBase64 &&
  a.size === b.size;
const sameImmutable = (a: AnchorEvidence, b: AnchorEvidence) =>
  a.id === b.id &&
  sameIdentity(a, b) &&
  sameSnapshot(a.snapshot, b.snapshot) &&
  a.actorId === b.actorId &&
  a.createdAt === b.createdAt;

function validateRecords(records: AnchorEvidence[]): void {
  const ids = new Set<string>(),
    identities = new Set<string>(),
    keys = new Set<string>();
  for (const candidate of records) {
    const r = evidenceSchema.parse(candidate);
    validateTechnicalAccount(r.identity.signer);
    const bytes = Buffer.from(r.snapshot.bytesBase64, "base64");
    if (
      bytes.toString("base64") !== r.snapshot.bytesBase64 ||
      bytes.length !== r.snapshot.size ||
      createHash("sha256").update(bytes).digest("hex") !== r.snapshot.digest
    )
      throw new Error("snapshot");
    if ((r.identity.kind === "document") !== (r.snapshot.serialization === "bytes-v1"))
      throw new Error("serialization");
    if (r.identity.kind === "agreement") {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (canonicalJson(JSON.parse(decoded)) !== decoded) throw new Error("canonical");
    }
    const identity = canonicalJson(r.identity);
    if (ids.has(r.id) || identities.has(identity)) throw new Error("duplicate");
    ids.add(r.id);
    identities.add(identity);
    for (const key of r.idempotencyKeys) {
      if (keys.has(key)) throw new Error("idempotency");
      keys.add(key);
    }
    const attempt = r.attempts[0];
    if (!attempt && r.state !== "pending") throw new Error("state");
    if (attempt) {
      const tx = inspectEnvelope(attempt.xdr, {
        signer: r.identity.signer,
        digest: r.snapshot.digest,
      });
      if (
        attempt.state !== r.state ||
        attempt.hash !== Buffer.from(tx.hash()).toString("hex") ||
        attempt.sequence !== tx.sequence ||
        attempt.minTime !== Number(tx.timeBounds!.minTime) ||
        attempt.maxTime !== Number(tx.timeBounds!.maxTime)
      )
        throw new Error("attempt");
      if (r.state === "confirmed" && (!attempt.ledger || !attempt.confirmedAt))
        throw new Error("confirmation");
    }
  }
}

const transitions: Record<string, readonly string[]> = {
  pending: ["prepared"],
  prepared: ["prepared", "submitted", "unknown", "confirmed", "rejected", "expired"],
  submitted: ["submitted", "unknown", "confirmed", "rejected", "expired"],
  unknown: ["unknown", "submitted", "confirmed", "rejected", "expired"],
  confirmed: ["confirmed"],
  rejected: ["rejected"],
  expired: ["expired", "confirmed", "rejected"],
};

/**
 * Reads and fully validates evidence.json (schema, checksum, records). `null` when absent.
 * Never creates, locks or writes anything. The writer replaces the file atomically.
 */
async function loadJournal(directory: string): Promise<AnchorEvidence[] | null> {
  const file = join(directory, "evidence.json");
  try {
    if ((await lstat(file)).isSymbolicLink() || (await stat(file)).size > 32 * 1024 * 1024)
      throw new Error();
    const raw = z
      .object({ format: z.literal(1), records: z.array(evidenceSchema), checksum: hash })
      .strict()
      .parse(JSON.parse(await readFile(file, "utf8")));
    if (raw.checksum !== checksum(raw.records)) throw new Error();
    validateRecords(raw.records);
    return raw.records;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    // Windows may briefly deny reads while the writer atomically replaces the file.
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES")
      throw new AnchorError("LOCKED", "Diario en actualización; reintentar la consulta");
    throw new AnchorError(
      "CORRUPT",
      "Diario inválido; no se intentó enviar ni sobrescribir evidencias",
    );
  }
}

/**
 * Read-only view of the local journal for the local web query screen. It takes no writer
 * lock, so it never competes with the operator CLI (the single writer), and rejects every
 * mutation. Each instance is an immutable snapshot of the file at read time.
 */
export class ReadOnlyAnchorRepository implements AnchorRepository {
  private constructor(private readonly records: readonly AnchorEvidence[]) {}

  static async read(directory: string): Promise<ReadOnlyAnchorRepository> {
    if (!isAbsolute(directory))
      throw new AnchorError("CONFIG", "Se requiere un directorio absoluto de almacenamiento");
    try {
      if ((await lstat(directory)).isSymbolicLink())
        throw new AnchorError("STORAGE", "No usar enlaces simbólicos como almacenamiento");
    } catch (e) {
      if (e instanceof AnchorError) throw e;
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return new ReadOnlyAnchorRepository([]);
      throw new AnchorError("STORAGE", "No se pudo leer el almacenamiento local");
    }
    return new ReadOnlyAnchorRepository((await loadJournal(directory)) ?? []);
  }
  async get(id: string): Promise<AnchorEvidence | null> {
    const r = this.records.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }
  async list(): Promise<AnchorEvidence[]> {
    return structuredClone([...this.records]);
  }
  createOrGet(): Promise<AnchorEvidence> {
    return Promise.reject(new AnchorError("DISABLED", "Consulta de solo lectura"));
  }
  save(): Promise<AnchorEvidence> {
    return Promise.reject(new AnchorError("DISABLED", "Consulta de solo lectura"));
  }
}

/** Single process only. Atomic replace + fsync; not a serverless database. */
export class LocalAnchorRepository implements AnchorRepository {
  private records: AnchorEvidence[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private closing = false;
  private closePromise: Promise<void> | undefined;
  private broken = false;
  private readonly token = randomUUID();
  private constructor(private readonly directory: string) {}

  static async open(
    directory: string,
    options: { recoverStaleLock?: boolean } = {},
  ): Promise<LocalAnchorRepository> {
    if (!isAbsolute(directory))
      throw new AnchorError(
        "CONFIG",
        "Se requiere un directorio absoluto de almacenamiento local privado",
      );
    const repo = new LocalAnchorRepository(directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink())
      throw new AnchorError("STORAGE", "No usar enlaces simbólicos como almacenamiento");
    const lock = join(directory, "writer.lock");
    try {
      try {
        await repo.acquireLock();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (!options.recoverStaleLock || (await lstat(lock)).isSymbolicLink())
          throw new AnchorError(
            "LOCKED",
            "Almacenamiento bloqueado; verificar el proceso antes de recuperar",
          );
        const owner: unknown = JSON.parse(await readFile(lock, "utf8"));
        const parsed = z
          .object({ pid: z.number().int().positive(), token: z.string().uuid() })
          .strict()
          .parse(owner);
        try {
          process.kill(parsed.pid, 0);
          throw new AnchorError("LOCKED", "Hay un proceso escritor activo");
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ESRCH")
            throw new AnchorError("LOCKED", "No se puede demostrar que el escritor terminó");
        }
        // Explicit operator recovery only, with no concurrent recovery/startup.
        await unlink(lock);
        await repo.acquireLock();
      }
    } catch (e) {
      if (e instanceof AnchorError) throw e;
      throw new AnchorError("LOCKED", "No se pudo obtener el bloqueo local");
    }
    try {
      repo.records = (await loadJournal(directory)) ?? [];
      return repo;
    } catch (e) {
      await repo.close();
      throw e;
    }
  }

  private async acquireLock(): Promise<void> {
    const handle = await open(join(this.directory, "writer.lock"), "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, token: this.token }));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new AnchorError("STORAGE", "Repositorio en cierre"));
    const next = this.queue.then(async () => {
      if (this.closed || this.broken)
        throw new AnchorError(
          "STORAGE",
          "Repositorio cerrado o con escritura incierta; reiniciar y revisar el diario",
        );
      return action();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async persist(records: AnchorEvidence[]): Promise<void> {
    try {
      validateRecords(records);
    } catch {
      throw new AnchorError("CORRUPT", "Estado de evidencia inválido");
    }
    const serialized = JSON.stringify({ format: 1, records, checksum: checksum(records) });
    if (Buffer.byteLength(serialized) > 32 * 1024 * 1024)
      throw new AnchorError("STORAGE", "Diario demo lleno; archivar antes de continuar");
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(serialized, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, join(this.directory, "evidence.json"));
      // Directory fsync is unavailable on some Windows filesystems.
      try {
        const dir = await open(this.directory, "r");
        try {
          await dir.sync();
        } finally {
          await dir.close();
        }
      } catch (e) {
        if (
          !["EPERM", "EISDIR", "EINVAL", "ENOTSUP", "EACCES"].includes(
            (e as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw e;
      }
      this.records = structuredClone(records);
    } catch {
      this.broken = true;
      throw new AnchorError("STORAGE", "No se confirmó la escritura local; no continuar enviando");
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async createOrGet(evidence: AnchorEvidence): Promise<AnchorEvidence> {
    return this.exclusive(async () => {
      if (
        evidence.state !== "pending" ||
        evidence.attempts.length ||
        evidence.revision !== 0 ||
        evidence.idempotencyKeys.length !== 1
      )
        throw new AnchorError("CONFLICT", "Alta de evidencia inválida");
      const key = evidence.idempotencyKeys[0]!;
      const byKey = this.records.find((r) => r.idempotencyKeys.includes(key));
      const existing = byKey ?? this.records.find((r) => sameIdentity(r, evidence));
      if (existing) {
        if (
          !sameIdentity(existing, evidence) ||
          !sameSnapshot(existing.snapshot, evidence.snapshot)
        )
          throw new AnchorError("CONFLICT", "La clave o versión ya corresponde a otro contenido");
        if (existing.idempotencyKeys.includes(key)) return structuredClone(existing);
        const updated = {
          ...existing,
          revision: existing.revision + 1,
          idempotencyKeys: [...existing.idempotencyKeys, key],
        };
        await this.persist(this.records.map((r) => (r.id === existing.id ? updated : r)));
        return structuredClone(updated);
      }
      await this.persist([...this.records, structuredClone(evidence)]);
      return structuredClone(evidence);
    });
  }
  async get(id: string): Promise<AnchorEvidence | null> {
    return this.exclusive(async () =>
      structuredClone(this.records.find((r) => r.id === id) ?? null),
    );
  }
  async list(): Promise<AnchorEvidence[]> {
    return this.exclusive(async () => structuredClone(this.records));
  }
  async save(evidence: AnchorEvidence, expectedRevision: number): Promise<AnchorEvidence> {
    return this.exclusive(async () => {
      const old = this.records.find((r) => r.id === evidence.id);
      if (
        !old ||
        old.revision !== expectedRevision ||
        evidence.revision !== old.revision ||
        !sameImmutable(old, evidence) ||
        canonicalJson(old.idempotencyKeys) !== canonicalJson(evidence.idempotencyKeys) ||
        !transitions[old.state]?.includes(evidence.state)
      )
        throw new AnchorError(
          "CONFLICT",
          "Conflicto de revisión o intento de modificar contenido inmutable",
        );
      if (old.attempts.length) {
        const a = old.attempts[0]!,
          b = evidence.attempts[0];
        if (
          !b ||
          evidence.attempts.length !== old.attempts.length ||
          ["id", "xdr", "hash", "sequence", "minTime", "maxTime"].some(
            (key) => a[key as keyof typeof a] !== b[key as keyof typeof b],
          ) ||
          b.submissions < a.submissions
        )
          throw new AnchorError(
            "CONFLICT",
            "No se puede reemplazar el sobre de un intento existente",
          );
      }
      const updated = { ...structuredClone(evidence), revision: old.revision + 1 };
      await this.persist(this.records.map((r) => (r.id === old.id ? updated : r)));
      return structuredClone(updated);
    });
  }
  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      await this.queue;
      if (this.closed) return;
      this.closed = true;
      const lock = join(this.directory, "writer.lock");
      const owner = JSON.parse(await readFile(lock, "utf8")) as { token?: string };
      if (owner.token === this.token) await unlink(lock);
    })();
    return this.closePromise;
  }
}
