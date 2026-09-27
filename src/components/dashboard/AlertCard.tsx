import { Link } from 'react-router-dom';
import type { OperationalAlert } from '@/utils/alerts';
import { ALERT_TYPE_LABEL } from '@/utils/alerts';
import { SeverityIcon } from '@/components/ui/SeverityBadge';
import { fmtDateShort } from '@/utils/format';

export function AlertCard({ alert, compact }: { alert: OperationalAlert; compact?: boolean }) {
  const border = alert.severity === 'critical' ? 'border-l-bad' : alert.severity === 'warning' ? 'border-l-warn' : 'border-l-slate-300';
  return (
    <Link
      to={`/registros/${alert.recordId}`}
      className={`block border border-slate-200 border-l-4 ${border} rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors`}
    >
      <div className="flex items-start gap-2.5">
        <SeverityIcon level={alert.severity} size={16} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-900 truncate">{alert.title}</span>
            <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">{alert.recordNumber}</span>
          </div>
          <p className={`text-xs text-slate-500 ${compact ? 'truncate' : ''}`}>
            {ALERT_TYPE_LABEL[alert.type]} · {fmtDateShort(alert.date)} · {alert.detail}
          </p>
        </div>
      </div>
    </Link>
  );
}
