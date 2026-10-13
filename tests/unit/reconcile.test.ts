import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/allocate";
import { evaluate } from "@/domain/reconcile";
import type { Dataset } from "@/domain/schemas";
import { approve, assignManual, claim, codes, dataset, movement, order } from "./helpers";

const evalOf = (d: Dataset, orderId: string) => evaluate(d).byOrderId.get(orderId)!;

describe("tabla A: movimiento con referencia explícita", () => {
  it("coincidencia completa genera propuesta y, al aprobar, concilia", () => {
    const o = order("VTA-9", 4_500_000);
    const m = movement("OP-77", 4_500_000, { reference: "vta 9" });
    let d = dataset({ orders: [o], movements: [m] });
    const before = evalOf(d, o.id);
    expect(before.proposals).toHaveLength(1);
    expect(before.proposals[0]).toMatchObject({ code: "PROP_COMPLETA", amountMinor: 4_500_000, outstandingAfterMinor: 0 });
    expect(before.allocatedMinor).toBe(0); // la propuesta no suma hasta aprobarla
    expect(before.attention).toBe("aprobacion");
    d = approve(d, o.id, m.key);
    const after = evalOf(d, o.id);
    expect(after).toMatchObject({ status: "conciliado", allocatedMinor: 4_500_000, outstandingMinor: 0, attention: "ninguna" });
    expect(after.proposals).toEqual([]);
  });

  it("pago parcial deja saldo por conciliar", () => {
    const o = order("PED-7", 3_000_000);
    const m = movement("X1", 2_000_000, { reference: "PED-7 seña" });
    let d = dataset({ orders: [o], movements: [m] });
    expect(evalOf(d, o.id).proposals[0]).toMatchObject({ code: "PROP_PARCIAL", amountMinor: 2_000_000, outstandingAfterMinor: 1_000_000 });
    d = approve(d, o.id, m.key);
    const after = evalOf(d, o.id);
    expect(after).toMatchObject({ status: "parcial", allocatedMinor: 2_000_000, outstandingMinor: 1_000_000, attention: "esperando" });
    expect(codes(after)).toContain("SALDO_PENDIENTE");
  });

  it("dos movimientos completan un pedido; las propuestas se calculan en cascada", () => {
    const o = order("PED-8", 3_000_000);
    const m1 = movement("A", 2_000_000, { reference: "PED-8", date: "2026-09-15" });
    const m2 = movement("B", 2_000_000, { reference: "PED-8", date: "2026-09-16" });
    let d = dataset({ orders: [o], movements: [m1, m2] });
    const ev = evalOf(d, o.id);
    expect(ev.proposals.map((p) => [p.code, p.amountMinor])).toEqual([
      ["PROP_PARCIAL", 2_000_000],
      ["PROP_EXCEDENTE", 1_000_000],
    ]);
    d = approve(d, o.id, m1.key);
    d = approve(d, o.id, m2.key);
    const after = evaluate(d);
    expect(after.byOrderId.get(o.id)).toMatchObject({ status: "conciliado", allocatedMinor: 3_000_000 });
    // El excedente de B queda en el movimiento para revisión, no se asigna a nada.
    const mb = after.movements.get(m2.key)!;
    expect(mb.availableMinor).toBe(1_000_000);
    expect(mb.findings.map((f) => f.code)).toContain("MOV_EXCEDENTE");
  });

  it("exceso de pago: se propone solo el saldo y el resto queda para revisión", () => {
    const o = order("PED-9", 1_000_000);
    const m = movement("C", 1_500_000, { reference: "PED-9" });
    let d = dataset({ orders: [o], movements: [m] });
    const p = evalOf(d, o.id).proposals[0]!;
    expect(p).toMatchObject({ code: "PROP_EXCEDENTE", amountMinor: 1_000_000, movementLeftoverMinor: 500_000 });
    d = approve(d, o.id, m.key);
    const me = evaluate(d).movements.get(m.key)!;
    expect(me.availableMinor).toBe(500_000);
    expect(me.findings[0]?.explanation).toMatch(/no recomienda ni ejecuta devoluciones/);
  });

  it("movimiento pendiente o revertido no cuenta como acreditado", () => {
    const o = order("PED-10", 1_000_000);
    const pend = movement("P", 1_000_000, { reference: "PED-10", status: "pendiente" });
    const rev = movement("R", 1_000_000, { reference: "PED-10", status: "revertido" });
    const ev = evalOf(dataset({ orders: [o], movements: [pend, rev] }), o.id);
    expect(ev.proposals).toEqual([]);
    expect(ev.allocatedMinor).toBe(0);
    expect(codes(ev)).toEqual(expect.arrayContaining(["REF_MOV_PENDIENTE", "REF_MOV_REVERTIDO"]));
  });

  it("si un movimiento asignado pasa a revertido, la asignación deja de contar y pide revisión", () => {
    const o = order("PED-11", 1_000_000);
    const m = movement("Z", 1_000_000, { reference: "PED-11" });
    let d = approve(dataset({ orders: [o], movements: [m] }), o.id, m.key);
    expect(evalOf(d, o.id).status).toBe("conciliado");
    d = { ...d, movements: [{ ...m, status: "revertido" }] };
    const ev = evalOf(d, o.id);
    expect(ev).toMatchObject({ status: "sin_conciliar", allocatedMinor: 0, outstandingMinor: 1_000_000, attention: "revision" });
    expect(codes(ev)).toContain("ASIG_MOV_NO_ACREDITADO");
  });

  it("un movimiento que menciona varios pedidos no se asigna automáticamente", () => {
    const a = order("PED-20", 1_000_000);
    const b = order("PED-21", 1_000_000);
    const m = movement("M", 2_000_000, { reference: "PED-20 PED-21" });
    const ev = evaluate(dataset({ orders: [a, b], movements: [m] }));
    expect(ev.byOrderId.get(a.id)!.proposals).toEqual([]);
    expect(codes(ev.byOrderId.get(a.id))).toContain("REF_VARIOS_PEDIDOS");
  });

  it("un pago repetido para un pedido ya conciliado queda para revisión", () => {
    const o = order("PED-30", 1_000_000);
    const m1 = movement("A", 1_000_000, { reference: "PED-30", date: "2026-09-15" });
    const m2 = movement("B", 1_000_000, { reference: "PED-30", date: "2026-09-16" });
    const d = approve(dataset({ orders: [o], movements: [m1, m2] }), o.id, m1.key);
    const ev = evalOf(d, o.id);
    expect(ev.proposals).toEqual([]);
    expect(codes(ev)).toContain("REF_PEDIDO_CONCILIADO");
    expect(ev.allocatedMinor).toBe(1_000_000);
  });

  it("una propuesta rechazada no reaparece", () => {
    const o = order("PED-31", 1_000_000);
    const m = movement("A", 1_000_000, { reference: "PED-31" });
    const d = dataset({
      orders: [o],
      movements: [m],
      rejections: [{ id: "r1", orderId: o.id, movementKey: m.key, rejectedAt: "2026-09-20T00:00:00.000Z" }],
    });
    const ev = evalOf(d, o.id);
    expect(ev.proposals).toEqual([]);
    expect(codes(ev)).toContain("PROPUESTA_RECHAZADA");
  });
});

