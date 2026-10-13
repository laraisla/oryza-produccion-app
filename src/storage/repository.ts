/**
 * Operaciones de escritura. Cada una corre en UNA transacción de lectura y
 * escritura de IndexedDB: lee datos frescos, valida con las reglas puras y
 * escribe junto con su entrada de historial. Si algo falla, no se escribe nada.
 */
import { buildApprovedAllocation, buildManualAllocation, DomainError } from "@/domain/allocate";
import { formatArs } from "@/domain/money";
import { referenceKey } from "@/domain/references";
import {
  claimInputSchema,
  orderInputSchema,
  type Allocation,
  type ClaimInput,
  type Dataset,
  type HistoryEntry,
  type Movement,
  type Order,
  type OrderInput,
  type PaymentClaim,
} from "@/domain/schemas";
import { DEMO_CLAIMS, DEMO_CSV_1, DEMO_CSV_1_NAME, DEMO_ORDERS } from "@/demo/dataset";
import { changesFromPlan, type ImportChanges } from "@/importing/apply";
import { parseMovementsCsv } from "@/importing/csv";
import { planImport, type ImportPlan } from "@/importing/plan";
import type { CobroDB } from "./db";
import { newId, nowIso } from "./ids";

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}

function errorName(e: unknown): string {
  if (typeof e !== "object" || e === null) return "";
  const any = e as { name?: string; inner?: { name?: string } };
  return any.inner?.name ?? any.name ?? "";
}

/** Traduce errores técnicos a mensajes que la persona pueda accionar. */
export function toUserError(e: unknown): Error {
  if (e instanceof DomainError || e instanceof StorageError) return e;
  const name = errorName(e);
  if (name === "QuotaExceededError") {
    return new StorageError(
      "El navegador no tiene espacio para guardar. No se guardó el cambio. Exportá tus datos y liberá espacio.",
      { cause: e },
    );
  }
  if (["MissingAPIError", "OpenFailedError", "DatabaseClosedError", "InvalidStateError", "UnknownError"].includes(name)) {
    return new StorageError(
      "No se pudo usar el almacenamiento local del navegador (puede estar bloqueado o en modo privado). No se guardó el cambio.",
      { cause: e },
    );
  }
  const message = e instanceof Error ? e.message : String(e);
  return new StorageError(`No se pudo guardar: ${message}`, { cause: e });
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toUserError(e);
  }
}

function history(entry: Omit<HistoryEntry, "at" | "seq"> & { at?: string }): HistoryEntry {
  return { at: entry.at ?? nowIso(), ...entry };
}

export async function loadDataset(db: CobroDB): Promise<Dataset> {
  const [orders, claims, movements, allocations, rejections, imports, conflicts] = await Promise.all([
    db.orders.orderBy("createdAt").toArray(),
    db.claims.toArray(),
    db.movements.toArray(),
    db.allocations.toArray(),
    db.rejections.toArray(),
    db.imports.orderBy("importedAt").toArray(),
    db.conflicts.toArray(),
  ]);
  return { orders, claims, movements, allocations, rejections, imports, conflicts };
}

export async function loadHistory(db: CobroDB, limit = 200): Promise<HistoryEntry[]> {
  return db.history.orderBy("seq").reverse().limit(limit).toArray();
}

const DATA_TABLES = (db: CobroDB) => [
  db.orders,
  db.claims,
  db.movements,
  db.imports,
  db.conflicts,
  db.allocations,
  db.rejections,
  db.history,
];

// ---------------------------------------------------------------------------
// Pedidos y declaraciones

export async function createOrder(db: CobroDB, input: OrderInput): Promise<Order> {
  const parsed = orderInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("DATOS_INVALIDOS", parsed.error.issues.map((i) => i.message).join(" "));
  }
  const clean = parsed.data;
  const order: Order = {
    ...clean,
    id: newId(),
    referenceKey: referenceKey(clean.reference),
    createdAt: nowIso(),
  };
  // Sin claves undefined (IndexedDB las guarda igual, pero mantenemos registros limpios).
  for (const k of Object.keys(order) as Array<keyof Order>) {
    if (order[k] === undefined || order[k] === "") delete order[k];
  }
  return run(() =>
    db.transaction("rw", [db.orders, db.history], async () => {
      const dup = await db.orders.where("referenceKey").equals(order.referenceKey).first();
      if (dup) {
        throw new DomainError(
          "REFERENCIA_DUPLICADA",
          `Ya existe un pedido con la referencia ${dup.reference}. Usá otra referencia.`,
        );
      }
      await db.orders.add(order);
      await db.history.add(
        history({
          action: "pedido_creado",
          orderIds: [order.id],
          movementKeys: [],
          summary: `Pedido ${order.reference} creado: ${order.customerName}, ${formatArs(order.totalMinor)}.`,
        }),
      );
      return order;
    }),
  );
}

