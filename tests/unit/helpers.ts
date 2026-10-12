import { buildApprovedAllocation, buildManualAllocation } from "@/domain/allocate";
import { referenceKey } from "@/domain/references";
import { evaluate, type OrderEvaluation } from "@/domain/reconcile";
import {
  movementKey,
  type Dataset,
  type Movement,
  type MovementStatus,
  type Order,
  type PaymentClaim,
} from "@/domain/schemas";
import { changesFromPlan } from "@/importing/apply";
import { parseMovementsCsv } from "@/importing/csv";
import { planImport } from "@/importing/plan";

let seq = 0;
export const nextId = () => `id-${++seq}`;
const AT = "2026-09-20T12:00:00.000Z";

export function emptyDataset(): Dataset {
  return { orders: [], claims: [], movements: [], allocations: [], rejections: [], imports: [], conflicts: [] };
}

export function order(reference: string, totalMinor: number, extra: Partial<Order> = {}): Order {
  return {
    id: `o-${reference}`,
    reference,
    referenceKey: referenceKey(reference),
    customerName: "Cliente ficticio",
    totalMinor,
    currency: "ARS",
    orderDate: "2026-09-14",
    createdAt: AT,
    ...extra,
  };
}

export function movement(
  externalId: string,
  amountMinor: number,
  opts: { status?: MovementStatus; reference?: string; description?: string; date?: string; account?: string } = {},
): Movement {
  const account = opts.account ?? "Cuenta test";
  return {
    key: movementKey(account, externalId),
    externalId,
    account,
    date: opts.date ?? "2026-09-15",
    amountMinor,
    currency: "ARS",
    status: opts.status ?? "acreditado",
    reference: opts.reference ?? "",
    description: opts.description ?? "",
    provenance: { importId: "imp-test", fileName: "test.csv", rowNumber: 2, importedAt: AT },
  };
}

export function claim(orderId: string, extra: Partial<PaymentClaim> = {}): PaymentClaim {
  return { id: nextId(), orderId, receivedText: "Texto ficticio", createdAt: AT, ...extra };
}

export function dataset(parts: Partial<Dataset>): Dataset {
  return { ...emptyDataset(), ...parts };
}

export function importCsv(data: Dataset, csv: string, fileName = "test.csv"): Dataset {
  const parsed = parseMovementsCsv(csv);
  const existing = new Map(data.movements.map((m) => [m.key, m]));
  const plan = planImport(parsed, existing);
  const ch = changesFromPlan(plan, { importId: nextId(), fileName, importedAt: AT, newId: nextId }, data.conflicts);
  const updated = new Map(ch.statusUpdates.map((u) => [u.after.key, u.after]));
  return {
    ...data,
    movements: [...data.movements.map((m) => updated.get(m.key) ?? m), ...ch.added],
    conflicts: [...data.conflicts, ...ch.conflicts],
    imports: [...data.imports, ch.batch],
  };
}

export function approve(data: Dataset, orderId: string, mKey: string, expected?: number): Dataset {
  const ev = evaluate(data);
  const p = ev.byOrderId.get(orderId)?.proposals.find((x) => x.movementKey === mKey);
  const amount = expected ?? p?.amountMinor ?? -1;
  const a = buildApprovedAllocation(data, orderId, mKey, amount, { id: nextId(), confirmedAt: AT });
  return { ...data, allocations: [...data.allocations, a] };
}

export function assignManual(data: Dataset, orderId: string, mKey: string, amount: number, note: string): Dataset {
  const a = buildManualAllocation(data, orderId, mKey, amount, note, { id: nextId(), confirmedAt: AT });
  return { ...data, allocations: [...data.allocations, a] };
}

export function codes(oe: OrderEvaluation | undefined): string[] {
  return (oe?.findings ?? []).map((f) => f.code);
}
