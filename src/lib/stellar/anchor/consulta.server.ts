import "@tanstack/react-start/server-only";
import { isAbsolute, resolve } from "node:path";
import { StrKey } from "@stellar/stellar-sdk";
import { esIpLoopback } from "@/lib/stellar/stellar.server";
import { sha256 } from "./digest";
import { ReadOnlyAnchorRepository } from "./repository.server";
import { AnchorService } from "./service.server";
import { validateTechnicalAccount } from "./signer.server";
import { HorizonAnchorTransport } from "./transport.server";
import {
  ANCHOR_MAX_BYTES,
  ANCHOR_NETWORK,
  AnchorError,
  type AnchorEvidence,
  type AnchorTransport,
  type Verification,
} from "./types";

/**
 * Local, read-only web query of the anchor journal. No signer, sending disabled, no writer
 * lock (the operator CLI remains the only writer). Only public evidence metadata leaves the
 * server: never snapshots, envelopes, idempotency keys or the journal itself.
 */

export interface ConsultaConfig {
  publicKey: string;
  epoch: string;
  directory: string;
}

/** Same opt-in as the operator CLI; `null` (disabled) outside an explicit local demo. */
export function configConsulta(
  env: Record<string, string | undefined> = process.env,
): ConsultaConfig | null {
  if (
    env["STELLAR_ANCHOR_DEMO"] !== "1" ||
    env["NODE_ENV"] === "production" ||
    env["VERCEL"] ||
    env["CF_PAGES"]
  )
    return null;
  const publicKey = env["STELLAR_ANCHOR_PUBLIC_KEY"] ?? "",
    epoch = env["STELLAR_ANCHOR_EPOCH"] ?? "";
  if (!StrKey.isValidEd25519PublicKey(publicKey) || !/^[\w.:-]{1,200}$/.test(epoch)) return null;
  try {
    validateTechnicalAccount(publicKey);
  } catch {
    return null;
  }
  const directory = resolve(env["STELLAR_ANCHOR_DIRECTORY"] ?? "anchor-demo.local");
  return isAbsolute(directory) ? { publicKey, epoch, directory } : null;
}

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Access only from the development server, from a loopback socket address, addressed to a
 * loopback host name (blocks DNS rebinding). Browser requests with a body must be
 * same-origin. Header values are never trusted to establish loopback: that is the socket IP.
 */
export function accesoLocal(input: {
  dev: boolean;
  ip: string | undefined;
  url: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  conCuerpo: boolean;
}): boolean {
  if (!input.dev || !esIpLoopback(input.ip)) return false;
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return false;
  }
  const host = (input.host ?? "").toLowerCase();
  if (!host || host !== url.host.toLowerCase() || !HOSTS_LOCALES.has(url.hostname.toLowerCase()))
    return false;
  if (input.secFetchSite && !["same-origin", "none"].includes(input.secFetchSite)) return false;
  if (input.conCuerpo) {
    if (input.origin !== url.origin) return false;
    if (input.secFetchSite !== "same-origin") return false;
  } else if (input.origin && input.origin !== url.origin) return false;
  return true;
}

export interface EvidenciaPublica {
  id: string;
  estadoLocal: AnchorEvidence["state"];
  tipo: AnchorEvidence["identity"]["kind"];
  entidad: string;
  version: string;
  red: "testnet";
  epoca: string;
  cuenta: string;
  digest: string;
  transaccion: {
    hash: string;
    ledgerLocal: number | null;
    confirmadaLocal: string | null;
    envios: number;
  } | null;
  actualizado: string;
}

export interface DetalleEvidencia {
  consultadoEn: string;
  evidencia: EvidenciaPublica;
  red: {
    passphrase: string;
    esTestnet: boolean;
    transaccion: {
      encontrada: boolean;
      exitosa: boolean;
      ledger: number | null;
      fecha: string | null;
    } | null;
  };
  verificacion: Verification | null;
}

function publica(r: AnchorEvidence): EvidenciaPublica {
  const a = r.attempts[0];
  return {
    id: r.id,
    estadoLocal: r.state,
    tipo: r.identity.kind,
    entidad: r.identity.entityId,
    version: r.identity.version,
    red: "testnet",
    epoca: r.identity.epoch,
    cuenta: r.identity.signer,
    digest: r.snapshot.digest,
    transaccion: a
      ? {
          hash: a.hash,
          ledgerLocal: a.ledger,
          confirmadaLocal: a.confirmedAt,
          envios: a.submissions,
        }
      : null,
    actualizado: r.updatedAt,
  };
}

const ACTOR = "local-web-viewer";

async function servicio(config: ConsultaConfig, transport?: AnchorTransport) {
  const repository = await ReadOnlyAnchorRepository.read(config.directory);
  const red = transport ?? new HorizonAnchorTransport(config.publicKey, { allowSending: false });
  const service = new AnchorService({
    repository,
    transport: red,
    publicKey: config.publicKey,
    epoch: config.epoch,
    runtime: "local-single-process",
    // Read and verify only; request/prepare/submit are refused by authorization too.
    authorize: async (c) => c.actorId === ACTOR && (c.action === "read" || c.action === "verify"),
    allowSending: false,
  });
  return { repository, service, red };
}

export async function listarEvidencias(
  config: ConsultaConfig,
  transport?: AnchorTransport,
): Promise<EvidenciaPublica[]> {
  const { repository } = await servicio(config, transport);
  return (await repository.list())
    .filter(
      (r) =>
        r.identity.signer === config.publicKey &&
        r.identity.epoch === config.epoch &&
        r.identity.network === "testnet",
    )
    .map(publica);
}

/** Network-confirmed detail: Horizon lookup + full independent verification of the snapshot. */
export async function detalleEvidencia(
  config: ConsultaConfig,
  id: string,
  transport?: AnchorTransport,
): Promise<DetalleEvidencia> {
  const { service, red } = await servicio(config, transport);
  const r = await service.get(id, ACTOR);
  const passphrase = await red.network();
  const hash = r.attempts[0]?.hash;
  let transaccion: DetalleEvidencia["red"]["transaccion"] = null;
  let verificacion: Verification | null = null;
  if (hash) {
    const observada = await red.lookup(hash);
    transaccion = observada
      ? {
          encontrada: observada.hash === hash,
          exitosa: observada.hash === hash && observada.successful === true,
          ledger: observada.ledger,
          fecha: observada.createdAt,
        }
      : { encontrada: false, exitosa: false, ledger: null, fecha: null };
    verificacion = await service.verify(id, ACTOR);
  }
  return {
    consultadoEn: new Date().toISOString(),
    evidencia: publica(r),
    red: { passphrase, esTestnet: passphrase === ANCHOR_NETWORK, transaccion },
    verificacion,
  };
}

/** Compares a user-provided document with the anchored evidence on the network. */
export async function verificarDocumento(
  config: ConsultaConfig,
  id: string,
  bytes: Uint8Array,
  transport?: AnchorTransport,
): Promise<{ digestArchivo: string; bytes: number; verificacion: Verification }> {
  if (!bytes.byteLength || bytes.byteLength > ANCHOR_MAX_BYTES)
    throw new AnchorError("INVALID_CONTENT", "Archivo vacío o mayor al máximo permitido");
  const { service } = await servicio(config, transport);
  const r = await service.get(id, ACTOR);
  if (r.identity.kind !== "document")
    throw new AnchorError("INVALID_CONTENT", "La evidencia no corresponde a un documento");
  const verificacion = await service.verify(id, ACTOR, { kind: "document", bytes });
  return { digestArchivo: await sha256(bytes), bytes: bytes.byteLength, verificacion };
}
