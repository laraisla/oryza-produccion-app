import { z } from "zod";
import { isIsoDate } from "./dates";
import { CURRENCY, MAX_MINOR } from "./money";
import { validateOrderReference } from "./references";

/** Límites de texto compartidos por formularios, importación y extracción. */
export const LIMITS = {
  customerName: 80,
  detail: 300,
  delivery: 200,
  sourceText: 2000,
  claimText: 2000,
  operation: 60,
  movementId: 60,
  account: 60,
  movementReference: 140,
  movementDescription: 200,
  note: 300,
} as const;

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "Fecha inválida (AAAA-MM-DD)." });

export const isoDateTimeSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Fecha y hora inválidas." });

export const minorSchema = z
  .number()
  .int({ message: "El importe debe ser un entero en centavos." })
  .positive({ message: "El importe debe ser mayor que cero." })
  .max(MAX_MINOR, { message: "El importe supera el máximo admitido." })
  .refine(Number.isSafeInteger, { message: "El importe no es un entero seguro." });

export const currencySchema = z.literal(CURRENCY, {
  message: "Moneda no soportada: el prototipo solo opera en ARS y no convierte monedas.",
});

const text = (max: number) => z.string().trim().max(max);

export const orderReferenceSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const error = validateOrderReference(value);
    if (error) ctx.addIssue({ code: "custom", message: error });
  });

// ---------- Pedido ----------

