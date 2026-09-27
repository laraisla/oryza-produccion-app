/**
 * Importación de planillas históricas (CSV / Excel).
 * Flujo: leer archivo → validar columnas → validar filas → detectar duplicados
 * → vista previa → confirmar. Solo se importan filas válidas.
 */
import type { Database, Downtime, ID, ProductionRecord, User } from '@/types/domain';
import { repository } from './storage/repository';
import { appendAudit } from './auditService';
import { BusinessError } from './errors';
import { normalize } from '@/utils/format';
import { computeTotalKg, recordAllowsOvernight } from '@/utils/calc';
import { isValidHHMM, minToHHMM, hhmmToMin, pad, spanMinutes } from '@/utils/time';
import { recordNumber, uid } from '@/utils/id';
import { downloadBlob, exportExcel, toCSV } from './exportService';

export const TEMPLATE_COLUMNS = [
  'Fecha',
  'Turno',
  'Responsable',
  'Linea',
  'Producto',
  'Variedad',
  'Lote',
  'Presentacion',
  'Unidades',
  'Kg',
  'HoraInicio',
  'HoraFin',
  'MinutosParada',
  'KgMerma',
  'Observaciones',
] as const;

type Col = (typeof TEMPLATE_COLUMNS)[number];
const REQUIRED: Col[] = ['Fecha', 'Turno', 'Responsable', 'Producto', 'Lote', 'Presentacion', 'HoraInicio', 'HoraFin'];

/** Sinónimos aceptados en encabezados de planillas anteriores. */
const ALIASES: Record<Col, string[]> = {
  Fecha: ['fecha', 'dia', 'date'],
  Turno: ['turno', 'shift'],
  Responsable: ['responsable', 'operador', 'operario'],
  Linea: ['linea', 'linea de produccion', 'maquina'],
  Producto: ['producto'],
  Variedad: ['variedad'],
  Lote: ['lote', 'nro lote', 'numero de lote'],
  Presentacion: ['presentacion', 'envase', 'formato'],
  Unidades: ['unidades', 'bolsas', 'cantidad'],
  Kg: ['kg', 'kilos', 'kg producidos', 'peso total'],
  HoraInicio: ['horainicio', 'hora inicio', 'inicio', 'desde'],
  HoraFin: ['horafin', 'hora fin', 'fin', 'hasta'],
  MinutosParada: ['minutosparada', 'minutos parada', 'min parada', 'paradas (min)', 'parada'],
  KgMerma: ['kgmerma', 'kg merma', 'merma', 'merma kg'],
  Observaciones: ['observaciones', 'obs', 'comentarios'],
};

export interface ImportRow {
  rowNumber: number;
  values: Partial<Record<Col, string>>;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
  record?: Omit<ProductionRecord, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
}

export interface ImportPreview {
  fileName: string;
  missingColumns: Col[];
  unknownColumns: string[];
  rows: ImportRow[];
}

// ---------------------------------------------------------------------------
// Lectura de archivos
// ---------------------------------------------------------------------------

function parseCSV(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // ExcelJS entrega fechas/horas como Date en UTC.
    const isTimeOnly = v.getUTCFullYear() <= 1900;
    if (isTimeOnly) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.result !== undefined) return cellToString(o.result);
    if (o.text !== undefined) return String(o.text);
  }
  return String(v);
}

async function readTable(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCSV(await file.text());
  if (name.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new BusinessError('No se pudo leer el archivo Excel. Verifica que no esté dañado ni protegido con contraseña.');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BusinessError('El archivo Excel no contiene hojas.');
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellToString(row.getCell(c).value).trim());
      rows.push(vals);
    });
    return rows.filter((r) => r.some((c) => c !== ''));
  }
  if (name.endsWith('.xls'))
    throw new BusinessError('El formato .xls (Excel 97-2003) no es compatible. Guarda el archivo como .xlsx o .csv e intenta nuevamente.');
  throw new BusinessError('Formato de archivo no admitido. Utiliza un archivo .csv o .xlsx.');
}

// ---------------------------------------------------------------------------
// Parseo de valores
// ---------------------------------------------------------------------------

function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    const mo = +m[2]!;
    const d = +m[1]!;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  if (/^\d{5}$/.test(t)) {
    // Número de serie de Excel
    const d = new Date(Date.UTC(1899, 11, 30) + +t * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return null;
}

function parseTime(s: string): string | null {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})[:.](\d{2})/);
  if (m) {
    const v = `${pad(+m[1]!)}:${m[2]}`;
    return isValidHHMM(v) ? v : null;
  }
  const f = Number(t.replace(',', '.'));
  if (Number.isFinite(f) && f >= 0 && f < 1) return minToHHMM(Math.round(f * 1440));
  return null;
}

