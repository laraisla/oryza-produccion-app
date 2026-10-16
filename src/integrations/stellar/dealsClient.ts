import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { contractErrorFrom, StellarContractError } from './errors';
import type { StellarNetworkConfig } from './networks';
import { bytesToHex, hexToBytes } from './terms';

/** Firma transacciones sin exponer claves: Freighter en el navegador, Keypair en scripts. */
export interface TxSigner {
  address: string;
  signTransaction(txXdr: string, opts: { networkPassphrase: string; address: string }): Promise<string>;
}

export interface ConfirmedTx {
  hash: string;
  ledger: number;
  /** Unix (segundos) de cierre del ledger según el RPC. */
  createdAt: number;
  returnValue?: unknown;
}

export type OnChainDealStatus = 'CREATED' | 'ACCEPTED' | 'CANCELLED';

export interface OnChainDeal {
  seller: string;
  buyer: string;
  termsHash: string;
  termsVersion: number;
  status: OnChainDealStatus;
  createdAt: number;
  updatedAt: number;
  acceptedAt: number | null;
  proofCount: number;
}

export type TxLookup =
  | { status: 'SUCCESS'; ledger: number; createdAt: number }
  | { status: 'FAILED'; ledger: number; createdAt: number }
  | { status: 'NOT_FOUND' };

/** Cuenta nula para simulaciones de solo lectura (no requiere existir ni firmar). */
const NULL_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const STATUS_BY_CODE: Record<number, OnChainDealStatus> = {
  0: 'CREATED',
  1: 'ACCEPTED',
  2: 'CANCELLED',
};

function bytes32(hex: string): xdr.ScVal {
  const bytes = hexToBytes(hex);
  if (bytes.length !== 32) {
    throw new Error('Se esperaba un hash de 32 bytes (64 caracteres hex).');
  }
  return nativeToScVal(bytes);
}

