import { Wallet } from 'lucide-react';
import { VerificationBadge } from '@/components/status';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Alert, KeyValue } from '@/components/ui/misc';
import { useCurrentUser, useDb } from '@/data/store';
import { dec } from '@/domain/decimal';
import { fmtDate, fmtMoney, fmtNum } from '@/domain/format';
import type { ScenarioDraft } from '../useScenarioDraft';

export function FinanceSection({ draft }: { draft: ScenarioDraft }) {
  const db = useDb();
  const user = useCurrentUser();
  const { scenario: s, update, evaluation } = draft;
  const r = evaluation.result;
  const rates = db.fxRates.filter((x) => x.organizationId === user.organizationId).sort((a, b) => b.date.localeCompare(a.date));
  const fin = s.financing;
  const setFin = (patch: Partial<typeof fin>) => update({ financing: { ...fin, ...patch } });
  const total = r.totalPrice ? dec(r.totalPrice) : null;
  const advance = total ? total.times(dec(s.finance.advancePct || 0)).div(100) : null;
  const currency = s.commercial.currency;
  const usedPairs = new Set(s.lines.filter((l) => l.enabled && l.currency !== currency).map((l) => `${currency}/${l.currency}`));

  return (
    <Card>
      <CardHeader title="Planificación financiera" description="Costos financieros y flujo de cobro esperado. No se realizan liquidaciones bancarias." icon={<Wallet />} />
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Banco">{(p) => <Input {...p} value={s.finance.bank} onChange={(e) => update({ finance: { ...s.finance, bank: e.target.value } })} />}</Field>
          <Field label="Anticipo (%)">{(p) => <Input {...p} inputMode="decimal" value={s.finance.advancePct} onChange={(e) => update({ finance: { ...s.finance, advancePct: e.target.value } })} />}</Field>
          <Field label="Fecha prevista de cobro">{(p) => <Input {...p} type="date" value={s.finance.expectedCollectionDate ?? ''} onChange={(e) => update({ finance: { ...s.finance, expectedCollectionDate: e.target.value || null } })} />}</Field>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-700">Tipos de cambio aplicados (con fecha y fuente)</p>
          {usedPairs.size === 0 ? <p className="text-xs text-slate-500">Todos los conceptos están en {currency}: no se requiere conversión.</p> : null}
          <div className="space-y-1.5">
            {rates.map((rate) => (
              <div key={rate.id} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
                <Checkbox
                  checked={s.fxRateIds.includes(rate.id)}
                  onChange={(v) => {
                    const others = s.fxRateIds.filter((id) => {
                      const other = db.fxRates.find((x) => x.id === id);
                      return id !== rate.id && !(v && other && other.base === rate.base && other.quote === rate.quote);
                    });
                    update({ fxRateIds: v ? [...others, rate.id] : others });
                  }}
                  label={`${rate.base}/${rate.quote} = ${fmtNum(rate.rate, 4)}`}
                  description={`${fmtDate(rate.date)} · ${rate.source}`}
                />
                <VerificationBadge status={rate.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <Checkbox checked={fin.enabled} onChange={(v) => setFin({ enabled: v })} label="Incluir costo de financiación (prefinanciación de exportaciones u otra línea)" description="Interés simple: capital × tasa anual × días / base. Revisar la convención real del producto bancario." />
          {fin.enabled ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Capital">
                {(p) => <Select {...p} value={fin.principalBase} onChange={(e) => setFin({ principalBase: e.target.value as typeof fin.principalBase })}><option value="sale_value">% del valor de venta</option><option value="custom_amount">Importe fijo</option></Select>}
              </Field>
              {fin.principalBase === 'sale_value' ? (
                <Field label="% financiado">{(p) => <Input {...p} inputMode="decimal" value={fin.principalPct} onChange={(e) => setFin({ principalPct: e.target.value })} />}</Field>
              ) : (
                <Field label={`Importe (${currency})`}>{(p) => <Input {...p} inputMode="decimal" value={fin.customAmount ?? ''} onChange={(e) => setFin({ customAmount: e.target.value })} />}</Field>
              )}
              <Field label="Tasa nominal anual (%)">{(p) => <Input {...p} inputMode="decimal" value={fin.annualRatePct} onChange={(e) => setFin({ annualRatePct: e.target.value })} />}</Field>
              <Field label="Plazo (días)">{(p) => <Input {...p} inputMode="numeric" value={fin.days} onChange={(e) => setFin({ days: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
              <Field label="Base temporal">{(p) => <Select {...p} value={fin.dayCountBase} onChange={(e) => setFin({ dayCountBase: Number(e.target.value) as 360 | 365 })}><option value={360}>360 días</option><option value={365}>365 días</option></Select>}</Field>
            </div>
          ) : null}
        </div>

        <KeyValue
          columns={4}
          items={[
            { label: 'Comisiones y gastos (vendedor)', value: fmtMoney(r.commissionsTotal, currency) },
            { label: 'Costo financiero', value: r.financing ? fmtMoney(r.financing.interest, currency) : 'No incluido' },
            { label: 'Anticipo previsto', value: advance ? fmtMoney(advance.toFixed(2), currency) : '—' },
            { label: 'Saldo previsto', value: total && advance ? fmtMoney(total.minus(advance).toFixed(2), currency) : '—' },
            { label: 'Resultado comercial esperado', value: fmtMoney(r.marginAbs, currency) },
          ]}
        />
        {r.financing ? <p className="text-[11px] text-slate-500">{r.financing.convention}.</p> : null}
        <Alert tone="info">Los cobros reales se registran en Conciliación financiera como información cargada por el usuario; no se conectan con WebCOMEX ni SECOEXPO.</Alert>
      </CardContent>
    </Card>
  );
}
