/** Public contracts only. Never put credentials or signing code in this module. */
export const ANCHOR_NETWORK = "Test SDF Network ; September 2015";
export const ANCHOR_DATA_KEY = "agroglobal:anchor:v1";
export const ANCHOR_MAX_BYTES = 4 * 1024 * 1024;
export const ANCHOR_MAX_FEE = 10_000;
export const ANCHOR_MAX_LIFETIME = 180;

export type Json = null | boolean | string | number | Json[] | { [key: string]: Json };
export type AnchorContent =
  { kind: "document"; bytes: Uint8Array } | { kind: "agreement"; conditions: Record<string, Json> };

export interface AnchorIdentity {
  network: "testnet";
  epoch: string;
  signer: string;
  entityId: string;
  version: string;
  kind: AnchorContent["kind"];
}
export interface ContentSnapshot {
  algorithm: "sha256";
  serialization: "bytes-v1" | "agroglobal-json-v1";
  digest: string;
  bytesBase64: string;
  size: number;
}
export type AttemptState =
  "prepared" | "submitted" | "unknown" | "confirmed" | "rejected" | "expired";
export type EvidenceState = "pending" | AttemptState;
export interface AnchorAttempt {
  id: string;
  state: AttemptState;
  xdr: string;
  hash: string;
  sequence: string;
  minTime: number;
  maxTime: number;
  submissions: number;
  nextRetryAt: number;
  lastErrorCode: string | null;
  ledger: number | null;
  confirmedAt: string | null;
}
export interface AnchorEvidence {
  id: string;
  revision: number;
  identity: AnchorIdentity;
  snapshot: ContentSnapshot;
  actorId: string;
  idempotencyKeys: string[];
  state: EvidenceState;
  attempts: AnchorAttempt[];
  createdAt: string;
  updatedAt: string;
}
export interface AnchorRequest {
  entityId: string;
  version: string;
  actorId: string;
  idempotencyKey: string;
  content: AnchorContent;
}
export interface ChainTransaction {
  hash: string;
  xdr: string;
  successful: boolean;
  ledger: number;
  createdAt: string;
}
export interface AnchorTransport {
  network(): Promise<string>;
  account(publicKey: string): Promise<{ sequence: string }>;
  submit(xdr: string): Promise<void>;
  lookup(hash: string): Promise<ChainTransaction | null>;
  latestLedgerTime(): Promise<number>;
}
/**
 * Server-side signer. Receives only the unsigned envelope and returns the same transaction
 * with one signature of `publicKey`. Implementations: environment secret (tests/compatibility)
 * and Stellar CLI with an OS secure-store identity (the key never enters this process).
 */
export interface AnchorTransactionSigner {
  readonly publicKey: string;
  sign(unsignedXdr: string, digest: string, now?: number): string | Promise<string>;
}
export interface AnchorRepository {
  createOrGet(evidence: AnchorEvidence): Promise<AnchorEvidence>;
  get(id: string): Promise<AnchorEvidence | null>;
  list(): Promise<AnchorEvidence[]>;
  /** Compare-and-swap; immutable content and old transaction envelopes cannot change. */
  save(evidence: AnchorEvidence, expectedRevision: number): Promise<AnchorEvidence>;
}
export type AnchorErrorCode =
  | "INVALID_CONTENT"
  | "CONFIG"
  | "DISABLED"
  | "POLICY"
  | "NETWORK"
  | "TIMEOUT"
  | "REMOTE"
  | "CONFLICT"
  | "LOCKED"
  | "CORRUPT"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "PENDING"
  | "STORAGE"
  | "SIGNER";
export class AnchorError extends Error {
  constructor(
    public readonly code: AnchorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnchorError";
  }
}
export interface Verification {
  result: "matches" | "mismatch" | "unverifiable";
  checks: {
    network: boolean;
    envelope: boolean;
    issuer: boolean;
    signature: boolean;
    memo: boolean;
    operation: boolean;
    hash: boolean;
    successful: boolean;
    content: boolean;
  };
}
