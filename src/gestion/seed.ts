import { COMPANY, type State } from "./domain";
// Inicialización explícita: nunca forma parte de registrar movimientos.
export function createBaseDemo(): State {
  return {
    version: 1,
    company: COMPANY,
    depots: [
      { id: "silo-a", name: "Silo A", location: "Planta Corrientes · Sector norte" },
      { id: "silo-b", name: "Silo B", location: "Planta Corrientes · Sector sur" },
    ],
    lots: [{ id: "arr-001", code: "ARR-001", variety: "Arroz largo fino", season: "2026/2027" }],
    movements: [],
  };
}
