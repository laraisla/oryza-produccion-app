import type { RecordStatus } from '@/types/domain';

const MAP: Record<RecordStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: 'Borrador', cls: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  pending: { label: 'Pendiente', cls: 'bg-warn-bg text-warn-text', dot: 'bg-warn' },
  approved: { label: 'Aprobado', cls: 'bg-ok-bg text-ok-text', dot: 'bg-ok' },
  rejected: { label: 'Rechazado', cls: 'bg-bad-bg text-bad-text', dot: 'bg-bad' },
};

export const STATUS_LABEL: Record<RecordStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente de aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

export function StatusBadge({ status, long }: { status: RecordStatus; long?: boolean }) {
  const s = MAP[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {long ? STATUS_LABEL[status] : s.label}
    </span>
  );
}
