import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { Severity } from '@/utils/alerts';

export type Level = Severity | 'ok';

const MAP: Record<Level, { label: string; cls: string; Icon: typeof Info }> = {
  critical: { label: 'Problema', cls: 'bg-bad-bg text-bad-text', Icon: AlertOctagon },
  warning: { label: 'Atención', cls: 'bg-warn-bg text-warn-text', Icon: AlertTriangle },
  info: { label: 'Info', cls: 'bg-slate-100 text-slate-600', Icon: Info },
  ok: { label: 'Normal', cls: 'bg-ok-bg text-ok-text', Icon: CheckCircle2 },
};

export function SeverityIcon({ level, size = 16 }: { level: Level; size?: number }) {
  const { Icon } = MAP[level];
  const color = level === 'critical' ? 'text-bad' : level === 'warning' ? 'text-warn-text' : level === 'ok' ? 'text-ok' : 'text-slate-400';
  return <Icon size={size} className={`${color} shrink-0`} aria-label={MAP[level].label} />;
}

export function SeverityBadge({ level, label }: { level: Level; label?: string }) {
  const { cls, Icon } = MAP[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon size={12} aria-hidden />
      {label ?? MAP[level].label}
    </span>
  );
}
