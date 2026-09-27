/**
 * Motor de alertas operativas. Las alertas se derivan de los registros y de los
 * parámetros de Configuración (no se almacenan): siempre reflejan el estado actual.
 */
import type { Database, ProductionRecord } from '@/types/domain';
import { computeMetrics, resolveTargets } from './calc';
import { fmtNum, normalize } from './format';

export type Severity = 'critical' | 'warning' | 'info';

export type AlertType =
  | 'scrap'
  | 'productivity'
  | 'long_stop'
  | 'downtime_pct'
  | 'quality'
  | 'incomplete'
  | 'pending'
  | 'repeated_lot';

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  scrap: 'Merma sobre límite',
  productivity: 'Productividad bajo objetivo',
  long_stop: 'Parada prolongada',
  downtime_pct: 'Tiempo detenido elevado',
  quality: 'Calidad no conforme',
  incomplete: 'Registro incompleto',
  pending: 'Pendiente de aprobación',
  repeated_lot: 'Lote repetido',
};

export interface OperationalAlert {
  id: string;
  type: AlertType;
  severity: Severity;
  title: string;
  detail: string;
  recordId: string;
  recordNumber: string;
  date: string;
}

export function computeAlerts(db: Database, records: ProductionRecord[], now = new Date()): OperationalAlert[] {
  const out: OperationalAlert[] = [];
  const shifts = new Map(db.shifts.map((s) => [s.id, s]));
  const lines = new Map(db.lines.map((l) => [l.id, l]));
  const products = new Map(db.products.map((p) => [p.id, p.name]));

  // Índice de lotes para detectar un mismo lote usado con distintos productos.
  const lotProducts = new Map<string, Set<string>>();
  db.records.forEach((r) => {
    const k = normalize(r.lot);
    if (!k) return;
    if (!lotProducts.has(k)) lotProducts.set(k, new Set());
    lotProducts.get(k)!.add(r.productId);
  });

  for (const r of records) {
    const t = resolveTargets(db.settings.targets, lines.get(r.lineId));
    const m = computeMetrics(r, shifts.get(r.shiftId), t);
    const push = (type: AlertType, severity: Severity, title: string, detail: string) =>
      out.push({ id: `${r.id}-${type}-${out.length}`, type, severity, title, detail, recordId: r.id, recordNumber: r.number, date: r.date });

    if (r.status === 'rejected') continue; // se corrigen y vuelven a enviarse

    if (m.scrapPct !== null && m.scrapPct > t.maxScrapPct)
      push(
        'scrap',
        m.scrapPct > t.maxScrapPct * 1.5 ? 'critical' : 'warning',
        `Merma ${fmtNum(m.scrapPct, 1)} % (máx. ${t.maxScrapPct} %)`,
        `${products.get(r.productId) ?? ''} · lote ${r.lot} · ${fmtNum(r.scrapKg)} kg de merma${r.scrapReason ? ` · ${r.scrapReason}` : ''}`,
      );

    if (m.productivityAttainmentPct !== null && m.productivityAttainmentPct < 90 && r.status !== 'draft')
      push(
        'productivity',
        m.productivityAttainmentPct < 75 ? 'critical' : 'warning',
        `Productividad ${fmtNum(m.kgPerHour, 0)} kg/h (${fmtNum(m.productivityAttainmentPct, 0)} % del objetivo)`,
        `${lines.get(r.lineId)?.name ?? ''} · objetivo ${fmtNum(t.targetKgPerHour)} kg/h`,
      );

    const longest = r.downtimes.reduce<ProductionRecord['downtimes'][number] | null>(
      (a, d) => (!a || d.durationMinutes > a.durationMinutes ? d : a),
      null,
    );
    if (longest && longest.durationMinutes > t.maxStopMinutes) {
      const cat = db.downtimeCategories.find((c) => c.id === longest.categoryId)?.name ?? '';
      push(
        'long_stop',
        longest.durationMinutes > t.maxStopMinutes * 2 ? 'critical' : 'warning',
        `Parada de ${longest.durationMinutes} min (límite ${t.maxStopMinutes} min)`,
        `${cat}${longest.reason ? ` · ${longest.reason}` : ''} · ${longest.startTime}–${longest.endTime}`,
      );
    }

    if (m.downtimePct !== null && m.downtimePct > t.maxDowntimePct)
      push('downtime_pct', 'warning', `Tiempo detenido ${fmtNum(m.downtimePct, 1)} % del registro`, `${m.downtimeMin} min detenidos · máximo ${t.maxDowntimePct} %`);

    const q = r.quality;
    const qv = [q.lotOk, q.packagingOk, q.printingOk, q.weightOk, q.productOk];
    if (qv.includes('nc') || q.hasIncident)
      push('quality', 'critical', qv.includes('nc') ? 'Control de calidad no conforme' : 'Incidencia de calidad', q.observations || q.incidentDescription || `Lote ${r.lot}`);

    if (r.status === 'draft') {
      const ageH = (now.getTime() - new Date(r.updatedAt).getTime()) / 3.6e6;
      if (ageH > 12 || !r.endTime || !r.units)
        push('incomplete', ageH > 24 ? 'warning' : 'info', 'Registro en borrador sin enviar', `Creado hace ${fmtNum(ageH, 0)} h · complétalo y envíalo a aprobación`);
    }

    if (r.status === 'pending') {
      const ageH = (now.getTime() - new Date(r.submittedAt ?? r.updatedAt).getTime()) / 3.6e6;
      push(
        'pending',
        ageH > db.settings.targets.pendingAlertHours ? 'warning' : 'info',
        'Pendiente de aprobación',
        `Enviado hace ${ageH < 1 ? 'menos de 1' : fmtNum(ageH, 0)} h`,
      );
    }

    if ((lotProducts.get(normalize(r.lot))?.size ?? 0) > 1)
      push('repeated_lot', 'warning', `Lote ${r.lot} usado con distintos productos`, 'Verificar identificación del lote');
  }

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.date.localeCompare(a.date));
}
