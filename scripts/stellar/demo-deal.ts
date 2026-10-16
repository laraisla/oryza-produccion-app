/**
 * Registra en Stellar el hash de una versión de acuerdo y su aceptación.
 *   npm run stellar:demo -- --network testnet
 *   npm run stellar:demo -- --network testnet --terms terminos.json --operation <uuid>
 * Sin --terms usa la operación demo del seed (la misma que muestra la app), así el
 * hash on-chain coincide con el que la interfaz recalcula desde sus datos.
 * Escribe evidencia pública (sin secretos) en deployments/<red>-evidence.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { DealsContractClient, type ConfirmedTx } from '../../src/integrations/stellar/dealsClient';
import { explorerTxUrl } from '../../src/integrations/stellar/networks';
import type { EvidenceFile, EvidenceRecord, EvidenceTx } from '../../src/integrations/stellar/evidence';
import { dealKeyFor, termsHashFor, type CanonicalValue } from '../../src/integrations/stellar/terms';
import {
  argValue,
  deploymentPath,
  evidencePath,
  keypairSigner,
  loadOrCreateAccount,
  readJson,
  selectedNetwork,
  writeJson,
  type DeploymentRecord,
} from './common';

async function loadTerms(): Promise<{
  operationId: string;
  operationCode?: string;
  quotationVersionId?: string;
  termsVersion: number;
  terms: CanonicalValue;
}> {
  const termsFile = argValue('terms');
  if (termsFile) {
    const operationId = argValue('operation');
    if (!operationId) throw new Error('Con --terms también se requiere --operation <id>.');
    return {
      operationId,
      termsVersion: Number(argValue('version') ?? 1),
      terms: JSON.parse(readFileSync(termsFile, 'utf8')) as CanonicalValue,
    };
  }
  const { demoAgreement } = await import('../../src/data/demoAgreement');
  return demoAgreement();
}

async function main() {
  const network = selectedNetwork();
  const deploymentFile = deploymentPath(network);
  if (!existsSync(deploymentFile)) {
    throw new Error(`Falta ${deploymentFile}. Ejecutar antes: npm run stellar:deploy -- --network ${network.id}`);
  }
  const deployment = readJson<DeploymentRecord>(deploymentFile);
  const client = new DealsContractClient(network, deployment.contractId);
  const { operationId, operationCode, quotationVersionId, termsVersion, terms } = await loadTerms();
  const dealKey = await dealKeyFor(operationId);
  const termsHash = await termsHashFor(terms);

  console.log(`Red: ${network.label} · contrato ${deployment.contractId}`);
  console.log(`Operación ${operationCode ?? operationId}`);
  console.log(`  deal_key   ${dealKey}`);
  console.log(`  terms_hash ${termsHash} (versión ${termsVersion})`);

  const seller = await loadOrCreateAccount(network, 'seller');
  const buyer = await loadOrCreateAccount(network, 'buyer');
  console.log(`Vendedor ${seller.publicKey()}`);
  console.log(`Comprador ${buyer.publicKey()}`);

  const transactions: EvidenceTx[] = [];
  const record = (action: EvidenceTx['action'], tx: ConfirmedTx) => {
    transactions.push({
      action,
      hash: tx.hash,
      ledger: tx.ledger,
      createdAt: tx.createdAt,
      status: 'SUCCESS',
      explorerUrl: explorerTxUrl(network, tx.hash),
    });
    console.log(`  ${action} confirmada: ${tx.hash} (ledger ${tx.ledger})`);
  };

  let current = await client.getDeal(dealKey);
  if (current && current.termsHash !== termsHash) {
    throw new Error('Ya existe un acuerdo para esa operación con otro hash de términos; no se modifica.');
  }
  if (!current) {
    record(
      'create_deal',
      await client.createDeal(keypairSigner(seller), { dealKey, buyer: buyer.publicKey(), termsHash, termsVersion }),
    );
    current = await client.getDeal(dealKey);
  }
  if (current?.status === 'CREATED') {
    record('accept_deal', await client.acceptDeal(keypairSigner(buyer), { dealKey, termsHash }));
    current = await client.getDeal(dealKey);
  }
  if (!current) throw new Error('El contrato no devolvió el acuerdo luego de registrarlo.');
  console.log(`Estado on-chain: ${current.status}`);

  const file = evidencePath(network);
  const evidence: EvidenceFile = existsSync(file)
    ? readJson<EvidenceFile>(file)
    : { network: network.id, contractId: deployment.contractId, records: [] };
  if (evidence.contractId !== deployment.contractId) {
    evidence.contractId = deployment.contractId;
    evidence.records = [];
  }
  const previous = evidence.records.find((r) => r.dealKey === dealKey);
  const entry: EvidenceRecord = {
    operationId,
    operationCode,
    quotationVersionId,
    dealKey,
    termsHash,
    termsVersion: current.termsVersion,
    seller: current.seller,
    buyer: current.buyer,
    transactions: [...(previous?.transactions ?? []), ...transactions],
    onChainStatus: current.status,
    checkedAt: new Date().toISOString(),
  };
  evidence.records = [...evidence.records.filter((r) => r.dealKey !== dealKey), entry];
  writeJson(file, evidence);
  console.log(`Evidencia guardada en ${file}`);
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
