/**
 * Verifica contra el RPC que cada transacción registrada en deployments/<red>-evidence.json
 * existe y fue exitosa, y que el estado on-chain coincide con el hash de términos.
 *   npm run stellar:verify -- --network testnet
 */
import { existsSync } from 'node:fs';
import { DealsContractClient } from '../../src/integrations/stellar/dealsClient';
import { deploymentPath, evidencePath, readJson, selectedNetwork, type DeploymentRecord } from './common';
import type { EvidenceFile } from '../../src/integrations/stellar/evidence';

async function main() {
  const network = selectedNetwork();
  const deployment = readJson<DeploymentRecord>(deploymentPath(network));
  const client = new DealsContractClient(network, deployment.contractId);
  let failures = 0;

  for (const tx of [deployment.uploadTx, deployment.createTx]) {
    const res = await client.lookupTransaction(tx.hash);
    console.log(`despliegue ${tx.hash}: ${res.status}`);
    if (res.status !== 'SUCCESS') failures += 1;
  }

  const file = evidencePath(network);
  if (existsSync(file)) {
    const evidence = readJson<EvidenceFile>(file);
    for (const record of evidence.records) {
      for (const tx of record.transactions) {
        const res = await client.lookupTransaction(tx.hash);
        console.log(`${record.operationCode ?? record.operationId} ${tx.action} ${tx.hash}: ${res.status}`);
        if (res.status !== 'SUCCESS') failures += 1;
      }
      const deal = await client.getDeal(record.dealKey);
      const ok = deal?.termsHash === record.termsHash;
      console.log(`  estado on-chain ${deal?.status ?? 'NO ENCONTRADO'} · hash ${ok ? 'coincide' : 'NO coincide'}`);
      if (!ok) failures += 1;
    }
  }
  if (failures > 0) {
    console.error(`${failures} verificaciones fallidas`);
    process.exit(1);
  }
  console.log('Todas las evidencias verificadas contra la red.');
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
