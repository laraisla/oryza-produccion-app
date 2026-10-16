import { ArrowLeft, Boxes, Calculator, History, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, EmptyState, KeyValue, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import { byId, presentationOf, stockOf } from '@/data/derive';
import type { Lot } from '@/data/model';
import { presentationLabel, userName } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { PACKAGING_TYPES, PROCESSING, PRODUCT_CATEGORIES, RICE_TYPES } from '@/domain/catalogs';
import { dec, isDecimalString, toPlain } from '@/domain/decimal';
import { fmtDate, fmtDateTime, fmtNum, fmtTons } from '@/domain/format';
import { checkAvailability, computePackaging, containersRequired, type PackagingDecision } from '@/domain/quantity';
import { toTons, type MassUnit } from '@/domain/units';
import { LotFormDialog, ProductFormDialog } from './forms';

const MOVEMENT_LABEL: Record<string, string> = {
  reservation: 'Reserva',
  release: 'Liberación',
  commitment: 'Compromiso',
  shipment: 'Embarque',
  adjustment: 'Ajuste',
};

function QuantityCalculator({ lot }: { lot: Lot }) {
  const db = useDb();
  const product = byId(db.products, lot.productId);
  const presentation = presentationOf(product, lot.presentationId);
  const [value, setValue] = useState('40');
  const [unit, setUnit] = useState<MassUnit>('t');
  const [decision, setDecision] = useState<PackagingDecision | ''>('');
  const valid = isDecimalString(value) && dec(value).gt(0);
  const tons = valid ? toPlain(toTons(value, unit)) : '0';
  const packaging = useMemo(
    () =>
      computePackaging(tons, {
        type: presentation?.packaging ?? 'bulk',
        netWeightKg: presentation?.netWeightKg,
        tareWeightKg: presentation?.tareWeightKg,
        unitsPerPallet: presentation?.unitsPerPallet,
        palletTareKg: presentation?.palletTareKg,
        packageVolumeM3: presentation?.packageVolumeM3,
      }, decision || undefined),
    [tons, presentation, decision],
  );
  const stock = stockOf(db, lot.id);
  const availability = checkAvailability(packaging.netT, toPlain(stock.available));
  return (
    <Card>
      <CardHeader title="Cantidad y unidades logísticas" description={`Lote ${lot.code} · ${presentationLabel(presentation)}`} icon={<Calculator />} />
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Cantidad neta" error={!valid ? 'Ingresar un número mayor a cero' : undefined}>
            {(p) => <Input {...p} inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setDecision(''); }} />}
          </Field>
          <Field label="Unidad">
            {(p) => <Select {...p} value={unit} onChange={(e) => { setUnit(e.target.value as MassUnit); setDecision(''); }}><option value="t">Toneladas</option><option value="kg">Kilogramos</option></Select>}
          </Field>
        </div>
        {valid && !packaging.isWhole ? (
          <Alert tone="warning" title={`${fmtNum(packaging.exactPackages, 3)} envases: no es un número entero`}>
            <p>Elegir cómo ajustar la cantidad antes de cotizar:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {packaging.options.map((o) => (
                <Button key={o.decision} size="sm" variant={decision === o.decision ? 'primary' : 'secondary'} onClick={() => setDecision(o.decision)}>
                  {o.decision === 'round_down' ? 'Bajar' : 'Subir'} a {o.packages} envases ({fmtTons(o.netT)})
                </Button>
              ))}
            </div>
          </Alert>
        ) : null}
        <KeyValue
          columns={4}
          items={[
            { label: 'Neto efectivo', value: `${fmtTons(packaging.netT)} (${fmtNum(packaging.netKg, 1)} kg)` },
            { label: 'Envases', value: packaging.packages ? fmtNum(packaging.packages, 0) : 'Granel' },
            { label: 'Pallets', value: packaging.pallets || 'Carga a piso' },
            { label: 'Peso bruto', value: `${fmtNum(packaging.grossKg, 1)} kg` },
          ]}
        />
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Contenedores requeridos por tipo (peso bruto, volumen y pallets)</p>
          <Table>
            <THead><TR><TH>Equipo</TH><TH>Límite aplicado</TH><TH className="text-right">Por peso</TH><TH className="text-right">Por volumen</TH><TH className="text-right">Total</TH><TH>Estado del dato</TH></TR></THead>
            <TBody>
              {db.containerTypes.map((c) => {
                const plan = containersRequired(packaging.grossKg, packaging.volumeM3, packaging.pallets, c);
                return (
                  <TR key={c.id}>
                    <TD>{c.name}</TD>
                    <TD className="num text-xs">{fmtNum(plan.effectiveLimitKg, 0)} kg{c.operationalLimitKg ? ' (límite operativo)' : ''}</TD>
                    <TD className="num text-right">{plan.byWeight}</TD>
                    <TD className="num text-right">{plan.byVolume ?? '—'}</TD>
                    <TD className="num text-right font-semibold">{plan.count}</TD>
                    <TD><VerificationBadge status={c.verificationStatus} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
        {valid ? (
          availability.sufficient ? (
            <Alert tone="success">Stock libre suficiente: {fmtTons(availability.availableT)} disponibles para {fmtTons(availability.requestedT)}.</Alert>
          ) : (
            <Alert tone="warning" title="La demanda supera la oferta del lote">
              Faltan {fmtTons(availability.shortfallT)}. Puede evaluarse consolidar con lotes compatibles desde Matching (sin reservar stock automáticamente).
            </Alert>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ProductDetailPage() {
  const { productId } = useParams();
  const [params, setParams] = useSearchParams();
  const db = useDb();
  const user = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [editingLot, setEditingLot] = useState<Lot | 'new' | null>(null);
  const product = byId(db.products, productId);
  if (!product || product.organizationId !== user.organizationId) {
    return <EmptyState icon={Boxes} title="Producto no disponible" description="No existe o pertenece a otra organización." action={<Button asChild variant="secondary"><Link to="/productos">Volver</Link></Button>} />;
  }
  const lots = db.lots.filter((l) => l.productId === product.id);
  const selectedLot = byId(db.lots, params.get('lote')) ?? lots.find((l) => l.status === 'active');
  const movements = selectedLot ? db.inventoryMovements.filter((m) => m.lotId === selectedLot.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={product.name}
        badge={<Badge tone="petrol">{product.code}</Badge>}
        description={`${RICE_TYPES[product.commercialType]} · ${PROCESSING[product.processing]}${product.variety ? ` · ${product.variety}` : ''}`}
        actions={
          <>
            <Button asChild variant="ghost"><Link to="/productos"><ArrowLeft /> Productos</Link></Button>
            {can(user, 'product.manage') ? <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Editar ficha</Button> : null}
            {can(user, 'lot.manage') ? <Button onClick={() => setEditingLot('new')}><Plus /> Nuevo lote</Button> : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Ficha técnica" />
          <CardContent>
            <KeyValue
              columns={3}
              items={[
                { label: 'Categoría', value: PRODUCT_CATEGORIES[product.category] },
                { label: 'Tipo comercial', value: RICE_TYPES[product.commercialType] },
                { label: 'Grado de elaboración', value: PROCESSING[product.processing] },
                { label: 'Variedad', value: product.variety || 'No informada' },
                { label: 'NCM', value: <span className="flex flex-wrap items-center gap-2"><span className="mono">{product.ncm ?? '—'}</span><VerificationBadge status={product.ncmStatus} /></span> },
                { label: 'Fuente NCM', value: product.ncmSource || '—' },
                { label: 'Descripción arancelaria', value: product.ncmDescription || '—' },
                { label: 'Estado', value: product.status === 'active' ? 'Disponible' : 'Inactivo' },
                { label: 'Reenvasado declarado', value: product.convertibleTo.map((c) => `${PACKAGING_TYPES[c.type]} ${c.netWeightKg ?? ''} kg`).join(', ') || 'Ninguno' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Presentaciones" />
          <Table>
            <THead><TR><TH>Presentación</TH><TH className="text-right">Neto</TH><TH className="text-right">Tara</TH></TR></THead>
            <TBody>
              {product.presentations.map((p) => (
                <TR key={p.id}><TD>{p.label}</TD><TD className="num text-right">{p.netWeightKg ? `${fmtNum(p.netWeightKg)} kg` : '—'}</TD><TD className="num text-right">{p.tareWeightKg ? `${fmtNum(p.tareWeightKg, 3)} kg` : '—'}</TD></TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader title="Lotes de este producto" description="Seleccionar un lote para ver movimientos y calcular unidades logísticas" />
        <Table>
          <THead><TR><TH>Lote</TH><TH>Calidad</TH><TH>Análisis</TH><TH className="text-right">Físico</TH><TH className="text-right">Comprometido</TH><TH className="text-right">Libre</TH><TH>Disponible</TH><TH /></TR></THead>
          <TBody>
            {lots.map((l) => {
              const stock = stockOf(db, l.id);
              return (
                <TR key={l.id} className={selectedLot?.id === l.id ? 'bg-petrol-50/60' : undefined}>
                  <TD><button type="button" className="mono font-medium text-petrol-700 hover:underline" onClick={() => setParams({ lote: l.id })}>{l.code}</button></TD>
                  <TD className="text-xs">Quebrado {l.quality.brokenPct ?? '—'} % · Humedad {l.quality.moisturePct ?? '—'} % · Impurezas {l.quality.impuritiesPct ?? '—'} %</TD>
                  <TD className="text-xs">{fmtDate(l.quality.analysisDate)} · {l.quality.analyst ?? '—'}<div className="mt-1"><VerificationBadge status={l.quality.verificationStatus} label={l.quality.verificationStatus === 'estimated' ? 'Declarado' : undefined} /></div></TD>
                  <TD className="num text-right">{fmtTons(stock.physical.toString(), 1)}</TD>
                  <TD className="num text-right">{fmtTons(stock.committed.toString(), 1)}</TD>
                  <TD className="num text-right font-semibold">{fmtTons(stock.available.toString(), 1)}</TD>
                  <TD className="text-xs">{fmtDate(l.availableFrom)}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost"><Link to={`/trazabilidad?lote=${l.id}`}><History /> Historial</Link></Button>
                      {can(user, 'lot.manage') ? <Button size="sm" variant="secondary" onClick={() => setEditingLot(l)}><Pencil /> Editar</Button> : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {selectedLot ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <QuantityCalculator key={selectedLot.id} lot={selectedLot} />
          <Card>
            <CardHeader title={`Movimientos de inventario · ${selectedLot.code}`} description="Reservas, compromisos y embarques: el stock libre nunca se edita a mano" />
            {movements.length === 0 ? (
              <CardContent><p className="text-sm text-slate-500">Sin movimientos: todo el stock físico está libre.</p></CardContent>
            ) : (
              <Table>
                <THead><TR><TH>Fecha</TH><TH>Movimiento</TH><TH className="text-right">Toneladas</TH><TH>Referencia</TH></TR></THead>
                <TBody>
                  {movements.map((m) => (
                    <TR key={m.id}>
                      <TD className="text-xs">{fmtDateTime(m.createdAt)}<br /><span className="text-slate-500">{userName(db, m.createdBy)}</span></TD>
                      <TD>{MOVEMENT_LABEL[m.type]}</TD>
                      <TD className="num text-right">{fmtNum(m.quantityT, 3)}</TD>
                      <TD className="text-xs">{m.note ?? '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {editing ? <ProductFormDialog product={product} open onOpenChange={setEditing} /> : null}
      {editingLot ? <LotFormDialog key={editingLot === 'new' ? 'new' : editingLot.id} lot={editingLot === 'new' ? undefined : editingLot} productId={product.id} open onOpenChange={(v) => !v && setEditingLot(null)} /> : null}
    </div>
  );
}
