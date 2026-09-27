/**
 * Exportación de datos a CSV y Excel. Se exportan los datos de los registros
 * (no capturas), con una hoja por entidad para facilitar el análisis posterior.
 */
import type { Database, ProductionRecord } from '@/types/domain';
import { computeMetrics, resolveTargets } from '@/utils/calc';
import type { GroupRow, PeriodRow } from '@/utils/analytics';

const STATUS_LABEL: Record<ProductionRecord['status'], string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};
const Q_LABEL = { ok: 'Conforme', obs: 'Observación', nc: 'No conforme' } as const;

type Row = Record<string, string | number | null>;

export function recordRows(db: Database, records: ProductionRecord[]): Row[] {
  const name = <T extends { id: string; name: string }>(list: T[], id?: string) => list.find((x) => x.id === id)?.name ?? '';
  const shifts = new Map(db.shifts.map((s) => [s.id, s]));
  return records.map((r) => {
    const t = resolveTargets(db.settings.targets, db.lines.find((l) => l.id === r.lineId));
    const m = computeMetrics(r, shifts.get(r.shiftId), t);
    const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
    return {
      ID: r.number,
      Fecha: r.date,
      Turno: name(db.shifts, r.shiftId),
      Responsable: name(db.users, r.operatorId),
      Línea: name(db.lines, r.lineId),
      Producto: name(db.products, r.productId),
      Variedad: name(db.varieties, r.varietyId),
      Lote: r.lot,
      Presentación: name(db.presentations, r.presentationId),
      HoraInicio: r.startTime,
      HoraFin: r.endTime,
      Unidades: r.units,
      PesoUnitarioKg: r.unitWeightKg,
      Kg: r2(m.totalKg),
      Toneladas: r2(m.totalTn),
      Pallets: r.pallets,
      DuracionMin: m.durationMin,
      MinutosParada: m.downtimeMin,
      MinutosProductivos: m.productiveMin,
      CantidadParadas: r.downtimes.length,
      KgPorHora: r2(m.kgPerHour),
      PorcParada: r2(m.downtimePct),
      KgMerma: r.scrapKg,
      PorcMerma: r2(m.scrapPct),
      MotivoMerma: r.scrapReason,
      KgRechazado: r.rejectedKg,
      CumplimientoProduccionPorc: r2(m.productionAttainmentPct),
      CumplimientoProductividadPorc: r2(m.productivityAttainmentPct),
      IncidenciaCalidad: r.quality.hasIncident ? 'Sí' : 'No',
      Estado: STATUS_LABEL[r.status],
      Observaciones: r.observations,
      CreadoPor: name(db.users, r.createdBy),
      CreadoEl: r.createdAt,
      ModificadoPor: name(db.users, r.updatedBy),
      ModificadoEl: r.updatedAt,
      AprobadoPor: name(db.users, r.approvedBy),
      AprobadoEl: r.approvedAt ?? '',
      Origen: r.source === 'import' ? 'Importación' : 'Carga manual',
    };
  });
}

export function downtimeRows(db: Database, records: ProductionRecord[]): Row[] {
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '';
  return records.flatMap((r) =>
    r.downtimes.map((d) => ({
      Registro: r.number,
      Fecha: r.date,
      Turno: name(db.shifts, r.shiftId),
      Línea: name(db.lines, r.lineId),
      Lote: r.lot,
      Inicio: d.startTime,
      Fin: d.endTime,
      DuracionMin: d.durationMinutes,
      Categoría: name(db.downtimeCategories, d.categoryId),
      Tipo: db.downtimeCategories.find((c) => c.id === d.categoryId)?.kind ?? '',
      Motivo: d.reason,
      Observaciones: d.observations,
    })),
  );
}

export function qualityRows(records: ProductionRecord[]): Row[] {
  const q = (v: keyof typeof Q_LABEL | null) => (v ? Q_LABEL[v] : 'Sin dato');
  return records.map((r) => ({
    Registro: r.number,
    Fecha: r.date,
    Lote: r.lot,
    LoteVerificado: q(r.quality.lotOk),
    EnvaseCorrecto: q(r.quality.packagingOk),
    ImpresionCorrecta: q(r.quality.printingOk),
    PesoCorrecto: q(r.quality.weightOk),
    ProductoConforme: q(r.quality.productOk),
    Incidencia: r.quality.hasIncident ? 'Sí' : 'No',
    DescripcionIncidencia: r.quality.incidentDescription,
    Observaciones: r.quality.observations,
  }));
}

// ---------- CSV ----------

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con separador ";" y BOM UTF-8: se abre correctamente con Excel en configuración regional es-AR. */
export function toCSV(rows: Row[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(';'), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(';'))];
  return '﻿' + lines.join('\r\n');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportCSV(db: Database, records: ProductionRecord[], filename: string) {
  downloadBlob(new Blob([toCSV(recordRows(db, records))], { type: 'text/csv;charset=utf-8' }), filename);
}

// ---------- Excel ----------

export interface ExcelSheet {
  name: string;
  rows: Row[];
}

export async function exportExcel(sheets: ExcelSheet[], filename: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ORYZA · Sistema de Producción';
  wb.created = new Date();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    if (!sh.rows.length) {
      ws.addRow(['Sin datos para los filtros seleccionados']);
      continue;
    }
    const headers = Object.keys(sh.rows[0]!);
    ws.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: Math.min(40, Math.max(10, h.length + 2, ...sh.rows.slice(0, 50).map((r) => String(r[h] ?? '').length + 2))),
    }));
    sh.rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132F57' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export function recordsWorkbook(db: Database, records: ProductionRecord[], extra: ExcelSheet[] = []): ExcelSheet[] {
  return [
    { name: 'Registros', rows: recordRows(db, records) },
    { name: 'Paradas', rows: downtimeRows(db, records) },
    { name: 'Calidad', rows: qualityRows(records) },
    ...extra,
  ];
}

export function groupSheet(name: string, dim: string, rows: GroupRow[]): ExcelSheet {
  return {
    name,
    rows: rows.map((g) => ({
      [dim]: g.name,
      Registros: g.records,
      Kg: Math.round(g.kg),
      Toneladas: Math.round(g.kg / 10) / 100,
      Participacion: Math.round(g.pct * 10) / 10,
      KgPorHora: g.kgPerHour !== null ? Math.round(g.kgPerHour) : null,
      PorcMerma: g.scrapPct !== null ? Math.round(g.scrapPct * 100) / 100 : null,
      MinutosParada: g.downtimeMin,
      CumplimientoProductividad: g.attainmentPct !== null ? Math.round(g.attainmentPct * 10) / 10 : null,
    })),
  };
}

export function periodSheet(rows: PeriodRow[]): ExcelSheet {
  return {
    name: 'Resumen por período',
    rows: rows.map((p) => ({
      Periodo: p.label,
      Desde: p.key,
      Registros: p.records,
      Toneladas: Math.round(p.kg / 10) / 100,
      HorasProductivas: Math.round((p.productiveMin / 60) * 10) / 10,
      MinutosParada: p.downtimeMin,
      TnPorHora: p.kgPerHour !== null ? Math.round(p.kgPerHour / 10) / 100 : null,
      PorcMerma: p.scrapPct !== null ? Math.round(p.scrapPct * 100) / 100 : null,
      PorcParada: p.downtimePct !== null ? Math.round(p.downtimePct * 10) / 10 : null,
    })),
  };
}
