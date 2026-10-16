export type StellarNetworkId = 'testnet' | 'local';

export interface StellarNetworkConfig {
  id: StellarNetworkId;
  label: string;
  rpcUrl: string;
  networkPassphrase: string;
  friendbotUrl?: string;
  /** Base del explorador público; la red local no tiene explorador. */
  explorerBaseUrl?: string;
  allowHttp: boolean;
}

export const STELLAR_NETWORKS: Record<StellarNetworkId, StellarNetworkConfig> = {
  testnet: {
    id: 'testnet',
    label: 'Stellar Testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    friendbotUrl: 'https://friendbot.stellar.org',
    explorerBaseUrl: 'https://stellar.expert/explorer/testnet',
    allowHttp: false,
  },
  local: {
    id: 'local',
    label: 'Red local (stellar/quickstart)',
    rpcUrl: 'http://localhost:8000/rpc',
    networkPassphrase: 'Standalone Network ; February 2017',
    friendbotUrl: 'http://localhost:8000/friendbot',
    allowHttp: true,
  },
};

export function explorerTxUrl(network: StellarNetworkConfig, hash: string): string | undefined {
  return network.explorerBaseUrl ? `${network.explorerBaseUrl}/tx/${hash}` : undefined;
}

export function explorerContractUrl(network: StellarNetworkConfig, contractId: string): string | undefined {
  return network.explorerBaseUrl ? `${network.explorerBaseUrl}/contract/${contractId}` : undefined;
}

export function explorerAccountUrl(network: StellarNetworkConfig, address: string): string | undefined {
  return network.explorerBaseUrl ? `${network.explorerBaseUrl}/account/${address}` : undefined;
}
