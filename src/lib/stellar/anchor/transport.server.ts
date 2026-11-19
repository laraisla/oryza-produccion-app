import "@tanstack/react-start/server-only";
import { Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { ANCHOR_NETWORK, AnchorError, type AnchorTransport, type ChainTransaction } from "./types";
import { inspectEnvelope } from "./verify.server";
import { validateTechnicalAccount } from "./signer.server";

export const ANCHOR_HORIZON = "https://horizon-testnet.stellar.org";

/** Fixed HTTPS provider. No client-supplied URL, redirects, signing or funding. */
export class HorizonAnchorTransport implements AnchorTransport {
  constructor(
    private readonly publicKey: string,
    private readonly options: {
      fetch?: typeof fetch;
      timeoutMs?: number;
      horizonUrl?: string;
      allowSending?: boolean;
    } = {},
  ) {
    validateTechnicalAccount(publicKey);
    if (options.horizonUrl !== undefined && options.horizonUrl !== ANCHOR_HORIZON)
      throw new AnchorError("NETWORK", "Proveedor Testnet no permitido");
    if (
      options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) ||
        options.timeoutMs < 1 ||
        options.timeoutMs > 30_000)
    )
      throw new AnchorError("CONFIG", "Timeout inválido");
  }

  private async request(path: string, body?: string): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 8000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AnchorError("TIMEOUT", "Stellar Testnet no respondió a tiempo"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        timeout,
        (async () => {
          const response = await (this.options.fetch ?? fetch)(`${ANCHOR_HORIZON}${path}`, {
            method: body === undefined ? "GET" : "POST",
            headers:
              body === undefined
                ? { Accept: "application/json" }
                : {
                    Accept: "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
            ...(body !== undefined ? { body } : {}),
            redirect: "error",
            signal: controller.signal,
          });
          if (response.status === 404 && path.startsWith("/transactions/") && body === undefined)
            return null;
          if (!response.ok)
            throw new AnchorError("REMOTE", "Horizon rechazó la solicitud o no está disponible");
          const reader = response.body?.getReader();
          if (!reader) throw new AnchorError("REMOTE", "Respuesta de red incompleta");
          let size = 0;
          const chunks: Uint8Array[] = [];
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > 2 * 1024 * 1024) {
                controller.abort();
                throw new AnchorError("REMOTE", "Respuesta de red demasiado grande");
              }
              chunks.push(part.value);
            }
          } finally {
            reader.releaseLock();
          }
          const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw new AnchorError("REMOTE", "Respuesta de red inválida");
          return data as Record<string, unknown>;
        })(),
      ]);
    } catch (error) {
      if (error instanceof AnchorError) throw error;
      // Do not propagate exception text, provider bodies or config values into journals/logs.
      throw new AnchorError("REMOTE", "No se pudo completar la consulta a Stellar Testnet");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async network(): Promise<string> {
    const root = await this.request("/");
    if (root?.["network_passphrase"] !== ANCHOR_NETWORK)
      throw new AnchorError("NETWORK", "El proveedor no informa la red Testnet esperada");
    return ANCHOR_NETWORK;
  }
  async account(publicKey: string): Promise<{ sequence: string }> {
    if (publicKey !== this.publicKey) throw new AnchorError("POLICY", "Cuenta no permitida");
    const data = await this.request(`/accounts/${publicKey}`);
    if (
      data?.["account_id"] !== publicKey ||
      typeof data["sequence"] !== "string" ||
      !/^\d+$/.test(data["sequence"])
    )
      throw new AnchorError("REMOTE", "Cuenta o secuencia no verificable");
    return { sequence: data["sequence"] };
  }
  async submit(xdr: string): Promise<void> {
    if (this.options.allowSending !== true)
      throw new AnchorError("DISABLED", "Envío de anclajes deshabilitado");
    const tx = TransactionBuilder.fromXDR(xdr, ANCHOR_NETWORK);
    if (
      !(tx instanceof Transaction) ||
      tx.memo.type !== "hash" ||
      !(tx.memo.value instanceof Uint8Array)
    )
      throw new AnchorError("POLICY", "Transacción no permitida");
    inspectEnvelope(xdr, {
      signer: this.publicKey,
      digest: Buffer.from(tx.memo.value).toString("hex"),
    });
    await this.network();
    await this.request("/transactions", new URLSearchParams({ tx: xdr }).toString());
  }
  async lookup(hash: string): Promise<ChainTransaction | null> {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new AnchorError("POLICY", "Hash inválido");
    const data = await this.request(`/transactions/${hash}`);
    if (!data) return null;
    if (
      data["hash"] !== hash ||
      typeof data["envelope_xdr"] !== "string" ||
      typeof data["successful"] !== "boolean" ||
      typeof data["ledger"] !== "number" ||
      !Number.isSafeInteger(data["ledger"]) ||
      data["ledger"] <= 0 ||
      typeof data["created_at"] !== "string" ||
      !Number.isFinite(Date.parse(data["created_at"]))
    )
      throw new AnchorError("REMOTE", "Transacción de red incompleta");
    return {
      hash,
      xdr: data["envelope_xdr"],
      successful: data["successful"],
      ledger: data["ledger"],
      createdAt: data["created_at"],
    };
  }
  async latestLedgerTime(): Promise<number> {
    const data = await this.request("/ledgers?order=desc&limit=1");
    const records = (data?.["_embedded"] as { records?: { closed_at?: string }[] } | undefined)
      ?.records;
    const time = Date.parse(records?.[0]?.closed_at ?? "") / 1000;
    if (!Number.isSafeInteger(time) || time <= 0)
      throw new AnchorError("REMOTE", "Ledger no verificable");
    return time;
  }
}
