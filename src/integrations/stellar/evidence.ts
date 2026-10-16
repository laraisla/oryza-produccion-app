import type { StellarNetworkId } from './networks';

/** Registro público de despliegue (sin secretos) escrito por scripts/stellar/deploy.ts. */
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

export interface EvidenceTx {
  action: 'create_deal' | 'accept_deal';
  hash: string;
  ledger: number;
  createdAt: number;
  /** Solo se escriben transacciones con estado SUCCESS confirmado por el RPC. */
  status: 'SUCCESS';
  explorerUrl?: string;
}

export interface EvidenceRecord {
  operationId: string;
  operationCode?: string;
  quotationVersionId?: string;
  dealKey: string;
  termsHash: string;
  termsVersion: number;
  seller: string;
  buyer: string;
  transactions: EvidenceTx[];
  onChainStatus: string;
  checkedAt: string;
}

export interface EvidenceFile {
  network: string;
  contractId: string;
  records: EvidenceRecord[];
}
