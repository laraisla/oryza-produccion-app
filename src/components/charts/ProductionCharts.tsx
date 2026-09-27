/**
 * Gráficos de producción. Reciben series ya calculadas por utils/analytics:
 * ningún gráfico contiene datos fijos.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyPoint, GroupRow, ParetoRow } from '@/utils/analytics';
import { fmtNum } from '@/utils/format';
import { EmptyState } from '@/components/ui/Card';

export const COLORS = {
  primary: '#2a5fa8',
  target: '#64748b',
  grid: '#e5e7eb',
  axis: '#94a3b8',
  bad: '#d03b3b',
  muted: '#cbd5e1',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
};

const axisProps = {
  tick: { fontSize: 11, fill: '#64748b' },
  tickLine: false,
  axisLine: { stroke: COLORS.grid },
} as const;

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-slate-800 mb-1">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5">
          {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-slate-500">{r.label}</span>
          <span className="ml-auto pl-3 font-semibold text-slate-800 tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mb-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

const hasData = (d: DailyPoint[]) => d.some((p) => p.records > 0);

/** Fecha vs toneladas producidas, con el objetivo del día (suma de objetivos por turno/línea). */
export function DailyProductionChart({ data, height = 260, onSelectDate }: { data: DailyPoint[]; height?: number; onSelectDate?: (d: string) => void }) {
  if (!hasData(data)) return <EmptyState title="Sin producción en el período seleccionado" />;
  return (
    <div>
      <Legend items={[{ label: 'Toneladas producidas', color: COLORS.primary }, { label: 'Objetivo', color: COLORS.target, dashed: true }]} />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axisProps} axisLine={false} width={48} tickFormatter={(v) => fmtNum(v)} />
          <Tooltip
            cursor={{ fill: 'rgba(42,95,168,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as DailyPoint;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: 'Producción', value: `${fmtNum(p.tn, 1)} tn`, color: COLORS.primary },
                    { label: 'Objetivo', value: `${fmtNum(p.targetTn, 1)} tn`, color: COLORS.target },
                    { label: 'Cumplimiento', value: p.targetTn ? `${fmtNum((p.tn / p.targetTn) * 100, 0)} %` : '—' },
                    { label: 'Registros', value: String(p.records) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="tn"
            fill={COLORS.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            cursor={onSelectDate ? 'pointer' : undefined}
            onClick={(d: { payload?: DailyPoint }) => d?.payload && onSelectDate?.(d.payload.date)}
          />
          <Line dataKey="targetTn" stroke={COLORS.target} strokeDasharray="4 4" strokeWidth={1.5} dot={false} type="stepAfter" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Participación por producto (barras horizontales con % — más legible que una torta). */
export function ShareBars({ rows, colorFor }: { rows: GroupRow[]; colorFor?: (id: string, i: number) => string }) {
  if (!rows.length) return <EmptyState title="Sin datos" />;
  const max = Math.max(...rows.map((r) => r.kg));
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.id}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-slate-700 truncate">{r.name}</span>
            <span className="tabular-nums text-slate-900 font-semibold">
              {fmtNum(r.kg / 1000, 1)} tn <span className="text-slate-500 font-normal">· {fmtNum(r.pct, 1)} %</span>
            </span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-slate-100" title={`${r.name}: ${fmtNum(r.pct, 1)} %`}>
            <div className="h-2.5 rounded-full" style={{ width: `${max ? (r.kg / max) * 100 : 0}%`, background: colorFor ? colorFor(r.id, i) : COLORS.series[i % COLORS.series.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Comparación por turno: toneladas y productividad. */
export function ShiftChart({ rows, height = 220 }: { rows: GroupRow[]; height?: number }) {
  if (!rows.length) return <EmptyState title="Sin datos" />;
  const data = rows.map((r) => ({ ...r, tn: r.kg / 1000 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} width={52} tickFormatter={(v) => fmtNum(v)} />
        <Tooltip
          cursor={{ fill: 'rgba(42,95,168,0.06)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as GroupRow & { tn: number };
            return (
              <TooltipBox
                title={`Turno ${p.name}`}
                rows={[
                  { label: 'Producción', value: `${fmtNum(p.tn, 1)} tn` },
                  { label: 'Participación', value: `${fmtNum(p.pct, 1)} %` },
                  { label: 'Productividad', value: p.kgPerHour ? `${fmtNum(p.kgPerHour / 1000, 2)} tn/h` : '—' },
                  { label: 'Cumpl. productividad', value: p.attainmentPct ? `${fmtNum(p.attainmentPct, 0)} %` : '—' },
                  { label: 'Merma', value: p.scrapPct !== null ? `${fmtNum(p.scrapPct, 2)} %` : '—' },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="tn" radius={[4, 4, 0, 0]} maxBarSize={56} label={{ position: 'top', fontSize: 11, fill: '#334155', formatter: (v: number) => `${fmtNum(v, 0)} tn` }}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS.series[i % COLORS.series.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Evolución de productividad (tn/h) contra el objetivo ponderado del día. */
export function ProductivityChart({ data, height = 240 }: { data: DailyPoint[]; height?: number }) {
  if (!hasData(data)) return <EmptyState title="Sin datos" />;
  return (
    <div>
      <Legend items={[{ label: 'tn/h productiva', color: COLORS.primary }, { label: 'Objetivo', color: COLORS.target, dashed: true }]} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axisProps} axisLine={false} width={48} domain={['auto', 'auto']} tickFormatter={(v) => fmtNum(v, 1)} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as DailyPoint;
              return (
                <TooltipBox
                  title={p.label}
                  rows={[
                    { label: 'Productividad', value: p.tnPerHour !== null ? `${fmtNum(p.tnPerHour, 2)} tn/h` : '—', color: COLORS.primary },
                    { label: 'Objetivo', value: p.targetTnPerHour !== null ? `${fmtNum(p.targetTnPerHour, 2)} tn/h` : '—', color: COLORS.target },
                  ]}
                />
              );
            }}
          />
          <Line dataKey="targetTnPerHour" stroke={COLORS.target} strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls />
          <Line dataKey="tnPerHour" stroke={COLORS.primary} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Evolución diaria del % de merma con el máximo configurado. */
export function ScrapChart({ data, max, height = 220 }: { data: DailyPoint[]; max: number; height?: number }) {
  if (!hasData(data)) return <EmptyState title="Sin datos" />;
  return (
    <div>
      <Legend items={[{ label: '% merma', color: COLORS.series[1]! }, { label: `Máximo ${fmtNum(max, 1)} %`, color: COLORS.bad, dashed: true }]} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axisProps} axisLine={false} width={48} domain={[0, (dataMax: number) => Math.max(max * 1.4, Math.ceil(dataMax + 0.5))]} tickFormatter={(v) => fmtNum(v, 1)} />
          <ReferenceLine y={max} stroke={COLORS.bad} strokeDasharray="4 4" />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as DailyPoint;
              return <TooltipBox title={p.label} rows={[{ label: 'Merma', value: p.scrapPct !== null ? `${fmtNum(p.scrapPct, 2)} %` : '—' }]} />;
            }}
          />
          <Line
            dataKey="scrapPct"
            stroke={COLORS.series[1]}
            strokeWidth={2}
            connectNulls
            dot={(props: { cx?: number; cy?: number; payload?: DailyPoint; index?: number }) => {
              const over = (props.payload?.scrapPct ?? 0) > max;
              return <circle key={props.index} cx={props.cx} cy={props.cy} r={over ? 4 : 2.5} fill={over ? COLORS.bad : COLORS.series[1]} stroke="#fff" strokeWidth={over ? 1.5 : 0} />;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Pareto de paradas en formato barra + acumulado tabular (evita el doble eje).
 * Las causas que acumulan hasta el 80 % (las "pocas vitales") se destacan.
 */
export function ParetoChart({ rows, limit = 8 }: { rows: ParetoRow[]; limit?: number }) {
  if (!rows.length) return <EmptyState title="Sin paradas registradas en el período" />;
  const shown = rows.slice(0, limit);
  const max = shown[0]!.minutes;
  let vitalReached = false;
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_64px_52px] sm:grid-cols-[minmax(110px,170px)_minmax(0,1fr)_64px_52px] gap-x-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 pb-2 border-b border-slate-100">
        <span>Causa</span>
        <span className="hidden sm:block">Minutos perdidos</span>
        <span className="text-right">Min</span>
        <span className="text-right">% Acum.</span>
      </div>
      <ul>
        {shown.map((r) => {
          const vital = !vitalReached;
          if (r.cumPct >= 80) vitalReached = true;
          return (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_64px_52px] sm:grid-cols-[minmax(110px,170px)_minmax(0,1fr)_64px_52px] gap-x-3 items-center py-2 border-b border-slate-50 text-sm" title={`${r.name}: ${r.minutes} min en ${r.stops} paradas (${fmtNum(r.pct, 1)} %)`}>
              <span className="truncate text-slate-700">{r.name}</span>
              <span className="hidden sm:block h-3 rounded bg-slate-100">
                <span className="block h-3 rounded" style={{ width: `${(r.minutes / max) * 100}%`, background: vital ? COLORS.primary : COLORS.muted }} />
              </span>
              <span className="text-right tabular-nums font-medium">{fmtNum(r.minutes)}</span>
              <span className={`text-right tabular-nums ${vital ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>{fmtNum(r.cumPct, 0)} %</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        <span className="inline-block h-2 w-2 rounded-sm mr-1 align-middle" style={{ background: COLORS.primary }} />
        Causas que explican el 80 % del tiempo detenido.
      </p>
    </div>
  );
}

/** Minutos perdidos por categoría (barras verticales). */
export function DowntimeCategoryChart({ rows, height = 240 }: { rows: ParetoRow[]; height?: number }) {
  if (!rows.length) return <EmptyState title="Sin paradas registradas" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={COLORS.grid} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => fmtNum(v)} />
        <YAxis type="category" dataKey="name" {...axisProps} width={140} />
        <Tooltip
          cursor={{ fill: 'rgba(42,95,168,0.06)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as ParetoRow;
            return <TooltipBox title={p.name} rows={[{ label: 'Minutos', value: fmtNum(p.minutes) }, { label: 'Paradas', value: String(p.stops) }, { label: 'Participación', value: `${fmtNum(p.pct, 1)} %` }]} />;
          }}
        />
        <Bar dataKey="minutes" fill={COLORS.primary} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 11, fill: '#334155' }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