export async function addClaim(db: CobroDB, input: ClaimInput): Promise<PaymentClaim> {
  const parsed = claimInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("DATOS_INVALIDOS", parsed.error.issues.map((i) => i.message).join(" "));
  }
  const claim: PaymentClaim = { ...parsed.data, id: newId(), createdAt: nowIso() };
  if (!claim.mentionedOperation) delete claim.mentionedOperation;
  return run(() =>
    db.transaction("rw", [db.orders, db.claims, db.history], async () => {
      const order = await db.orders.get(claim.orderId);
      if (!order) throw new DomainError("PEDIDO_INEXISTENTE", "El pedido no existe.");
      await db.claims.add(claim);
      await db.history.add(
        history({
          action: "declaracion_registrada",
          orderIds: [order.id],
          movementKeys: [],
          summary: `Declaración de pago registrada para ${order.reference}${claim.declaredAmountMinor ? ` (${formatArs(claim.declaredAmountMinor)} declarados)` : ""}. No suma dinero conciliado.`,
        }),
      );
      return claim;
    }),
  );
}

// ---------------------------------------------------------------------------
// Importación

export async function previewImport(db: CobroDB, text: string): Promise<ImportPlan> {
  const parsed = parseMovementsCsv(text);
  const existing = new Map((await db.movements.toArray()).map((m) => [m.key, m]));
  return planImport(parsed, existing);
}

export interface ImportResult extends ImportChanges {
  plan: ImportPlan;
}

export async function confirmImport(db: CobroDB, text: string, fileName: string): Promise<ImportResult> {
  const parsed = parseMovementsCsv(text);
  if (parsed.fileErrors.length > 0) {
    throw new DomainError("DATOS_INVALIDOS", parsed.fileErrors.join(" "));
  }
  const safeName = fileName.slice(0, 200) || "archivo.csv";
  return run(() =>
    db.transaction(
      "rw",
      [db.movements, db.imports, db.conflicts, db.allocations, db.orders, db.history],
      async () => {
        // Se vuelve a planificar con datos frescos dentro de la transacción.
        const existing = new Map((await db.movements.toArray()).map((m) => [m.key, m]));
        const plan = planImport(parsed, existing);
        if (plan.items.length === 0) {
          throw new DomainError("DATOS_INVALIDOS", "No hay filas válidas para importar.");
        }
        const at = nowIso();
        const importId = newId();
        const changes = changesFromPlan(
          plan,
          { importId, fileName: safeName, importedAt: at, newId },
          await db.conflicts.where("status").equals("abierto").toArray(),
        );
        await db.imports.add(changes.batch);
        if (changes.added.length) await db.movements.bulkAdd(changes.added);
        for (const u of changes.statusUpdates) await db.movements.put(u.after);
        if (changes.conflicts.length) await db.conflicts.bulkAdd(changes.conflicts);

        const entries: HistoryEntry[] = [
          history({
            at,
            action: "importacion_confirmada",
            orderIds: [],
            movementKeys: changes.added.map((m) => m.key),
            importId,
            summary: `Archivo «${safeName}» importado: ${changes.added.length} nuevos, ${changes.batch.unchanged} sin cambios, ${changes.statusUpdates.length} cambios de estado, ${plan.counts.conflicto} conflictos, ${plan.counts.errores} filas con error.`,
          }),
        ];
        for (const u of changes.statusUpdates) {
          const affected = await db.allocations.where("movementKey").equals(u.after.key).toArray();
          const vigentes = affected.filter((a) => a.status === "vigente");
          const orders = await db.orders.bulkGet(vigentes.map((a) => a.orderId));
          entries.push(
            history({
              at,
              action: "movimiento_estado_actualizado",
              orderIds: vigentes.map((a) => a.orderId),
              movementKeys: [u.after.key],
              importId,
              summary: `${u.after.externalId}: estado «${u.before.status}» → «${u.after.status}».${vigentes.length ? ` Asignaciones afectadas: ${orders.map((o) => o?.reference ?? "?").join(", ")} (se recalculan).` : ""}`,
            }),
          );
        }
        for (const c of changes.conflicts) {
          entries.push(
            history({
              at,
              action: "conflicto_detectado",
              orderIds: [],
              movementKeys: [c.movementKey],
              importId,
              summary: `Conflicto en ${c.incoming.externalId} (fila ${c.rowNumber}): cambia ${c.fields.join(", ")}. Se conservaron los datos anteriores.`,
            }),
          );
        }
        await db.history.bulkAdd(entries);
        return { ...changes, plan };
      },
    ),
  );
}

