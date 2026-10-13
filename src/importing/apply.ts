/**
 * Convierte un plan de importación en cambios concretos. Puro: la capa de
 * almacenamiento escribe el resultado dentro de una transacción.
 */
import type { ImportBatch, ImportConflict, Movement } from "@/domain/schemas";
import type { ImportPlan } from "./plan";

export interface ImportContext {
  importId: string;
  fileName: string;
  importedAt: string;
  newId: () => string;
}

export interface ImportChanges {
  batch: ImportBatch;
  added: Movement[];
  statusUpdates: Array<{ before: Movement; after: Movement }>;
  conflicts: ImportConflict[];
}

export function changesFromPlan(
  plan: ImportPlan,
  ctx: ImportContext,
  openConflicts: readonly ImportConflict[] = [],
): ImportChanges {
  const added: Movement[] = [];
  const statusUpdates: ImportChanges["statusUpdates"] = [];
  const conflicts: ImportConflict[] = [];

  for (const item of plan.items) {
    const provenance = {
      importId: ctx.importId,
      fileName: ctx.fileName,
      rowNumber: item.row,
      importedAt: ctx.importedAt,
    };
    if (item.kind === "nuevo") {
      added.push({ ...item.draft, key: item.key, provenance });
    } else if (item.kind === "estado_actualizado" && item.existing) {
      statusUpdates.push({
        before: item.existing,
        after: { ...item.existing, status: item.draft.status, statusUpdatedBy: provenance },
      });
    } else if (item.kind === "conflicto" && item.existing) {
      const already = openConflicts.some(
        (c) =>
          c.status === "abierto" &&
          c.movementKey === item.key &&
          JSON.stringify(c.incoming) === JSON.stringify(item.draft),
      );
      if (!already) {
        conflicts.push({
          id: ctx.newId(),
          movementKey: item.key,
          importId: ctx.importId,
          fileName: ctx.fileName,
          rowNumber: item.row,
          detectedAt: ctx.importedAt,
          existing: {
            externalId: item.existing.externalId,
            account: item.existing.account,
            date: item.existing.date,
            amountMinor: item.existing.amountMinor,
            currency: item.existing.currency,
            status: item.existing.status,
            reference: item.existing.reference,
            description: item.existing.description,
          },
          incoming: item.draft,
          fields: item.changedFields,
          status: "abierto",
        });
      }
    }
  }

  const batch: ImportBatch = {
    id: ctx.importId,
    fileName: ctx.fileName,
    importedAt: ctx.importedAt,
    accounts: plan.accounts,
    ...(plan.periodFrom ? { periodFrom: plan.periodFrom } : {}),
    ...(plan.periodTo ? { periodTo: plan.periodTo } : {}),
    totalRows: plan.counts.total,
    added: added.length,
    unchanged: plan.counts.sin_cambios + plan.counts.repetido_en_archivo,
    statusUpdates: statusUpdates.length,
    conflicts: plan.counts.conflicto,
    errors: plan.counts.errores,
  };

  return { batch, added, statusUpdates, conflicts };
}
