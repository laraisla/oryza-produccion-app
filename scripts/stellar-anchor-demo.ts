/** Local operator CLI only. Does not create/fund accounts; no public signing endpoint. */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { LocalAnchorRepository } from "../src/lib/stellar/anchor/repository.server";
import { AnchorService } from "../src/lib/stellar/anchor/service.server";
import { StellarCliSigner } from "../src/lib/stellar/anchor/cli-signer.server";
import { AnchorSigner } from "../src/lib/stellar/anchor/signer.server";
import { HorizonAnchorTransport } from "../src/lib/stellar/anchor/transport.server";
import {
  AnchorError,
  type AnchorContent,
  type AnchorEvidence,
  type AnchorTransactionSigner,
} from "../src/lib/stellar/anchor/types";

function summary(r: AnchorEvidence) {
  return {
    id: r.id,
    state: r.state,
    revision: r.revision,
    digest: r.snapshot.digest,
    transactionHash: r.attempts[0]?.hash ?? null,
    ledger: r.attempts[0]?.ledger ?? null,
    submissions: r.attempts[0]?.submissions ?? 0,
    lastErrorCode: r.attempts[0]?.lastErrorCode ?? null,
  };
}

async function main() {
  if (
    process.env["STELLAR_ANCHOR_DEMO"] !== "1" ||
    process.env["NODE_ENV"] === "production" ||
    process.env["VERCEL"] ||
    process.env["CF_PAGES"]
  )
    throw new AnchorError(
      "DISABLED",
      "CLI solo para demo local explícita, fuera de producción/serverless",
    );
  const args = process.argv.slice(2);
  const [command, argument, comparison] = args.filter((a) => !a.startsWith("--"));
  if (
    !["request", "prepare", "submit", "reconcile", "verify", "status", "list"].includes(
      command ?? "",
    )
  )
    throw new AnchorError(
      "CONFIG",
      "Uso: bun scripts/stellar-anchor-demo.ts request|prepare|submit|reconcile|verify|status|list [archivo o id] [archivo de comparación] [--send] [--recover-lock]",
    );
  const publicKey = process.env["STELLAR_ANCHOR_PUBLIC_KEY"],
    epoch = process.env["STELLAR_ANCHOR_EPOCH"];
  if (!publicKey || !epoch)
    throw new AnchorError("CONFIG", "Configurar cuenta pública nueva y época Testnet");
  const allowSending = process.env["STELLAR_ANCHOR_ENABLED"] === "1" && args.includes("--send");
  if (command === "submit" && !allowSending)
    throw new AnchorError("DISABLED", "Enviar requiere habilitación y --send explícitos");
  // "env" (default, tests/compatibility): STELLAR_ANCHOR_SECRET in this process.
  // "stellar-cli": official Stellar CLI signs with an OS secure-store identity; no secret here.
  const signerMode = process.env["STELLAR_ANCHOR_SIGNER"] ?? "env";
  if (signerMode !== "env" && signerMode !== "stellar-cli")
    throw new AnchorError("CONFIG", "STELLAR_ANCHOR_SIGNER debe ser env o stellar-cli");
  let signer: AnchorTransactionSigner | undefined;
  if (command === "prepare") {
    if (signerMode === "stellar-cli") {
      const cliSigner = StellarCliSigner.fromEnvironment();
      await cliSigner.checkIdentity();
      signer = cliSigner;
    } else signer = AnchorSigner.fromEnvironment();
  }
  const repository = await LocalAnchorRepository.open(
    resolve(process.env["STELLAR_ANCHOR_DIRECTORY"] ?? "anchor-demo.local"),
    { recoverStaleLock: args.includes("--recover-lock") },
  );
  try {
    const actorId = "local-demo-operator";
    const service = new AnchorService({
      repository,
      publicKey,
      epoch,
      runtime: "local-single-process",
      transport: new HorizonAnchorTransport(publicKey, { allowSending }),
      authorize: async (context) => context.actorId === actorId,
      ...(signer ? { signer } : {}),
      allowSending,
    });
    if (command === "list") {
      const records = await repository.list();
      const visible: object[] = [];
      for (const r of records) visible.push(summary(await service.get(r.id, actorId)));
      console.log(JSON.stringify(visible, null, 2));
      return;
    }
    if (!argument) throw new AnchorError("CONFIG", "Falta archivo o identificador");
    if (command === "request") {
      const path = resolve(argument);
      const input = JSON.parse(await readFile(path, "utf8")) as {
        entityId: string;
        version: string;
        idempotencyKey: string;
        kind: string;
        file?: string;
        conditions?: Record<string, import("../src/lib/stellar/anchor/types").Json>;
      };
      let content: AnchorContent;
      if (input.kind === "document" && typeof input.file === "string")
        content = { kind: "document", bytes: await readFile(resolve(dirname(path), input.file)) };
      else if (input.kind === "agreement" && input.conditions)
        content = { kind: "agreement", conditions: input.conditions };
      else throw new AnchorError("INVALID_CONTENT", "Manifiesto de documento o acuerdo inválido");
      console.log(
        JSON.stringify(
          summary(
            await service.request({
              entityId: input.entityId,
              version: input.version,
              idempotencyKey: input.idempotencyKey,
              actorId,
              content,
            }),
          ),
          null,
          2,
        ),
      );
    } else if (command === "verify") {
      const r = await service.get(argument, actorId);
      let content: AnchorContent | undefined;
      if (comparison) {
        const bytes = await readFile(resolve(comparison));
        content =
          r.identity.kind === "document"
            ? { kind: "document", bytes }
            : {
                kind: "agreement",
                conditions: JSON.parse(bytes.toString("utf8")) as Record<
                  string,
                  import("../src/lib/stellar/anchor/types").Json
                >,
              };
      }
      const result = await service.verify(argument, actorId, content);
      console.log(JSON.stringify(result, null, 2));
      if (result.result !== "matches") process.exitCode = 2;
    } else {
      const r =
        command === "prepare"
          ? await service.prepare(argument, actorId)
          : command === "submit"
            ? await service.submit(argument, actorId)
            : command === "reconcile"
              ? await service.reconcile(argument, actorId)
              : await service.get(argument, actorId);
      console.log(JSON.stringify(summary(r), null, 2));
      if ((command === "submit" || command === "reconcile") && r.state !== "confirmed")
        process.exitCode = 2;
    }
  } finally {
    await repository.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      error instanceof AnchorError
        ? { error: error.code, message: error.message }
        : {
            error: "LOCAL_ERROR",
            message:
              "No se completó la operación local; revisar configuración y archivos sin publicar secretos",
          },
    ),
  );
  process.exitCode = 1;
});
