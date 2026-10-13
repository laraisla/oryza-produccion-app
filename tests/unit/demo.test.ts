/**
 * Recorrido de la demostración con datos sintéticos, calculado por el motor.
 * Cálculos verificados a mano:
 *  A. PED-101 $45.000 − MOV-001 $45.000 = $0          → completa
 *  B. PED-102 $30.000 − MOV-002 $20.000 = $10.000     → parcial
 *     + MOV-004 $10.000 (archivo 2)     = $0          → conciliado
 *  C. PED-103 declara MOV-001 (ya de PED-101)         → asignado $0, saldo $45.000
 *  D. PED-104 declara $18.000, sin movimiento          → no encontrado
 *  E. PED-105/106 $25.000 y MOV-003 $25.000 sin ref.   → revisión, nada asignado
 */
import { describe, expect, it } from "vitest";
import { evaluate } from "@/domain/reconcile";
import { messageDrafts } from "@/domain/messages";
import { referenceKey } from "@/domain/references";
import type { Dataset, Order } from "@/domain/schemas";
import { DEMO_CLAIMS, DEMO_CSV_1, DEMO_CSV_2, DEMO_ORDERS } from "@/demo/dataset";
import { approve, claim, codes, emptyDataset, importCsv } from "./helpers";

function loadDemo(): Dataset {
  const orders: Order[] = DEMO_ORDERS.map((o) => ({
    ...o,
    id: `id-${o.reference}`,
    referenceKey: referenceKey(o.reference),
    createdAt: "2026-09-20T00:00:00.000Z",
  }));
  const claims = DEMO_CLAIMS.map((c) =>
    claim(`id-${c.orderReference}`, {
      receivedText: c.receivedText,
      ...(c.declaredAmountMinor ? { declaredAmountMinor: c.declaredAmountMinor } : {}),
      ...(c.mentionedOperation ? { mentionedOperation: c.mentionedOperation } : {}),
    }),
  );
  return importCsv({ ...emptyDataset(), orders, claims }, DEMO_CSV_1, "movimientos-demo-1.csv");
}

const key = (d: Dataset, id: string) => d.movements.find((m) => m.externalId === id)!.key;

describe("demo: estado inicial calculado", () => {
  const d = loadDemo();
  const ev = evaluate(d);
  const get = (ref: string) => ev.byOrderId.get(`id-${ref}`)!;

  it("A: PED-101 tiene propuesta completa por $45.000", () => {
    expect(get("PED-101").proposals).toHaveLength(1);
    expect(get("PED-101").proposals[0]).toMatchObject({ code: "PROP_COMPLETA", amountMinor: 4_500_000 });
  });
  it("B: PED-102 tiene propuesta parcial por $20.000 con saldo de $10.000", () => {
    expect(get("PED-102").proposals[0]).toMatchObject({ code: "PROP_PARCIAL", amountMinor: 2_000_000, outstandingAfterMinor: 1_000_000 });
  });
  it("C: PED-103 menciona MOV-001, que corresponde a otro pedido", () => {
    expect(codes(get("PED-103"))).toContain("DECL_MOV_REF_OTRO");
    expect(codes(get("PED-103"))).not.toContain("SIN_MOVIMIENTOS");
    expect(get("PED-103").proposals).toEqual([]);
  });
  it("D: PED-104 no encontrado en el archivo importado", () => {
    expect(get("PED-104").attention).toBe("sin_encontrar");
    expect(codes(get("PED-104"))).toContain("DECL_SIN_MOVIMIENTO");
  });
  it("E: PED-105 y PED-106 requieren revisión sin asignación", () => {
    for (const ref of ["PED-105", "PED-106"]) {
      expect(get(ref).attention).toBe("revision");
      expect(get(ref).proposals).toEqual([]);
      expect(codes(get(ref))).toContain("CAND_IMPORTE_AMBIGUO");
    }
  });
  it("ningún pedido aparece conciliado antes de aprobar", () => {
    expect(ev.summary.reconciled).toBe(0);
    expect(ev.orders.every((o) => o.allocatedMinor === 0)).toBe(true);
    expect(ev.coverage).toMatchObject({ files: 1, from: "2026-09-15", to: "2026-09-17" });
  });
});

describe("demo: recorrido del guion", () => {
  it("aprobar PED-101 y PED-102; PED-103 advierte movimiento ya utilizado", () => {
    let d = loadDemo();
    d = approve(d, "id-PED-101", key(d, "MOV-001"));
    d = approve(d, "id-PED-102", key(d, "MOV-002"));
    const ev = evaluate(d);
    expect(ev.byOrderId.get("id-PED-101")).toMatchObject({ status: "conciliado", allocatedMinor: 4_500_000, outstandingMinor: 0 });
    expect(ev.byOrderId.get("id-PED-102")).toMatchObject({ status: "parcial", allocatedMinor: 2_000_000, outstandingMinor: 1_000_000 });
    const c = ev.byOrderId.get("id-PED-103")!;
    expect(c).toMatchObject({ allocatedMinor: 0, outstandingMinor: 4_500_000, attention: "revision" });
    expect(codes(c)).toContain("DECL_MOV_USADO");
    // Sin hallazgos contradictorios: el movimiento existe, solo que ya fue usado.
    expect(codes(c)).not.toContain("SIN_MOVIMIENTOS");
    // Total asignado en toda la demo: 45.000 + 20.000 = 65.000 (MOV-001 contado una sola vez)
    expect(ev.orders.reduce((n, o) => n + o.allocatedMinor, 0)).toBe(6_500_000);

    // El mensaje sugerido a Marta no revela datos de otro cliente ni acusa.
    const drafts = messageDrafts(c, ev);
    const text = drafts.map((x) => x.text).join("\n");
    expect(text).toMatch(/PED-103/);
    expect(text).not.toMatch(/PED-101|Ana|fraude|estafa/);

    // Mensaje por saldo de PED-102
    const saldo = messageDrafts(ev.byOrderId.get("id-PED-102")!, ev).find((x) => x.id === "saldo")!;
    expect(saldo.text).toMatch(/\$ 10\.000/);
  });

  it("archivo 2: sin duplicar, completa PED-102, deja pendiente y conflicto a revisión", () => {
    let d = loadDemo();
    d = approve(d, "id-PED-102", key(d, "MOV-002"));
    d = importCsv(d, DEMO_CSV_2, "movimientos-demo-2.csv");
    expect(d.movements.map((m) => m.externalId).sort()).toEqual(["MOV-001", "MOV-002", "MOV-003", "MOV-004", "MOV-005"]);
    expect(d.conflicts).toHaveLength(1);
    let ev = evaluate(d);
    expect(ev.byOrderId.get("id-PED-102")!.proposals[0]).toMatchObject({ code: "PROP_COMPLETA", amountMinor: 1_000_000 });
    expect(codes(ev.byOrderId.get("id-PED-104"))).toContain("REF_MOV_PENDIENTE");
    expect(ev.byOrderId.get("id-PED-104")!.allocatedMinor).toBe(0);
    d = approve(d, "id-PED-102", key(d, "MOV-004"));
    ev = evaluate(d);
    expect(ev.byOrderId.get("id-PED-102")).toMatchObject({ status: "conciliado", allocatedMinor: 3_000_000, outstandingMinor: 0 });
    expect(ev.summary.openConflicts).toBe(1);
  });
});
