import "@tanstack/react-start/server-only";
import { spawn } from "node:child_process";
import { basename, isAbsolute } from "node:path";
import { StrKey } from "@stellar/stellar-sdk";
import { validateTechnicalAccount } from "./signer.server";
import { inspectEnvelope } from "./verify.server";
import { ANCHOR_NETWORK, AnchorError, type AnchorTransactionSigner } from "./types";

/**
 * External signer backed by the official Stellar CLI (`stellar tx sign --sign-with-key`).
 * The identity lives in the OS secure store (Windows Credential Manager, Keychain, ...):
 * this process only sends the unsigned XDR on stdin and receives the signed XDR on stdout.
 * It never reads, exports, derives or prints the private key, and discards CLI stderr.
 */

export interface ProcessResult {
  code: number | null;
  stdout: string;
  timedOut: boolean;
  overflow: boolean;
  spawnError: boolean;
}
export type ProcessRunner = (
  executable: string,
  args: readonly string[],
  input: string,
  options: { env: NodeJS.ProcessEnv; timeoutMs: number; maxOutput: number },
) => Promise<ProcessResult>;

/** No shell, fixed argv, stdin input, bounded stdout, stderr dropped, hard timeout. */
export const runProcess: ProcessRunner = (executable, args, input, options) =>
  new Promise((resolve) => {
    let stdout = "",
      size = 0,
      overflow = false,
      timedOut = false,
      settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, [...args], {
        env: options.env,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve({ code: null, stdout: "", timedOut: false, overflow: false, spawnError: true });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    const finish = (code: number | null, spawnError: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout: overflow ? "" : stdout, timedOut, overflow, spawnError });
    };
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      size += chunk.length;
      if (size > options.maxOutput) {
        overflow = true;
        child.kill();
      } else stdout += chunk;
    });
    child.stderr!.on("data", () => {
      /* Discarded on purpose: never surfaced, logged or returned. */
    });
    child.on("error", () => finish(null, true));
    child.on("close", (code) => finish(code, false));
    child.stdin!.on("error", () => {
      /* A closed pipe is reported through the exit code. */
    });
    child.stdin!.end(input);
  });

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_OUTPUT = 16_384;

/** Child environment without any Stellar/anchor variable that could change key or network. */
export function signerEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env))
    if (!/^STELLAR_/i.test(k) && !/^RUST_LOG$/i.test(k) && v !== undefined) clean[k] = v;
  return clean;
}

export class StellarCliSigner implements AnchorTransactionSigner {
  readonly publicKey: string;
  readonly identity: string;
  readonly #executable: string;
  readonly #run: ProcessRunner;
  readonly #timeoutMs: number;
  readonly #env: NodeJS.ProcessEnv;

  constructor(config: {
    publicKey: string;
    identity: string;
    executable?: string;
    run?: ProcessRunner;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
  }) {
    validateTechnicalAccount(config.publicKey);
    const identity = config.identity;
    // --sign-with-key also accepts raw secrets and seed phrases: only a named identity is allowed.
    if (
      typeof identity !== "string" ||
      !IDENTITY.test(identity) ||
      StrKey.isValidEd25519SecretSeed(identity) ||
      /^S[A-Z2-7]{55}$/.test(identity)
    )
      throw new AnchorError("CONFIG", "Identidad de Stellar CLI inválida: usar solo su nombre");
    const executable = config.executable ?? "stellar";
    if (
      executable !== "stellar" &&
      (!isAbsolute(executable) || !/^stellar(\.exe)?$/i.test(basename(executable)))
    )
      throw new AnchorError("CONFIG", "Ruta de Stellar CLI inválida");
    const timeoutMs = config.timeoutMs ?? 20_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
      throw new AnchorError("CONFIG", "Tiempo límite de firma inválido");
    this.publicKey = config.publicKey;
    this.identity = identity;
    this.#executable = executable;
    this.#run = config.run ?? runProcess;
    this.#timeoutMs = timeoutMs;
    this.#env = signerEnvironment(config.env ?? process.env);
  }

  static fromEnvironment(
    env: Record<string, string | undefined> = process.env,
    run?: ProcessRunner,
  ): StellarCliSigner {
    const publicKey = env["STELLAR_ANCHOR_PUBLIC_KEY"],
      identity = env["STELLAR_ANCHOR_CLI_IDENTITY"],
      executable = env["STELLAR_ANCHOR_CLI_PATH"];
    if (!publicKey || !identity)
      throw new AnchorError("CONFIG", "Falta la cuenta pública o la identidad de Stellar CLI");
    if (env["STELLAR_ANCHOR_SECRET"])
      throw new AnchorError(
        "CONFIG",
        "Con firma externa no debe haber un secreto de anclaje en el entorno",
      );
    return new StellarCliSigner({
      publicKey,
      identity,
      ...(executable ? { executable } : {}),
      ...(run ? { run } : {}),
    });
  }

  async #exec(args: readonly string[], input: string): Promise<string> {
    const r = await this.#run(this.#executable, args, input, {
      env: this.#env,
      timeoutMs: this.#timeoutMs,
      maxOutput: MAX_OUTPUT,
    });
    if (r.spawnError) throw new AnchorError("SIGNER", "No se pudo ejecutar Stellar CLI");
    if (r.timedOut) throw new AnchorError("TIMEOUT", "Stellar CLI no respondió a tiempo");
    if (r.overflow || r.code !== 0)
      throw new AnchorError("SIGNER", "Stellar CLI rechazó o no completó la operación");
    return r.stdout.trim();
  }

  /** Confirms the CLI identity resolves to the configured account. Reads only the public key. */
  async checkIdentity(): Promise<void> {
    const pk = await this.#exec(["keys", "public-key", this.identity, "--quiet"], "");
    if (pk !== this.publicKey)
      throw new AnchorError("CONFIG", "La identidad de Stellar CLI no corresponde a la cuenta");
  }

  async sign(unsignedXdr: string, digest: string, now = Math.floor(Date.now() / 1000)) {
    const expected = { signer: this.publicKey, digest };
    const before = inspectEnvelope(unsignedXdr, expected, false);
    if (
      !Number.isSafeInteger(now) ||
      Number(before.timeBounds!.maxTime) <= now ||
      Number(before.timeBounds!.minTime) > now
    )
      throw new AnchorError("POLICY", "Transacción fuera de su ventana de firma");
    const out = await this.#exec(
      [
        "tx",
        "sign",
        "--sign-with-key",
        this.identity,
        "--network-passphrase",
        ANCHOR_NETWORK,
        "--quiet",
      ],
      unsignedXdr,
    );
    if (!out || out.length > MAX_OUTPUT || !BASE64.test(out))
      throw new AnchorError("SIGNER", "Stellar CLI devolvió un sobre ilegible");
    // Full policy + exactly one valid signature by the authorized account on Testnet.
    const after = inspectEnvelope(out, expected, true);
    // signatureBase = network id + envelope type + full transaction body (fee, seq, bounds, memo, ops).
    if (
      !Buffer.from(after.hash()).equals(Buffer.from(before.hash())) ||
      !Buffer.from(after.signatureBase()).equals(Buffer.from(before.signatureBase()))
    )
      throw new AnchorError("POLICY", "Stellar CLI devolvió una transacción distinta");
    return out;
  }
}