export const orderInputSchema = z.object({
  reference: orderReferenceSchema,
  customerName: text(LIMITS.customerName).min(1, { message: "Falta el nombre del cliente." }),
  totalMinor: minorSchema,
  currency: currencySchema,
  orderDate: isoDateSchema,
  detail: text(LIMITS.detail).optional(),
  delivery: text(LIMITS.delivery).optional(),
  deliveryDate: isoDateSchema.optional(),
  sourceText: z.string().max(LIMITS.sourceText).optional(),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const orderSchema = orderInputSchema.extend({
  id: z.string().min(1),
  referenceKey: z.string().min(1),
  createdAt: isoDateTimeSchema,
});
export type Order = z.infer<typeof orderSchema>;

// ---------- Declaración de pago ----------

export const claimInputSchema = z.object({
  orderId: z.string().min(1),
  receivedText: z.string().trim().min(1, { message: "Falta el texto recibido." }).max(LIMITS.claimText),
  declaredAmountMinor: minorSchema.optional(),
  mentionedOperation: text(LIMITS.operation).optional(),
  declaredDate: isoDateSchema.optional(),
});
export type ClaimInput = z.infer<typeof claimInputSchema>;

export const claimSchema = claimInputSchema.extend({
  id: z.string().min(1),
  createdAt: isoDateTimeSchema,
});
export type PaymentClaim = z.infer<typeof claimSchema>;

// ---------- Movimiento ----------

export const MOVEMENT_STATUSES = ["acreditado", "pendiente", "revertido"] as const;
export const movementStatusSchema = z.enum(MOVEMENT_STATUSES);
export type MovementStatus = z.infer<typeof movementStatusSchema>;

export const movementDraftSchema = z.object({
  externalId: text(LIMITS.movementId).min(1, { message: "Falta el identificador del movimiento." }),
  account: text(LIMITS.account).min(1, { message: "Falta la cuenta de origen." }),
  date: isoDateSchema,
  amountMinor: minorSchema,
  currency: currencySchema,
  status: movementStatusSchema,
  reference: text(LIMITS.movementReference),
  description: text(LIMITS.movementDescription),
});
export type MovementDraft = z.infer<typeof movementDraftSchema>;

export const provenanceSchema = z.object({
  importId: z.string().min(1),
  fileName: z.string().max(200),
  rowNumber: z.number().int().positive(),
  importedAt: isoDateTimeSchema,
});

export const movementSchema = movementDraftSchema.extend({
  /** Clave compuesta `cuenta|id externo` (normalizada). */
  key: z.string().min(1),
  provenance: provenanceSchema,
  /** Última importación que actualizó el estado, si hubo. */
  statusUpdatedBy: provenanceSchema.optional(),
});
export type Movement = z.infer<typeof movementSchema>;

export function accountKey(account: string): string {
  return account.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Clave de deduplicación: cuenta normalizada + identificador externo exacto
 * (sin espacios al borde). No se normaliza la puntuación del identificador para
 * no fusionar operaciones distintas.
 */
export function movementKey(account: string, externalId: string): string {
  return `${accountKey(account)}|${externalId.trim()}`;
}

// ---------- Importación ----------

export const importBatchSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().max(200),
  importedAt: isoDateTimeSchema,
  accounts: z.array(z.string()),
  periodFrom: isoDateSchema.optional(),
  periodTo: isoDateSchema.optional(),
  totalRows: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  statusUpdates: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const movementSnapshotSchema = movementDraftSchema;
export type MovementSnapshot = MovementDraft;

export const importConflictSchema = z.object({
  id: z.string().min(1),
  movementKey: z.string().min(1),
  importId: z.string().min(1),
  fileName: z.string().max(200),
  rowNumber: z.number().int().positive(),
  detectedAt: isoDateTimeSchema,
  existing: movementSnapshotSchema,
  incoming: movementSnapshotSchema,
  fields: z.array(z.string()),
  status: z.enum(["abierto", "revisado"]),
  reviewedAt: isoDateTimeSchema.optional(),
});
export type ImportConflict = z.infer<typeof importConflictSchema>;

// ---------- Asignación ----------

export const allocationSchema = z.object({
  id: z.string().min(1),
  movementKey: z.string().min(1),
  orderId: z.string().min(1),
  amountMinor: minorSchema,
  kind: z.enum(["propuesta_aprobada", "manual"]),
  confirmedAt: isoDateTimeSchema,
  /** Siempre una persona: no hay asignaciones automáticas. */
  confirmedBy: z.literal("usuario"),
  note: z.string().max(LIMITS.note).optional(),
  status: z.enum(["vigente", "liberada"]),
  /** `orderId|movementKey` mientras está vigente; índice único en IndexedDB. */
  activeKey: z.string().optional(),
  releasedAt: isoDateTimeSchema.optional(),
  releaseReason: z.string().max(LIMITS.note).optional(),
});
export type Allocation = z.infer<typeof allocationSchema>;

export const rejectionSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  movementKey: z.string().min(1),
  rejectedAt: isoDateTimeSchema,
  reason: z.string().max(LIMITS.note).optional(),
});
export type Rejection = z.infer<typeof rejectionSchema>;

// ---------- Historial ----------

export const HISTORY_ACTIONS = [
  "pedido_creado",
  "declaracion_registrada",
  "importacion_confirmada",
  "movimiento_estado_actualizado",
  "conflicto_detectado",
  "conflicto_revisado",
  "asignacion_aprobada",
  "asignacion_manual",
  "asignacion_liberada",
  "propuesta_rechazada",
  "rechazo_deshecho",
  "demo_cargada",
  "datos_restaurados",
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export const historyEntrySchema = z.object({
  seq: z.number().int().positive().optional(),
  at: isoDateTimeSchema,
  action: z.enum(HISTORY_ACTIONS),
  orderIds: z.array(z.string()),
  movementKeys: z.array(z.string()),
  allocationId: z.string().optional(),
  importId: z.string().optional(),
  summary: z.string().max(500),
  reason: z.string().max(LIMITS.note).optional(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** Conjunto completo de datos que evalúa el motor. */
export interface Dataset {
  orders: Order[];
  claims: PaymentClaim[];
  movements: Movement[];
  allocations: Allocation[];
  rejections: Rejection[];
  imports: ImportBatch[];
  conflicts: ImportConflict[];
}