describe("tabla B: nunca conciliar por monto solamente", () => {
  it("dos pedidos de igual importe y referencia insuficiente: revisión, sin asignación", () => {
    const a = order("PED-40", 2_500_000);
    const b = order("PED-41", 2_500_000);
    const m = movement("M", 2_500_000, { reference: "Pago pedido" });
    const ev = evaluate(dataset({ orders: [a, b], movements: [m] }));
    for (const o of [a, b]) {
      const oe = ev.byOrderId.get(o.id)!;
      expect(oe.proposals).toEqual([]);
      expect(oe.allocatedMinor).toBe(0);
      expect(oe.attention).toBe("revision");
      expect(codes(oe)).toContain("CAND_IMPORTE_AMBIGUO");
      expect(oe.candidates[0]?.ambiguousWith).toHaveLength(1);
    }
  });

  it("un único pedido con el mismo importe tampoco genera propuesta", () => {
    const a = order("PED-42", 2_500_000);
    const m = movement("M", 2_500_000, { reference: "" });
    const oe = evalOf(dataset({ orders: [a], movements: [m] }), a.id);
    expect(oe.proposals).toEqual([]);
    expect(codes(oe)).toContain("CAND_IMPORTE");
  });

  it("un movimiento que menciona otro pedido no es candidato por importe", () => {
    const a = order("PED-43", 2_500_000);
    const b = order("PED-44", 2_500_000);
    const m = movement("M", 2_500_000, { reference: "PED-44" });
    const oe = evalOf(dataset({ orders: [a, b], movements: [m] }), a.id);
    expect(oe.candidates).toEqual([]);
    expect(codes(oe)).toContain("SIN_MOVIMIENTOS");
  });

  it("asignación manual: exige motivo y no supera disponible ni saldo", () => {
    const a = order("PED-45", 2_500_000);
    const m = movement("M", 2_500_000);
    const d = dataset({ orders: [a], movements: [m] });
    expect(() => assignManual(d, a.id, m.key, 2_500_000, "")).toThrow(DomainError);
    expect(() => assignManual(d, a.id, m.key, 3_000_000, "Confirmado por el cliente")).toThrow(/disponibles/);
    const d2 = assignManual(d, a.id, m.key, 2_500_000, "Confirmado por el cliente por mensaje");
    expect(evalOf(d2, a.id).status).toBe("conciliado");
    expect(d2.allocations[0]).toMatchObject({ kind: "manual", confirmedBy: "usuario" });
  });
});

