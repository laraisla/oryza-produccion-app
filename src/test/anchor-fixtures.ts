import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { vi } from "vitest";
import { LocalAnchorRepository } from "@/lib/stellar/anchor/repository.server";
import { AnchorService } from "@/lib/stellar/anchor/service.server";
import { AnchorSigner } from "@/lib/stellar/anchor/signer.server";
import {
  ANCHOR_NETWORK,
  AnchorError,
  type AnchorRequest,
  type ChainTransaction,
} from "@/lib/stellar/anchor/types";

export const demoRequest = (patch: Partial<AnchorRequest> = {}): AnchorRequest => ({
  entityId: "demo-doc",
  version: "1",
  actorId: "operator",
  idempotencyKey: "request-1",
  content: { kind: "document", bytes: new TextEncoder().encode("Fictitious demo content") },
  ...patch,
});

export async function fixture(allowSending = true) {
  const base = resolve("../work");
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "anchor-test-"));
  const key = Keypair.random(); // Ephemeral; never funded, saved, printed or sent to any network.
  const signer = new AnchorSigner({ publicKey: key.publicKey(), secret: key.secret() });
  const chain = new Map<string, ChainTransaction>();
  const behavior = { time: 1_800_000_000, confirm: true, failBefore: false, failAfter: false };
  const transport = {
    network: vi.fn(async () => ANCHOR_NETWORK),
    account: vi.fn(async () => ({ sequence: "10" })),
    lookup: vi.fn(async (hash: string) => chain.get(hash) ?? null),
    latestLedgerTime: vi.fn(async () => behavior.time),
    submit: vi.fn(async (xdr: string) => {
      if (behavior.failBefore) throw new AnchorError("TIMEOUT", "Simulated timeout");
      const hash = Buffer.from(TransactionBuilder.fromXDR(xdr, ANCHOR_NETWORK).hash()).toString(
        "hex",
      );
      if (behavior.confirm)
        chain.set(hash, {
          hash,
          xdr,
          successful: true,
          ledger: 7,
          createdAt: new Date(behavior.time * 1000).toISOString(),
        });
      if (behavior.failAfter)
        throw new AnchorError("TIMEOUT", "Simulated timeout after acceptance");
    }),
  };
  const makeService = (
    repository: LocalAnchorRepository,
    overrides: Partial<ConstructorParameters<typeof AnchorService>[0]> = {},
  ) =>
    new AnchorService({
      repository,
      transport,
      signer,
      publicKey: key.publicKey(),
      epoch: "test-epoch",
      runtime: "local-single-process",
      authorize: async (ctx) => ctx.actorId === "operator",
      now: () => behavior.time,
      allowSending,
      ...overrides,
    });
  const repo = await LocalAnchorRepository.open(directory);
  return {
    base,
    directory,
    key,
    signer,
    repo,
    transport,
    chain,
    behavior,
    makeService,
    service: makeService(repo),
    async cleanup() {
      await repo.close();
      // Only recursively remove the absolute mkdtemp directory underneath this workspace's work/.
      if (!directory.startsWith(base + sep) || !directory.includes("anchor-test-"))
        throw new Error("Unsafe test cleanup");
      await rm(directory, { recursive: true, force: true });
    },
  };
}
