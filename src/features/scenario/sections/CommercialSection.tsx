import { Handshake, MapPin, Wand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { byId } from '@/data/derive';
import { COUNTRY_NAMES } from '@/data/selectors';
import { suggestedNamedPlace } from '@/data/services/scenarios';
import { useCurrentUser, useDb } from '@/data/store';
import { INCOTERMS, PAYMENT_METHODS, TRANSPORT_MODES, type Incoterm, type PaymentMethod, type TransportMode } from '@/domain/catalogs';
import { PRICING_MODES, type PricingMode } from '@/domain/costing';
import type { RoundingMode } from '@/domain/decimal';
import { fmtNum } from '@/domain/format';
import { INCOTERM_DEFINITIONS, NAMED_PLACE_KINDS, type NamedPlaceKind } from '@/domain/incoterms';
import type { ScenarioDraft } from '../useScenarioDraft';

export function PartiesSection({ draft }: { draft: ScenarioDraft }) {
  const db = useDb();
  const user = useCurrentUser();
  const { scenario: s, update } = draft;
  const buyers = db.organizations.filter((o) => o.kinds.includes('buyer'));
  const facilities = db.facilities.filter((f) => f.organizationId === user.organizationId);
  const facility = byId(db.facilities, s.originFacilityId);
  const request = byId(db.requests, s.requestId);
  const destPorts = db.ports.filter((p) => p.kind !== 'origin' && (!s.destinationCountry || p.country === s.destinationCountry));
  return (
    <Card>
      <CardHeader title="Comprador, origen y destino" description={request ? `Vinculado a la solicitud ${request.code}` : 'Sin solicitud vinculada'} icon={<MapPin />} />
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Empresa compradora" required>
          {(p) => (
            <Select {...p} value={s.buyerOrganizationId ?? ''} onChange={(e) => update({ buyerOrganizationId: e.target.value || null })}>
              <option value="">Elegir…</option>
              {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Planta o depósito de origen">
          {(p) => (
            <Select {...p} value={s.originFacilityId ?? ''} onChange={(e) => {
              const f = byId(db.facilities, e.target.value);
              update({ originFacilityId: e.target.value || null, exitPortId: f?.exitPortId ?? s.exitPortId });
            }}>
              <option value="">Elegir…</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.city})</option>)}
            </Select>
          )}
        </Field>
        <Field label="Puerto de salida" hint={facility?.distanceToPortKm ? `Distancia planta → puerto: ${fmtNum(facility.distanceToPortKm)} km (manual)` : undefined}>
          {(p) => (
            <Select {...p} value={s.exitPortId ?? ''} onChange={(e) => update({ exitPortId: e.target.value || null })}>
              <option value="">Elegir…</option>
              {db.ports.filter((x) => x.kind !== 'destination').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="País de destino" required>
          {(p) => (
            <Select {...p} value={s.destinationCountry ?? ''} onChange={(e) => update({ destinationCountry: e.target.value || null, destinationPortId: null })}>
              <option value="">Elegir…</option>
              {Object.entries(COUNTRY_NAMES).filter(([k]) => k !== '*' && k !== 'AR').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Puerto de destino">
          {(p) => (
            <Select {...p} value={s.destinationPortId ?? ''} onChange={(e) => update({ destinationPortId: e.target.value || null })}>
              <option value="">Sin definir</option>
              {destPorts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Ciudad de destino">
          {(p) => <Input {...p} value={s.destinationCity ?? ''} onChange={(e) => update({ destinationCity: e.target.value })} />}
        </Field>
      </CardContent>
    </Card>
  );
}

export function CommercialSection({ draft }: { draft: ScenarioDraft }) {
  const db = useDb();
  const { scenario: s, update } = draft;
  const c = s.commercial;
  const def = INCOTERM_DEFINITIONS[c.incoterm];
  const setCommercial = (patch: Partial<typeof c>) => update({ commercial: { ...c, ...patch } });
  const suggest = (incoterm: Incoterm) =>
    suggestedNamedPlace(db, incoterm, {
      facilityId: s.originFacilityId,
      exitPortId: s.exitPortId,
      destinationPortId: s.destinationPortId,
      destinationCity: s.destinationCity,
    });

  return (
    <Card>
      <CardHeader title="Condiciones comerciales" description="Cambiar el Incoterm conserva los importes cargados y recalcula quién paga cada concepto" icon={<Handshake />} />
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Incoterm (2020)" required>
            {(p) => (
              <Select
                {...p}
                value={c.incoterm}
                onChange={(e) => {
                  const incoterm = e.target.value as Incoterm;
                  const place = suggest(incoterm);
                  const keepPlace = INCOTERM_DEFINITIONS[incoterm].placeKinds.includes(c.namedPlaceKind);
                  setCommercial({ incoterm, namedPlaceKind: keepPlace ? c.namedPlaceKind : place.namedPlaceKind, namedPlace: keepPlace ? c.namedPlace : place.namedPlace });
                }}
              >
                {INCOTERMS.map((i) => <option key={i} value={i}>{i} — {INCOTERM_DEFINITIONS[i].name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Tipo de lugar convenido">
            {(p) => (
              <Select {...p} value={c.namedPlaceKind} onChange={(e) => setCommercial({ namedPlaceKind: e.target.value as NamedPlaceKind })}>
                {def.placeKinds.map((k) => <option key={k} value={k}>{NAMED_PLACE_KINDS[k]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Lugar convenido" required error={!c.namedPlace.trim() ? 'Requerido: sin lugar no se puede cotizar' : undefined}>
            {(p) => (
              <div className="flex gap-1">
                <Input {...p} value={c.namedPlace} onChange={(e) => setCommercial({ namedPlace: e.target.value })} />
                <Button size="icon" variant="secondary" aria-label="Sugerir lugar" onClick={() => setCommercial(suggest(c.incoterm))}><Wand /></Button>
              </div>
            )}
          </Field>
        </div>
        <Alert tone="info" title={`${c.incoterm}: ${def.name}`}>{def.delivery}</Alert>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Modo de transporte">
            {(p) => <Select {...p} value={c.transportMode} onChange={(e) => setCommercial({ transportMode: e.target.value as TransportMode })}>{Object.entries(TRANSPORT_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
          </Field>
          <Field label="Moneda de cotización">
            {(p) => <Select {...p} value={c.currency} onChange={(e) => setCommercial({ currency: e.target.value as typeof c.currency })}>{['USD', 'EUR'].map((x) => <option key={x}>{x}</option>)}</Select>}
          </Field>
          <Field label="Fecha de embarque">
            {(p) => <Input {...p} type="date" value={c.shipmentDate ?? ''} onChange={(e) => setCommercial({ shipmentDate: e.target.value || null })} />}
          </Field>
          <Field label="Vigencia de la cotización (días)">
            {(p) => <Input {...p} inputMode="numeric" value={c.validityDays} onChange={(e) => setCommercial({ validityDays: Math.max(1, Number(e.target.value) || 1) })} />}
          </Field>
          <Field label="Forma de pago" className="sm:col-span-2">
            {(p) => <Select {...p} value={s.finance.paymentMethod} onChange={(e) => update({ finance: { ...s.finance, paymentMethod: e.target.value as PaymentMethod } })}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
          </Field>
          <Field label="Condición de pago (texto contractual)" className="sm:col-span-2">
            {(p) => <Textarea {...p} className="min-h-[38px]" value={c.paymentTerms} onChange={(e) => setCommercial({ paymentTerms: e.target.value })} />}
          </Field>
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Precio</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Criterio de precio" hint="Margen sobre venta y recargo sobre costo son magnitudes distintas">
              {(p) => (
                <Select {...p} value={s.pricing.mode} onChange={(e) => update({ pricing: { ...s.pricing, mode: e.target.value as PricingMode } })}>
                  {Object.entries(PRICING_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </Field>
            {s.pricing.mode === 'margin_on_sale' ? (
              <Field label="Margen objetivo (% sobre venta)">
                {(p) => <Input {...p} inputMode="decimal" value={s.pricing.marginPct ?? ''} onChange={(e) => update({ pricing: { ...s.pricing, marginPct: e.target.value } })} />}
              </Field>
            ) : s.pricing.mode === 'markup_on_cost' ? (
              <Field label="Recargo (% sobre costo)">
                {(p) => <Input {...p} inputMode="decimal" value={s.pricing.markupPct ?? ''} onChange={(e) => update({ pricing: { ...s.pricing, markupPct: e.target.value } })} />}
              </Field>
            ) : (
              <Field label={`Precio negociado (${c.currency}/t)`}>
                {(p) => <Input {...p} inputMode="decimal" value={s.pricing.pricePerT ?? ''} onChange={(e) => update({ pricing: { ...s.pricing, pricePerT: e.target.value } })} />}
              </Field>
            )}
            <Field label="Redondeo del precio">
              {(p) => (
                <Select {...p} value={`${s.rounding.target}:${s.rounding.decimals}:${s.rounding.mode}`} onChange={(e) => {
                  const [target, decimals, mode] = e.target.value.split(':');
                  update({ rounding: { target: target as 'per_ton' | 'total', decimals: Number(decimals), mode: mode as RoundingMode } });
                }}>
                  <option value="per_ton:2:half_up">Por tonelada, 2 decimales</option>
                  <option value="per_ton:0:up">Por tonelada, entero hacia arriba</option>
                  <option value="per_ton:0:half_up">Por tonelada, entero</option>
                  <option value="total:2:half_up">Sobre el total, 2 decimales</option>
                </Select>
              )}
            </Field>
            <Field label="Nota de comisión / intermediario">
              {(p) => <Input {...p} value={c.commissionNote ?? ''} onChange={(e) => setCommercial({ commissionNote: e.target.value })} placeholder="Base: valor de venta FOB" />}
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
