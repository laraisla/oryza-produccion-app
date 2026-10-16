import { ChevronDown, ChevronRight, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { evaluateScenario } from '@/data/derive';
import { visibleScenarios } from '@/data/selectors';
import { todayISO, useCurrentUser, useDb } from '@/data/store';
import { COST_STAGES, compareResults, sensitivity, type CostingResult, type CostStage } from '@/domain/costing';
import { dec } from '@/domain/decimal';
import { fmtMoney, fmtNum, fmtPct } from '@/domain/format';
import type { ScenarioDraft } from './useScenarioDraft';

/** Serie única validada (paleta de referencia, slot 1): contraste ≥ 3:1 y croma suficiente. */
const SERIES = '#2a78d6';

interface StageDatum {
  stage: CostStage;
  label: string;
  seller: number;
  buyer: number;
  share: number | null;
}

function StageTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: StageDatum }[]; currency: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-slate-900">{d.label}</p>
      <p className="text-slate-700">Vendedor: {fmtMoney(d.seller, currency)}{d.share !== null ? ` (${fmtPct(d.share, 1)} del precio)` : ''}</p>
      <p className="text-slate-500">Comprador: {fmtMoney(d.buyer, currency)}</p>
    </div>
  );
}

export function CostCompositionChart({ result }: { result: CostingResult }) {
  const total = result.totalPrice ? Number(result.totalPrice) : null;
  const data: StageDatum[] = result.stages
    .map((s) => ({
      stage: s.stage,
      label: COST_STAGES[s.stage],
      seller: Number(dec(s.seller).toFixed(2)),
      buyer: Number(dec(s.buyer).toFixed(2)),
      share: total ? (Number(s.seller) / total) * 100 : null,
    }))
    .filter((d) => d.seller > 0)
    .sort((a, b) => b.seller - a.seller);
  if (data.length === 0) return <p className="text-xs text-slate-500">Sin costos del vendedor para graficar.</p>;
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-slate-700">Costo asumido por el vendedor, por etapa ({result.currency})</figcaption>
      <div style={{ height: Math.max(140, data.length * 30 + 20) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeWidth={1} />
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
            <ChartTooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<StageTooltip currency={result.currency} />} />
            <Bar dataKey="seller" fill={SERIES} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
              <LabelList dataKey="seller" position="right" formatter={(v: number) => fmtNum(v, 0)} style={{ fontSize: 11, fill: '#334155' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`num text-right ${strong ? 'text-base font-semibold text-slate-900' : 'text-sm text-slate-800'}`}>{value}</span>
    </div>
  );
}

export function ResultsPanel({ draft }: { draft: ScenarioDraft }) {
  const db = useDb();
  const user = useCurrentUser();
  const { scenario: s, evaluation } = draft;
  const r = evaluation.result;
  const cur = r.currency;
  const [showInfo, setShowInfo] = useState(false);
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [compareId, setCompareId] = useState('');
  const errors = [...r.alerts.filter((a) => a.level === 'error').map((a) => a.message), ...evaluation.extraAlerts.filter((a) => a.level === 'error').map((a) => a.message)];
  const warnings = [...r.alerts.filter((a) => a.level === 'warning' && a.code !== 'duplicate').map((a) => a.message), ...evaluation.extraAlerts.filter((a) => a.level === 'warning').map((a) => a.message)];
  const infos = r.alerts.filter((a) => a.level === 'info').map((a) => a.message);
  const sens = useMemo(() => (showSensitivity ? sensitivity(evaluation.input, 10) : []), [showSensitivity, evaluation.input]);
  const others = visibleScenarios(db, user).filter((x) => x.id !== s.id);
  const comparison = useMemo(() => {
    const other = others.find((x) => x.id === compareId);
    return other ? compareResults(r, evaluateScenario(db, other, todayISO()).result) : null;
  }, [compareId, others, r, db]);

  return (
    <div className="space-y-4">
      <Card className="border-petrol-200">
        <CardHeader title="Resultado de la cotización" description={`${s.commercial.incoterm} ${s.commercial.namedPlace || '(sin lugar)'} · ${fmtNum(r.quantityT, 3)} t · ${r.containers} contenedor(es)`} />
        <CardContent>
          <div className="rounded-md bg-petrol-50 px-3 py-3">
            <p className="text-xs text-petrol-800">Precio de cotización</p>
            <p className="num text-3xl font-semibold text-petrol-950"><span data-testid="price-per-t">{r.pricePerT ? `${fmtMoney(r.pricePerT, cur)}` : '—'}</span><span className="text-sm font-normal text-petrol-800"> / t</span></p>
            <p className="num text-sm text-petrol-900">Total <span data-testid="price-total">{fmtMoney(r.totalPrice, cur)}</span></p>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            <Metric label="Precio mínimo (equilibrio)" value={r.minPricePerT ? `${fmtMoney(r.minPricePerT, cur)}/t` : '—'} />
            <Metric label="Costo del vendedor" value={fmtMoney(r.sellerCostTotal, cur)} />
            <Metric label="Costo por tonelada" value={`${fmtMoney(r.sellerCostPerT, cur)}/t`} />
            <Metric label="Costo por contenedor" value={r.sellerCostPerContainer ? fmtMoney(r.sellerCostPerContainer, cur) : '—'} />
            <Metric label="Comisiones y gastos financieros" value={fmtMoney(r.commissionsTotal, cur)} />
            <Metric label="Margen absoluto" value={fmtMoney(r.marginAbs, cur)} strong />
            <Metric label="Margen % sobre venta" value={fmtPct(r.marginPctOnSale)} />
            <Metric label="Recargo % sobre costo" value={fmtPct(r.markupPctOnCost)} />
            <Metric label="Costos a cargo del comprador (fuera del precio)" value={fmtMoney(r.buyerCostTotal, cur)} />
            <Metric label="Costo total de la operación (ambas partes)" value={fmtMoney(r.operationCostTotal, cur)} />
          </div>
          <p className="mt-3 rounded bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
            <span className="font-medium">{r.pricing.label}.</span> {r.pricing.formula}. Motor {r.engineVersion}; decimales exactos, redondeo solo del precio final.
          </p>
        </CardContent>
      </Card>

      {errors.length || warnings.length || infos.length ? (
        <Card>
          <CardContent className="space-y-2">
            {errors.map((m) => (
              <p key={m} className="flex gap-2 text-sm text-red-700"><CircleAlert className="mt-0.5 size-4 shrink-0" />{m}</p>
            ))}
            {warnings.map((m) => (
              <p key={m} className="flex gap-2 text-sm text-amber-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{m}</p>
            ))}
            {infos.length ? (
              <button type="button" className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900" onClick={() => setShowInfo(!showInfo)} aria-expanded={showInfo}>
                {showInfo ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} {infos.length} datos estimados o pendientes de verificación
              </button>
            ) : null}
            {showInfo ? infos.map((m) => <p key={m} className="flex gap-2 pl-4 text-xs text-slate-600"><Info className="mt-0.5 size-3.5 shrink-0" />{m}</p>) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Composición de costos" />
        <CardContent className="space-y-3">
          <CostCompositionChart result={r} />
          <Table>
            <THead><TR><TH>Etapa</TH><TH className="text-right">Vendedor</TH><TH className="text-right">Comprador</TH></TR></THead>
            <TBody>
              {r.stages.map((st) => (
                <TR key={st.stage}><TD className="text-xs">{COST_STAGES[st.stage]}</TD><TD className="num text-right text-xs">{fmtNum(st.seller, 2)}</TD><TD className="num text-right text-xs">{fmtNum(st.buyer, 2)}</TD></TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setShowSensitivity(!showSensitivity)} aria-expanded={showSensitivity}>
          <span className="text-sm font-semibold text-slate-900">Análisis de sensibilidad (±10 %)</span>
          {showSensitivity ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
        </button>
        {showSensitivity ? (
          <Table>
            <THead><TR><TH>Variación</TH><TH className="text-right">Precio/t</TH><TH className="text-right">Δ precio/t</TH><TH className="text-right">Δ margen</TH></TR></THead>
            <TBody>
              {sens.map((c) => (
                <TR key={c.label}>
                  <TD className="text-xs">{c.label}</TD>
                  <TD className="num text-right text-xs">{fmtNum(c.pricePerT, 2)}</TD>
                  <TD className="num text-right text-xs">{fmtNum(c.deltaPricePerT, 2)}</TD>
                  <TD className="num text-right text-xs">{fmtNum(c.deltaMargin, 2)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Comparar con otro escenario" description="Los escenarios no sobrescriben cotizaciones aceptadas" />
        <CardContent>
          <Select aria-label="Escenario a comparar" value={compareId} onChange={(e) => setCompareId(e.target.value)}>
            <option value="">Elegir escenario…</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          {comparison ? (
            <Table className="mt-3">
              <THead><TR><TH>Métrica</TH><TH className="text-right">Este</TH><TH className="text-right">Otro</TH><TH className="text-right">Diferencia</TH></TR></THead>
              <TBody>
                {comparison.map((d) => (
                  <TR key={d.metric}><TD className="text-xs">{d.metric}</TD><TD className="num text-right text-xs">{fmtNum(d.a, 2)}</TD><TD className="num text-right text-xs">{fmtNum(d.b, 2)}</TD><TD className="num text-right text-xs">{fmtNum(d.diff, 2)}</TD></TR>
                ))}
              </TBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
