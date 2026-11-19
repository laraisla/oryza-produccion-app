export const COMPANY = "Acopiadora del Litoral";
export const STORAGE_KEY = "agrolocal:gestion:demo:acopiadora-del-litoral:v1";
export interface Depot {
  id: string;
  name: string;
  location: string;
}
export interface Lot {
  id: string;
  code: string;
  variety: string;
  season: string;
  humidity?: number;
  quality?: string;
}
export type MovementType = "ingreso" | "egreso" | "transferencia" | "ajuste";
export interface MovementInput {
  type: MovementType;
  date: string;
  lotId: string;
  quantity: number;
  fromId?: string;
  toId?: string;
  reason?: string;
  direction?: "aumento" | "disminucion";
}
export interface Movement extends MovementInput {
  id: string;
  recordedAt: string;
}
export interface State {
  version: 1;
  company: typeof COMPANY;
  depots: Depot[];
  lots: Lot[];
  movements: Movement[];
}
export interface Persistence {
  read(): string | null;
  write(value: string): void;
}
export const TYPES: Record<MovementType, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} es obligatorio.`);
  if (value.trim().length > 200) throw new Error(`${label}: máximo 200 caracteres.`);
  return value.trim();
}
function grams(quantity: number): number {
  const value = Math.round(quantity * 1000);
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    Math.abs(value / 1000 - quantity) > 1e-9
  )
    throw new Error("La cantidad debe ser finita, mayor que cero y tener hasta 3 decimales (kg).");
  return value;
}
export function balanceGrams(state: State, lotId: string, depotId: string): number {
  return state.movements.reduce((sum, m) => {
    if (m.lotId !== lotId) return sum;
    return (
      sum +
      (m.toId === depotId ? grams(m.quantity) : 0) -
      (m.fromId === depotId ? grams(m.quantity) : 0)
    );
  }, 0);
}
export function balance(state: State, lotId: string, depotId: string): number {
  return balanceGrams(state, lotId, depotId) / 1000;
}
export function inventory(state: State) {
  return state.lots.flatMap((lot) =>
    state.depots.map((depot) => ({ lot, depot, quantity: balance(state, lot.id, depot.id) })),
  );
}
export function totalStock(state: State): number {
  return (
    state.lots.reduce(
      (sum, lot) =>
        sum + state.depots.reduce((n, depot) => n + balanceGrams(state, lot.id, depot.id), 0),
      0,
    ) / 1000
  );
}
function lotFields(input: Omit<Lot, "id">): Omit<Lot, "id"> {
  const humidity = input.humidity;
  if (humidity !== undefined && (!Number.isFinite(humidity) || humidity < 0 || humidity > 100))
    throw new Error("La humedad debe estar entre 0 y 100 %.");
  return {
    code: required(input.code, "Código").toUpperCase(),
    variety: required(input.variety, "Variedad"),
    season: required(input.season, "Campaña"),
    ...(humidity !== undefined ? { humidity } : {}),
    ...(input.quality?.trim() ? { quality: required(input.quality, "Calidad") } : {}),
  };
}
function validatedMovement(state: State, input: MovementInput): MovementInput {
  if (!Object.hasOwn(TYPES, input.type)) throw new Error("Tipo de movimiento inválido.");
  const amount = grams(input.quantity);
  if (!state.lots.some((l) => l.id === input.lotId)) throw new Error("El lote no existe.");
  if (
    typeof input.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    Number.isNaN(Date.parse(input.date)) ||
    new Date(input.date).toISOString().slice(0, 10) !== input.date
  )
    throw new Error("Ingresá una fecha válida.");
  if (input.type === "ajuste" && !["aumento", "disminucion"].includes(input.direction ?? ""))
    throw new Error("Seleccioná la dirección del ajuste.");
  const from =
    input.type === "egreso" ||
    input.type === "transferencia" ||
    (input.type === "ajuste" && input.direction === "disminucion");
  const to =
    input.type === "ingreso" ||
    input.type === "transferencia" ||
    (input.type === "ajuste" && input.direction === "aumento");
  const fromId = from ? input.fromId : undefined;
  const toId = to ? input.toId : undefined;
  if (from && !state.depots.some((d) => d.id === fromId))
    throw new Error("Seleccioná un depósito de origen existente.");
  if (to && !state.depots.some((d) => d.id === toId))
    throw new Error("Seleccioná un depósito de destino existente.");
  if (from && to && fromId === toId) throw new Error("El origen y el destino deben ser distintos.");
  const reason =
    input.type === "ajuste" ? required(input.reason, "El motivo del ajuste") : input.reason?.trim();
  if (from && balanceGrams(state, input.lotId, fromId!) < amount)
    throw new Error(
      `Saldo insuficiente en origen. Disponible: ${balance(state, input.lotId, fromId!).toLocaleString("es-AR")} kg. No se registró el movimiento.`,
    );
  if (to && !Number.isSafeInteger(balanceGrams(state, input.lotId, toId!) + amount))
    throw new Error("La cantidad excede el límite de precisión.");
  if (to && !from && !Number.isSafeInteger(Math.round(totalStock(state) * 1000) + amount))
    throw new Error("El stock total excede el límite de precisión.");
  return {
    type: input.type,
    date: input.date,
    lotId: input.lotId,
    quantity: input.quantity,
    ...(fromId ? { fromId } : {}),
    ...(toId ? { toId } : {}),
    ...(reason ? { reason: required(reason, "Motivo") } : {}),
    ...(input.type === "ajuste" ? { direction: input.direction } : {}),
  };
}

// No React, navegador, red ni datos de otras áreas en este servicio.
export function validateState(raw: unknown): State {
  if (!raw || typeof raw !== "object") throw new Error("Estado de demo inválido.");
  const state = raw as State;
  if (
    state.version !== 1 ||
    state.company !== COMPANY ||
    !Array.isArray(state.depots) ||
    !Array.isArray(state.lots) ||
    !Array.isArray(state.movements)
  )
    throw new Error("Formato de demo incompatible.");
  const ids = new Set<string>();
  const checkId = (id: string) => {
    required(id, "Identificador");
    if (ids.has(id)) throw new Error("Identificador duplicado.");
    ids.add(id);
  };
  state.depots.forEach((d) => {
    checkId(d.id);
    required(d.name, "Nombre del depósito");
    required(d.location, "Ubicación");
  });
  const codes = new Set<string>();
  state.lots.forEach((l) => {
    checkId(l.id);
    const clean = lotFields(l);
    if (codes.has(clean.code)) throw new Error("El código de lote ya existe.");
    codes.add(clean.code);
  });
  const replay: State = { ...state, movements: [] };
  state.movements.forEach((m) => {
    checkId(m.id);
    if (typeof m.recordedAt !== "string" || Number.isNaN(Date.parse(m.recordedAt)))
      throw new Error("Fecha de registro inválida.");
    const clean = validatedMovement(replay, m);
    if (clean.fromId !== m.fromId || clean.toId !== m.toId)
      throw new Error("Ubicaciones de movimiento inválidas.");
    replay.movements.push({ ...clean, id: m.id, recordedAt: m.recordedAt });
  });
  return structuredClone(state);
}

export function createGestionService(
  persistence: Persistence,
  id: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
) {
  const read = (): State => {
    const raw = persistence.read();
    if (raw === null) throw new Error("No hay escenario. Iniciá la demo desde cero.");
    try {
      return validateState(JSON.parse(raw));
    } catch {
      throw new Error(
        "Los datos guardados están dañados o son incompatibles. No se sobrescribieron. Reiniciá la demo para recuperar los datos base.",
      );
    }
  };
  const commit = (state: State): State => {
    const clean = validateState(state);
    try {
      persistence.write(JSON.stringify(clean));
    } catch {
      throw new Error(
        "No se pudo guardar en el navegador. Verificá el espacio o los permisos. No se confirmó la operación.",
      );
    }
    return structuredClone(clean);
  };
  return {
    read,
    hasData: () => persistence.read() !== null,
    initialize: (base: State) => (persistence.read() === null ? commit(base) : read()),
    resetDemo: (base: State) => commit(base),
    addDepot(input: Omit<Depot, "id">) {
      const state = read();
      state.depots.push({
        id: id(),
        name: required(input.name, "Nombre"),
        location: required(input.location, "Ubicación"),
      });
      return commit(state);
    },
    editDepot(depotId: string, input: Omit<Depot, "id">) {
      const state = read();
      const index = state.depots.findIndex((d) => d.id === depotId);
      if (index < 0) throw new Error("El depósito no existe.");
      state.depots[index] = {
        id: depotId,
        name: required(input.name, "Nombre"),
        location: required(input.location, "Ubicación"),
      };
      return commit(state);
    },
    addLot(input: Omit<Lot, "id">) {
      const state = read();
      state.lots.push({ ...lotFields(input), id: id() });
      return commit(state);
    },
    record(input: MovementInput) {
      const state = read();
      const clean = validatedMovement(state, input);
      state.movements.push({ ...clean, id: id(), recordedAt: now() });
      // Transferencia: un movimiento, una validación completa y una sola escritura.
      return commit(state);
    },
  };
}
export type GestionService = ReturnType<typeof createGestionService>;
