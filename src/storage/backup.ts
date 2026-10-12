/**
 * Exportar y restaurar los datos del prototipo (JSON). La restauración valida
 * estructura e integridad antes de reemplazar nada y lo hace en una sola
 * transacción.
 */
import { z } from "zod";
import { DomainError } from "@/domain/allocate";
import { referenceKey } from "@/domain/references";
import {
  allocationSchema,
  claimSchema,
  historyEntrySchema,
  importBatchSchema,
  importConflictSchema,
  movementKey,
  movementSchema,
  orderSchema,
  rejectionSchema,
} from "@/domain/schemas";
import type { CobroDB } from "./db";
import { nowIso } from "./ids";
import { loadDataset, toUserError } from "./repository";

export const BACKUP_MAX_BYTES = 5_000_000;
const MAX_ITEMS = 20_000;

const backupSchema = z.object({
  app: z.literal("cobro-claro"),
  kind: z.literal("respaldo-prototipo"),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  notice: z.string().optional(),
  data: z.object({
    orders: z.array(orderSchema).max(MAX_ITEMS),
    claims: z.array(claimSchema).max(MAX_ITEMS),
    movements: z.array(movementSchema).max(MAX_ITEMS),
    imports: z.array(importBatchSchema).max(MAX_ITEMS),
    conflicts: z.array(importConflictSchema).max(MAX_ITEMS),
    allocations: z.array(allocationSchema).max(MAX_ITEMS),
    rejections: z.array(rejectionSchema).max(MAX_ITEMS),
    history: z.array(historyEntrySchema).max(MAX_ITEMS * 5),
  }),
});
export type BackupFile = z.infer<typeof backupSchema>;

export async function exportBackup(db: CobroDB): Promise<BackupFile> {
  const data = await loadDataset(db);
  const history = await db.history.orderBy("seq").toArray();
  return {
    app: "cobro-claro",
    kind: "respaldo-prototipo",
    schemaVersion: 1,
    exportedAt: nowIso(),
    notice:
      "Datos de un prototipo local. No es un comprobante ni un registro contable o legal; el historial puede modificarse técnicamente.",
    data: { ...data, history },
  };
}

function dupes(values: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const v of values) (seen.has(v) ? out : seen).add(v);
  return [...out];
}

/** Devuelve la lista de problemas de integridad (vacía si el respaldo es coherente). */
export function integrityProblems(file: BackupFile): string[] {
  const d = file.data;
  const problems: string[] = [];
  const orderIds = new Set(d.orders.map((o) => o.id));
  const movementKeys = new Set(d.movements.map((m) => m.key));

  for (const id of dupes(d.orders.map((o) => o.id))) problems.push(`Pedido duplicado: ${id}.`);
  for (const k of dupes(d.orders.map((o) => o.referenceKey))) problems.push(`Referencia de pedido repetida: ${k}.`);
  for (const o of d.orders) {
    if (o.referenceKey !== referenceKey(o.reference)) problems.push(`Clave de referencia incoherente en ${o.reference}.`);
  }
  for (const k of dupes(d.movements.map((m) => m.key))) problems.push(`Movimiento duplicado: ${k}.`);
  for (const m of d.movements) {
    if (m.key !== movementKey(m.account, m.externalId)) problems.push(`Clave incoherente en el movimiento ${m.externalId}.`);
  }
  for (const c of d.claims) {
    if (!orderIds.has(c.orderId)) problems.push(`Declaración ${c.id} apunta a un pedido inexistente.`);
  }
  for (const id of dupes(d.allocations.map((a) => a.id))) problems.push(`Asignación duplicada: ${id}.`);
  const vigentes = d.allocations.filter((a) => a.status === "vigente");
  for (const a of d.allocations) {
    if (!orderIds.has(a.orderId)) problems.push(`Asignación ${a.id} apunta a un pedido inexistente.`);
    if (!movementKeys.has(a.movementKey)) problems.push(`Asignación ${a.id} apunta a un movimiento inexistente.`);
    if (a.status === "vigente" && a.activeKey !== `${a.orderId}|${a.movementKey}`) {
      problems.push(`Asignación vigente ${a.id} con clave activa incoherente.`);
    }
    if (a.status === "liberada" && a.activeKey !== undefined) problems.push(`Asignación liberada ${a.id} con clave activa.`);
  }
  for (const k of dupes(vigentes.map((a) => `${a.orderId}|${a.movementKey}`))) {
    problems.push(`Más de una asignación vigente para el mismo par pedido–movimiento (${k}).`);
  }
  for (const m of d.movements) {
    const total = vigentes.filter((a) => a.movementKey === m.key).reduce((n, a) => n + a.amountMinor, 0);
    if (total > m.amountMinor) problems.push(`El movimiento ${m.externalId} tiene asignado más que su importe.`);
  }
  for (const o of d.orders) {
    const total = vigentes.filter((a) => a.orderId === o.id).reduce((n, a) => n + a.amountMinor, 0);
    if (total > o.totalMinor) problems.push(`El pedido ${o.reference} tiene asignado más que su total.`);
  }
  for (const r of d.rejections) {
    if (!orderIds.has(r.orderId) || !movementKeys.has(r.movementKey)) problems.push(`Rechazo ${r.id} con referencias inexistentes.`);
  }
  for (const k of dupes(d.rejections.map((r) => `${r.orderId}|${r.movementKey}`))) problems.push(`Rechazo repetido (${k}).`);
  return problems;
}

export type RestoreCheck = { ok: true; file: BackupFile } | { ok: false; problems: string[] };

export function checkBackupText(text: string): RestoreCheck {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) {
    return { ok: false, problems: [`El archivo supera ${BACKUP_MAX_BYTES / 1_000_000} MB.`] };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["El archivo no es un JSON válido."] };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "archivo"}: ${i.message}`),
    };
  }
  const problems = integrityProblems(parsed.data);
  return problems.length ? { ok: false, problems: problems.slice(0, 20) } : { ok: true, file: parsed.data };
}

/** Reemplaza todos los datos locales por el respaldo validado (atómico). */
export async function restoreBackup(db: CobroDB, file: BackupFile): Promise<void> {
  const problems = integrityProblems(file);
  if (problems.length) throw new DomainError("DATOS_INVALIDOS", problems.join(" "));
  const d = file.data;
  try {
    await db.transaction("rw", db.allTables, async () => {
      await Promise.all(db.allTables.map((t) => t.clear()));
      await db.orders.bulkAdd(d.orders);
      await db.claims.bulkAdd(d.claims);
      await db.movements.bulkAdd(d.movements);
      await db.imports.bulkAdd(d.imports);
      await db.conflicts.bulkAdd(d.conflicts);
      await db.allocations.bulkAdd(d.allocations);
      await db.rejections.bulkAdd(d.rejections);
      // El número de secuencia lo asigna la base nueva.
      await db.history.bulkAdd(
        d.history.map((h) => {
          const copy = { ...h };
          delete copy.seq;
          return copy;
        }),
      );
      await db.history.add({
        at: nowIso(),
        action: "datos_restaurados",
        orderIds: [],
        movementKeys: [],
        summary: `Datos restaurados desde un respaldo exportado el ${file.exportedAt}.`,
      });
    });
  } catch (e) {
    throw toUserError(e);
  }
}
