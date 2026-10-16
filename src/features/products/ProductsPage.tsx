import { Copy, Factory, Package, Pencil, Plus, Power, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { can } from '@/data/access';
import { byId, presentationOf, stockOf } from '@/data/derive';
import type { Facility, Lot, Product } from '@/data/model';
import { portName, presentationLabel } from '@/data/selectors';
import { duplicateProduct, setLotStatus, setProductStatus } from '@/data/services/catalog';
import { useApp, useCurrentUser, useDb } from '@/data/store';
import { PROCESSING, RICE_TYPES } from '@/domain/catalogs';
import { fmtDate, fmtNum, fmtTons } from '@/domain/format';
import { FacilityFormDialog, LotFormDialog, ProductFormDialog } from './forms';

export default function ProductsPage() {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'productos';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [typeFilter, setTypeFilter] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | 'new' | null>(null);
  const [editingLot, setEditingLot] = useState<Lot | 'new' | null>(null);
  const [editingFacility, setEditingFacility] = useState<Facility | 'new' | null>(null);

  const products = db.products
    .filter((p) => p.organizationId === user.organizationId)
    .filter((p) => statusFilter === 'all' || p.status === statusFilter)
    .filter((p) => !typeFilter || p.commercialType === typeFilter)
    .filter((p) => !query || `${p.code} ${p.name} ${p.variety ?? ''} ${p.ncm ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const lots = db.lots
    .filter((l) => l.organizationId === user.organizationId)
    .filter((l) => statusFilter === 'all' || l.status === statusFilter)
    .filter((l) => !query || l.code.toLowerCase().includes(query.toLowerCase()) || byId(db.products, l.productId)?.name.toLowerCase().includes(query.toLowerCase()));
  const facilities = db.facilities.filter((f) => f.organizationId === user.organizationId);
  const canProduct = can(user, 'product.manage');
  const canLot = can(user, 'lot.manage');

  return (
    <div>
      <PageHeader
        title="Mis productos"
        description="Fichas técnicas, presentaciones, lotes con su calidad y stock, y establecimientos de origen."
        actions={
          <>
            {canProduct && tab === 'productos' ? <Button onClick={() => setEditingProduct('new')}><Plus /> Nuevo producto</Button> : null}
            {canLot && tab === 'lotes' ? <Button onClick={() => setEditingLot('new')}><Plus /> Nuevo lote</Button> : null}
            {tab === 'establecimientos' && can(user, 'facility.manage') ? <Button onClick={() => setEditingFacility('new')}><Plus /> Nuevo establecimiento</Button> : null}
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="productos"><Package /> Productos</TabsTrigger>
          <TabsTrigger value="lotes">Lotes</TabsTrigger>
          <TabsTrigger value="establecimientos"><Factory /> Establecimientos</TabsTrigger>
        </TabsList>

        {tab !== 'establecimientos' ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <Input aria-label="Buscar" className="pl-8" placeholder="Buscar por código, nombre, NCM…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select aria-label="Estado" className="w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="active">Disponibles</option>
              <option value="inactive">Inactivos</option>
              <option value="all">Todos</option>
            </Select>
            {tab === 'productos' ? (
              <Select aria-label="Tipo comercial" className="w-48" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Todos los tipos</option>
                {Object.entries(RICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            ) : null}
          </div>
        ) : null}

        <TabsContent value="productos">
          {products.length === 0 ? (
            <EmptyState icon={Package} title="Sin productos" description="Registrar la ficha técnica y sus presentaciones." action={canProduct ? <Button onClick={() => setEditingProduct('new')}><Plus /> Nuevo producto</Button> : undefined} />
          ) : (
            <Card>
              <Table>
                <THead><TR><TH>Código</TH><TH>Producto</TH><TH>Tipo / elaboración</TH><TH>NCM</TH><TH>Presentaciones</TH><TH>Lotes</TH><TH>Estado</TH><TH /></TR></THead>
                <TBody>
                  {products.map((p) => {
                    const productLots = db.lots.filter((l) => l.productId === p.id && l.status === 'active');
                    const free = productLots.reduce((acc, l) => acc + Number(stockOf(db, l.id).available.toFixed(3)), 0);
                    return (
                      <TR key={p.id}>
                        <TD className="mono">{p.code}</TD>
                        <TD>
                          <Link to={`/productos/${p.id}`} className="font-medium text-petrol-700 hover:underline">{p.name}</Link>
                          {p.variety ? <p className="text-[11px] text-slate-500">Variedad: {p.variety}</p> : null}
                        </TD>
                        <TD className="text-xs">{RICE_TYPES[p.commercialType]}<br />{PROCESSING[p.processing]}</TD>
                        <TD><span className="mono">{p.ncm ?? '—'}</span><div className="mt-1"><VerificationBadge status={p.ncmStatus} /></div></TD>
                        <TD className="text-xs">{p.presentations.map((x) => x.label).join(', ')}</TD>
                        <TD className="text-xs">{productLots.length} activos<br /><span className="num">{fmtNum(free, 1)} t libres</span></TD>
                        <TD>{p.status === 'active' ? <Badge tone="success">Disponible</Badge> : <Badge tone="outline">Inactivo</Badge>}</TD>
                        <TD>
                          {canProduct ? (
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditingProduct(p)}><Pencil /></Button>
                              <Button size="icon" variant="ghost" aria-label={`Duplicar ${p.name}`} onClick={() => run((d, ctx) => duplicateProduct(d, ctx, p.id), 'Producto duplicado')}><Copy /></Button>
                              <Button size="icon" variant="ghost" aria-label={p.status === 'active' ? 'Inactivar' : 'Activar'} onClick={() => run((d, ctx) => setProductStatus(d, ctx, p.id, p.status === 'active' ? 'inactive' : 'active'), p.status === 'active' ? 'Producto inactivado' : 'Producto activado')}><Power /></Button>
                            </div>
                          ) : null}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="lotes">
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Lote</TH><TH>Producto</TH><TH>Calidad</TH><TH className="text-right">Físico</TH><TH className="text-right">Reservado</TH><TH className="text-right">Comprometido</TH><TH className="text-right">Libre</TH><TH>Disponible desde</TH><TH>Publicación</TH><TH />
                </TR>
              </THead>
              <TBody>
                {lots.map((l) => {
                  const product = byId(db.products, l.productId);
                  const stock = stockOf(db, l.id);
                  return (
                    <TR key={l.id}>
                      <TD><Link to={`/productos/${l.productId}?lote=${l.id}`} className="mono font-medium text-petrol-700 hover:underline">{l.code}</Link><p className="text-[11px] text-slate-500">{byId(db.facilities, l.facilityId)?.name}</p></TD>
                      <TD className="text-xs">{product?.name}<br />{presentationLabel(presentationOf(product, l.presentationId))}</TD>
                      <TD className="text-xs">Quebrado {l.quality.brokenPct ?? '—'} % · Humedad {l.quality.moisturePct ?? '—'} %<div className="mt-1"><VerificationBadge status={l.quality.verificationStatus} label={l.quality.verificationStatus === 'estimated' ? 'Declarado' : undefined} /></div></TD>
                      <TD className="num text-right">{fmtTons(stock.physical.toString(), 1)}</TD>
                      <TD className="num text-right">{fmtTons(stock.reserved.toString(), 1)}</TD>
                      <TD className="num text-right">{fmtTons(stock.committed.toString(), 1)}</TD>
                      <TD className="num text-right font-semibold">{fmtTons(stock.available.toString(), 1)}</TD>
                      <TD className="text-xs">{fmtDate(l.availableFrom)}</TD>
                      <TD>{l.status === 'inactive' ? <Badge tone="outline">Inactivo</Badge> : l.published ? <Badge tone="success">Publicado</Badge> : <Badge>Privado</Badge>}</TD>
                      <TD>
                        {canLot ? (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" aria-label={`Editar ${l.code}`} onClick={() => setEditingLot(l)}><Pencil /></Button>
                            <Button size="icon" variant="ghost" aria-label={l.status === 'active' ? 'Inactivar lote' : 'Activar lote'} onClick={() => run((d, ctx) => setLotStatus(d, ctx, l.id, l.status === 'active' ? 'inactive' : 'active'), 'Estado del lote actualizado')}><Power /></Button>
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {lots.length === 0 ? <p className="p-4 text-sm text-slate-500">Sin lotes con los filtros elegidos.</p> : null}
          </Card>
        </TabsContent>

        <TabsContent value="establecimientos">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {facilities.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{f.name}</p>
                    <p className="text-xs text-slate-500">{f.city}, {f.province} ({f.country}) · {f.address}</p>
                  </div>
                  {can(user, 'facility.manage') ? <Button size="sm" variant="secondary" onClick={() => setEditingFacility(f)}><Pencil /> Editar</Button> : null}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-slate-500">Punto de salida</dt><dd>{portName(db, f.exitPortId)}</dd></div>
                  <div><dt className="text-slate-500">Distancia</dt><dd>{f.distanceToPortKm ? `${fmtNum(f.distanceToPortKm)} km (${f.distanceSource === 'service' ? 'servicio geográfico' : 'ingreso manual'})` : 'Sin dato'}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Condiciones de carga</dt><dd>{f.loadingConditions || '—'}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Lotes asociados</dt><dd>{db.lots.filter((l) => l.facilityId === f.id).map((l) => l.code).join(', ') || '—'}</dd></div>
                </dl>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {editingProduct ? <ProductFormDialog key={editingProduct === 'new' ? 'new' : editingProduct.id} product={editingProduct === 'new' ? undefined : editingProduct} open onOpenChange={(v) => !v && setEditingProduct(null)} /> : null}
      {editingLot ? <LotFormDialog key={editingLot === 'new' ? 'new' : editingLot.id} lot={editingLot === 'new' ? undefined : editingLot} open onOpenChange={(v) => !v && setEditingLot(null)} /> : null}
      {editingFacility ? <FacilityFormDialog key={editingFacility === 'new' ? 'new' : editingFacility.id} facility={editingFacility === 'new' ? undefined : editingFacility} open onOpenChange={(v) => !v && setEditingFacility(null)} /> : null}
    </div>
  );
}
