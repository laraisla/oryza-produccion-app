import { getNetworkDetails, isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import type { TxSigner } from './dealsClient';

export class FreighterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FreighterError';
  }
}

/** Conecta la billetera Freighter: la clave privada nunca sale de la extensión. */
export async function connectFreighter(): Promise<{ address: string; networkPassphrase: string; network: string }> {
  const connected = await isConnected();
  if (connected.error || !connected.isConnected) {
    throw new FreighterError('Freighter no está instalada o no responde. Instalar la extensión desde freighter.app.');
  }
  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new FreighterError(access.error?.message ?? 'El usuario no autorizó el acceso a la cuenta.');
  }
  const details = await getNetworkDetails();
  if (details.error) throw new FreighterError(details.error.message ?? 'No se pudo leer la red de Freighter.');
  return { address: access.address, networkPassphrase: details.networkPassphrase, network: details.network };
}

export function freighterSigner(address: string): TxSigner {
  return {
    address,
    async signTransaction(txXdr, opts) {
      const res = await signTransaction(txXdr, { networkPassphrase: opts.networkPassphrase, address: opts.address });
      if (res.error || !res.signedTxXdr) {
        throw new FreighterError(res.error?.message ?? 'Firma rechazada en Freighter.');
      }
      return res.signedTxXdr;
    },
  };
}
