import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import type { Facility, Lot, Product } from '@/data/model';
import { facilitySchema, fieldErrors, lotSchema, productSchema, type FacilityInput, type LotInput, type ProductInput } from '@/data/schemas';
import { createFacility, createLot, createProduct, updateFacility, updateLot, updateProduct } from '@/data/services/catalog';
import { useApp, useCurrentUser, useDb } from '@/data/store';
import {
  PACKAGING_TYPES,
  PROCESSING,
  PRODUCT_CATEGORIES,
  RICE_TYPES,
  VERIFICATION_STATUS,
  type PackagingType,
  type VerificationStatus,
} from '@/domain/catalogs';
import { COUNTRY_NAMES } from '@/data/selectors';

const CONVERTIBLE_OPTIONS: { type: PackagingType; netWeightKg: string; label: string }[] = [
  { type: 'bag', netWeightKg: '1', label: 'Bolsa 1 kg' },
  { type: 'bag', netWeightKg: '5', label: 'Bolsa 5 kg' },
  { type: 'bag', netWeightKg: '25', label: 'Bolsa 25 kg' },
  { type: 'bag', netWeightKg: '50', label: 'Bolsa 50 kg' },
  { type: 'big_bag', netWeightKg: '1000', label: 'Big bag 1.000 kg' },
];

function emptyProduct(): ProductInput {
  return {
    name: '',
    category: 'rice',
    commercialType: 'long_fine',
    variety: '',
    processing: 'white',
    ncm: '1006.30',
    ncmDescription: '',
    ncmStatus: 'pending',
    ncmSource: 'ARCA — Arancel Integrado: subposición pendiente',
    description: '',
    presentations: [{ label: 'Bolsa 25 kg', packaging: 'bag', netWeightKg: '25', tareWeightKg: '0.12', unitsPerPallet: null, palletTareKg: '' }],
    convertibleTo: [],
  };
}

function toProductInput(p: Product): ProductInput {
  return {
    name: p.name,
    category: p.category,
    commercialType: p.commercialType,
    variety: p.variety ?? '',
    processing: p.processing,
    ncm: p.ncm ?? '',
    ncmDescription: p.ncmDescription ?? '',
    ncmStatus: p.ncmStatus,
    ncmSource: p.ncmSource ?? '',
    description: p.description ?? '',
    presentations: p.presentations.map((x) => ({
      id: x.id,
      label: x.label,
      packaging: x.packaging,
      netWeightKg: x.netWeightKg ?? '',
      tareWeightKg: x.tareWeightKg ?? '',
      unitsPerPallet: x.unitsPerPallet ?? null,
      palletTareKg: x.palletTareKg ?? '',
    })),
    convertibleTo: p.convertibleTo.map((c) => ({ type: c.type, netWeightKg: c.netWeightKg ?? null })),
  };
}

