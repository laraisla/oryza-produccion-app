/**
 * Despliega contracts/agromatch_deals en la red elegida.
 *   npm run build:contract
 *   npm run stellar:deploy -- --network testnet   (o --network local)
 * Resultado público (sin secretos): deployments/<red>.json
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DealsContractClient } from '../../src/integrations/stellar/dealsClient';
import { explorerContractUrl, explorerTxUrl } from '../../src/integrations/stellar/networks';
import {
  ROOT,
  deploymentPath,
  keypairSigner,
  loadOrCreateAccount,
  selectedNetwork,
  writeJson,
  type DeploymentRecord,
} from './common';

const WASM = resolve(ROOT, 'contracts/target/wasm32v1-none/release/agromatch_deals.wasm');

async function main() {
  const network = selectedNetwork();
  if (!existsSync(WASM)) {
    throw new Error(`No se encontró ${WASM}. Ejecutar antes: npm run build:contract`);
  }
  const wasm = readFileSync(WASM);
  console.log(`Red: ${network.label} (${network.rpcUrl})`);
  console.log(`Wasm: ${wasm.length} bytes, sha256 ${createHash('sha256').update(wasm).digest('hex')}`);

  const deployer = await loadOrCreateAccount(network, 'deployer');
  console.log(`Desplegador: ${deployer.publicKey()}`);

  const result = await DealsContractClient.deploy(network, keypairSigner(deployer), wasm, randomBytes(32));
  const record: DeploymentRecord = {
    network: network.id,
    networkPassphrase: network.networkPassphrase,
    rpcUrl: network.rpcUrl,
    contractId: result.contractId,
    wasmHash: result.wasmHash,
    deployer: deployer.publicKey(),
    uploadTx: pick(result.uploadTx),
    createTx: pick(result.createTx),
    deployedAt: new Date(result.createTx.createdAt * 1000).toISOString(),
    explorer: network.explorerBaseUrl
      ? {
          contract: explorerContractUrl(network, result.contractId),
          uploadTx: explorerTxUrl(network, result.uploadTx.hash),
          createTx: explorerTxUrl(network, result.createTx.hash),
        }
      : undefined,
  };
  writeJson(deploymentPath(network), record);
  console.log(`Contrato desplegado: ${record.contractId}`);
  console.log(`  subida wasm  tx ${record.uploadTx.hash} (ledger ${record.uploadTx.ledger})`);
  console.log(`  creación     tx ${record.createTx.hash} (ledger ${record.createTx.ledger})`);
  console.log(`Registro guardado en ${deploymentPath(network)}`);
}

function pick(tx: { hash: string; ledger: number; createdAt: number }) {
  return { hash: tx.hash, ledger: tx.ledger, createdAt: tx.createdAt };
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
