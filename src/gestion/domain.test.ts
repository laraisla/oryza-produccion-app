import { beforeEach, describe, expect, it } from "vitest";
import {
  COMPANY,
  STORAGE_KEY,
  balance,
  createGestionService,
  inventory,
  totalStock,
  type MovementInput,
  type Persistence,
} from "./domain";
import { browserPersistence } from "./browserPersistence";
import { createBaseDemo } from "./seed";

describe("Gestión · servicio aislado", () => {
  let raw: string | null;
  let writes: number;
  let fail: boolean;
  let sequence: number;
  let persistence: Persistence;
  let service: ReturnType<typeof createGestionService>;
  // Integración AgroGlobal: solo tipado para exactOptionalPropertyTypes (permite `toId: undefined`).
  type Overrides = { [K in keyof MovementInput]?: MovementInput[K] | undefined };
  const movement = (overrides: Overrides = {}): MovementInput =>
    ({
      type: "ingreso",
      lotId: "arr-001",
      toId: "silo-a",
      quantity: 100000,
      date: "2026-11-18",
      ...overrides,
    }) as MovementInput;
  beforeEach(() => {
    raw = null;
    writes = 0;
    sequence = 0;
    fail = false;
    persistence = {
      read: () => raw,
      write: (value) => {
        if (fail) throw new Error("Quota");
        raw = value;
        writes++;
      },
    };
    service = createGestionService(
      persistence,
      () => `id-${++sequence}`,
      () => "2026-11-18T12:00:00.000Z",
    );
    service.initialize(createBaseDemo());
  });
  function rejectUnchanged(input: MovementInput, message?: RegExp) {
    const before = raw;
    const beforeWrites = writes;
    expect(() => service.record(input)).toThrow(message);
    expect(raw).toBe(before);
    expect(writes).toBe(beforeWrites);
  }
  it("cumple el circuito obligatorio y rechaza retirar 50.000 kg sin modificar saldos ni los tres movimientos", () => {
    service.record(movement());
    const beforeTransfer = writes;
    service.record(
      movement({ type: "transferencia", fromId: "silo-a", toId: "silo-b", quantity: 30000 }),
    );
    expect(writes).toBe(beforeTransfer + 1);
    service.record(
      movement({ type: "egreso", fromId: "silo-b", toId: undefined, quantity: 10000 }),
    );
    const state = service.read();
    expect(balance(state, "arr-001", "silo-a")).toBe(70000);
    expect(balance(state, "arr-001", "silo-b")).toBe(20000);
    expect(totalStock(state)).toBe(90000);
    expect(totalStock(state) / 1000).toBe(90);
    expect(inventory(state).reduce((sum, r) => sum + r.quantity, 0)).toBe(totalStock(state));
    rejectUnchanged(
      movement({ type: "egreso", fromId: "silo-b", toId: undefined, quantity: 50000 }),
      /Saldo insuficiente/,
    );
    expect(service.read()).toEqual(state);
    expect(service.read().movements).toHaveLength(3);
  });
  it("inicializa una vez y recupera la sesión al recrear el servicio", () => {
    service.record(movement());
    const before = raw;
    service.initialize(createBaseDemo());
    expect(raw).toBe(before);
    expect(writes).toBe(2);
    expect(createGestionService(persistence).read()).toEqual(service.read());
  });
  it("el lote base y un lote nuevo empiezan con saldo cero sin movimientos", () => {
    const state = service.addLot({
      code: "arr-002",
      variety: "Doble carolina",
      season: "2026/2027",
    });
    expect(state.lots[1]!.code).toBe("ARR-002");
    expect(totalStock(state)).toBe(0);
    expect(state.movements).toHaveLength(0);
    expect(inventory(state).every((r) => r.quantity === 0)).toBe(true);
  });
  it("rechaza códigos de lote duplicados sin distinguir mayúsculas ni espacios", () => {
    const before = raw;
    expect(() => service.addLot({ code: " arr-001 ", variety: "Otra", season: "2026" })).toThrow(
      /ya existe/,
    );
    expect(raw).toBe(before);
  });
  it("rechaza ajuste sin motivo", () =>
    rejectUnchanged(movement({ type: "ajuste", direction: "aumento", reason: "  " }), /motivo/));
  it("rechaza ajuste de disminución sin saldo", () =>
    rejectUnchanged(
      movement({
        type: "ajuste",
        direction: "disminucion",
        fromId: "silo-a",
        toId: undefined,
        quantity: 1,
        reason: "Conteo",
      }),
      /Saldo insuficiente/,
    ));
  it("rechaza transferencia sin saldo suficiente", () =>
    rejectUnchanged(
      movement({ type: "transferencia", fromId: "silo-a", toId: "silo-b", quantity: 1 }),
      /Saldo insuficiente/,
    ));
  it.each([0, -1, NaN, Infinity, -Infinity, 0.0001, 1.2345, Number.MAX_VALUE])(
    "rechaza cantidad inválida %s sin escrituras",
    (quantity) => rejectUnchanged(movement({ quantity }), /cantidad/),
  );
  it("rechaza origen igual al destino", () =>
    rejectUnchanged(movement({ type: "transferencia", fromId: "silo-a" }), /distintos/));
  it.each([
    { lotId: "inexistente" },
    { toId: "inexistente" },
    { type: "egreso" as const, fromId: "inexistente", toId: undefined },
    { date: "2026-02-30" },
    { date: "" },
    { type: "ajuste" as const, reason: "Conteo" },
  ])("rechaza referencias, fecha o dirección inválidas: %j", (override) =>
    rejectUnchanged(movement(override)),
  );
  it("registra ajustes positivos con dirección explícita y conserva precisión en gramos", () => {
    service.record(movement({ quantity: 0.1 }));
    service.record(movement({ quantity: 0.2 }));
    expect(totalStock(service.read())).toBe(0.3);
    service.record(
      movement({
        type: "ajuste",
        direction: "disminucion",
        fromId: "silo-a",
        toId: undefined,
        quantity: 0.1,
        reason: "Diferencia física",
      }),
    );
    service.record(
      movement({
        type: "ajuste",
        direction: "aumento",
        toId: "silo-b",
        quantity: 0.5,
        reason: "Recuento",
      }),
    );
    expect(balance(service.read(), "arr-001", "silo-a")).toBe(0.2);
    expect(totalStock(service.read())).toBe(0.7);
  });
  it("conserva identificador, saldos y referencias históricas al editar depósitos", () => {
    service.record(movement());
    const history = service.read().movements;
    const state = service.editDepot("silo-a", { name: "Silo A renovado", location: "Corrientes" });
    expect(state.depots[0]!.id).toBe("silo-a");
    expect(state.movements).toEqual(history);
    expect(balance(state, "arr-001", "silo-a")).toBe(100000);
  });
  it("mantiene lotes separados aunque estén en el mismo depósito", () => {
    const state = service.addLot({ code: "ARR-002", variety: "Otra", season: "2026" });
    service.record(movement());
    rejectUnchanged(
      movement({
        type: "egreso",
        lotId: state.lots[1]!.id,
        fromId: "silo-a",
        toId: undefined,
        quantity: 1,
      }),
      /Saldo insuficiente/,
    );
  });
  it("no confirma la operación si falla la escritura", () => {
    const before = raw;
    fail = true;
    expect(() => service.record(movement())).toThrow(/No se pudo guardar/);
    expect(raw).toBe(before);
    expect(service.read().movements).toHaveLength(0);
  });
  it("no sobrescribe datos dañados al iniciar", () => {
    raw = "{dañado";
    const beforeWrites = writes;
    expect(() => service.initialize(createBaseDemo())).toThrow(/dañados/);
    expect(raw).toBe("{dañado");
    expect(writes).toBe(beforeWrites);
  });
  it("valida el estado completo antes de cualquier persistencia", () => {
    const bad = createBaseDemo();
    bad.movements.push({
      ...movement({ type: "egreso", fromId: "silo-a", toId: undefined }),
      id: "bad",
      recordedAt: "2026-11-18T12:00:00Z",
    });
    const before = raw;
    expect(() => service.resetDemo(bad)).toThrow(/Saldo insuficiente/);
    expect(raw).toBe(before);
  });
  it("reiniciar elimina solo el escenario demo y restaura el stock cero", () => {
    service.record(movement());
    const state = service.resetDemo(createBaseDemo());
    expect(totalStock(state)).toBe(0);
    expect(state.movements).toHaveLength(0);
    expect(state.depots).toHaveLength(2);
    expect(state.company).toBe(COMPANY);
  });
  it("el adaptador local solo lee y escribe la clave propia", () => {
    const values = new Map([["marketplace", "intacto"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    } as Storage;
    const adapter = browserPersistence(storage);
    expect(adapter.read()).toBeNull();
    adapter.write("demo");
    expect(values.get(STORAGE_KEY)).toBe("demo");
    expect(values.get("marketplace")).toBe("intacto");
    expect(values.size).toBe(2);
  });
});
