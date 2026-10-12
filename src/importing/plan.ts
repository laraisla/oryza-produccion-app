/**
 * Plan de importación: clasifica cada fila válida frente a lo ya guardado.
 * Clave de deduplicación: cuenta (normalizada) + identificador externo.
 * Función pura; la capa de almacenamiento la vuelve a ejecutar dentro de la
 * transacción antes de escribir.
 */
import { formatArs } from "@/domain/money";
import { movementKey, type Movement, type MovementDraft } from "@/domain/schemas";
import type { CsvParseResult, RowError } from "./csv";

export type PlanKind = "nuevo" | "sin_cambios" | "estado_actualizado" | "conflicto" | "repetido_en_archivo";

export interface PlanItem {
  row: number;
  kind: PlanKind;
  key: string;
  draft: MovementDraft;
  existing?: Movement;
  /** Campos materiales que difieren (solo conflicto o estado). */
  changedFields: Array<keyof MovementDraft>;
}

export interface ImportPlan {
  items: PlanItem[];
  errors: RowError[];
  fileErrors: string[];
  warnings: string[];
  periodFrom?: string;
  periodTo?: string;
  accounts: string[];
  counts: Record<PlanKind, number> & { errores: number; total: number };
}

const MATERIAL: Array<keyof MovementDraft> = ["date", "amountMinor", "currency", "reference"];

export const FIELD_LABELS: Record<keyof MovementDraft, string> = {
  externalId: "identificador",
  account: "cuenta",
  date: "fecha",
  amountMinor: "importe",
  currency: "moneda",
  status: "estado",
  reference: "referencia",
  description: "descripción",
};

export function describeValue(field: keyof MovementDraft, d: MovementDraft): string {
  if (field === "amountMinor") return formatArs(d.amountMinor);
  const v = d[field];
  return v === "" ? "(vacío)" : String(v);
}

function diff(a: MovementDraft, b: MovementDraft, fields: Array<keyof MovementDraft>) {
  return fields.filter((f) => a[f] !== b[f]);
}

export function planImport(parsed: CsvParseResult, existing: ReadonlyMap<string, Movement>): ImportPlan {
  const items: PlanItem[] = [];
  const errors: RowError[] = [...parsed.errors];
  const seen = new Map<string, { row: number; draft: MovementDraft }>();

  for (const { row, draft } of parsed.rows) {
    const key = movementKey(draft.account, draft.externalId);
    const prev = seen.get(key);
    if (prev) {
      const changed = diff(prev.draft, draft, [...MATERIAL, "status"]);
      if (changed.length === 0) {
        items.push({ row, kind: "repetido_en_archivo", key, draft, changedFields: [] });
      } else {
        errors.push({
          row,
          message: `El identificador ${draft.externalId} (${draft.account}) ya aparece en la fila ${prev.row} con otro/a ${changed.map((f) => FIELD_LABELS[f]).join(", ")}. No se importa esta fila.`,
        });
      }
      continue;
    }
    seen.set(key, { row, draft });

    const current = existing.get(key);
    if (!current) {
      items.push({ row, kind: "nuevo", key, draft, changedFields: [] });
      continue;
    }
    const material = diff(current, draft, MATERIAL);
    if (material.length > 0) {
      items.push({ row, kind: "conflicto", key, draft, existing: current, changedFields: material });
    } else if (current.status !== draft.status) {
      items.push({ row, kind: "estado_actualizado", key, draft, existing: current, changedFields: ["status"] });
    } else {
      items.push({ row, kind: "sin_cambios", key, draft, existing: current, changedFields: [] });
    }
  }

  const dates = parsed.rows.map((r) => r.draft.date).sort();
  const counts = {
    nuevo: 0,
    sin_cambios: 0,
    estado_actualizado: 0,
    conflicto: 0,
    repetido_en_archivo: 0,
    errores: new Set(errors.map((e) => e.row)).size,
    total: parsed.totalDataRows,
  };
  for (const it of items) counts[it.kind]++;

  return {
    items,
    errors: errors.sort((a, b) => a.row - b.row),
    fileErrors: parsed.fileErrors,
    warnings: parsed.warnings,
    ...(dates[0] ? { periodFrom: dates[0] } : {}),
    ...(dates.at(-1) ? { periodTo: dates.at(-1) } : {}),
    accounts: [...new Set(parsed.rows.map((r) => r.draft.account))],
    counts,
  };
}

/** ¿Hay algo para escribir? (nuevos, cambios de estado o conflictos a registrar) */
export function planHasChanges(plan: ImportPlan): boolean {
  return plan.counts.nuevo + plan.counts.estado_actualizado + plan.counts.conflicto > 0;
}
