// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "./anchor-fixtures";

const active: Awaited<ReturnType<typeof fixture>>[] = [];
afterEach(async () => {
  for (const f of active.splice(0)) await f.cleanup();
});

describe("actual Bun CLI, offline and ephemeral account only", () => {
  it("requests, prepares, reloads and verifies in separate processes without sending or loading dotenv", async () => {
    const f = await fixture();
    active.push(f);
    await f.repo.close();
    const cli = resolve("scripts/stellar-anchor-demo.ts");
    const preload = join(f.directory, "offline-preload.mjs");
    await writeFile(
      join(f.directory, ".env"),
      "STELLAR_ANCHOR_TEST_ENV_FILE_MARKER=must-not-load\n",
    );
    await writeFile(join(f.directory, "sample.txt"), "Fictitious CLI document\n");
    await writeFile(join(f.directory, "altered.txt"), "Fictitious CLI document!\n");
    const manifest = join(f.directory, "request.json");
    await writeFile(
      manifest,
      JSON.stringify({
        entityId: "cli-demo",
        version: "1",
        idempotencyKey: "cli-demo-v1",
        kind: "document",
        file: "sample.txt",
      }),
    );
    await writeFile(
      preload,
      `
      import { readFile } from 'node:fs/promises';
      import { join } from 'node:path';
      if (process.env.STELLAR_ANCHOR_TEST_ENV_FILE_MARKER) throw new Error('dotenv loaded');
      globalThis.fetch = async (url, init) => {
        if (init?.method !== 'GET') throw new Error('All network writes forbidden by CLI test');
        const u = new URL(String(url));
        if (u.origin !== 'https://horizon-testnet.stellar.org') throw new Error('Unexpected host');
        if (u.pathname === '/') return Response.json({network_passphrase:'Test SDF Network ; September 2015'});
        if (u.pathname === '/accounts/' + process.env.STELLAR_ANCHOR_PUBLIC_KEY) return Response.json({account_id:process.env.STELLAR_ANCHOR_PUBLIC_KEY,sequence:'10'});
        if (u.pathname.startsWith('/transactions/')) {
          const journal = JSON.parse(await readFile(join(process.env.STELLAR_ANCHOR_DIRECTORY,'evidence.json'),'utf8'));
          const a = journal.records[0].attempts[0];
          return Response.json({hash:a.hash,envelope_xdr:a.xdr,successful:true,ledger:7,created_at:new Date().toISOString()});
        }
        throw new Error('Unexpected GET');
      };
    `,
    );
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      STELLAR_ANCHOR_DEMO: "1",
      STELLAR_ANCHOR_PUBLIC_KEY: f.key.publicKey(),
      STELLAR_ANCHOR_EPOCH: "cli-offline-test",
      STELLAR_ANCHOR_DIRECTORY: f.directory,
      STELLAR_ANCHOR_ENABLED: "0",
    };
    delete environment["STELLAR_ANCHOR_SECRET"];
    delete environment["STELLAR_ANCHOR_TEST_ENV_FILE_MARKER"];
    delete environment["VERCEL"];
    delete environment["CF_PAGES"];
    const run = (args: string[], signing = false) => {
      const result = spawnSync("bun", ["--no-env-file", "--preload", preload, cli, ...args], {
        cwd: f.directory,
        env: { ...environment, ...(signing ? { STELLAR_ANCHOR_SECRET: f.key.secret() } : {}) },
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.stdout + result.stderr).not.toContain(f.key.secret());
      return result;
    };
    const first = run(["request", manifest]);
    expect(first.status).toBe(0);
    const id = (JSON.parse(first.stdout) as { id: string }).id;
    expect(JSON.parse(run(["request", manifest]).stdout).id).toBe(id);
    const prepared = run(["prepare", id], true);
    expect(prepared.status).toBe(0);
    expect(JSON.parse(prepared.stdout).state).toBe("prepared");
    const status = run(["status", id]);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout).submissions).toBe(0);
    const disabled = run(["submit", id]);
    expect(disabled.status).toBe(1);
    expect(JSON.parse(disabled.stderr).error).toBe("DISABLED");
    const verified = run(["verify", id, join(f.directory, "sample.txt")]);
    expect(verified.status).toBe(0);
    expect(JSON.parse(verified.stdout).result).toBe("matches");
    const altered = run(["verify", id, join(f.directory, "altered.txt")]);
    expect(altered.status).toBe(2);
    expect(JSON.parse(altered.stdout).checks.content).toBe(false);
    const journal = JSON.parse(await readFile(join(f.directory, "evidence.json"), "utf8"));
    expect(journal.records[0].attempts[0].submissions).toBe(0);
  });

  it("stellar-cli signer mode fails closed before any network access or signing", async () => {
    const f = await fixture();
    active.push(f);
    await f.repo.close();
    const cli = resolve("scripts/stellar-anchor-demo.ts");
    const preload = join(f.directory, "no-network-preload.mjs");
    await writeFile(
      preload,
      "globalThis.fetch = async () => { throw new Error('Network forbidden by CLI test'); };\n",
    );
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      STELLAR_ANCHOR_DEMO: "1",
      STELLAR_ANCHOR_PUBLIC_KEY: f.key.publicKey(),
      STELLAR_ANCHOR_EPOCH: "cli-offline-test",
      STELLAR_ANCHOR_DIRECTORY: f.directory,
      STELLAR_ANCHOR_ENABLED: "0",
      STELLAR_ANCHOR_SIGNER: "stellar-cli",
      STELLAR_ANCHOR_CLI_IDENTITY: "agroglobal-anchor-test-identity",
      // Absolute path to a stellar.exe that does not exist: the real CLI is never invoked.
      STELLAR_ANCHOR_CLI_PATH: join(f.directory, "missing", "stellar.exe"),
    };
    delete environment["STELLAR_ANCHOR_SECRET"];
    delete environment["VERCEL"];
    delete environment["CF_PAGES"];
    const run = (extra: NodeJS.ProcessEnv) => {
      const result = spawnSync(
        "bun",
        ["--no-env-file", "--preload", preload, cli, "prepare", "any-id"],
        {
          cwd: f.directory,
          env: { ...environment, ...extra },
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.stdout + result.stderr).not.toContain(f.key.secret());
      expect(result.status).toBe(1);
      return JSON.parse(result.stderr) as { error: string };
    };
    expect(run({}).error).toBe("SIGNER");
    expect(run({ STELLAR_ANCHOR_SECRET: f.key.secret() }).error).toBe("CONFIG");
    expect(run({ STELLAR_ANCHOR_SIGNER: "lab" }).error).toBe("CONFIG");
    expect(run({ STELLAR_ANCHOR_CLI_IDENTITY: f.key.secret() }).error).toBe("CONFIG");
    expect(run({ STELLAR_ANCHOR_CLI_PATH: "stellar.exe" }).error).toBe("CONFIG");
  });
});
