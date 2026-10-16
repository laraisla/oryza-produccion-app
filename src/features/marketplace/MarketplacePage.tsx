import { ClipboardList, Search, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RequestStatusBadge, VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { can } from '@/data/access';
import { byId, presentationOf, stockOf } from '@/data/derive';
import { countryName, orgName, presentationLabel, visibleLots, visibleRequests } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { PROCESSING, RICE_TYPES } from '@/domain/catalogs';
import { dec, isDecimalString } from '@/domain/decimal';
import { fmtDate, fmtNum, fmtTons } from '@/domain/format';

export default function MarketplacePage() {
  const db = useDb();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const [processing, setProcessing] = useState('');
  const [maxBroken, setMaxBroken] = useState('');
  const [minQty, setMinQty] = useState('');
  const [query, setQuery] = useState('');
  const lots = visibleLots(db, user)
    .filter((l) => l.published && l.status === 'active')
    .map((l) => ({ lot: l, product: byId(db.products, l.productId)!, stock: stockOf(db, l.id) }))
    .filter(({ stock }) => stock.available.gt(0))
    .filter(({ product }) => !type || product.commercialType === type)
    .filter(({ product }) => !processing || product.processing === processing)
    .filter(({ lot }) => !isDecimalString(maxBroken) || (lot.quality.brokenPct !== null && dec(lot.quality.brokenPct).lte(dec(maxBroken))))
    .filter(({ stock }) => !isDecimalString(minQty) || stock.available.gte(dec(minQty)))
    .filter(({ lot, product }) => !query || `${lot.code} ${product.name} ${orgName(db, lot.organizationId)}`.toLowerCase().includes(query.toLowerCase()));
  const requests = visibleRequests(db, user).filter((r) => r.status === 'published' || r.status === 'negotiating');

  return (
    <div className="space-y-4">
      <PageHeader title="Marketplace" description="Oferta publicada por productores y molinos, y demanda publicada por compradores. Se comparten especificaciones y stock libre; nunca costos ni datos financieros." />
      <Tabs defaultValue="oferta">
        <TabsList>
          <TabsTrigger value="oferta"><Store /> Oferta publicada</TabsTrigger>
          <TabsTrigger value="demanda"><ClipboardList /> Demanda publicada</TabsTrigger>
        </TabsList>
        <TabsContent value="oferta" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" /><Input aria-label="Buscar" className="pl-8" placeholder="Lote, producto o empresa…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <Select aria-label="Tipo comercial" className="w-44" value={type} onChange={(e) => setType(e.target.value)}><option value="">Todo tipo</option>{Object.entries(RICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select aria-label="Elaboración" className="w-44" value={processing} onChange={(e) => setProcessing(e.target.value)}><option value="">Toda elaboración</option>{Object.entries(PROCESSING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Input aria-label="Quebrado máximo" className="w-36" placeholder="Quebrado ≤ %" inputMode="decimal" value={maxBroken} onChange={(e) => setMaxBroken(e.target.value)} />
            <Input aria-label="Stock mínimo" className="w-36" placeholder="Stock ≥ t" inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
          </div>
          {lots.length === 0 ? <EmptyState icon={Store} title="Sin lotes con esos filtros" /> : (
            <Card>
              <Table>
                <THead><TR><TH>Lote</TH><TH>Oferente</TH><TH>Producto</TH><TH>Calidad</TH><TH className="text-right">Stock libre</TH><TH>Presentación</TH><TH>Origen</TH><TH>Disponible</TH><TH /></TR></THead>
                <TBody>
                  {lots.map(({ lot, product, stock }) => {
                    const facility = byId(db.facilities, lot.facilityId);
                    const own = lot.organizationId === user.organizationId;
                    return (
                      <TR key={lot.id}>
                        <TD className="mono font-medium">{lot.code}{own ? <div><Badge tone="petrol">Propio</Badge></div> : null}</TD>
                        <TD className="text-xs">{orgName(db, lot.organizationId)}</TD>
                        <TD className="text-xs">{RICE_TYPES[product.commercialType]}<br />{PROCESSING[product.processing]}</TD>
                        <TD className="text-xs">Quebrado {fmtNum(lot.quality.brokenPct)} % · humedad {fmtNum(lot.quality.moisturePct)} %<div className="mt-1"><VerificationBadge status={lot.quality.verificationStatus} label={lot.quality.verificationStatus === 'estimated' ? 'Declarado' : undefined} /></div></TD>
                        <TD className="num text-right font-medium">{fmtTons(stock.available.toString(), 1)}</TD>
                        <TD className="text-xs">{presentationLabel(presentationOf(product, lot.presentationId))}</TD>
                        <TD className="text-xs">{facility?.city}, {facility?.province}</TD>
                        <TD className="text-xs">{fmtDate(lot.availableFrom)}</TD>
                        <TD className="text-right">{can(user, 'request.manage') && !own ? <Button size="sm" variant="secondary" onClick={() => navigate(`/solicitudes?nueva=1&lote=${lot.id}`)}>Solicitar cotización</Button> : null}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="demanda">
          <Card>
            <Table>
              <THead><TR><TH>Solicitud</TH><TH>Comprador</TH><TH>Pedido</TH><TH>Destino</TH><TH>Estado</TH><TH /></TR></THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id}>
                    <TD><Link className="mono font-medium text-petrol-700 hover:underline" to={`/solicitudes/${r.id}`}>{r.code}</Link></TD>
                    <TD className="text-xs">{orgName(db, r.buyerOrganizationId)}</TD>
                    <TD className="text-xs">{RICE_TYPES[r.commercialType]} {PROCESSING[r.processing].toLowerCase()} · {fmtTons(r.quantityT, 0)} · quebrado ≤ {fmtNum(r.maxBrokenPct)} %</TD>
                    <TD className="text-xs">{countryName(r.destinationCountry)}</TD>
                    <TD><RequestStatusBadge status={r.status} /></TD>
                    <TD className="text-right"><Button asChild size="sm" variant="secondary"><Link to={`/matching?request=${r.id}`}>Ver matching</Link></Button></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