export function ProductFormDialog({ product, open, onOpenChange }: { product?: Product; open: boolean; onOpenChange: (v: boolean) => void }) {
  const run = useApp((s) => s.run);
  const [form, setForm] = useState<ProductInput>(() => (product ? toProductInput(product) : emptyProduct()));
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => (touched ? fieldErrors(productSchema, form) : {}), [form, touched]);
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const presentations = form.presentations ?? [];

  const submit = () => {
    setTouched(true);
    if (Object.keys(fieldErrors(productSchema, form)).length) return;
    const ok = run(
      (db, ctx) => (product ? updateProduct(db, ctx, product.id, form) : createProduct(db, ctx, form)),
      product ? 'Producto actualizado' : 'Producto creado',
    );
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={product ? `Editar ${product.code}` : 'Nuevo producto'}
        description="La ficha del producto se separa de cada lote: calidad y cantidades se registran por lote."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit}>{product ? 'Guardar cambios' : 'Crear producto'}</Button>
          </>
        }
      >
        <div className="space-y-5">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Identificación</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre" required error={errors.name} className="sm:col-span-2">
                {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Arroz blanco largo fino" />}
              </Field>
              <Field label="Categoría">
                {(p) => (
                  <Select {...p} value={form.category} onChange={(e) => set('category', e.target.value as ProductInput['category'])}>
                    {Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Tipo comercial" required hint="Dos tipos distintos no son sustitutos automáticos">
                {(p) => (
                  <Select {...p} value={form.commercialType} onChange={(e) => set('commercialType', e.target.value as ProductInput['commercialType'])}>
                    {Object.entries(RICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Variedad genética" hint="Opcional">
                {(p) => <Input {...p} value={form.variety ?? ''} onChange={(e) => set('variety', e.target.value)} />}
              </Field>
              <Field label="Grado de elaboración" required>
                {(p) => (
                  <Select {...p} value={form.processing} onChange={(e) => set('processing', e.target.value as ProductInput['processing'])}>
                    {Object.entries(PROCESSING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Código NCM" error={errors.ncm} hint="Familia 1006 para arroz; la subposición exacta requiere clasificación">
                {(p) => <Input {...p} value={form.ncm ?? ''} onChange={(e) => set('ncm', e.target.value)} placeholder="1006.30" />}
              </Field>
              <Field label="Estado de la clasificación NCM">
                {(p) => (
                  <Select {...p} value={form.ncmStatus} onChange={(e) => set('ncmStatus', e.target.value as VerificationStatus)}>
                    {(['pending', 'estimated', 'verified'] as VerificationStatus[]).map((k) => <option key={k} value={k}>{VERIFICATION_STATUS[k]}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Fuente de la clasificación" className="sm:col-span-2">
                {(p) => <Input {...p} value={form.ncmSource ?? ''} onChange={(e) => set('ncmSource', e.target.value)} />}
              </Field>
              <Field label="Descripción" className="sm:col-span-2">
                {(p) => <Textarea {...p} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />}
              </Field>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Presentaciones</h4>
              <Button size="sm" variant="secondary" onClick={() => set('presentations', [...presentations, { label: '', packaging: 'bag', netWeightKg: '', tareWeightKg: '', unitsPerPallet: null, palletTareKg: '' }])}>
                <Plus /> Agregar presentación
              </Button>
            </div>
            {errors.presentations ? <Alert tone="error">{errors.presentations}</Alert> : null}
            <div className="space-y-2">
              {presentations.map((pres, i) => {
                const update = (patch: Partial<typeof pres>) => set('presentations', presentations.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-6">
                    <Field label="Nombre" error={errors[`presentations.${i}.label`]} className="col-span-2">
                      {(p) => <Input {...p} value={pres.label} onChange={(e) => update({ label: e.target.value })} />}
                    </Field>
                    <Field label="Envase">
                      {(p) => (
                        <Select {...p} value={pres.packaging} onChange={(e) => update({ packaging: e.target.value as PackagingType })}>
                          {Object.entries(PACKAGING_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                      )}
                    </Field>
                    <Field label="Peso neto (kg)" error={errors[`presentations.${i}.netWeightKg`]}>
                      {(p) => <Input {...p} inputMode="decimal" disabled={pres.packaging === 'bulk'} value={pres.netWeightKg ?? ''} onChange={(e) => update({ netWeightKg: e.target.value })} />}
                    </Field>
                    <Field label="Tara envase (kg)">
                      {(p) => <Input {...p} inputMode="decimal" disabled={pres.packaging === 'bulk'} value={pres.tareWeightKg ?? ''} onChange={(e) => update({ tareWeightKg: e.target.value })} />}
                    </Field>
                    <div className="flex items-end gap-1">
                      <Field label="Unid./pallet" className="flex-1">
                        {(p) => <Input {...p} inputMode="numeric" value={pres.unitsPerPallet ?? ''} onChange={(e) => update({ unitsPerPallet: e.target.value ? Number(e.target.value) : null })} />}
                      </Field>
                      <Button size="icon" variant="ghost" aria-label="Quitar presentación" onClick={() => set('presentations', presentations.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Capacidad de reenvasado declarada</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CONVERTIBLE_OPTIONS.map((opt) => {
                const checked = (form.convertibleTo ?? []).some((c) => c.type === opt.type && c.netWeightKg === opt.netWeightKg);
                return (
                  <Checkbox
                    key={opt.label}
                    label={opt.label}
                    checked={checked}
                    onChange={(v) =>
                      set(
                        'convertibleTo',
                        v
                          ? [...(form.convertibleTo ?? []), { type: opt.type, netWeightKg: opt.netWeightKg }]
                          : (form.convertibleTo ?? []).filter((c) => !(c.type === opt.type && c.netWeightKg === opt.netWeightKg)),
                      )
                    }
                  />
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">El matching la usa para marcar una presentación distinta como "con condiciones" (nunca compatible sin revisión).</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function emptyLot(productId: string, presentationId: string, facilityId: string, today: string): LotInput {
  return {
    productId,
    facilityId,
    presentationId,
    physicalStockT: '',
    harvest: '2025/26',
    availableFrom: today,
    quality: { brokenPct: '', moisturePct: '', impuritiesPct: '', other: [], analysisDate: '', analyst: '', documentRef: '', verificationStatus: 'estimated', validUntil: '' },
    certifications: [],
    published: false,
    notes: '',
  };
}

function toLotInput(lot: Lot): LotInput {
  return {
    productId: lot.productId,
    facilityId: lot.facilityId,
    presentationId: lot.presentationId,
    physicalStockT: lot.physicalStockT,
    harvest: lot.harvest ?? '',
    availableFrom: lot.availableFrom,
    quality: {
      brokenPct: lot.quality.brokenPct ?? '',
      moisturePct: lot.quality.moisturePct ?? '',
      impuritiesPct: lot.quality.impuritiesPct ?? '',
      other: lot.quality.other,
      analysisDate: lot.quality.analysisDate ?? '',
      analyst: lot.quality.analyst ?? '',
      documentRef: lot.quality.documentRef ?? '',
      verificationStatus: lot.quality.verificationStatus,
      validUntil: lot.quality.validUntil ?? '',
    },
    certifications: lot.certifications.map((c) => ({ name: c.name, status: c.status, documentRef: c.documentRef ?? null })),
    published: lot.published,
    notes: lot.notes ?? '',
  };
}

export function LotFormDialog({ lot, productId, open, onOpenChange }: { lot?: Lot; productId?: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const products = db.products.filter((p) => p.organizationId === user.organizationId && p.status === 'active');
  const facilities = db.facilities.filter((f) => f.organizationId === user.organizationId);
  const today = new Date().toISOString().slice(0, 10);
  const initialProduct = products.find((p) => p.id === productId) ?? products[0];
  const [form, setForm] = useState<LotInput>(() =>
    lot ? toLotInput(lot) : emptyLot(initialProduct?.id ?? '', initialProduct?.presentations[0]?.id ?? '', facilities[0]?.id ?? '', today),
  );
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => (touched ? fieldErrors(lotSchema, form) : {}), [form, touched]);
  const product = products.find((p) => p.id === form.productId);
  const setQuality = (patch: Partial<LotInput['quality']>) => setForm((f) => ({ ...f, quality: { ...f.quality, ...patch } }));
  const certs = form.certifications ?? [];

  const submit = () => {
    setTouched(true);
    if (Object.keys(fieldErrors(lotSchema, form)).length) return;
    const ok = run((d, ctx) => (lot ? updateLot(d, ctx, lot.id, form) : createLot(d, ctx, form)), lot ? 'Lote actualizado' : 'Lote creado');
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={lot ? `Editar lote ${lot.code}` : 'Nuevo lote'}
        description="Cada lote tiene su propia cantidad, origen y resultados de calidad."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit}>{lot ? 'Guardar' : 'Crear lote'}</Button>
          </>
        }
      >
        {products.length === 0 || facilities.length === 0 ? (
          <Alert tone="warning" title="Faltan datos previos">Registrar al menos un producto activo y un establecimiento propio antes de crear lotes.</Alert>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Producto" required error={errors.productId}>
                {(p) => (
                  <Select {...p} value={form.productId} onChange={(e) => {
                    const next = products.find((x) => x.id === e.target.value);
                    setForm((f) => ({ ...f, productId: e.target.value, presentationId: next?.presentations[0]?.id ?? '' }));
                  }}>
                    {products.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Presentación" required error={errors.presentationId}>
                {(p) => (
                  <Select {...p} value={form.presentationId} onChange={(e) => setForm((f) => ({ ...f, presentationId: e.target.value }))}>
                    {(product?.presentations ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Planta o depósito" required error={errors.facilityId}>
                {(p) => (
                  <Select {...p} value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}>
                    {facilities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Stock físico (t)" required error={errors.physicalStockT} hint={lot ? 'Un cambio genera un ajuste de inventario registrado' : 'Toneladas netas'}>
                {(p) => <Input {...p} inputMode="decimal" value={form.physicalStockT} onChange={(e) => setForm((f) => ({ ...f, physicalStockT: e.target.value }))} />}
              </Field>
              <Field label="Disponible desde" required error={errors.availableFrom}>
                {(p) => <Input {...p} type="date" value={form.availableFrom} onChange={(e) => setForm((f) => ({ ...f, availableFrom: e.target.value }))} />}
              </Field>
              <Field label="Cosecha / campaña">
                {(p) => <Input {...p} value={form.harvest ?? ''} onChange={(e) => setForm((f) => ({ ...f, harvest: e.target.value }))} />}
              </Field>
            </div>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Calidad del lote</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Quebrado (%)" error={errors['quality.brokenPct']} hint="Vacío = sin análisis (nunca compatible definitivo)">
                  {(p) => <Input {...p} inputMode="decimal" value={form.quality.brokenPct ?? ''} onChange={(e) => setQuality({ brokenPct: e.target.value })} />}
                </Field>
                <Field label="Humedad (%)" error={errors['quality.moisturePct']}>
                  {(p) => <Input {...p} inputMode="decimal" value={form.quality.moisturePct ?? ''} onChange={(e) => setQuality({ moisturePct: e.target.value })} />}
                </Field>
                <Field label="Impurezas (%)" error={errors['quality.impuritiesPct']}>
                  {(p) => <Input {...p} inputMode="decimal" value={form.quality.impuritiesPct ?? ''} onChange={(e) => setQuality({ impuritiesPct: e.target.value })} />}
                </Field>
                <Field label="Fecha del análisis" error={errors['quality.analysisDate']}>
                  {(p) => <Input {...p} type="date" value={form.quality.analysisDate ?? ''} onChange={(e) => setQuality({ analysisDate: e.target.value })} />}
                </Field>
                <Field label="Responsable del análisis">
                  {(p) => <Input {...p} value={form.quality.analyst ?? ''} onChange={(e) => setQuality({ analyst: e.target.value })} />}
                </Field>
                <Field label="Documento respaldatorio">
                  {(p) => <Input {...p} value={form.quality.documentRef ?? ''} onChange={(e) => setQuality({ documentRef: e.target.value })} placeholder="N.º de informe" />}
                </Field>
                <Field label="Estado de verificación" hint="Verificado solo con informe de laboratorio identificado">
                  {(p) => (
                    <Select {...p} value={form.quality.verificationStatus} onChange={(e) => setQuality({ verificationStatus: e.target.value as VerificationStatus })}>
                      {(['estimated', 'pending', 'verified'] as VerificationStatus[]).map((k) => <option key={k} value={k} disabled={k === 'verified' && !form.quality.documentRef}>{k === 'estimated' ? 'Declarado (sin verificar)' : VERIFICATION_STATUS[k]}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Vigencia del análisis">
                  {(p) => <Input {...p} type="date" value={form.quality.validUntil ?? ''} onChange={(e) => setQuality({ validUntil: e.target.value })} />}
                </Field>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Certificaciones del lote</h4>
                <Button size="sm" variant="secondary" onClick={() => setForm((f) => ({ ...f, certifications: [...certs, { name: '', status: 'pending', documentRef: null }] }))}>
                  <Plus /> Agregar
                </Button>
              </div>
              {certs.length === 0 ? <p className="text-xs text-slate-500">Sin certificaciones registradas.</p> : null}
              {certs.map((c, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_180px_auto] items-end gap-2">
                  <Input aria-label="Certificación" value={c.name} placeholder="Kosher, Halal, Orgánico…" onChange={(e) => setForm((f) => ({ ...f, certifications: certs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                  <Select aria-label="Estado" value={c.status} onChange={(e) => setForm((f) => ({ ...f, certifications: certs.map((x, j) => (j === i ? { ...x, status: e.target.value as VerificationStatus } : x)) }))}>
                    {(['pending', 'estimated', 'verified', 'expired'] as VerificationStatus[]).map((k) => <option key={k} value={k}>{VERIFICATION_STATUS[k]}</option>)}
                  </Select>
                  <Button size="icon" variant="ghost" aria-label="Quitar" onClick={() => setForm((f) => ({ ...f, certifications: certs.filter((_, j) => j !== i) }))}><Trash2 /></Button>
                </div>
              ))}
            </section>

            <Checkbox
              checked={Boolean(form.published)}
              onChange={(v) => setForm((f) => ({ ...f, published: v }))}
              label="Publicar en el marketplace"
              description="Se muestran tipo, calidad, stock libre y origen; nunca costos ni datos financieros."
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toFacilityInput(f?: Facility): FacilityInput {
  return {
    name: f?.name ?? '',
    type: f?.type ?? 'mill',
    country: f?.country ?? 'AR',
    province: f?.province ?? '',
    city: f?.city ?? '',
    address: f?.address ?? '',
    exitPortId: f?.exitPortId ?? null,
    distanceToPortKm: f?.distanceToPortKm ?? '',
    distanceSource: f?.distanceSource ?? 'manual',
    loadingConditions: f?.loadingConditions ?? '',
    logisticsNotes: f?.logisticsNotes ?? '',
  };
}

export function FacilityFormDialog({ facility, open, onOpenChange }: { facility?: Facility; open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb();
  const run = useApp((s) => s.run);
  const [form, setForm] = useState<FacilityInput>(() => toFacilityInput(facility));
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => (touched ? fieldErrors(facilitySchema, form) : {}), [form, touched]);
  const set = <K extends keyof FacilityInput>(k: K, v: FacilityInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    setTouched(true);
    if (Object.keys(fieldErrors(facilitySchema, form)).length) return;
    const ok = run((d, ctx) => (facility ? updateFacility(d, ctx, facility.id, form) : createFacility(d, ctx, form)), facility ? 'Establecimiento actualizado' : 'Establecimiento registrado');
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={facility ? `Editar ${facility.name}` : 'Nuevo establecimiento'}
        description="Origen desde donde se prepara y despacha el producto."
        footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre" required error={errors.name}>{(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} />}</Field>
          <Field label="Tipo">
            {(p) => (
              <Select {...p} value={form.type} onChange={(e) => set('type', e.target.value as FacilityInput['type'])}>
                <option value="mill">Molino</option><option value="plant">Planta</option><option value="warehouse">Depósito</option><option value="farm">Campo / acopio</option>
              </Select>
            )}
          </Field>
          <Field label="País" required error={errors.country}>
            {(p) => <Select {...p} value={form.country} onChange={(e) => set('country', e.target.value)}>{Object.entries(COUNTRY_NAMES).filter(([k]) => k !== '*').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
          </Field>
          <Field label="Provincia" required error={errors.province}>{(p) => <Input {...p} value={form.province} onChange={(e) => set('province', e.target.value)} />}</Field>
          <Field label="Localidad" required error={errors.city}>{(p) => <Input {...p} value={form.city} onChange={(e) => set('city', e.target.value)} />}</Field>
          <Field label="Dirección de carga" required error={errors.address}>{(p) => <Input {...p} value={form.address} onChange={(e) => set('address', e.target.value)} />}</Field>
          <Field label="Puerto o punto de salida">
            {(p) => (
              <Select {...p} value={form.exitPortId ?? ''} onChange={(e) => set('exitPortId', e.target.value || null)}>
                <option value="">Sin definir</option>
                {db.ports.filter((x) => x.kind !== 'destination').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Distancia al puerto (km)" error={errors.distanceToPortKm} hint="Ingreso manual: sin servicio geográfico configurado. No se convierte en costo sin tarifa.">
            {(p) => <Input {...p} inputMode="decimal" value={form.distanceToPortKm ?? ''} onChange={(e) => set('distanceToPortKm', e.target.value)} />}
          </Field>
          <Field label="Condiciones de carga" className="sm:col-span-2">{(p) => <Textarea {...p} value={form.loadingConditions ?? ''} onChange={(e) => set('loadingConditions', e.target.value)} />}</Field>
          <Field label="Observaciones logísticas" className="sm:col-span-2">{(p) => <Textarea {...p} value={form.logisticsNotes ?? ''} onChange={(e) => set('logisticsNotes', e.target.value)} />}</Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