/** Acepta "18.500", "18500,5", "18,500.5". */
function parseNumber(s: string | undefined): number | null {
  if (s === undefined || s.trim() === '') return null;
  let t = s.trim().replace(/\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function findByName<T extends { id: string; name: string; code?: string }>(list: T[], value: string): T | undefined {
  const v = normalize(value);
  if (!v) return undefined;
  return (
    list.find((x) => normalize(x.name) === v || (x.code && normalize(x.code) === v)) ??
    list.find((x) => normalize(x.name).startsWith(v) || v.startsWith(normalize(x.name)))
  );
}

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

export async function buildPreview(file: File, db: Database, defaultLineId: ID): Promise<ImportPreview> {
  if (file.size > 5 * 1024 * 1024) throw new BusinessError('El archivo supera los 5 MB. Divide la planilla en archivos más pequeños.');
  const table = await readTable(file);
  if (table.length < 2) throw new BusinessError('El archivo no contiene filas de datos (se espera una fila de encabezados y al menos una fila).');

  const headers = table[0]!.map((h) => normalize(h));
  const colIndex = new Map<Col, number>();
  TEMPLATE_COLUMNS.forEach((col) => {
    const idx = headers.findIndex((h) => ALIASES[col].includes(h) || h === normalize(col));
    if (idx >= 0) colIndex.set(col, idx);
  });
  const missingColumns = REQUIRED.filter((c) => !colIndex.has(c));
  if (!colIndex.has('Unidades') && !colIndex.has('Kg')) missingColumns.push('Unidades');
  const known = new Set(colIndex.values());
  const unknownColumns = table[0]!.filter((h, i) => !known.has(i) && h.trim());

  const rows: ImportRow[] = [];
  if (missingColumns.length) return { fileName: file.name, missingColumns, unknownColumns, rows };

  const histCat = db.downtimeCategories.find((c) => c.id === 'dc-hist') ?? db.downtimeCategories.find((c) => c.kind === 'otra');
  const seenKeys = new Set<string>();
  const existingKeys = new Set(db.records.map((r) => `${r.date}|${r.shiftId}|${r.lineId}|${normalize(r.lot)}|${r.productId}`));

  table.slice(1).forEach((cells, i) => {
    const values: Partial<Record<Col, string>> = {};
    colIndex.forEach((idx, col) => (values[col] = (cells[idx] ?? '').trim()));
    const row: ImportRow = { rowNumber: i + 2, values, errors: [], warnings: [], duplicate: false };
    const e = (m: string) => row.errors.push(m);
    const w = (m: string) => row.warnings.push(m);

    const date = parseDate(values.Fecha ?? '');
    if (!date) e(`Fecha inválida: "${values.Fecha ?? ''}". Usa DD/MM/AAAA.`);
    const shift = findByName(db.shifts, values.Turno ?? '');
    if (!shift) e(`Turno desconocido: "${values.Turno ?? ''}".`);
    const operator = findByName(db.users, values.Responsable ?? '');
    if (!operator) e(`Responsable no registrado: "${values.Responsable ?? ''}". Créalo primero en Usuarios.`);
    const product = findByName(db.products, values.Producto ?? '');
    if (!product) e(`Producto desconocido: "${values.Producto ?? ''}".`);
    const variety = values.Variedad ? findByName(db.varieties, values.Variedad) : db.varieties.find((v) => v.id === product?.defaultVarietyId);
    if (!variety) e(`Variedad desconocida: "${values.Variedad ?? ''}".`);
    const presentation = findByName(db.presentations, values.Presentacion ?? '');
    if (!presentation) e(`Presentación desconocida: "${values.Presentacion ?? ''}".`);
    const line = values.Linea ? findByName(db.lines, values.Linea) : db.lines.find((l) => l.id === defaultLineId);
    if (!line) e(values.Linea ? `Línea desconocida: "${values.Linea}".` : 'Selecciona una línea por defecto para filas sin línea.');
    const lot = (values.Lote ?? '').trim().toUpperCase();
    if (!lot) e('Falta el lote.');

    const start = parseTime(values.HoraInicio ?? '');
    const end = parseTime(values.HoraFin ?? '');
    if (!start) e(`Hora de inicio inválida: "${values.HoraInicio ?? ''}".`);
    if (!end) e(`Hora de fin inválida: "${values.HoraFin ?? ''}".`);
    const overnight = recordAllowsOvernight(shift);
    const duration = start && end ? spanMinutes(start, end, overnight) : null;
    if (start && end && duration === null) e('La hora de fin es anterior a la hora de inicio.');

    let units = parseNumber(values.Unidades);
    const kg = parseNumber(values.Kg);
    const stopMin = parseNumber(values.MinutosParada) ?? 0;
    const scrap = parseNumber(values.KgMerma) ?? 0;
    [
      ['Unidades', units],
      ['Kg', kg],
      ['MinutosParada', stopMin],
      ['KgMerma', scrap],
    ].forEach(([label, v]) => {
      if (typeof v === 'number' && Number.isNaN(v)) e(`${label}: valor no numérico.`);
      else if (typeof v === 'number' && v < 0) e(`${label} no puede ser negativo.`);
    });
    if (presentation && units === null && kg !== null && !Number.isNaN(kg)) units = Math.round(kg / presentation.unitWeightKg);
    if (units === null) e('Faltan las unidades o los kg producidos.');
    if (presentation && units && kg && !Number.isNaN(kg) && !Number.isNaN(units)) {
      const calc = units * presentation.unitWeightKg;
      if (Math.abs(calc - kg) / Math.max(1, kg) > 0.01)
        w(`Kg informados (${kg}) no coinciden con unidades × peso (${calc}). Se usará el cálculo por unidades.`);
    }
    if (duration !== null && stopMin > duration) e('Los minutos de parada superan la duración del turno.');

    if (!row.errors.length && date && shift && operator && product && variety && presentation && line && start && end && units !== null) {
      const key = `${date}|${shift.id}|${line.id}|${normalize(lot)}|${product.id}`;
      if (existingKeys.has(key)) {
        row.duplicate = true;
        e('Ya existe un registro con la misma fecha, turno, línea, lote y producto.');
      } else if (seenKeys.has(key)) {
        row.duplicate = true;
        e('Fila duplicada dentro del archivo.');
      }
      seenKeys.add(key);
      const downtimes: Downtime[] =
        stopMin > 0 && histCat
          ? [
              {
                id: uid('dt'),
                startTime: start,
                endTime: minToHHMM(hhmmToMin(start) + stopMin),
                durationMinutes: stopMin,
                categoryId: histCat.id,
                reason: 'Parada consolidada (planilla anterior)',
                observations: 'Importado sin detalle de horario ni causa.',
              },
            ]
          : [];
      if (stopMin > 0) w('Las paradas se importan como un único bloque "Sin clasificar (histórico)".');
      row.record = {
        module: 'fraccionamiento',
        date,
        shiftId: shift.id,
        operatorId: operator.id,
        lineId: line.id,
        productId: product.id,
        varietyId: variety.id,
        lot,
        presentationId: presentation.id,
        startTime: start,
        endTime: end,
        units,
        unitWeightKg: presentation.unitWeightKg,
        totalKg: computeTotalKg(units, presentation.unitWeightKg),
        pallets: Math.ceil(units / Math.max(1, presentation.unitsPerPallet)),
        unitsPerPallet: presentation.unitsPerPallet,
        scrapKg: scrap,
        rejectedKg: 0,
        scrapReason: '',
        scrapObservations: '',
        observations: values.Observaciones ?? '',
        downtimes,
        quality: { lotOk: null, packagingOk: null, printingOk: null, weightOk: null, productOk: null, observations: '', hasIncident: false, incidentDescription: '' },
        status: 'approved',
        source: 'import',
      };
    }
    rows.push(row);
  });
  return { fileName: file.name, missingColumns, unknownColumns, rows };
}

export async function commitImport(preview: ImportPreview, user: User): Promise<number> {
  const valid = preview.rows.filter((r) => r.record && !r.errors.length);
  if (!valid.length) throw new BusinessError('No hay filas válidas para importar.');
  return repository.transaction((db) => {
    // Revalida duplicados por si la base cambió desde la vista previa.
    const existing = new Set(db.records.map((r) => `${r.date}|${r.shiftId}|${r.lineId}|${normalize(r.lot)}|${r.productId}`));
    const now = new Date().toISOString();
    let n = 0;
    for (const row of valid) {
      const rec = row.record!;
      const key = `${rec.date}|${rec.shiftId}|${rec.lineId}|${normalize(rec.lot)}|${rec.productId}`;
      if (existing.has(key)) continue;
      existing.add(key);
      db.counters.record += 1;
      db.records.push({
        ...rec,
        id: uid('rec'),
        number: recordNumber(db.counters.record),
        createdBy: user.id,
        createdAt: now,
        updatedBy: user.id,
        updatedAt: now,
        submittedAt: now,
        approvedBy: user.id,
        approvedAt: now,
        reviewComment: `Importado desde ${preview.fileName}`,
      });
      n++;
    }
    appendAudit(db, {
      userId: user.id,
      action: 'import',
      entity: 'production_record',
      entityId: 'import',
      entityLabel: `${n} registros desde ${preview.fileName}`,
    });
    return n;
  });
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

const TEMPLATE_EXAMPLES = [
  ['24/08/2026', 'Mañana', 'Juan Pérez', 'L1', 'Arroz Largo Fino', 'IRGA 424', 'LOT-240826-01', '1 kg', '17850', '17850', '06:05', '13:40', '35', '210', ''],
  ['24/08/2026', 'Tarde', 'Lucía Fernández', 'L2', 'Arroz Blanco', 'Ñu Poty', 'LOT-240826-02', '25 kg', '1150', '28750', '14:10', '21:45', '48', '390', 'Cambio de bobina'],
];

export function downloadTemplateCSV() {
  const rows = TEMPLATE_EXAMPLES.map((ex) => Object.fromEntries(TEMPLATE_COLUMNS.map((c, i) => [c, ex[i] ?? ''])));
  downloadBlob(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }), 'plantilla_importacion_oryza.csv');
}

export function downloadTemplateExcel() {
  const rows = TEMPLATE_EXAMPLES.map((ex) => Object.fromEntries(TEMPLATE_COLUMNS.map((c, i) => [c, ex[i] ?? ''])));
  return exportExcel([{ name: 'Datos', rows }], 'plantilla_importacion_oryza.xlsx');
}
