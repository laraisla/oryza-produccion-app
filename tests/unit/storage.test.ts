import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/allocate";
import { evaluate } from "@/domain/reconcile";
import { DEMO_CSV_1, DEMO_CSV_2 } from "@/demo/dataset";
import { CobroDB, deleteAppDatabase } from "@/storage/db";
import { checkBackupText, exportBackup, restoreBackup } from "@/storage/backup";
import {
  addClaim,
  approveProposal,
  assignManually,
  clearAll,
  confirmImport,
  createOrder,
  loadDataset,
  loadDemo,
  loadHistory,
  rejectProposal,
  releaseAllocation,
  resetDemo,
  toUserError,
  undoRejection,
} from "@/storage/repository";

let n = 0;
const freshDb = () => new CobroDB(`test-db-${++n}-${Math.random().toString(36).slice(2)}`);

async function evalDb(db: CobroDB) {
  return evaluate(await loadDataset(db));
}

async function refId(db: CobroDB, ref: string) {
  return (await db.orders.where("referenceKey").equals(ref).first())!.id;
}

async function movKey(db: CobroDB, externalId: string) {
  return (await db.movements.where("externalId").equals(externalId).first())!.key;
}

describe("almacenamiento local (IndexedDB)", () => {
  it("carga la demo por los caminos normales; nada aparece conciliado sin aprobar", async () => {
    const db = freshDb();
    await loadDemo(db);
    const ev = await evalDb(db);
    expect(ev.orders).toHaveLength(6);
    expect(ev.summary.reconciled).toBe(0);
    expect(ev.summary.proposals).toBe(2);
    expect(await db.allocations.count()).toBe(0);
    await expect(loadDemo(db)).rejects.toThrow(/Ya hay datos cargados/);
  });

  it("persiste después de cerrar y reabrir la base (recarga)", async () => {
    const name = `persist-${Math.random()}`;
    const db1 = new CobroDB(name);
    await loadDemo(db1);
    const ped101 = await refId(db1, "PED-101");
    await approveProposal(db1, ped101, await movKey(db1, "MOV-001"), 4_500_000);
    db1.close();

    const db2 = new CobroDB(name);
    const ev = await evalDb(db2);
    expect(ev.byOrderId.get(ped101)).toMatchObject({ status: "conciliado", allocatedMinor: 4_500_000 });
    expect((await loadHistory(db2)).some((h) => h.action === "asignacion_aprobada")).toBe(true);
    db2.close();
  });

  it("doble confirmación concurrente no duplica la asignación", async () => {
    const db = freshDb();
    await loadDemo(db);
    const id = await refId(db, "PED-101");
    const key = await movKey(db, "MOV-001");
    const results = await Promise.allSettled([
      approveProposal(db, id, key, 4_500_000),
      approveProposal(db, id, key, 4_500_000),
      approveProposal(db, id, key, 4_500_000),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(DomainError);
    expect(await db.allocations.count()).toBe(1);
    expect((await evalDb(db)).byOrderId.get(id)!.allocatedMinor).toBe(4_500_000);
  });

  it("un movimiento no puede asignarse dos veces a pedidos distintos aunque sea concurrente", async () => {
    const db = freshDb();
    await loadDemo(db);
    const a = await refId(db, "PED-105");
    const b = await refId(db, "PED-106");
    const key = await movKey(db, "MOV-003");
    const results = await Promise.allSettled([
      assignManually(db, a, key, 2_500_000, "Confirmado por el cliente"),
      assignManually(db, b, key, 2_500_000, "Confirmado por el cliente"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ev = await evalDb(db);
    expect(ev.movements.get(key)!.availableMinor).toBe(0);
    expect(ev.byOrderId.get(a)!.allocatedMinor + ev.byOrderId.get(b)!.allocatedMinor).toBe(2_500_000);
  });

  it("importar dos veces el mismo archivo no duplica; un conflicto no sobrescribe", async () => {
    const db = freshDb();
    await confirmImport(db, DEMO_CSV_1, "a.csv");
    const again = await confirmImport(db, DEMO_CSV_1, "a.csv");
    expect(again.added).toHaveLength(0);
    expect(again.batch.unchanged).toBe(3);
    expect(await db.movements.count()).toBe(3);
    await confirmImport(db, DEMO_CSV_2, "b.csv");
    expect(await db.movements.count()).toBe(5);
    expect((await db.movements.where("externalId").equals("MOV-003").first())!.amountMinor).toBe(2_500_000);
    expect(await db.conflicts.where("status").equals("abierto").count()).toBe(1);
    expect(await db.imports.count()).toBe(3);
  });

  it("una actualización a «revertido» saca la asignación del conciliado y queda en historial", async () => {
    const db = freshDb();
    const o = await createOrder(db, { reference: "VTA-1", customerName: "Cliente ficticio", totalMinor: 100_000, currency: "ARS", orderDate: "2026-09-10" });
    const head = "id_movimiento,cuenta,fecha,importe,moneda,estado,referencia,descripcion";
    await confirmImport(db, `${head}\nT-1,Caja,2026-09-11,1000,ARS,acreditado,VTA-1,`, "1.csv");
    const key = await movKey(db, "T-1");
    await approveProposal(db, o.id, key, 100_000);
    expect((await evalDb(db)).byOrderId.get(o.id)!.status).toBe("conciliado");
    await confirmImport(db, `${head}\nT-1,Caja,2026-09-11,1000,ARS,revertido,VTA-1,`, "2.csv");
    const oe = (await evalDb(db)).byOrderId.get(o.id)!;
    expect(oe).toMatchObject({ status: "sin_conciliar", allocatedMinor: 0, attention: "revision" });
    const h = await loadHistory(db);
    expect(h.find((x) => x.action === "movimiento_estado_actualizado")!.summary).toMatch(/acreditado» → «revertido».*VTA-1/);
    // Liberar exige motivo y deja el movimiento sin asignaciones vigentes.
    const alloc = (await db.allocations.toArray())[0]!;
    await expect(releaseAllocation(db, alloc.id, "")).rejects.toThrow(/motivo/);
    await releaseAllocation(db, alloc.id, "Transferencia revertida por el banco");
    expect((await db.allocations.get(alloc.id))!.status).toBe("liberada");
  });

  it("rechazar y deshacer el rechazo", async () => {
    const db = freshDb();
    await loadDemo(db);
    const id = await refId(db, "PED-101");
    const key = await movKey(db, "MOV-001");
    await rejectProposal(db, id, key, "No corresponde");
    expect((await evalDb(db)).byOrderId.get(id)!.proposals).toHaveLength(0);
    await undoRejection(db, id, key);
    expect((await evalDb(db)).byOrderId.get(id)!.proposals).toHaveLength(1);
  });

  it("la referencia de pedido es única en la capa de datos", async () => {
    const db = freshDb();
    const base = { customerName: "X", totalMinor: 100, currency: "ARS" as const, orderDate: "2026-09-10" };
    await createOrder(db, { ...base, reference: "PED-1" });
    await expect(createOrder(db, { ...base, reference: "ped 1" })).rejects.toThrow(/Ya existe un pedido/);
  });

  it("valida importes y moneda al crear pedidos y declaraciones", async () => {
    const db = freshDb();
    const base = { reference: "PED-2", customerName: "X", orderDate: "2026-09-10" };
    await expect(createOrder(db, { ...base, totalMinor: 0, currency: "ARS" })).rejects.toThrow(/mayor que cero/);
    await expect(createOrder(db, { ...base, totalMinor: 10.5, currency: "ARS" })).rejects.toThrow(/entero/);
    // @ts-expect-error moneda no admitida
    await expect(createOrder(db, { ...base, totalMinor: 100, currency: "USD" })).rejects.toThrow(/solo opera en ARS/);
    const o = await createOrder(db, { ...base, totalMinor: 100, currency: "ARS" });
    await expect(addClaim(db, { orderId: o.id, receivedText: "x", declaredAmountMinor: -1 })).rejects.toThrow();
  });

  it("exportar y restaurar conserva los datos; un respaldo alterado se rechaza", async () => {
    const db = freshDb();
    await loadDemo(db);
    const id = await refId(db, "PED-102");
    await approveProposal(db, id, await movKey(db, "MOV-002"), 2_000_000);
    const backup = await exportBackup(db);
    const text = JSON.stringify(backup);

    const db2 = freshDb();
    const check = checkBackupText(text);
    expect(check.ok).toBe(true);
    if (check.ok) await restoreBackup(db2, check.file);
    const ev = await evalDb(db2);
    expect(ev.byOrderId.get(id)).toMatchObject({ status: "parcial", outstandingMinor: 1_000_000 });

    const tampered = structuredClone(backup);
    tampered.data.allocations[0]!.amountMinor = 99_000_000;
    const bad = checkBackupText(JSON.stringify(tampered));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems.join(" ")).toMatch(/más que su (importe|total)/);
    expect(checkBackupText("{no es json").ok).toBe(false);
    expect(checkBackupText(JSON.stringify({ app: "otra" })).ok).toBe(false);
  });

  it("reiniciar la demo reemplaza los datos; borrar elimina solo esta base", async () => {
    const db = freshDb();
    await loadDemo(db);
    await approveProposal(db, await refId(db, "PED-101"), await movKey(db, "MOV-001"), 4_500_000);
    await resetDemo(db);
    expect(await db.allocations.count()).toBe(0);
    expect(await db.orders.count()).toBe(6);
    await clearAll(db);
    expect(await db.orders.count()).toBe(0);

    const other = new CobroDB("otra-app-ajena");
    await other.open();
    await deleteAppDatabase(db);
    const names = await (await import("dexie")).default.getDatabaseNames();
    expect(names).toContain("otra-app-ajena");
    expect(names).not.toContain(db.name);
    other.close();
  });

  it("traduce errores de cuota a un mensaje accionable", () => {
    const err = toUserError({ name: "QuotaExceededError", message: "quota" });
    expect(err.message).toMatch(/No se guardó el cambio/);
  });
});