describe("tabla C: declaraciones de pago", () => {
  it("una declaración nunca suma dinero conciliado", () => {
    const o = order("PED-50", 1_800_000);
    const ev = evalOf(dataset({ orders: [o], claims: [claim(o.id, { declaredAmountMinor: 1_800_000 })] }), o.id);
    expect(ev.allocatedMinor).toBe(0);
    expect(ev.outstandingMinor).toBe(1_800_000);
  });

  it("declaración sin movimiento compatible: «no encontrado», no «no pagó»", () => {
    const o = order("PED-51", 1_800_000);
    const other = movement("Q", 999_900, { reference: "" });
    const d = dataset({
      orders: [o],
      movements: [other],
      claims: [claim(o.id, { declaredAmountMinor: 1_800_000 })],
      imports: [
        {
          id: "i1", fileName: "f.csv", importedAt: "2026-09-20T00:00:00.000Z", accounts: ["C"],
          periodFrom: "2026-09-15", periodTo: "2026-09-17", totalRows: 1, added: 1, unchanged: 0,
          statusUpdates: 0, conflicts: 0, errors: 0,
        },
      ],
    });
    const ev = evalOf(d, o.id);
    expect(ev.attention).toBe("sin_encontrar");
    const f = ev.findings.find((x) => x.code === "DECL_SIN_MOVIMIENTO")!;
    expect(f.title).toBe("No encontrado en el archivo importado");
    expect(f.explanation).toMatch(/15\/09\/2026 y 17\/09\/2026/);
    expect(f.explanation).toMatch(/no significa que no haya pagado/i);
    expect(f.explanation).not.toMatch(/fraude|estafa/i);
    expect(f.nextActions).toEqual(["importar_recientes", "copiar_mensaje"]);
  });

  it("declaración que menciona un movimiento ya asignado a otro pedido: advertencia sin acusar", () => {
    const a = order("PED-60", 4_500_000);
    const b = order("PED-61", 4_500_000);
    const m = movement("OP-1", 4_500_000, { reference: "PED-60" });
    let d = dataset({ orders: [a, b], movements: [m], claims: [claim(b.id, { mentionedOperation: "op 1", declaredAmountMinor: 4_500_000 })] });
    expect(codes(evalOf(d, b.id))).toContain("DECL_MOV_REF_OTRO");
    d = approve(d, a.id, m.key);
    const eb = evalOf(d, b.id);
    expect(eb.allocatedMinor).toBe(0); // no se vuelve a sumar
    expect(eb.attention).toBe("revision");
    const f = eb.findings.find((x) => x.code === "DECL_MOV_USADO")!;
    expect(f.explanation).toMatch(/No se cuenta nuevamente/);
    expect(f.explanation).toMatch(/no implica fraude/);
    expect(f.relatedOrderIds).toEqual([a.id]);
  });

  it("declaración con operación inexistente en los archivos", () => {
    const o = order("PED-62", 1_000_000);
    const ev = evalOf(dataset({ orders: [o], claims: [claim(o.id, { mentionedOperation: "OP-999" })] }), o.id);
    expect(codes(ev)).toContain("DECL_OP_NO_ENCONTRADA");
  });

  it("declaración que señala un movimiento libre lo muestra como candidato manual, no como propuesta", () => {
    const o = order("PED-63", 1_000_000);
    const m = movement("OP-5", 1_000_000, { reference: "transferencia" });
    const ev = evalOf(dataset({ orders: [o], movements: [m], claims: [claim(o.id, { mentionedOperation: "OP-5" })] }), o.id);
    expect(ev.proposals).toEqual([]);
    expect(ev.candidates.map((c) => c.basis)).toContain("declaracion");
    expect(codes(ev)).toContain("DECL_MOV_CANDIDATO");
  });
});

