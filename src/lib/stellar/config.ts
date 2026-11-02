// ============================================================
// Configuración pública de Stellar TESTNET y acuerdos de referencia.
// Fuente: blockchain/deployments/testnet.json (generado por los
// scripts de despliegue). Solo direcciones públicas: nunca claves.
// Se usa en navegador y servidor.
// ============================================================

import deployment from "../../../blockchain/deployments/testnet.json";
import ordenExportacion from "../../../blockchain/demo/orden-demo.json";
import ordenLocal from "../../../blockchain/demo/orden-demo-local.json";
import type { CondicionesOrden, TipoOperacion } from "@/lib/stellar/terms";

export const AVISO_TESTNET = "Stellar Testnet — Demostración con activos sin valor monetario real";

export const STELLAR = {
  red: "testnet" as const,
  networkPassphrase: deployment.networkPassphrase,
  rpcUrl: deployment.rpcUrl,
  horizonUrl: "https://horizon-testnet.stellar.org",
  contractId: deployment.contractId,
  deployLedger: deployment.deployLedger,
  wasmSha256: deployment.wasmSha256,
  activo: deployment.testAsset,
  cuentas: deployment.accounts,
  desplegadoEn: deployment.deployedAt,
  despliegue: deployment.deployTransactions as Record<string, { hash: string; url: string }>,
  decimales: 7,
};

const EXPLORER = "https://stellar.expert/explorer/testnet";
export const explorer = {
  tx: (hash: string) => `${EXPLORER}/tx/${hash}`,
  contrato: (id: string) => `${EXPLORER}/contract/${id}`,
  cuenta: (id: string) => `${EXPLORER}/account/${id}`,
};

export type EtapaAcuerdo = "create" | "accept" | "deposit" | "release" | "refund" | "cancel";

export const ETAPAS: Record<EtapaAcuerdo, string> = {
  create: "Acuerdo creado (firma comprador)",
  accept: "Condiciones aceptadas (firma vendedor)",
  deposit: "Depósito en garantía (comprador → contrato)",
  release: "Fondos liberados al vendedor",
  refund: "Fondos reembolsados al comprador",
  cancel: "Acuerdo cancelado",
};

/** Registro local (AgroGlobal) de un acuerdo enviado a Testnet. No es prueba por sí mismo. */
export interface AcuerdoStellar {
  id: number;
  contractId: string;
  orderRef: string;
  tipo: TipoOperacion;
  condiciones: CondicionesOrden;
  termsHash: string;
  montoUnidades: string; // en unidades mínimas (7 decimales)
  transacciones: { etapa: EtapaAcuerdo; hash: string }[];
  operacionId?: string | undefined;
  productoId?: string | undefined;
  origen: "script" | "app";
  registradoEn: string;
}

const ORDENES_DEMO: Record<string, CondicionesOrden> = {
  [ordenExportacion.orden]: ordenExportacion as CondicionesOrden,
  [ordenLocal.orden]: ordenLocal as CondicionesOrden,
};

/** Acuerdos ejecutados por blockchain/scripts/demo-flow.sh (registro de referencia). */
export const ACUERDOS_REFERENCIA: AcuerdoStellar[] = deployment.agreements
  .filter((a) => ORDENES_DEMO[a.orderRef])
  .map((a) => ({
    id: a.id,
    contractId: deployment.contractId,
    orderRef: a.orderRef,
    tipo: ORDENES_DEMO[a.orderRef]!.tipo,
    condiciones: ORDENES_DEMO[a.orderRef]!,
    termsHash: a.termsHash,
    montoUnidades: a.amount,
    transacciones: Object.entries(a.transactions).map(([etapa, t]) => ({
      etapa: etapa as EtapaAcuerdo,
      hash: (t as { hash: string }).hash,
    })),
    origen: "script" as const,
    registradoEn: a.recordedAt,
  }));

export function unidadesAMonto(unidades: string | bigint): number {
  return Number(BigInt(unidades)) / 10 ** STELLAR.decimales;
}

export function montoAUnidades(monto: number): string {
  return (BigInt(Math.round(monto * 100)) * 10n ** BigInt(STELLAR.decimales - 2)).toString();
}

export function fmtActivo(unidades: string | bigint): string {
  return `${unidadesAMonto(unidades).toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${STELLAR.activo.code}`;
}

export function acortar(s: string, n = 6): string {
  return s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}
