import { Package, Plus, Trash2 } from 'lucide-react';
import { VerificationBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, KeyValue } from '@/components/ui/misc';
import { byId, stockOf } from '@/data/derive';
import { useCurrentUser, useDb } from '@/data/store';
import { dec, isDecimalString, sum, toPlain } from '@/domain/decimal';
import { fmtNum, fmtTons } from '@/domain/format';
import type { ScenarioDraft } from '../useScenarioDraft';

export function ProductSection({ draft, compact }: { draft: ScenarioDraft; compact?: boolean }) {
  const db = useDb();
  const user = useCurrentUser();
  const { scenario: s, update, evaluation } = draft;
  const { packaging, containerPlan, containers, container } = evaluation.logistics;
  const products = db.products.filter((p) => p.organizationId === user.organizationId && p.status === 'active');
  const product = byId(db.products, s.productId);
  const lotOptions = db.lots.filter((l) => l.organizationId === user.organizationId && l.productId === s.productId && l.status === 'active');
  const assigned = toPlain(sum(s.lots.map((l) => (isDecimalString(l.quantityT) ? l.quantityT : '0'))));
  const qtyError = s.quantityT && !isDecimalString(s.quantityT) ? 'Ingresar un número (punto decimal)' : !s.quantityT || dec(s.quantityT || 0).lte(0) ? 'La cantidad debe ser mayor a cero' : undefined;

  return (
    <Card>
      <CardHeader title="Producto y cantidad" description="El lote elegido alimenta matching, cotización, documentación y trazabilidad sin volver a cargarlo" icon={<Package />} />
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Producto" required>
            {(p) => (
              <Select
                {...p}
                value={s.productId ?? ''}
                onChange={(e) => {
                  const next = byId(db.products, e.target.value);
                  update({ productId: e.target.value || null, presentationId: next?.presentations[0]?.id ?? null, lots: [], customs: { ...s.customs, ncm: next?.ncm ?? '', ncmDescription: next?.ncmDescription ?? '' } });
                }}
              >
                <option value="">Elegir…</option>
                {products.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Presentación / envase" required>
            {(p) => (
              <Select {...p} value={s.presentationId ?? ''} onChange={(e) => update({ presentationId: e.target.value, packagingDecision: null })}>
                {(product?.presentations ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Cantidad neta de la operación (t)" required error={qtyError}>
            {(p) => <Input {...p} inputMode="decimal" value={s.quantityT} onChange={(e) => update({ quantityT: e.target.value, packagingDecision: null })} />}
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-700">Lotes asignados (stock libre calculado)</p>
            <div className="flex gap-2">
              {s.lots.length > 0 && assigned !== toPlain(dec(s.quantityT || 0)) && isDecimalString(assigned) ? (
                <Button size="sm" variant="ghost" onClick={() => update({ quantityT: assigned, packagingDecision: null })}>Usar suma de lotes ({fmtTons(assigned)})</Button>
              ) : null}
              <Button size="sm" variant="secondary" disabled={!s.productId || lotOptions.length === 0} onClick={() => update({ lots: [...s.lots, { lotId: lotOptions.find((l) => !s.lots.some((x) => x.lotId === l.id))?.id ?? lotOptions[0].id, quantityT: '' }] })}>
                <Plus /> Agregar lote
              </Button>
            </div>
          </div>
          {s.lots.length === 0 ? <p className="text-xs text-slate-500">Sin lotes asignados.</p> : null}
          <div className="space-y-2">
            {s.lots.map((part, i) => {
              const lot = byId(db.lots, part.lotId);
              const free = stockOf(db, part.lotId).available;
              const over = isDecimalString(part.quantityT) && dec(part.quantityT).gt(free);
              return (
                <div key={i} className="grid grid-cols-[1fr_140px_auto] items-start gap-2">
                  <Select aria-label="Lote" value={part.lotId} onChange={(e) => update({ lots: s.lots.map((x, j) => (j === i ? { ...x, lotId: e.target.value } : x)) })}>
                    {lotOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {fmtTons(stockOf(db, l.id).available.toString(), 1)} libres · quebrado {l.quality.brokenPct ?? '—'} %
                      </option>
                    ))}
                  </Select>
                  <div>
                    <Input aria-label="Toneladas del lote" aria-invalid={over || undefined} inputMode="decimal" value={part.quantityT} onChange={(e) => update({ lots: s.lots.map((x, j) => (j === i ? { ...x, quantityT: e.target.value } : x)) })} />
                    {over ? <p className="mt-0.5 text-[11px] text-red-600">Supera las {fmtNum(free.toString(), 3)} t libres</p> : null}
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Quitar lote" onClick={() => update({ lots: s.lots.filter((_, j) => j !== i) })}><Trash2 /></Button>
                  {lot && !compact ? (
                    <p className="col-span-3 -mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      Calidad: quebrado {lot.quality.brokenPct ?? '—'} %, humedad {lot.quality.moisturePct ?? '—'} % <VerificationBadge status={lot.quality.verificationStatus} label={lot.quality.verificationStatus === 'estimated' ? 'Declarado' : undefined} />
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {packaging.needsDecision ? (
          <Alert tone="warning" title={`${fmtNum(packaging.exactPackages, 3)} envases: no resulta un número entero`}>
            <div className="mt-1 flex flex-wrap gap-2">
              {packaging.options.map((o) => (
                <Button key={o.decision} size="sm" variant="secondary" onClick={() => update({ packagingDecision: o.decision, quantityT: o.netT, lots: s.lots.length === 1 ? [{ ...s.lots[0], quantityT: o.netT }] : s.lots })}>
                  {o.decision === 'round_down' ? 'Ajustar a' : 'Subir a'} {o.packages} envases ({fmtTons(o.netT)})
                </Button>
              ))}
            </div>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Tipo de contenedor" hint="Cada equipo tiene su propia carga útil y restricción operativa">
            {(p) => (
              <Select {...p} value={s.containerTypeId ?? ''} onChange={(e) => update({ containerTypeId: e.target.value || null })}>
                <option value="">Sin contenedor</option>
                {db.containerTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Contenedores" hint={containerPlan ? `Calculados: ${containerPlan.count} (límite por ${containerPlan.limitingFactor === 'weight' ? 'peso' : containerPlan.limitingFactor === 'volume' ? 'volumen' : 'pallets'})` : 'Sin cálculo'}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                placeholder={containerPlan ? String(containerPlan.count) : '0'}
                value={s.containersOverride ?? ''}
                onChange={(e) => update({ containersOverride: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            )}
          </Field>
          <div className="text-xs text-slate-500 sm:pt-6">
            {container ? <>Límite aplicado {fmtNum(containerPlan?.effectiveLimitKg ?? container.maxPayloadKg, 0)} kg · <VerificationBadge status={container.verificationStatus} /></> : null}
          </div>
        </div>
        <KeyValue
          columns={4}
          items={[
            { label: 'Envases', value: packaging.packages ? fmtNum(packaging.packages, 0) : 'Granel' },
            { label: 'Peso bruto', value: `${fmtNum(packaging.grossKg, 1)} kg` },
            { label: 'Pallets', value: packaging.pallets || 'Carga a piso' },
            { label: 'Contenedores', value: `${containers}${s.containersOverride != null ? ' (manual)' : ''}` },
          ]}
        />
      </CardContent>
    </Card>
  );
}
