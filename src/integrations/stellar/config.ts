import type { AppSettings } from '@/data/model';
import type { DeploymentRecord, EvidenceFile } from './evidence';
import { STELLAR_NETWORKS, type StellarNetworkConfig, type StellarNetworkId } from './networks';

/**
 * Registros públicos generados por los scripts (deployments/*.json). Solo contienen
 * IDs de contrato, hashes de transacciones confirmadas y direcciones públicas.
 */
const files = import.meta.glob('/deployments/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function deploymentFor(network: StellarNetworkId): DeploymentRecord | null {
  return (files[`/deployments/${network}.json`] as DeploymentRecord | undefined) ?? null;
}

export function evidenceFor(network: StellarNetworkId): EvidenceFile | null {
  return (files[`/deployments/${network}-evidence.json`] as EvidenceFile | undefined) ?? null;
}

export interface StellarRuntime {
  network: StellarNetworkConfig;
  contractId: string | null;
  contractSource: 'settings' | 'deployment' | null;
  deployment: DeploymentRecord | null;
  evidence: EvidenceFile | null;
}

export function stellarRuntime(settings: AppSettings['stellar']): StellarRuntime {
  const base = STELLAR_NETWORKS[settings.network];
  const deployment = deploymentFor(settings.network);
  const contractId = settings.contractId || deployment?.contractId || null;
  return {
    network: { ...base, rpcUrl: settings.rpcUrl || deployment?.rpcUrl || base.rpcUrl },
    contractId,
    contractSource: settings.contractId ? 'settings' : deployment ? 'deployment' : null,
    deployment,
    evidence: evidenceFor(settings.network),
  };
}
