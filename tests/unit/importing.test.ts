import { describe, expect, it } from "vitest";
import { DEMO_CSV_1, DEMO_CSV_2 } from "@/demo/dataset";
import { CSV_LIMITS, CSV_TEMPLATE, parseMovementsCsv } from "@/importing/csv";
import { planImport } from "@/importing/plan";
import { emptyDataset, importCsv } from "./helpers";

const HEADER = "id_movimiento,cuenta,fecha,importe,moneda,estado,referencia,descripcion";

describe("lectura del CSV", () => {
  it("lee la plantilla documentada", () => {
    const r = parseMovementsCsv(CSV_TEMPLATE);
    expect(r.fileErrors).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]?.draft.date).toBe("2026-09-16");
    expect(r.rows[1]?.draft.amountMinor).toBe(1_250_050);
  });

  it("respeta comillas y comas dentro de campos (no usa split)", () => {
    const csv = `${HEADER}\nA1,Cuenta,2026-09-15,100.00,ARS,acreditado,"PED-1, seña","Texto con ""comillas"""`;
    const r = parseMovementsCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.draft.reference).toBe("PED-1, seña");
    expect(r.rows[0]?.draft.description).toBe('Texto con "comillas"');
  });

  it("acepta punto y coma como separador y encabezados con acentos", () => {
    const csv = "ID_Movimiento;Cuenta;Fecha;Importe;Moneda;Estado;Referencia;Descripción\nA1;C;15/09/2026;10;ARS;Acreditado;;";
    const r = parseMovementsCsv(csv);
    expect(r.fileErrors).toEqual([]);
    expect(r.rows[0]?.draft.status).toBe("acreditado");
  });

  it("informa errores con número de fila y motivo", () => {
    const csv = [
      HEADER,
      "A1,C,2026-09-15,100.00,ARS,acreditado,,", // fila 2 ok
      "A2,C,2026-13-01,100.00,ARS,acreditado,,", // fila 3 fecha
      "A3,C,2026-09-15,-5,ARS,acreditado,,", // fila 4 negativo
      "A4,C,2026-09-15,100.00,USD,acreditado,,", // fila 5 moneda
      "A5,C,2026-09-15,100.00,ARS,cobrado,,", // fila 6 estado
      ",C,2026-09-15,100.00,ARS,acreditado,,", // fila 7 sin id
    ].join("\n");
    const r = parseMovementsCsv(csv);
    expect(r.rows.map((x) => x.row)).toEqual([2]);
    const byRow = Object.fromEntries(r.errors.map((e) => [e.row, e]));
    expect(byRow[3]?.column).toBe("fecha");
    expect(byRow[4]?.message).toMatch(/positivo/);
    expect(byRow[5]?.message).toMatch(/USD.*solo opera en ARS/);
    expect(byRow[6]?.column).toBe("estado");
    expect(byRow[7]?.column).toBe("id_movimiento");
  });

  it("rechaza archivos sin columnas obligatorias", () => {
    const r = parseMovementsCsv("fecha,importe\n2026-09-15,10");
    expect(r.fileErrors[0]).toMatch(/Faltan columnas obligatorias/);
  });

  it("limita tamaño y cantidad de filas", () => {
    const rows = Array.from({ length: CSV_LIMITS.maxRows + 1 }, (_, i) => `X${i},C,2026-09-15,1,ARS,acreditado,,`);
    expect(parseMovementsCsv([HEADER, ...rows].join("\n")).fileErrors[0]).toMatch(/máximo es 2000/);
    const big = HEADER + "\n" + "x".repeat(CSV_LIMITS.maxBytes);
    expect(parseMovementsCsv(big).fileErrors[0]).toMatch(/supera el máximo/);
  });

  it("trata el contenido como texto, no como HTML", () => {
    const csv = `${HEADER}\nA1,C,2026-09-15,1,ARS,acreditado,<img src=x onerror=alert(1)>,<script>x</script>`;
    const r = parseMovementsCsv(csv);
    expect(r.rows[0]?.draft.reference).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("plan de importación", () => {
  it("importar dos veces el mismo archivo no duplica movimientos", () => {
    let data = importCsv(emptyDataset(), DEMO_CSV_1);
    expect(data.movements).toHaveLength(3);
    const plan = planImport(parseMovementsCsv(DEMO_CSV_1), new Map(data.movements.map((m) => [m.key, m])));
    expect(plan.counts.nuevo).toBe(0);
    expect(plan.counts.sin_cambios).toBe(3);
    data = importCsv(data, DEMO_CSV_1);
    expect(data.movements).toHaveLength(3);
  });

  it("mismo id en otra cuenta es otro movimiento (clave compuesta)", () => {
    const csv = `${HEADER}\nMOV-1,Cuenta A,2026-09-15,10,ARS,acreditado,,\nMOV-1,Cuenta B,2026-09-15,10,ARS,acreditado,,`;
    const data = importCsv(emptyDataset(), csv);
    expect(data.movements).toHaveLength(2);
  });

  it("mismo identificador con datos incompatibles: conflicto, sin sobrescribir", () => {
    let data = importCsv(emptyDataset(), DEMO_CSV_1);
    data = importCsv(data, DEMO_CSV_2);
    const mov3 = data.movements.find((m) => m.externalId === "MOV-003");
    expect(mov3?.amountMinor).toBe(2_500_000); // conserva el dato original
    expect(data.conflicts).toHaveLength(1);
    expect(data.conflicts[0]?.fields).toEqual(["amountMinor"]);
    expect(data.conflicts[0]?.incoming.amountMinor).toBe(2_600_000);
    // reimportar el mismo archivo no duplica el conflicto abierto
    data = importCsv(data, DEMO_CSV_2);
    expect(data.conflicts).toHaveLength(1);
  });

  it("clasifica el segundo archivo de demo con fila de error", () => {
    const data = importCsv(emptyDataset(), DEMO_CSV_1);
    const plan = planImport(parseMovementsCsv(DEMO_CSV_2), new Map(data.movements.map((m) => [m.key, m])));
    expect(plan.counts).toMatchObject({ nuevo: 2, sin_cambios: 1, conflicto: 1, errores: 1, total: 5 });
    expect(plan.errors[0]?.row).toBe(6);
    expect(plan.periodFrom).toBe("2026-09-16");
    expect(plan.periodTo).toBe("2026-09-19");
  });

  it("una actualización de estado se detecta como tal", () => {
    const csvA = `${HEADER}\nM1,C,2026-09-15,100,ARS,pendiente,PED-1,`;
    const csvB = `${HEADER}\nM1,C,2026-09-15,100,ARS,acreditado,PED-1,`;
    let data = importCsv(emptyDataset(), csvA);
    const plan = planImport(parseMovementsCsv(csvB), new Map(data.movements.map((m) => [m.key, m])));
    expect(plan.items[0]?.kind).toBe("estado_actualizado");
    data = importCsv(data, csvB);
    expect(data.movements[0]?.status).toBe("acreditado");
    expect(data.movements[0]?.statusUpdatedBy).toBeDefined();
  });

  it("id repetido dentro del mismo archivo: idéntico se ignora, distinto es error", () => {
    const csv = `${HEADER}\nM1,C,2026-09-15,100,ARS,acreditado,,\nM1,C,2026-09-15,100,ARS,acreditado,,\nM1,C,2026-09-15,200,ARS,acreditado,,`;
    const plan = planImport(parseMovementsCsv(csv), new Map());
    expect(plan.counts.nuevo).toBe(1);
    expect(plan.counts.repetido_en_archivo).toBe(1);
    expect(plan.errors[0]?.row).toBe(4);
    expect(plan.errors[0]?.message).toMatch(/fila 2/);
  });
});
