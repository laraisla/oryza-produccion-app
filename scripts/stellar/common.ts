import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TxSigner } from '../../src/integrations/stellar/dealsClient';
import { STELLAR_NETWORKS, type StellarNetworkConfig, type StellarNetworkId } from '../../src/integrations/stellar/networks';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function selectedNetwork(): StellarNetworkConfig {
  const id = (argValue('network') ?? process.env.STELLAR_NETWORK ?? 'testnet') as StellarNetworkId;
  const base = STELLAR_NETWORKS[id];
  if (!base) {
    throw new Error(`Red desconocida: ${id}. Opciones: ${Object.keys(STELLAR_NETWORKS).join(', ')}`);
  }
  const rpcUrl = process.env.STELLAR_RPC_URL ?? base.rpcUrl;
  return { ...base, rpcUrl };
}

/**
 * Claves de cuentas de prueba. Orden de búsqueda:
 * 1) variable de entorno AGROMATCH_<NOMBRE>_SECRET,
 * 2) archivo local .stellar/<red>/<nombre>.secret (ignorado por git, permisos 0600),
 * 3) generación de una cuenta nueva financiada con friendbot (solo testnet/local).
 * Los secretos nunca se imprimen ni se escriben en deployments/.
 */
export async function loadOrCreateAccount(network: StellarNetworkConfig, name: string): Promise<Keypair> {
  const envSecret = process.env[`AGROMATCH_${name.toUpperCase()}_SECRET`];
  if (envSecret) return Keypair.fromSecret(envSecret);

  const file = resolve(ROOT, '.stellar', network.id, `${name}.secret`);
  if (existsSync(file)) return Keypair.fromSecret(readFileSync(file, 'utf8').trim());

  const keypair = Keypair.random();
  await fund(network, keypair.publicKey());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${keypair.secret()}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`  cuenta "${name}" creada y financiada: ${keypair.publicKey()}`);
  return keypair;
}

async function fund(network: StellarNetworkConfig, address: string): Promise<void> {
  if (!network.friendbotUrl) throw new Error('La red no tiene friendbot configurado.');
  const res = await fetch(`${network.friendbotUrl}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    throw new Error(`Friendbot respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export function keypairSigner(keypair: Keypair): TxSigner {
  return {
    address: keypair.publicKey(),
    async signTransaction(txXdr, { networkPassphrase }) {
      const tx = TransactionBuilder.fromXDR(txXdr, networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  };
}

export interface DeploymentRecord {
  network: StellarNetworkId;
  networkPassphrase: string;
  rpcUrl: string;
  contractId: string;
  wasmHash: string;
  deployer: string;
  uploadTx: { hash: string; ledger: number; createdAt: number };
  createTx: { hash: string; ledger: number; createdAt: number };
  deployedAt: string;
  explorer?: { contract?: string; uploadTx?: string; createTx?: string };
}

export function deploymentPath(network: StellarNetworkConfig): string {
  return resolve(ROOT, 'deployments', `${network.id}.json`);
}

export function evidencePath(network: StellarNetworkConfig): string {
  return resolve(ROOT, 'deployments', `${network.id}-evidence.json`);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
