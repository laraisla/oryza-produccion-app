/**
 * Validación de asignaciones. Puro: recibe el conjunto de datos actual y
 * devuelve la asignación a crear o un error explicable. La capa de datos lo
 * ejecuta dentro de una transacción de escritura con datos recién leídos.
 */
import { formatArs } from "./money";
import { evaluate, findProposal } from "./reconcile";
import { LIMITS, type Allocation, type Dataset } from "./schemas";

export class DomainError extends Error {
  constructor(
    public readonly code:
      | "PROPUESTA_INEXISTENTE"
      | "PROPUESTA_CAMBIO"
      | "YA_ASIGNADO"
      | "MOVIMIENTO_INEXISTENTE"
      | "PEDIDO_INEXISTENTE"
      | "MOVIMIENTO_NO_ACREDITADO"
      | "MONEDA_DISTINTA"
      | "IMPORTE_INVALIDO"
      | "EXCEDE_DISPONIBLE"
      | "EXCEDE_SALDO"
      | "MOTIVO_REQUERIDO"
      | "REFERENCIA_DUPLICADA"
      | "ASIGNACION_INEXISTENTE"
      | "DATOS_INVALIDOS",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export interface AllocationRequest {
  id: string;
  confirmedAt: string;
}

function activeKey(orderId: string, movementKey: string): string {
  return `${orderId}|${movementKey}`;
}

/** Aprobar una propuesta: se recalcula y debe coincidir con lo que vio la persona. */
export function buildApprovedAllocation(
  data: Dataset,
  orderId: string,
  movementKey: string,
  expectedAmountMinor: number,
  req: AllocationRequest,
): Allocation {
  const existing = data.allocations.find(
    (a) => a.status === "vigente" && a.orderId === orderId && a.movementKey === movementKey,
  );
  if (existing) {
    throw new DomainError("YA_ASIGNADO", "Esta asociación ya estaba confirmada. No se duplicó.");
  }
  const ev = evaluate(data);
  const proposal = findProposal(ev, orderId, movementKey);
  if (!proposal) {
    throw new DomainError(
      "PROPUESTA_INEXISTENTE",
      "La propuesta ya no está disponible (los datos cambiaron). Revisá el pedido nuevamente.",
    );
  }
  if (proposal.amountMinor !== expectedAmountMinor) {
    throw new DomainError(
      "PROPUESTA_CAMBIO",
      `La propuesta cambió: ahora es por ${formatArs(proposal.amountMinor)}. Revisala antes de aprobar.`,
    );
  }
  return {
    id: req.id,
    movementKey,
    orderId,
    amountMinor: proposal.amountMinor,
    kind: "propuesta_aprobada",
    confirmedAt: req.confirmedAt,
    confirmedBy: "usuario",
    status: "vigente",
    activeKey: activeKey(orderId, movementKey),
  };
}

/** Asignación manual: requiere motivo y respeta disponible y saldo. */
export function buildManualAllocation(
  data: Dataset,
  orderId: string,
  movementKey: string,
  amountMinor: number,
  note: string,
  req: AllocationRequest,
): Allocation {
  const reason = note.trim();
  if (reason.length < 5) {
    throw new DomainError("MOTIVO_REQUERIDO", "Escribí el motivo de la asignación manual (mínimo 5 caracteres).");
  }
  if (reason.length > LIMITS.note) {
    throw new DomainError("MOTIVO_REQUERIDO", `El motivo no puede superar ${LIMITS.note} caracteres.`);
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new DomainError("IMPORTE_INVALIDO", "El importe a asignar debe ser mayor que cero.");
  }
  const ev = evaluate(data);
  const oe = ev.byOrderId.get(orderId);
  if (!oe) throw new DomainError("PEDIDO_INEXISTENTE", "El pedido no existe.");
  const me = ev.movements.get(movementKey);
  if (!me) throw new DomainError("MOVIMIENTO_INEXISTENTE", "El movimiento no existe.");
  if (data.allocations.some((a) => a.status === "vigente" && a.orderId === orderId && a.movementKey === movementKey)) {
    throw new DomainError("YA_ASIGNADO", "Ese movimiento ya tiene una asignación vigente a este pedido.");
  }
  if (me.movement.status !== "acreditado") {
    throw new DomainError(
      "MOVIMIENTO_NO_ACREDITADO",
      `El movimiento figura como «${me.movement.status}»: no cuenta como acreditado.`,
    );
  }
  if (me.movement.currency !== oe.order.currency) {
    throw new DomainError("MONEDA_DISTINTA", "La moneda del movimiento no coincide con la del pedido.");
  }
  if (amountMinor > me.availableMinor) {
    throw new DomainError(
      "EXCEDE_DISPONIBLE",
      `El movimiento solo tiene ${formatArs(me.availableMinor)} disponibles.`,
    );
  }
  if (amountMinor > oe.outstandingMinor) {
    throw new DomainError(
      "EXCEDE_SALDO",
      `El saldo por conciliar del pedido es ${formatArs(oe.outstandingMinor)}.`,
    );
  }
  return {
    id: req.id,
    movementKey,
    orderId,
    amountMinor,
    kind: "manual",
    confirmedAt: req.confirmedAt,
    confirmedBy: "usuario",
    note: reason,
    status: "vigente",
    activeKey: activeKey(orderId, movementKey),
  };
}
