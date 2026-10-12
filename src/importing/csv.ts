/**
 * Lectura del CSV propio de movimientos. Usa PapaParse (parser probado) en vez
 * de separar por comas. El contenido se trata siempre como texto.
 *
 * Formato documentado en docs/FORMATO_CSV.md; la plantilla se descarga desde la pantalla Importar.
 */
import Papa from "papaparse";
import { parseDate } from "@/domain/dates";
import { CURRENCY, parseCsvAmount } from "@/domain/money";
import { LIMITS, MOVEMENT_STATUSES, type MovementDraft, type MovementStatus } from "@/domain/schemas";

export const CSV_LIMITS = {
  maxBytes: 1_000_000,
  maxRows: 2000,
} as const;

export const CSV_COLUMNS = [
  "id_movimiento",
  "cuenta",
  "fecha",
  "importe",
  "moneda",
  "estado",
  "referencia",
  "descripcion",
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

const REQUIRED: readonly CsvColumn[] = ["id_movimiento", "cuenta", "fecha", "importe", "moneda", "estado"];

export interface RowError {
  /** Número de registro en el archivo; la fila 1 es el encabezado. */
  row: number;
  column?: CsvColumn;
  message: string;
}

export interface ParsedRow {
  row: number;
  draft: MovementDraft;
}

export interface CsvParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  /** Errores que impiden leer el archivo completo. */
  fileErrors: string[];
  warnings: string[];
  totalDataRows: number;
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function stripControl(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function parseMovementsCsv(text: string): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [], fileErrors: [], warnings: [], totalDataRows: 0 };

  if (byteLength(text) > CSV_LIMITS.maxBytes) {
    result.fileErrors.push(`El archivo supera el máximo de ${CSV_LIMITS.maxBytes / 1_000_000} MB.`);
    return result;
  }
  if (text.trim() === "") {
    result.fileErrors.push("El archivo está vacío.");
    return result;
  }
  if (text.includes("�")) {
    result.warnings.push(
      "El archivo contiene caracteres no reconocidos. Guardalo como «CSV UTF-8» para conservar acentos.",
    );
  }

  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
    delimitersToGuess: [",", ";"],
  });

  const records = parsed.data;
  const header = records[0];
  if (!header) {
    result.fileErrors.push("No se encontró la fila de encabezado.");
    return result;
  }
  const names = header.map(normalizeHeader);
  const index = new Map<string, number>();
  names.forEach((n, i) => {
    if (!index.has(n)) index.set(n, i);
  });
  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length > 0) {
    result.fileErrors.push(
      `Faltan columnas obligatorias: ${missing.join(", ")}. Descargá la plantilla para ver el formato.`,
    );
    return result;
  }
  const unknown = names.filter((n) => n !== "" && !(CSV_COLUMNS as readonly string[]).includes(n));
  if (unknown.length > 0) {
    result.warnings.push(`Se ignoran columnas no reconocidas: ${unknown.join(", ")}.`);
  }

  const dataRecords = records.slice(1);
  const nonEmpty = dataRecords.filter((r) => r.some((cell) => cell.trim() !== ""));
  result.totalDataRows = nonEmpty.length;
  if (nonEmpty.length === 0) {
    result.fileErrors.push("El archivo no tiene filas de movimientos.");
    return result;
  }
  if (nonEmpty.length > CSV_LIMITS.maxRows) {
    result.fileErrors.push(
      `El archivo tiene ${nonEmpty.length} filas; el máximo es ${CSV_LIMITS.maxRows}. Dividilo en archivos más chicos.`,
    );
    return result;
  }

  const parseErrorsByRow = new Map<number, string>();
  for (const e of parsed.errors) {
    if (typeof e.row === "number") parseErrorsByRow.set(e.row, e.message);
  }

  dataRecords.forEach((record, i) => {
    const rowNumber = i + 2;
    if (!record.some((cell) => cell.trim() !== "")) return;
    const parseError = parseErrorsByRow.get(i + 1);
    if (parseError && parseError.toLowerCase().includes("quote")) {
      result.errors.push({ row: rowNumber, message: "Comillas mal cerradas en la fila." });
      return;
    }
    if (record.length > names.length) {
      result.errors.push({
        row: rowNumber,
        message: `La fila tiene ${record.length} columnas y el encabezado ${names.length}. Revisá separadores o comillas.`,
      });
      return;
    }
    const cell = (c: CsvColumn): string => {
      const idx = index.get(c);
      return idx === undefined ? "" : stripControl(record[idx] ?? "");
    };
    const rowErrors: RowError[] = [];
    const fail = (column: CsvColumn, message: string) => rowErrors.push({ row: rowNumber, column, message });

    const externalId = cell("id_movimiento");
    if (externalId === "") fail("id_movimiento", "Falta el identificador del movimiento.");
    else if (externalId.length > LIMITS.movementId) fail("id_movimiento", `El identificador supera ${LIMITS.movementId} caracteres.`);

    const account = cell("cuenta");
    if (account === "") fail("cuenta", "Falta la cuenta de origen.");
    else if (account.length > LIMITS.account) fail("cuenta", `La cuenta supera ${LIMITS.account} caracteres.`);

    const date = parseDate(cell("fecha"));
    if (!date.ok) fail("fecha", date.error);

    const amount = parseCsvAmount(cell("importe"));
    if (!amount.ok) fail("importe", amount.error);

    const currency = cell("moneda").toUpperCase();
    if (currency === "") fail("moneda", "Falta la moneda.");
    else if (currency !== CURRENCY) {
      fail("moneda", `Moneda «${currency}» no soportada: el prototipo solo opera en ARS y no convierte monedas.`);
    }

    const statusRaw = cell("estado").toLowerCase();
    const status = MOVEMENT_STATUSES.find((s) => s === statusRaw) as MovementStatus | undefined;
    if (!status) fail("estado", `Estado «${cell("estado")}» inválido: usá acreditado, pendiente o revertido.`);

    const reference = cell("referencia");
    if (reference.length > LIMITS.movementReference) {
      fail("referencia", `La referencia supera ${LIMITS.movementReference} caracteres.`);
    }
    const description = cell("descripcion");
    if (description.length > LIMITS.movementDescription) {
      fail("descripcion", `La descripción supera ${LIMITS.movementDescription} caracteres.`);
    }

    if (rowErrors.length > 0 || !date.ok || !amount.ok || !status) {
      result.errors.push(...rowErrors);
      return;
    }
    result.rows.push({
      row: rowNumber,
      draft: {
        externalId,
        account,
        date: date.iso,
        amountMinor: amount.minor,
        currency: CURRENCY,
        status,
        reference,
        description,
      },
    });
  });

  return result;
}

export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  "OP-0001,Cuenta principal,2026-09-15,45000.00,ARS,acreditado,PED-001,Transferencia recibida",
  "OP-0002,Cuenta principal,16/09/2026,12500.50,ARS,pendiente,,Depósito en revisión",
].join("\n");
