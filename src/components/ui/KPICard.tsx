import type { ReactNode } from 'react';
import { SeverityIcon, type Level } from './SeverityBadge';

interface Props {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  level?: Level;
  onClick?: () => void;
}

/** Tarjeta de indicador: número protagonista, unidad y contexto (objetivo / comparación). */
export function KPICard({ label, value, unit, sub, level, onClick }: Props) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`card text-left px-4 py-3.5 flex flex-col gap-1 min-w-0 ${onClick ? 'hover:border-brand-200 hover:bg-brand-50/30 transition-colors' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 truncate" title={label}>{label}</span>
        {level && level !== 'info' && <SeverityIcon level={level} size={15} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-slate-900">{value}</span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-slate-500 truncate" title={typeof sub === 'string' ? sub : undefined}>{sub}</div>}
    </Tag>
  );
}
