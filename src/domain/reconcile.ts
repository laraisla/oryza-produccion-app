/**
 * Motor de conciliación. Función pura: recibe todos los datos y devuelve
 * propuestas, candidatos y hallazgos explicables. No escribe nada, no usa la
 * fecha actual, no llama a servicios externos ni a modelos de IA.
 *
 * Ver docs/REGLAS.md para la tabla de decisiones.
 */
import { compareIso, formatDate } from "./dates";
import { formatArs, subMinor, sumMinor } from "./money";
import { findMentionedKeys, findReferenceLikeTokens, referenceKey } from "./references";
import type {
  Allocation,
  Dataset,
  ImportBatch,
  Movement,
  Order,
  PaymentClaim,
} from "./schemas";

export type Severity = "ok" | "info" | "atencion" | "advertencia";

export type NextAction =
  | "aprobar_propuesta"
  | "revisar_referencia"
  | "importar_recientes"
  | "copiar_mensaje"
  | "asignar_manual"
  | "liberar_asignacion"
  | "deshacer_rechazo"
  | "revisar_conflicto";

export type FindingCode =
  | "MONEDA_DISTINTA"
  | "REF_MOV_PENDIENTE"
  | "REF_MOV_REVERTIDO"
  | "REF_VARIOS_PEDIDOS"
  | "PROPUESTA_RECHAZADA"
  | "REF_MOV_USADO"
  | "REF_PEDIDO_CONCILIADO"
  | "CAND_IMPORTE"
  | "CAND_IMPORTE_AMBIGUO"
  | "SIN_MOVIMIENTOS"
  | "SIN_IMPORTACIONES"
  | "SALDO_PENDIENTE"
  | "DECL_OP_NO_ENCONTRADA"
  | "DECL_MOV_USADO"
  | "DECL_MOV_REF_OTRO"
  | "DECL_MOV_NO_ACREDITADO"
  | "DECL_MOV_ASIGNADO"
  | "DECL_MOV_CANDIDATO"
  | "DECL_CANDIDATOS_IMPORTE"
  | "DECL_SIN_MOVIMIENTO"
  | "DECL_IMPORTE_DIFIERE"
  | "DECL_INCOMPLETA"
  | "DECL_PEDIDO_CONCILIADO"
  | "ASIG_MOV_NO_ACREDITADO"
  | "MOV_EXCEDENTE"
  | "MOV_SIN_PEDIDO"
  | "MOV_REF_DESCONOCIDA"
  | "DATOS_INCONSISTENTES";

export type ProposalCode = "PROP_COMPLETA" | "PROP_PARCIAL" | "PROP_EXCEDENTE";

export interface Check {
  label: string;
  result: "cumple" | "observacion";
  detail: string;
}

export interface Proposal {
  id: string;
  orderId: string;
  movementKey: string;
  code: ProposalCode;
  amountMinor: number;
  outstandingBeforeMinor: number;
  outstandingAfterMinor: number;
  movementAvailableMinor: number;
  movementLeftoverMinor: number;
  matchedIn: Array<"referencia" | "descripcion">;
  checks: Check[];
  title: string;
}

export interface Finding {
  code: FindingCode;
  severity: Severity;
  title: string;
  explanation: string;
  movementKeys: string[];
  claimId?: string;
  /** Otros pedidos involucrados. Uso interno: no incluir en mensajes al cliente. */
  relatedOrderIds: string[];
  nextActions: NextAction[];
}

export interface Candidate {
  orderId: string;
  movementKey: string;
  basis: "importe" | "declaracion";
  suggestedMinor: number;
  ambiguousWith: string[];
}

export interface AllocationView {
  allocation: Allocation;
  movement: Movement | undefined;
  counts: boolean;
}

export type OrderStatus = "conciliado" | "parcial" | "sin_conciliar";
export type Attention = "revision" | "aprobacion" | "sin_encontrar" | "esperando" | "ninguna";

export interface OrderEvaluation {
  order: Order;
  allocatedMinor: number;
  outstandingMinor: number;
  status: OrderStatus;
  allocations: AllocationView[];
  proposals: Proposal[];
  candidates: Candidate[];
  findings: Finding[];
  claims: PaymentClaim[];
  attention: Attention;
}

export interface MovementEvaluation {
  movement: Movement;
  allocatedMinor: number;
  availableMinor: number;
  mentionedOrderIds: string[];
  matchedIn: Map<string, Array<"referencia" | "descripcion">>;
  allocations: Allocation[];
  findings: Finding[];
}

export interface Coverage {
  files: number;
  from?: string;
  to?: string;
  lastImportAt?: string;
}

export interface EvaluationSummary {
  orders: number;
  proposals: number;
  review: number;
  notFound: number;
  waiting: number;
  reconciled: number;
  partial: number;
  openConflicts: number;
  movementsNeedingReview: number;
}

