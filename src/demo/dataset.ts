/**
 * Datos de demostración. TODO ES FICTICIO: nombres, mensajes, pedidos y
 * movimientos son sintéticos. Las fechas son fijas (septiembre de 2026) para
 * que el ejemplo sea reproducible y no dependa de la fecha actual.
 *
 * Solo se definen ENTRADAS (pedidos, declaraciones y archivos CSV). Ningún
 * resultado está precargado: la demo carga estas entradas por los mismos
 * caminos que usa una persona (crear pedido, registrar declaración, importar
 * CSV) y el motor calcula todo.
 */
import type { OrderInput } from "@/domain/schemas";

export interface DemoClaim {
  orderReference: string;
  receivedText: string;
  declaredAmountMinor?: number;
  mentionedOperation?: string;
}

export const DEMO_ORDERS: OrderInput[] = [
  {
    reference: "PED-101",
    customerName: "Ana",
    totalMinor: 4_500_000,
    currency: "ARS",
    orderDate: "2026-09-14",
    detail: "3 productos",
    delivery: "Retiro el viernes",
    sourceText:
      "Soy Ana. Confirmo el pedido de 3 productos por un total de $45.000. Retiro el viernes. Referencia PED-101.",
  },
  {
    reference: "PED-102",
    customerName: "Luis",
    totalMinor: 3_000_000,
    currency: "ARS",
    orderDate: "2026-09-14",
    detail: "2 productos",
  },
  {
    reference: "PED-103",
    customerName: "Marta",
    totalMinor: 4_500_000,
    currency: "ARS",
    orderDate: "2026-09-15",
    detail: "3 productos",
  },
  {
    reference: "PED-104",
    customerName: "Carla",
    totalMinor: 1_800_000,
    currency: "ARS",
    orderDate: "2026-09-15",
    detail: "1 producto",
  },
  {
    reference: "PED-105",
    customerName: "Bruno",
    totalMinor: 2_500_000,
    currency: "ARS",
    orderDate: "2026-09-16",
    detail: "2 productos",
  },
  {
    reference: "PED-106",
    customerName: "Elena",
    totalMinor: 2_500_000,
    currency: "ARS",
    orderDate: "2026-09-16",
    detail: "2 productos",
  },
];

export const DEMO_CLAIMS: DemoClaim[] = [
  {
    orderReference: "PED-103",
    receivedText: "Hola, ya pagué el pedido. Te paso el comprobante: operación MOV-001 por $45.000.",
    declaredAmountMinor: 4_500_000,
    mentionedOperation: "MOV-001",
  },
  {
    orderReference: "PED-104",
    receivedText: "Ya te transferí los $18.000 del pedido PED-104.",
    declaredAmountMinor: 1_800_000,
  },
];

export const DEMO_ACCOUNT = "Cuenta demo";

/** Archivo inicial que la demo importa con el mismo proceso que la pantalla Importar. */
export const DEMO_CSV_1_NAME = "movimientos-demo-1.csv";
export const DEMO_CSV_1 = `id_movimiento,cuenta,fecha,importe,moneda,estado,referencia,descripcion
MOV-001,${DEMO_ACCOUNT},2026-09-15,45000.00,ARS,acreditado,PED-101,Transferencia recibida
MOV-002,${DEMO_ACCOUNT},2026-09-16,20000.00,ARS,acreditado,PED-102 seña,Transferencia recibida
MOV-003,${DEMO_ACCOUNT},2026-09-17,25000.00,ARS,acreditado,Pago pedido,Transferencia recibida
`;

/**
 * Segundo archivo opcional (descargable en Importar) para mostrar
 * deduplicación, un pago que completa un pedido, un movimiento pendiente,
 * un conflicto y un error de fila.
 */
export const DEMO_CSV_2_NAME = "movimientos-demo-2.csv";
export const DEMO_CSV_2 = `id_movimiento,cuenta,fecha,importe,moneda,estado,referencia,descripcion
MOV-002,${DEMO_ACCOUNT},2026-09-16,20000.00,ARS,acreditado,PED-102 seña,Transferencia recibida
MOV-004,${DEMO_ACCOUNT},2026-09-19,10000.00,ARS,acreditado,PED-102 saldo,Transferencia recibida
MOV-005,${DEMO_ACCOUNT},2026-09-19,18000.00,ARS,pendiente,PED-104,Transferencia en proceso
MOV-003,${DEMO_ACCOUNT},2026-09-17,26000.00,ARS,acreditado,Pago pedido,Transferencia recibida
MOV-006,${DEMO_ACCOUNT},2026-09-20,120.00,USD,acreditado,PED-105,Transferencia recibida
`;