function toNumber(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

function toHex(value: unknown): string {
  if (value instanceof Uint8Array) return bytesToHex(value);
  throw new Error('Valor binario inesperado en la respuesta del contrato.');
}

export function decodeDeal(native: Record<string, unknown>): OnChainDeal {
  const acceptedAt = toNumber(native.accepted_at);
  return {
    seller: String(native.seller),
    buyer: String(native.buyer),
    termsHash: toHex(native.terms_hash),
    termsVersion: toNumber(native.terms_version),
    status: STATUS_BY_CODE[toNumber(native.status)] ?? 'CREATED',
    createdAt: toNumber(native.created_at),
    updatedAt: toNumber(native.updated_at),
    acceptedAt: acceptedAt === 0 ? null : acceptedAt,
    proofCount: toNumber(native.proof_count),
  };
}

export class DealsContractClient {
  readonly server: rpc.Server;

  constructor(
    readonly network: StellarNetworkConfig,
    readonly contractId: string,
  ) {
    this.server = new rpc.Server(network.rpcUrl, { allowHttp: network.allowHttp });
  }

  createDeal(
    signer: TxSigner,
    params: { dealKey: string; buyer: string; termsHash: string; termsVersion: number },
  ): Promise<ConfirmedTx> {
    return this.invoke(signer, 'create_deal', [
      bytes32(params.dealKey),
      new Address(signer.address).toScVal(),
      new Address(params.buyer).toScVal(),
      bytes32(params.termsHash),
      nativeToScVal(params.termsVersion, { type: 'u32' }),
    ]);
  }

  amendTerms(
    signer: TxSigner,
    params: { dealKey: string; termsHash: string; termsVersion: number },
  ): Promise<ConfirmedTx> {
    return this.invoke(signer, 'amend_terms', [
      bytes32(params.dealKey),
      bytes32(params.termsHash),
      nativeToScVal(params.termsVersion, { type: 'u32' }),
    ]);
  }

  acceptDeal(signer: TxSigner, params: { dealKey: string; termsHash: string }): Promise<ConfirmedTx> {
    return this.invoke(signer, 'accept_deal', [bytes32(params.dealKey), bytes32(params.termsHash)]);
  }

  recordProof(
    signer: TxSigner,
    params: { dealKey: string; docHash: string; kind: string },
  ): Promise<ConfirmedTx> {
    return this.invoke(signer, 'record_proof', [
      bytes32(params.dealKey),
      new Address(signer.address).toScVal(),
      bytes32(params.docHash),
      nativeToScVal(params.kind, { type: 'symbol' }),
    ]);
  }

  /** Lectura pública vía simulación: no envía ninguna transacción. */
  async getDeal(dealKey: string): Promise<OnChainDeal | null> {
    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, '0'), {
      fee: BASE_FEE,
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(new Contract(this.contractId).call('get_deal', bytes32(dealKey)))
      .setTimeout(30)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      const err = contractErrorFrom(sim.error);
      if (err.code === 2) return null;
      throw err;
    }
    const retval = sim.result?.retval;
    if (!retval) return null;
    return decodeDeal(scValToNative(retval) as Record<string, unknown>);
  }

  async lookupTransaction(hash: string): Promise<TxLookup> {
    const res = await this.server.getTransaction(hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { status: 'SUCCESS', ledger: res.ledger, createdAt: Number(res.createdAt) };
    }
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      return { status: 'FAILED', ledger: res.ledger, createdAt: Number(res.createdAt) };
    }
    return { status: 'NOT_FOUND' };
  }

  /** Sube el wasm y crea una instancia del contrato (usado por el script de despliegue). */
  static async deploy(
    network: StellarNetworkConfig,
    signer: TxSigner,
    wasm: Uint8Array,
    salt: Uint8Array,
  ): Promise<{ contractId: string; wasmHash: string; uploadTx: ConfirmedTx; createTx: ConfirmedTx }> {
    const server = new rpc.Server(network.rpcUrl, { allowHttp: network.allowHttp });
    const uploadTx = await submit(server, network, signer, Operation.uploadContractWasm({ wasm }));
    const wasmHashBytes = uploadTx.returnValue;
    if (!(wasmHashBytes instanceof Uint8Array)) {
      throw new Error('La subida del wasm no devolvió el hash esperado.');
    }
    const createTx = await submit(
      server,
      network,
      signer,
      Operation.createCustomContract({
        address: new Address(signer.address),
        wasmHash: wasmHashBytes,
        salt,
      }),
    );
    const contractId = String(createTx.returnValue);
    if (!contractId.startsWith('C')) {
      throw new Error(`Identificador de contrato inesperado: ${contractId}`);
    }
    return { contractId, wasmHash: bytesToHex(wasmHashBytes), uploadTx, createTx };
  }

  private invoke(signer: TxSigner, method: string, args: xdr.ScVal[]): Promise<ConfirmedTx> {
    return submit(this.server, this.network, signer, new Contract(this.contractId).call(method, ...args));
  }
}

async function submit(
  server: rpc.Server,
  network: StellarNetworkConfig,
  signer: TxSigner,
  operation: xdr.Operation,
): Promise<ConfirmedTx> {
  const source = await server.getAccount(signer.address);
  const draft = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(120)
    .build();

  let prepared;
  try {
    prepared = await server.prepareTransaction(draft);
  } catch (error) {
    throw contractErrorFrom(error instanceof Error ? error.message : String(error));
  }

  const signedXdr = await signer.signTransaction(prepared.toXDR(), {
    networkPassphrase: network.networkPassphrase,
    address: signer.address,
  });
  const signed = TransactionBuilder.fromXDR(signedXdr, network.networkPassphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
    const detail = sent.errorResult ? sent.errorResult.result().switch().name : sent.status;
    throw new StellarContractError(`La red rechazó la transacción (${detail}).`);
  }

  const final = await server.pollTransaction(sent.hash, {
    attempts: 40,
    sleepStrategy: () => 1500,
  });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new StellarContractError(
      final.status === rpc.Api.GetTransactionStatus.FAILED
        ? `La transacción ${sent.hash} falló en la red.`
        : `La transacción ${sent.hash} no se confirmó a tiempo; verificar más tarde.`,
    );
  }
  return {
    hash: sent.hash,
    ledger: final.ledger,
    createdAt: Number(final.createdAt),
    returnValue: final.returnValue ? scValToNative(final.returnValue) : undefined,
  };
}