export interface Evaluation {
  orders: OrderEvaluation[];
  byOrderId: Map<string, OrderEvaluation>;
  movements: Map<string, MovementEvaluation>;
  coverage: Coverage;
  summary: EvaluationSummary;
}

// ---------------------------------------------------------------------------

const REVIEW_CODES = new Set<FindingCode>([
  "MONEDA_DISTINTA",
  "REF_VARIOS_PEDIDOS",
  "REF_MOV_USADO",
  "REF_PEDIDO_CONCILIADO",
  "CAND_IMPORTE",
  "CAND_IMPORTE_AMBIGUO",
  "DECL_MOV_USADO",
  "DECL_MOV_REF_OTRO",
  "DECL_MOV_CANDIDATO",
  "DECL_CANDIDATOS_IMPORTE",
  "ASIG_MOV_NO_ACREDITADO",
  "DATOS_INCONSISTENTES",
]);

const NOT_FOUND_CODES = new Set<FindingCode>(["DECL_SIN_MOVIMIENTO", "DECL_OP_NO_ENCONTRADA"]);

function byDateThenKey(a: Movement, b: Movement): number {
  return compareIso(a.date, b.date) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export function coverageOf(imports: readonly ImportBatch[]): Coverage {
  const froms = imports.map((i) => i.periodFrom).filter((v): v is string => !!v).sort();
  const tos = imports.map((i) => i.periodTo).filter((v): v is string => !!v).sort();
  const last = imports.map((i) => i.importedAt).sort().at(-1);
  return {
    files: imports.length,
    ...(froms[0] ? { from: froms[0] } : {}),
    ...(tos.at(-1) ? { to: tos.at(-1) } : {}),
    ...(last ? { lastImportAt: last } : {}),
  };
}

export function coverageText(c: Coverage): string {
  if (c.files === 0) return "Todavía no se importó ningún archivo de movimientos.";
  const files = c.files === 1 ? "1 archivo importado" : `${c.files} archivos importados`;
  if (c.from && c.to) {
    return `${files}; fechas de movimientos entre ${formatDate(c.from)} y ${formatDate(c.to)}.`;
  }
  return `${files}.`;
}

export function movementLabel(m: Movement): string {
  return `${m.externalId} (${formatDate(m.date)}, ${formatArs(m.amountMinor)})`;
}

function sameOperation(mentioned: string, externalId: string): boolean {
  const a = referenceKey(mentioned);
  const b = referenceKey(externalId);
  if (a !== "" && a === b) return true;
  return mentioned.trim().toUpperCase() === externalId.trim().toUpperCase();
}

// ---------------------------------------------------------------------------

export function evaluate(data: Dataset): Evaluation {
  const coverage = coverageOf(data.imports);
  const coverageSentence = coverageText(coverage);

  const ordersById = new Map(data.orders.map((o) => [o.id, o]));
  const orderIdByRefKey = new Map(data.orders.map((o) => [o.referenceKey, o.id]));
  const knownPrefixes = new Set(
    data.orders.map((o) => o.referenceKey.split("-")[0] ?? "").filter((p) => /^[A-Z]+$/.test(p)),
  );
  const refOf = (orderId: string) => ordersById.get(orderId)?.reference ?? "(pedido desconocido)";

  const vigentes = data.allocations.filter((a) => a.status === "vigente");
  const allocByMovement = new Map<string, Allocation[]>();
  const allocByOrder = new Map<string, Allocation[]>();
  for (const a of vigentes) {
    allocByMovement.set(a.movementKey, [...(allocByMovement.get(a.movementKey) ?? []), a]);
    allocByOrder.set(a.orderId, [...(allocByOrder.get(a.orderId) ?? []), a]);
  }
  const rejected = new Set(data.rejections.map((r) => `${r.orderId}|${r.movementKey}`));

  // ---- Movimientos: menciones, disponible ----
  const movements = new Map<string, MovementEvaluation>();
  const sortedMovements = [...data.movements].sort(byDateThenKey);
  for (const m of sortedMovements) {
    const allocs = allocByMovement.get(m.key) ?? [];
    const allocatedMinor = sumMinor(allocs.map((a) => a.amountMinor));
    const rawAvailable = m.status === "acreditado" ? subMinor(m.amountMinor, allocatedMinor) : 0;
    const matchedIn = new Map<string, Array<"referencia" | "descripcion">>();
    const keys = [...orderIdByRefKey.keys()];
    for (const k of findMentionedKeys(m.reference, keys)) {
      const id = orderIdByRefKey.get(k);
      if (id) matchedIn.set(id, ["referencia"]);
    }
    for (const k of findMentionedKeys(m.description, keys)) {
      const id = orderIdByRefKey.get(k);
      if (id) matchedIn.set(id, [...(matchedIn.get(id) ?? []), "descripcion"]);
    }
    const findings: Finding[] = [];
    if (rawAvailable < 0) {
      findings.push({
        code: "DATOS_INCONSISTENTES",
        severity: "advertencia",
        title: "Asignaciones mayores que el movimiento",
        explanation: `Las asignaciones vigentes de ${movementLabel(m)} suman ${formatArs(allocatedMinor)}, más que su importe. Revisá y liberá las asignaciones incorrectas.`,
        movementKeys: [m.key],
        relatedOrderIds: allocs.map((a) => a.orderId),
        nextActions: ["liberar_asignacion"],
      });
    }
    movements.set(m.key, {
      movement: m,
      allocatedMinor,
      availableMinor: Math.max(0, rawAvailable),
      mentionedOrderIds: [...matchedIn.keys()],
      matchedIn,
      allocations: allocs,
      findings,
    });
  }

  // ---- Pedidos: asignado y saldo ----
  const base = new Map<
    string,
    { allocatedMinor: number; outstandingMinor: number; views: AllocationView[]; findings: Finding[] }
  >();
  for (const o of data.orders) {
    const views: AllocationView[] = (allocByOrder.get(o.id) ?? []).map((a) => {
      const mv = movements.get(a.movementKey)?.movement;
      const counts = !!mv && mv.status === "acreditado" && mv.currency === o.currency;
      return { allocation: a, movement: mv, counts };
    });
    const allocatedMinor = sumMinor(views.filter((v) => v.counts).map((v) => v.allocation.amountMinor));
    const findings: Finding[] = [];
    for (const v of views.filter((x) => !x.counts)) {
      const mv = v.movement;
      findings.push({
        code: "ASIG_MOV_NO_ACREDITADO",
        severity: "advertencia",
        title: "Asignación que dejó de contar",
        explanation: mv
          ? `La asignación de ${formatArs(v.allocation.amountMinor)} usa ${mv.externalId}, que ahora figura como «${mv.status}» en el último archivo importado. No suma al pedido hasta que vuelva a figurar acreditado. Podés liberarla o esperar un archivo más reciente.`
          : `La asignación de ${formatArs(v.allocation.amountMinor)} apunta a un movimiento que no está cargado. No suma al pedido.`,
        movementKeys: [v.allocation.movementKey],
        relatedOrderIds: [],
        nextActions: ["liberar_asignacion", "importar_recientes"],
      });
    }
    let outstandingMinor = subMinor(o.totalMinor, allocatedMinor);
    if (outstandingMinor < 0) {
      findings.push({
        code: "DATOS_INCONSISTENTES",
        severity: "advertencia",
        title: "Asignado mayor que el total",
        explanation: `Las asignaciones suman ${formatArs(allocatedMinor)} y el total del pedido es ${formatArs(o.totalMinor)}. Revisá las asignaciones.`,
        movementKeys: views.map((v) => v.allocation.movementKey),
        relatedOrderIds: [],
        nextActions: ["liberar_asignacion"],
      });
      outstandingMinor = 0;
    }
    base.set(o.id, { allocatedMinor, outstandingMinor, views, findings });
  }

  // ---- Propuestas por referencia explícita (tabla A) ----
  const proposalsByOrder = new Map<string, Proposal[]>();
  const findingsByOrder = new Map<string, Finding[]>();
  const addFinding = (orderId: string, f: Finding) =>
    findingsByOrder.set(orderId, [...(findingsByOrder.get(orderId) ?? []), f]);

  for (const o of data.orders) {
    const b = base.get(o.id)!;
    let running = b.outstandingMinor;
    const proposals: Proposal[] = [];
    const mentioning = sortedMovements.filter((m) => movements.get(m.key)!.mentionedOrderIds.includes(o.id));
    for (const m of mentioning) {
      const me = movements.get(m.key)!;
      if (m.currency !== o.currency) {
        addFinding(o.id, {
          code: "MONEDA_DISTINTA",
          severity: "advertencia",
          title: "Moneda distinta",
          explanation: `${m.externalId} está en ${m.currency} y el pedido en ${o.currency}. El prototipo no convierte monedas.`,
          movementKeys: [m.key],
          relatedOrderIds: [],
          nextActions: ["revisar_referencia"],
        });
        continue;
      }
      if (m.status === "pendiente") {
        addFinding(o.id, {
          code: "REF_MOV_PENDIENTE",
          severity: "atencion",
          title: "Movimiento pendiente",
          explanation: `${movementLabel(m)} menciona ${o.reference}, pero el archivo lo informa como pendiente. Un movimiento pendiente no cuenta como acreditado. Importá un archivo más reciente cuando figure acreditado.`,
          movementKeys: [m.key],
          relatedOrderIds: [],
          nextActions: ["importar_recientes"],
        });
        continue;
      }
      if (m.status === "revertido") {
        addFinding(o.id, {
          code: "REF_MOV_REVERTIDO",
          severity: "atencion",
          title: "Movimiento revertido",
          explanation: `${movementLabel(m)} menciona ${o.reference}, pero el archivo lo informa como revertido. No cuenta para el pedido.`,
          movementKeys: [m.key],
          relatedOrderIds: [],
          nextActions: ["importar_recientes", "copiar_mensaje"],
        });
        continue;
      }
      if (me.allocations.some((a) => a.orderId === o.id)) continue; // ya cuenta (A4)
      if (me.mentionedOrderIds.length > 1) {
        const others = me.mentionedOrderIds.filter((id) => id !== o.id);
        addFinding(o.id, {
          code: "REF_VARIOS_PEDIDOS",
          severity: "advertencia",
          title: "El movimiento menciona varios pedidos",
          explanation: `${movementLabel(m)} menciona ${o.reference} y también ${others.map(refOf).join(", ")}. No se propone una asignación automática: decidí cómo distribuirlo con una asignación manual.`,
          movementKeys: [m.key],
          relatedOrderIds: others,
          nextActions: ["asignar_manual", "copiar_mensaje"],
        });
        continue;
      }
      if (rejected.has(`${o.id}|${m.key}`)) {
        addFinding(o.id, {
          code: "PROPUESTA_RECHAZADA",
          severity: "info",
          title: "Propuesta rechazada",
          explanation: `Rechazaste la asociación con ${movementLabel(m)}. No se vuelve a proponer salvo que deshagas el rechazo.`,
          movementKeys: [m.key],
          relatedOrderIds: [],
          nextActions: ["deshacer_rechazo"],
        });
        continue;
      }
      if (me.availableMinor === 0) {
        const others = me.allocations.map((a) => a.orderId).filter((id) => id !== o.id);
        addFinding(o.id, {
          code: "REF_MOV_USADO",
          severity: "advertencia",
          title: "Movimiento ya utilizado",
          explanation: `${movementLabel(m)} menciona ${o.reference}, pero ya está asignado completo a ${others.map(refOf).join(", ") || "otro pedido"}. No se cuenta nuevamente.`,
          movementKeys: [m.key],
          relatedOrderIds: others,
          nextActions: ["revisar_referencia", "copiar_mensaje"],
        });
        continue;
      }
      if (running === 0) {
        addFinding(o.id, {
          code: "REF_PEDIDO_CONCILIADO",
          severity: "atencion",
          title: "Pedido ya cubierto: movimiento adicional",
          explanation: `${movementLabel(m)} menciona ${o.reference}, pero el pedido ya no tiene saldo por conciliar${proposals.length ? " con las propuestas anteriores" : ""}. Queda para revisión (por ejemplo, un pago repetido). La app no recomienda ni ejecuta devoluciones.`,
          movementKeys: [m.key],
          relatedOrderIds: [],
          nextActions: ["revisar_referencia", "copiar_mensaje"],
        });
        continue;
      }
      const amountMinor = Math.min(me.availableMinor, running);
      const code: ProposalCode =
        me.availableMinor === running
          ? "PROP_COMPLETA"
          : me.availableMinor < running
            ? "PROP_PARCIAL"
            : "PROP_EXCEDENTE";
      const outstandingAfterMinor = subMinor(running, amountMinor);
      const leftover = subMinor(me.availableMinor, amountMinor);
      const matched = me.matchedIn.get(o.id) ?? ["referencia"];
      const checks: Check[] = [
        {
          label: "Referencia explícita",
          result: "cumple",
          detail: `«${o.reference}» aparece en ${matched.map((f) => (f === "referencia" ? "la referencia" : "la descripción")).join(" y ")} de ${m.externalId}${m.reference ? `: «${m.reference}»` : ""}.`,
        },
        { label: "Moneda", result: "cumple", detail: `${m.currency} en el pedido y en el movimiento.` },
        {
          label: "Estado del movimiento",
          result: "cumple",
          detail: `Acreditado según el archivo «${(m.statusUpdatedBy ?? m.provenance).fileName}» (fila ${(m.statusUpdatedBy ?? m.provenance).rowNumber}).`,
        },
        {
          label: "Disponible del movimiento",
          result: "cumple",
          detail:
            me.allocatedMinor === 0
              ? `${formatArs(m.amountMinor)} sin asignar a otros pedidos.`
              : `${formatArs(me.availableMinor)} disponibles de ${formatArs(m.amountMinor)} (el resto ya está asignado).`,
        },
        {
          label: "Importe frente al saldo",
          result: code === "PROP_COMPLETA" ? "cumple" : "observacion",
          detail:
            code === "PROP_COMPLETA"
              ? `Cubre el saldo de ${formatArs(running)}.`
              : code === "PROP_PARCIAL"
                ? `Cubre ${formatArs(amountMinor)} de ${formatArs(running)}; quedarían ${formatArs(outstandingAfterMinor)} por conciliar.`
                : `Supera el saldo en ${formatArs(leftover)}. Se propone asignar ${formatArs(amountMinor)}; el excedente queda en el movimiento para revisión.`,
        },
        compareIso(m.date, o.orderDate) < 0
          ? {
              label: "Fecha",
              result: "observacion",
              detail: `El movimiento (${formatDate(m.date)}) es anterior a la fecha del pedido (${formatDate(o.orderDate)}). Puede ser una seña; verificalo.`,
            }
          : {
              label: "Fecha",
              result: "cumple",
              detail: `Movimiento del ${formatDate(m.date)}; pedido del ${formatDate(o.orderDate)}.`,
            },
      ];
      if (proposals.length > 0) {
        checks.push({
          label: "Orden de cálculo",
          result: "observacion",
          detail: "Este importe se calculó suponiendo que se aprueban las propuestas anteriores de este pedido.",
        });
      }
      proposals.push({
        id: `${o.id}|${m.key}`,
        orderId: o.id,
        movementKey: m.key,
        code,
        amountMinor,
        outstandingBeforeMinor: running,
        outstandingAfterMinor,
        movementAvailableMinor: me.availableMinor,
        movementLeftoverMinor: leftover,
        matchedIn: matched,
        checks,
        title:
          code === "PROP_COMPLETA"
            ? "Propuesta de conciliación completa"
            : code === "PROP_PARCIAL"
              ? "Propuesta de conciliación parcial"
              : "Propuesta por el saldo (con excedente)",
      });
      running = outstandingAfterMinor;
    }
    proposalsByOrder.set(o.id, proposals);
  }

  // ---- Candidatos por importe (tabla B) ----
  const candidatesByOrder = new Map<string, Candidate[]>();
  const addCandidate = (c: Candidate) => {
    const list = candidatesByOrder.get(c.orderId) ?? [];
    const i = list.findIndex((x) => x.movementKey === c.movementKey);
    if (i === -1) list.push(c);
    // Si la declaración del cliente señala el mismo movimiento, se muestra esa evidencia.
    else if (c.basis === "declaracion") list[i] = { ...list[i]!, basis: "declaracion" };
    candidatesByOrder.set(c.orderId, list);
  };
  const openNoProposal = data.orders.filter(
    (o) => base.get(o.id)!.outstandingMinor > 0 && (proposalsByOrder.get(o.id) ?? []).length === 0,
  );
  for (const m of sortedMovements) {
    const me = movements.get(m.key)!;
    if (m.status !== "acreditado" || me.availableMinor === 0 || me.mentionedOrderIds.length > 0) continue;
    const matching = openNoProposal.filter(
      (o) =>
        o.currency === m.currency &&
        base.get(o.id)!.outstandingMinor === me.availableMinor &&
        !rejected.has(`${o.id}|${m.key}`),
    );
    for (const o of matching) {
      const others = matching.filter((x) => x.id !== o.id).map((x) => x.id);
      addCandidate({
        orderId: o.id,
        movementKey: m.key,
        basis: "importe",
        suggestedMinor: me.availableMinor,
        ambiguousWith: others,
      });
      addFinding(
        o.id,
        others.length > 0
          ? {
              code: "CAND_IMPORTE_AMBIGUO",
              severity: "advertencia",
              title: "Importe que coincide con varios pedidos",
              explanation: `${movementLabel(m)} coincide en importe con ${[o.reference, ...others.map(refOf)].join(" y ")}, pero su referencia («${m.reference || "sin referencia"}») no permite distinguirlos. No se asigna automáticamente: no se concilia por monto solamente.`,
              movementKeys: [m.key],
              relatedOrderIds: others,
              nextActions: ["copiar_mensaje", "asignar_manual"],
            }
          : {
              code: "CAND_IMPORTE",
              severity: "atencion",
              title: "Coincide solo el importe",
              explanation: `${movementLabel(m)} tiene el mismo importe que el saldo de ${o.reference}, pero no menciona el pedido. No se concilia por monto solamente: verificá con el cliente antes de asignarlo manualmente.`,
              movementKeys: [m.key],
              relatedOrderIds: [],
              nextActions: ["copiar_mensaje", "asignar_manual"],
            },
      );
    }
  }

  // ---- Declaraciones de pago (tabla C) ----
  const claimsByOrder = new Map<string, PaymentClaim[]>();
  for (const c of data.claims) {
    claimsByOrder.set(c.orderId, [...(claimsByOrder.get(c.orderId) ?? []), c]);
  }
  for (const o of data.orders) {
    const b = base.get(o.id)!;
    const proposals = proposalsByOrder.get(o.id) ?? [];
    for (const c of claimsByOrder.get(o.id) ?? []) {
      const note = "Una declaración del cliente no suma dinero conciliado.";
      if (c.declaredAmountMinor !== undefined && c.declaredAmountMinor !== o.totalMinor && c.declaredAmountMinor !== b.outstandingMinor) {
        addFinding(o.id, {
          code: "DECL_IMPORTE_DIFIERE",
          severity: "info",
          title: "Importe declarado distinto",
          explanation: `La declaración menciona ${formatArs(c.declaredAmountMinor)}; el total del pedido es ${formatArs(o.totalMinor)} y el saldo ${formatArs(b.outstandingMinor)}.`,
          movementKeys: [],
          claimId: c.id,
          relatedOrderIds: [],
          nextActions: ["copiar_mensaje"],
        });
      }
      if (c.mentionedOperation) {
        const found = sortedMovements.filter((m) => sameOperation(c.mentionedOperation!, m.externalId));
        if (found.length === 0) {
          addFinding(o.id, {
            code: "DECL_OP_NO_ENCONTRADA",
            severity: "atencion",
            title: "Operación no encontrada en los movimientos importados",
            explanation: `La declaración menciona «${c.mentionedOperation}», que no figura en los movimientos importados. ${coverageSentence} No significa que no haya pagado: puede faltar un archivo más reciente o la referencia puede ser otra. ${note}`,
            movementKeys: [],
            claimId: c.id,
            relatedOrderIds: [],
            nextActions: ["importar_recientes", "copiar_mensaje"],
          });
          continue;
        }
        for (const m of found) {
          const me = movements.get(m.key)!;
          const toThis = me.allocations.some((a) => a.orderId === o.id);
          const others = [...new Set(me.allocations.map((a) => a.orderId).filter((id) => id !== o.id))];
          const mentionsOthers = me.mentionedOrderIds.filter((id) => id !== o.id);
          if (toThis) {
            addFinding(o.id, {
              code: "DECL_MOV_ASIGNADO",
              severity: "ok",
              title: "Declaración coherente con una asignación",
              explanation: `La declaración menciona ${movementLabel(m)}, ya asignado a este pedido.`,
              movementKeys: [m.key],
              claimId: c.id,
              relatedOrderIds: [],
              nextActions: [],
            });
          } else if (m.status !== "acreditado") {
            addFinding(o.id, {
              code: "DECL_MOV_NO_ACREDITADO",
              severity: "atencion",
              title: "La operación declarada no está acreditada",
              explanation: `La declaración menciona ${movementLabel(m)}, que el archivo informa como «${m.status}». No cuenta como acreditado. ${note}`,
              movementKeys: [m.key],
              claimId: c.id,
              relatedOrderIds: [],
              nextActions: ["importar_recientes", "copiar_mensaje"],
            });
          } else if (me.availableMinor === 0 && others.length > 0) {
            addFinding(o.id, {
              code: "DECL_MOV_USADO",
              severity: "advertencia",
              title: "Movimiento ya utilizado en otro pedido",
              explanation: `La declaración menciona ${movementLabel(m)}, que ya está asignado a ${others.map(refOf).join(", ")}. No se cuenta nuevamente. Esto no implica fraude: puede ser un comprobante reenviado o una referencia equivocada. Consultá al cliente con un mensaje neutral.`,
              movementKeys: [m.key],
              claimId: c.id,
              relatedOrderIds: others,
              nextActions: ["copiar_mensaje", "revisar_referencia"],
            });
          } else if (mentionsOthers.length > 0) {
            addFinding(o.id, {
              code: "DECL_MOV_REF_OTRO",
              severity: "advertencia",
              title: "La operación declarada menciona otro pedido",
              explanation: `La declaración menciona ${movementLabel(m)}, pero la referencia de ese movimiento corresponde a ${mentionsOthers.map(refOf).join(", ")}. No se propone para este pedido. Consultá al cliente con un mensaje neutral.`,
              movementKeys: [m.key],
              claimId: c.id,
              relatedOrderIds: mentionsOthers,
              nextActions: ["copiar_mensaje", "revisar_referencia"],
            });
          } else if (me.mentionedOrderIds.includes(o.id)) {
            // Ya cubierto por la tabla A (propuesta, rechazo o advertencia).
          } else if (me.availableMinor > 0 && b.outstandingMinor > 0) {
            addCandidate({
              orderId: o.id,
              movementKey: m.key,
              basis: "declaracion",
              suggestedMinor: Math.min(me.availableMinor, b.outstandingMinor),
              ambiguousWith: [],
            });
            addFinding(o.id, {
              code: "DECL_MOV_CANDIDATO",
              severity: "atencion",
              title: "Movimiento señalado por la declaración",
              explanation: `La declaración menciona ${movementLabel(m)}, que está disponible pero no menciona ${o.reference}. Verificalo antes de asignarlo manualmente. ${note}`,
              movementKeys: [m.key],
              claimId: c.id,
              relatedOrderIds: [],
              nextActions: ["asignar_manual", "copiar_mensaje"],
            });
          }
        }
        continue;
      }
      if (c.declaredAmountMinor === undefined) {
        addFinding(o.id, {
          code: "DECL_INCOMPLETA",
          severity: "info",
          title: "Declaración sin importe ni operación",
          explanation: `La declaración no indica importe ni número de operación, así que no se puede contrastar con los movimientos. ${note}`,
          movementKeys: [],
          claimId: c.id,
          relatedOrderIds: [],
          nextActions: ["copiar_mensaje"],
        });
        continue;
      }
      if (b.outstandingMinor === 0) {
        addFinding(o.id, {
          code: "DECL_PEDIDO_CONCILIADO",
          severity: "ok",
          title: "Pedido ya conciliado",
          explanation: "El pedido ya está conciliado con el archivo; la declaración no cambia los importes.",
          movementKeys: [],
          claimId: c.id,
          relatedOrderIds: [],
          nextActions: [],
        });
        continue;
      }
      const declared = c.declaredAmountMinor;
      const matches = sortedMovements.filter((m) => {
        const me = movements.get(m.key)!;
        return (
          m.status === "acreditado" &&
          m.currency === o.currency &&
          me.availableMinor === declared &&
          me.mentionedOrderIds.length === 0 &&
          !rejected.has(`${o.id}|${m.key}`)
        );
      });
      if (matches.length > 0) {
        for (const m of matches) {
          addCandidate({
            orderId: o.id,
            movementKey: m.key,
            basis: "declaracion",
            suggestedMinor: Math.min(declared, b.outstandingMinor),
            ambiguousWith: [],
          });
        }
        addFinding(o.id, {
          code: "DECL_CANDIDATOS_IMPORTE",
          severity: "atencion",
          title: "Movimientos con el importe declarado",
          explanation: `Hay ${matches.length === 1 ? "un movimiento" : `${matches.length} movimientos`} sin referencia por ${formatArs(declared)}: ${matches.map(movementLabel).join("; ")}. Coincide solo el importe: verificá antes de asignar. ${note}`,
          movementKeys: matches.map((m) => m.key),
          claimId: c.id,
          relatedOrderIds: [],
          nextActions: ["asignar_manual", "copiar_mensaje"],
        });
      } else if (proposals.length === 0 && b.views.length === 0) {
        addFinding(o.id, {
          code: "DECL_SIN_MOVIMIENTO",
          severity: "atencion",
          title: "No encontrado en el archivo importado",
          explanation: `El cliente declaró un pago de ${formatArs(declared)}, pero no hay un movimiento compatible en los movimientos importados. ${coverageSentence} Esto no significa que no haya pagado: puede faltar un archivo más reciente o el movimiento puede figurar con otros datos. ${note}`,
          movementKeys: [],
          claimId: c.id,
          relatedOrderIds: [],
          nextActions: ["importar_recientes", "copiar_mensaje"],
        });
      }
    }
  }

  // ---- Resultado por pedido ----
  const orders: OrderEvaluation[] = data.orders.map((o) => {
    const b = base.get(o.id)!;
    const proposals = proposalsByOrder.get(o.id) ?? [];
    const candidates = candidatesByOrder.get(o.id) ?? [];
    const findings = [...b.findings, ...(findingsByOrder.get(o.id) ?? [])];
    const anyMention = sortedMovements.some((m) => movements.get(m.key)!.mentionedOrderIds.includes(o.id));
    const nothingElseExplains =
      b.outstandingMinor > 0 &&
      proposals.length === 0 &&
      candidates.length === 0 &&
      !findings.some((f) => NOT_FOUND_CODES.has(f.code) || REVIEW_CODES.has(f.code));
    if (nothingElseExplains && coverage.files === 0 && data.movements.length === 0) {
      findings.push({
        code: "SIN_IMPORTACIONES",
        severity: "info",
        title: "Sin movimientos importados",
        explanation: "Todavía no se importó ningún archivo de movimientos para contrastar.",
        movementKeys: [],
        relatedOrderIds: [],
        nextActions: ["importar_recientes"],
      });
    } else if (nothingElseExplains && b.allocatedMinor > 0) {
      findings.push({
        code: "SALDO_PENDIENTE",
        severity: "atencion",
        title: "Saldo por conciliar",
        explanation: `Quedan ${formatArs(b.outstandingMinor)} por conciliar y ningún otro movimiento importado permite proponer una asignación. ${coverageSentence} Podés importar movimientos más recientes o consultar al cliente.`,
        movementKeys: [],
        relatedOrderIds: [],
        nextActions: ["importar_recientes", "copiar_mensaje"],
      });
    } else if (nothingElseExplains && !anyMention) {
      findings.push({
        code: "SIN_MOVIMIENTOS",
        severity: "info",
        title: "No encontrado en los movimientos importados",
        explanation: `Ningún movimiento importado menciona ${o.reference}. ${coverageSentence} No significa que no haya pagado.`,
        movementKeys: [],
        relatedOrderIds: [],
        nextActions: ["importar_recientes", "copiar_mensaje"],
      });
    }
    const status: OrderStatus =
      b.outstandingMinor === 0 ? "conciliado" : b.allocatedMinor > 0 ? "parcial" : "sin_conciliar";
    const attention: Attention = findings.some((f) => REVIEW_CODES.has(f.code))
      ? "revision"
      : proposals.length > 0
        ? "aprobacion"
        : findings.some((f) => NOT_FOUND_CODES.has(f.code))
          ? "sin_encontrar"
          : b.outstandingMinor > 0
            ? "esperando"
            : "ninguna";
    return {
      order: o,
      allocatedMinor: b.allocatedMinor,
      outstandingMinor: b.outstandingMinor,
      status,
      allocations: b.views,
      proposals,
      candidates,
      findings,
      claims: claimsByOrder.get(o.id) ?? [],
      attention,
    };
  });

  // ---- Hallazgos por movimiento (tabla D) ----
  const candidateMovements = new Set(
    [...candidatesByOrder.values()].flat().map((c) => c.movementKey),
  );
  for (const me of movements.values()) {
    const m = me.movement;
    if (m.status === "acreditado" && me.allocations.length > 0 && me.availableMinor > 0) {
      me.findings.push({
        code: "MOV_EXCEDENTE",
        severity: "atencion",
        title: "Importe sin asignar",
        explanation: `${movementLabel(m)} tiene ${formatArs(me.availableMinor)} sin asignar después de cubrir ${me.allocations.map((a) => refOf(a.orderId)).join(", ")}. Queda para revisión; no se asigna automáticamente a otro pedido. La app no recomienda ni ejecuta devoluciones.`,
        movementKeys: [m.key],
        relatedOrderIds: me.allocations.map((a) => a.orderId),
        nextActions: ["revisar_referencia", "asignar_manual"],
      });
    }
    if (
      m.status === "acreditado" &&
      me.allocations.length === 0 &&
      me.availableMinor > 0 &&
      me.mentionedOrderIds.length === 0 &&
      !candidateMovements.has(m.key)
    ) {
      me.findings.push({
        code: "MOV_SIN_PEDIDO",
        severity: "info",
        title: "Movimiento sin pedido asociado",
        explanation: `${movementLabel(m)} no menciona ningún pedido cargado ni coincide con un saldo pendiente.`,
        movementKeys: [m.key],
        relatedOrderIds: [],
        nextActions: ["asignar_manual"],
      });
    }
    const unknown = [m.reference, m.description]
      .flatMap(findReferenceLikeTokens)
      .filter((t) => knownPrefixes.has(t.split("-")[0] ?? "") && !orderIdByRefKey.has(t));
    if (unknown.length > 0) {
      me.findings.push({
        code: "MOV_REF_DESCONOCIDA",
        severity: "info",
        title: "Referencia a un pedido no cargado",
        explanation: `${movementLabel(m)} menciona ${[...new Set(unknown)].join(", ")}, que no coincide con ningún pedido cargado.`,
        movementKeys: [m.key],
        relatedOrderIds: [],
        nextActions: ["revisar_referencia"],
      });
    }
  }

  const byOrderId = new Map(orders.map((e) => [e.order.id, e]));
  const summary: EvaluationSummary = {
    orders: orders.length,
    proposals: orders.reduce((n, e) => n + e.proposals.length, 0),
    review: orders.filter((e) => e.attention === "revision").length,
    notFound: orders.filter((e) => e.attention === "sin_encontrar").length,
    waiting: orders.filter((e) => e.attention === "esperando").length,
    reconciled: orders.filter((e) => e.status === "conciliado").length,
    partial: orders.filter((e) => e.status === "parcial").length,
    openConflicts: data.conflicts.filter((c) => c.status === "abierto").length,
    movementsNeedingReview: [...movements.values()].filter((me) =>
      me.findings.some((f) => f.code === "MOV_EXCEDENTE" || f.code === "DATOS_INCONSISTENTES"),
    ).length,
  };

  return { orders, byOrderId, movements, coverage, summary };
}

/** Busca la propuesta vigente para un par pedido–movimiento. */
export function findProposal(ev: Evaluation, orderId: string, movementKey: string): Proposal | undefined {
  return ev.byOrderId.get(orderId)?.proposals.find((p) => p.movementKey === movementKey);
}