describe("doble confirmación y validaciones de datos", () => {
  it("aprobar dos veces la misma propuesta no duplica la asignación", () => {
    const o = order("PED-70", 1_000_000);
    const m = movement("A", 1_000_000, { reference: "PED-70" });
    const d = approve(dataset({ orders: [o], movements: [m] }), o.id, m.key);
    expect(() => approve(d, o.id, m.key, 1_000_000)).toThrow(/ya estaba confirmada/);
    expect(d.allocations).toHaveLength(1);
  });

  it("aprobar con un importe que ya no coincide se rechaza", () => {
    const o = order("PED-71", 1_000_000);
    const m = movement("A", 600_000, { reference: "PED-71" });
    const d = dataset({ orders: [o], movements: [m] });
    expect(() => approve(d, o.id, m.key, 1_000_000)).toThrow(/La propuesta cambió/);
  });

  it("no se puede usar un movimiento agotado en otro pedido", () => {
    const a = order("PED-72", 1_000_000);
    const b = order("PED-73", 1_000_000);
    const m = movement("A", 1_000_000, { reference: "PED-72" });
    const d = approve(dataset({ orders: [a, b], movements: [m] }), a.id, m.key);
    expect(() => assignManual(d, b.id, m.key, 1_000_000, "Intento de reutilizar")).toThrow(/disponibles/);
  });
});

describe("reglas generales", () => {
  it("las mismas reglas resuelven datos con otros identificadores (sin casos especiales)", () => {
    const o = order("ORD-5001", 12_345_678);
    const m = movement("TRX-ABC", 12_345_678, { reference: "Pago ord 5001" });
    const oe = evalOf(dataset({ orders: [o], movements: [m] }), o.id);
    expect(oe.proposals[0]?.code).toBe("PROP_COMPLETA");
  });

  it("los resultados no dependen de la fecha actual", () => {
    const o = order("PED-80", 1_000_000);
    const m = movement("A", 1_000_000, { reference: "PED-80" });
    const d = dataset({ orders: [o], movements: [m] });
    const a = JSON.stringify(evalOf(d, o.id).proposals);
    const realNow = Date.now;
    Date.now = () => new Date("2031-01-01").getTime();
    try {
      expect(JSON.stringify(evalOf(d, o.id).proposals)).toBe(a);
    } finally {
      Date.now = realNow;
    }
  });
});