export async function markConflictReviewed(db: CobroDB, conflictId: string): Promise<void> {
  return run(() =>
    db.transaction("rw", [db.conflicts, db.history], async () => {
      const c = await db.conflicts.get(conflictId);
      if (!c || c.status !== "abierto") return;
      await db.conflicts.update(conflictId, { status: "revisado", reviewedAt: nowIso() });
      await db.history.add(
        history({
          action: "conflicto_revisado",
          orderIds: [],
          movementKeys: [c.movementKey],
          summary: `Conflicto de ${c.incoming.externalId} marcado como revisado. Se mantienen los datos ya importados.`,
        }),
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Asignaciones

async function datasetInTx(db: CobroDB): Promise<Dataset> {
  return loadDataset(db);
}

const ALLOC_TABLES = (db: CobroDB) => [
  db.orders,
  db.claims,
  db.movements,
  db.allocations,
  db.rejections,
  db.imports,
  db.conflicts,
  db.history,
];

function isConstraint(e: unknown) {
  return errorName(e) === "ConstraintError";
}

export async function approveProposal(
  db: CobroDB,
  orderId: string,
  movementKey: string,
  expectedAmountMinor: number,
): Promise<Allocation> {
  try {
    return await db.transaction("rw", ALLOC_TABLES(db), async () => {
      const data = await datasetInTx(db);
      const allocation = buildApprovedAllocation(data, orderId, movementKey, expectedAmountMinor, {
        id: newId(),
        confirmedAt: nowIso(),
      });
      await db.allocations.add(allocation);
      const order = data.orders.find((o) => o.id === orderId)!;
      const mv = data.movements.find((m) => m.key === movementKey)!;
      await db.history.add(
        history({
          action: "asignacion_aprobada",
          orderIds: [orderId],
          movementKeys: [movementKey],
          allocationId: allocation.id,
          summary: `Asociación aprobada: ${formatArs(allocation.amountMinor)} de ${mv.externalId} a ${order.reference}.`,
          reason: "Referencia explícita, moneda compatible y movimiento acreditado; aprobada por la persona usuaria.",
        }),
      );
      return allocation;
    });
  } catch (e) {
    if (isConstraint(e)) throw new DomainError("YA_ASIGNADO", "Esta asociación ya estaba confirmada. No se duplicó.");
    throw toUserError(e);
  }
}

export async function assignManually(
  db: CobroDB,
  orderId: string,
  movementKey: string,
  amountMinor: number,
  note: string,
): Promise<Allocation> {
  try {
    return await db.transaction("rw", ALLOC_TABLES(db), async () => {
      const data = await datasetInTx(db);
      const allocation = buildManualAllocation(data, orderId, movementKey, amountMinor, note, {
        id: newId(),
        confirmedAt: nowIso(),
      });
      await db.allocations.add(allocation);
      const order = data.orders.find((o) => o.id === orderId)!;
      const mv = data.movements.find((m) => m.key === movementKey)!;
      await db.history.add(
        history({
          action: "asignacion_manual",
          orderIds: [orderId],
          movementKeys: [movementKey],
          allocationId: allocation.id,
          summary: `Asignación manual: ${formatArs(allocation.amountMinor)} de ${mv.externalId} a ${order.reference}.`,
          reason: allocation.note,
        }),
      );
      return allocation;
    });
  } catch (e) {
    if (isConstraint(e)) throw new DomainError("YA_ASIGNADO", "Ese movimiento ya tiene una asignación vigente a este pedido.");
    throw toUserError(e);
  }
}

export async function releaseAllocation(db: CobroDB, allocationId: string, reason: string): Promise<void> {
  const why = reason.trim();
  if (why.length < 5) throw new DomainError("MOTIVO_REQUERIDO", "Escribí el motivo para liberar la asignación (mínimo 5 caracteres).");
  return run(() =>
    db.transaction("rw", [db.allocations, db.orders, db.movements, db.history], async () => {
      const a = await db.allocations.get(allocationId);
      if (!a || a.status !== "vigente") {
        throw new DomainError("ASIGNACION_INEXISTENTE", "La asignación ya no está vigente.");
      }
      const released: Allocation = { ...a, status: "liberada", releasedAt: nowIso(), releaseReason: why.slice(0, 300) };
      delete released.activeKey;
      await db.allocations.put(released);
      const order = await db.orders.get(a.orderId);
      const mv = await db.movements.get(a.movementKey);
      await db.history.add(
        history({
          action: "asignacion_liberada",
          orderIds: [a.orderId],
          movementKeys: [a.movementKey],
          allocationId: a.id,
          summary: `Asignación liberada: ${formatArs(a.amountMinor)} de ${mv?.externalId ?? "?"} a ${order?.reference ?? "?"}.`,
          reason: why,
        }),
      );
    }),
  );
}

export async function rejectProposal(db: CobroDB, orderId: string, movementKey: string, reason?: string): Promise<void> {
  return run(() =>
    db.transaction("rw", [db.rejections, db.orders, db.movements, db.history], async () => {
      const exists = await db.rejections.where({ orderId, movementKey }).first();
      if (exists) return;
      const why = reason?.trim().slice(0, 300);
      await db.rejections.add({
        id: newId(),
        orderId,
        movementKey,
        rejectedAt: nowIso(),
        ...(why ? { reason: why } : {}),
      });
      const order = await db.orders.get(orderId);
      const mv = await db.movements.get(movementKey);
      await db.history.add(
        history({
          action: "propuesta_rechazada",
          orderIds: [orderId],
          movementKeys: [movementKey],
          summary: `Propuesta rechazada: ${mv?.externalId ?? "?"} para ${order?.reference ?? "?"}.`,
          ...(why ? { reason: why } : {}),
        }),
      );
    }),
  );
}

export async function undoRejection(db: CobroDB, orderId: string, movementKey: string): Promise<void> {
  return run(() =>
    db.transaction("rw", [db.rejections, db.orders, db.movements, db.history], async () => {
      const r = await db.rejections.where({ orderId, movementKey }).first();
      if (!r) return;
      await db.rejections.delete(r.id);
      const order = await db.orders.get(orderId);
      const mv = await db.movements.get(movementKey);
      await db.history.add(
        history({
          action: "rechazo_deshecho",
          orderIds: [orderId],
          movementKeys: [movementKey],
          summary: `Rechazo deshecho: ${mv?.externalId ?? "?"} vuelve a evaluarse para ${order?.reference ?? "?"}.`,
        }),
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Demostración y datos locales

export async function isEmpty(db: CobroDB): Promise<boolean> {
  const counts = await Promise.all([db.orders.count(), db.movements.count(), db.claims.count()]);
  return counts.every((n) => n === 0);
}

/**
 * Carga las ENTRADAS de la demo por los mismos caminos que usa una persona.
 * No escribe resultados: el motor los calcula.
 */
export async function loadDemo(db: CobroDB): Promise<void> {
  // Una sola transacción: si algo falla, no queda una demo a medias.
  return run(() =>
    db.transaction("rw", DATA_TABLES(db), async () => {
      if (!(await isEmpty(db))) {
        throw new DomainError(
          "DATOS_INVALIDOS",
          "Ya hay datos cargados. Usá «Reiniciar demostración» para reemplazarlos por el ejemplo.",
        );
      }
      const ids = new Map<string, string>();
      for (const o of DEMO_ORDERS) {
        const created = await createOrder(db, o);
        ids.set(o.reference, created.id);
      }
      for (const c of DEMO_CLAIMS) {
        await addClaim(db, {
          orderId: ids.get(c.orderReference)!,
          receivedText: c.receivedText,
          ...(c.declaredAmountMinor ? { declaredAmountMinor: c.declaredAmountMinor } : {}),
          ...(c.mentionedOperation ? { mentionedOperation: c.mentionedOperation } : {}),
        });
      }
      await confirmImport(db, DEMO_CSV_1, DEMO_CSV_1_NAME);
      await db.history.add(
        history({
          action: "demo_cargada",
          orderIds: [],
          movementKeys: [],
          summary: "Ejemplo con datos sintéticos cargado (6 pedidos, 2 declaraciones, 1 archivo de movimientos).",
        }),
      );
    }),
  );
}

/** Vacía las tablas de esta app (no toca otro almacenamiento del navegador). */
export async function clearAll(db: CobroDB): Promise<void> {
  return run(() =>
    db.transaction("rw", DATA_TABLES(db), async () => {
      await Promise.all(DATA_TABLES(db).map((t) => t.clear()));
    }),
  );
}

export async function resetDemo(db: CobroDB): Promise<void> {
  return run(() =>
    db.transaction("rw", DATA_TABLES(db), async () => {
      await clearAll(db);
      await loadDemo(db);
    }),
  );
}

export async function getMovement(db: CobroDB, key: string): Promise<Movement | undefined> {
  return db.movements.get(key);
}

