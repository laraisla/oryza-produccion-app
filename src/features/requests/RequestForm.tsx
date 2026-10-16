import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import type { BuyerRequest } from '@/data/model';
import { COUNTRY_NAMES } from '@/data/selectors';
import { fieldErrors, requestSchema, type RequestInput } from '@/data/schemas';
import { createRequest, updateRequest } from '@/data/services/requests';
import { useApp, useCurrentUser, useDb } from '@/data/store';
import { INCOTERMS, PACKAGING_TYPES, PROCESSING, RICE_TYPES, type PackagingType } from '@/domain/catalogs';
import { INCOTERM_DEFINITIONS } from '@/domain/incoterms';

function toInput(r: BuyerRequest | undefined, contactName: string): RequestInput {
  return {
    contactName: r?.contactName ?? contactName,
    contactEmail: r?.contactEmail ?? '',
    visibility: r?.visibility ?? 'public',
    invitedOrganizationIds: r?.invitedOrganizationIds ?? [],
    category: r?.category ?? 'rice',
    commercialType: r?.commercialType ?? 'long_fine',
    varietyPolicy: r?.varietyPolicy ?? 'equivalents_allowed',
    variety: r?.variety ?? '',
    processing: r?.processing ?? 'white',
    maxBrokenPct: r?.maxBrokenPct ?? '5',
    maxMoisturePct: r?.maxMoisturePct ?? '',
    maxImpuritiesPct: r?.maxImpuritiesPct ?? '',
    quantityT: r?.quantityT ?? '',
    packaging: r?.packaging ?? { type: 'bag', netWeightKg: '25' },
    packagingFlexible: r?.packagingFlexible ?? false,
    allowConsolidation: r?.allowConsolidation ?? false,
    destinationCountry: r?.destinationCountry ?? '',
    destinationCity: r?.destinationCity ?? '',
    destinationPortId: r?.destinationPortId ?? '',
    finalAddress: r?.finalAddress ?? '',
    availabilityDeadline: r?.availabilityDeadline ?? '',
    deliveryDate: r?.deliveryDate ?? '',
    currency: r?.currency ?? 'USD',
    preferredIncoterm: r?.preferredIncoterm ?? null,
    requiredCertifications: r?.requiredCertifications ?? [],
    buyerDocuments: r?.buyerDocuments ?? [],
    notes: r?.notes ?? '',
  };
}

const SECTIONS = ['Producto', 'Calidad', 'Volumen y presentación', 'Destino y plazos', 'Requisitos y contacto'];
const SECTION_FIELDS: string[][] = [
  ['commercialType', 'processing', 'variety'],
  ['maxBrokenPct', 'maxMoisturePct', 'maxImpuritiesPct'],
  ['quantityT', 'packaging'],
  ['destinationCountry', 'availabilityDeadline', 'deliveryDate'],
  ['contactName', 'contactEmail'],
];

export function RequestFormDialog({ request, initial, open, onOpenChange }: { request?: BuyerRequest; initial?: Partial<RequestInput>; open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const [form, setForm] = useState<RequestInput>(() => ({ ...toInput(request, user.name), ...initial }));
  const [section, setSection] = useState(0);
  const [touched, setTouched] = useState(false);
  const [cert, setCert] = useState('');
  const [docName, setDocName] = useState('');
  const errors = useMemo(() => (touched ? fieldErrors(requestSchema, form) : {}), [form, touched]);
  const set = <K extends keyof RequestInput>(k: K, v: RequestInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ports = db.ports.filter((p) => p.kind !== 'origin' && (!form.destinationCountry || p.country === form.destinationCountry));
  const sectionErrors = (index: number) => SECTION_FIELDS[index].some((k) => errors[k]);

  const submit = (publish: boolean) => {
    setTouched(true);
    const errs = fieldErrors(requestSchema, form);
    if (Object.keys(errs).length) {
      const first = SECTION_FIELDS.findIndex((keys) => keys.some((k) => errs[k]));
      if (first >= 0) setSection(first);
      return;
    }
    const ok = run(
      (d, ctx) => (request ? updateRequest(d, ctx, request.id, form) : createRequest(d, ctx, form, publish)),
      request ? 'Solicitud actualizada' : publish ? 'Solicitud publicada' : 'Borrador guardado',
    );
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={request ? `Editar ${request.code}` : 'Nueva solicitud de compra'}
        description="Describí exactamente qué arroz necesitás: el matching compara cada criterio sin compensar requisitos excluyentes."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {section > 0 ? <Button variant="secondary" onClick={() => setSection(section - 1)}>Anterior</Button> : null}
            {section < SECTIONS.length - 1 ? <Button variant="secondary" onClick={() => setSection(section + 1)}>Siguiente</Button> : null}
            {!request ? <Button variant="secondary" onClick={() => submit(false)}>Guardar borrador</Button> : null}
            <Button onClick={() => submit(true)}>{request ? 'Guardar cambios' : 'Publicar solicitud'}</Button>
          </>
        }
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(i)}
              className={`rounded-full border px-2.5 py-1 text-xs ${i === section ? 'border-petrol-600 bg-petrol-50 text-petrol-900' : sectionErrors(i) ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'}`}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {section === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo comercial" required hint="Criterio excluyente: un tipo distinto no es sustituto">
              {(p) => <Select {...p} value={form.commercialType} onChange={(e) => set('commercialType', e.target.value as RequestInput['commercialType'])}>{Object.entries(RICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
            </Field>
            <Field label="Grado de elaboración" required>
              {(p) => <Select {...p} value={form.processing} onChange={(e) => set('processing', e.target.value as RequestInput['processing'])}>{Object.entries(PROCESSING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
            </Field>
            <Field label="Variedad">
              {(p) => <Select {...p} value={form.varietyPolicy} onChange={(e) => set('varietyPolicy', e.target.value as RequestInput['varietyPolicy'])}><option value="equivalents_allowed">Admito variedades equivalentes</option><option value="exact">Exijo una variedad exacta</option></Select>}
            </Field>
            {form.varietyPolicy === 'exact' ? (
              <Field label="Variedad exigida" required error={errors.variety}>
                {(p) => <Input {...p} value={form.variety ?? ''} onChange={(e) => set('variety', e.target.value)} />}
              </Field>
            ) : null}
          </div>
        ) : null}

        {section === 1 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Quebrado máximo (%)" required error={errors.maxBrokenPct}>{(p) => <Input {...p} inputMode="decimal" value={form.maxBrokenPct} onChange={(e) => set('maxBrokenPct', e.target.value)} />}</Field>
            <Field label="Humedad máxima (%)" hint="Opcional" error={errors.maxMoisturePct}>{(p) => <Input {...p} inputMode="decimal" value={form.maxMoisturePct ?? ''} onChange={(e) => set('maxMoisturePct', e.target.value)} />}</Field>
            <Field label="Impurezas máximas (%)" hint="Opcional" error={errors.maxImpuritiesPct}>{(p) => <Input {...p} inputMode="decimal" value={form.maxImpuritiesPct ?? ''} onChange={(e) => set('maxImpuritiesPct', e.target.value)} />}</Field>
          </div>
        ) : null}

        {section === 2 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Cantidad mínima (t netas)" required error={errors.quantityT}>{(p) => <Input {...p} inputMode="decimal" value={form.quantityT} onChange={(e) => set('quantityT', e.target.value)} />}</Field>
            <Field label="Envase" required>
              {(p) => <Select {...p} value={form.packaging.type} onChange={(e) => set('packaging', { type: e.target.value as PackagingType, netWeightKg: e.target.value === 'bulk' ? null : form.packaging.netWeightKg })}>{Object.entries(PACKAGING_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
            </Field>
            {form.packaging.type !== 'bulk' ? (
              <Field label="Peso por envase (kg)" required error={errors.packaging}>
                {(p) => <Select {...p} value={form.packaging.netWeightKg ?? ''} onChange={(e) => set('packaging', { ...form.packaging, netWeightKg: e.target.value })}><option value="">Elegir…</option>{['1', '5', '10', '25', '50', '1000'].map((w) => <option key={w} value={w}>{w} kg</option>)}</Select>}
              </Field>
            ) : null}
            <div className="space-y-2 sm:col-span-3">
              <Checkbox checked={form.packagingFlexible} onChange={(v) => set('packagingFlexible', v)} label="Acepto otra presentación (reenvasado a confirmar)" description="Si no, la presentación es excluyente." />
              <Checkbox checked={form.allowConsolidation} onChange={(v) => set('allowConsolidation', v)} label="Admito consolidar lotes compatibles de uno o más proveedores" description="La consolidación se sugiere con condiciones y nunca reserva stock automáticamente." />
            </div>
          </div>
        ) : null}

        {section === 3 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="País de destino" required error={errors.destinationCountry}>
              {(p) => <Select {...p} value={form.destinationCountry} onChange={(e) => setForm((f) => ({ ...f, destinationCountry: e.target.value, destinationPortId: '' }))}><option value="">Elegir…</option>{Object.entries(COUNTRY_NAMES).filter(([k]) => k !== '*' && k !== 'AR').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
            </Field>
            <Field label="Puerto de destino">
              {(p) => <Select {...p} value={form.destinationPortId ?? ''} onChange={(e) => set('destinationPortId', e.target.value)}><option value="">Sin definir</option>{ports.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}
            </Field>
            <Field label="Ciudad">{(p) => <Input {...p} value={form.destinationCity ?? ''} onChange={(e) => set('destinationCity', e.target.value)} />}</Field>
            <Field label="Dirección final (si aplica)">{(p) => <Input {...p} value={form.finalAddress ?? ''} onChange={(e) => set('finalAddress', e.target.value)} />}</Field>
            <Field label="Disponible para despacho antes del" hint="Descarta lotes que no llegan al plazo" error={errors.availabilityDeadline}>{(p) => <Input {...p} type="date" value={form.availabilityDeadline ?? ''} onChange={(e) => set('availabilityDeadline', e.target.value)} />}</Field>
            <Field label="Fecha de entrega en destino" error={errors.deliveryDate}>{(p) => <Input {...p} type="date" value={form.deliveryDate ?? ''} onChange={(e) => set('deliveryDate', e.target.value)} />}</Field>
            <Field label="Moneda">{(p) => <Select {...p} value={form.currency} onChange={(e) => set('currency', e.target.value as RequestInput['currency'])}>{['USD', 'EUR', 'ARS', 'BRL'].map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
            <Field label="Incoterm preferido" hint="Orientativo: se pacta en la cotización">
              {(p) => <Select {...p} value={form.preferredIncoterm ?? ''} onChange={(e) => set('preferredIncoterm', (e.target.value || null) as RequestInput['preferredIncoterm'])}><option value="">Sin preferencia</option>{INCOTERMS.map((i) => <option key={i} value={i}>{i} — {INCOTERM_DEFINITIONS[i].name}</option>)}</Select>}
            </Field>
          </div>
        ) : null}

        {section === 4 ? (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-700">Certificaciones exigidas por el comprador</p>
              <p className="mb-2 text-[11px] text-slate-500">Son exigencias particulares, no requisitos normativos: se registran con su fuente.</p>
              <div className="flex gap-2">
                <Input aria-label="Nueva certificación" value={cert} onChange={(e) => setCert(e.target.value)} placeholder="Kosher, Halal…" />
                <Button variant="secondary" onClick={() => { if (cert.trim()) { set('requiredCertifications', [...(form.requiredCertifications ?? []), cert.trim()]); setCert(''); } }}><Plus /> Agregar</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(form.requiredCertifications ?? []).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {c}
                    <button type="button" aria-label={`Quitar ${c}`} onClick={() => set('requiredCertifications', (form.requiredCertifications ?? []).filter((x) => x !== c))}><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-700">Documentos que aportará el importador</p>
              <div className="flex gap-2">
                <Input aria-label="Documento del importador" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Ej.: datos de registro del importador" />
                <Button variant="secondary" onClick={() => { if (docName.trim()) { set('buyerDocuments', [...(form.buyerDocuments ?? []), { name: docName.trim(), note: null }]); setDocName(''); } }}><Plus /> Agregar</Button>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {(form.buyerDocuments ?? []).map((d) => (
                  <li key={d.name} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">{d.name}<button type="button" aria-label={`Quitar ${d.name}`} onClick={() => set('buyerDocuments', (form.buyerDocuments ?? []).filter((x) => x.name !== d.name))}><X className="size-3" /></button></li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Persona de contacto" required error={errors.contactName}>{(p) => <Input {...p} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />}</Field>
              <Field label="Email de contacto" error={errors.contactEmail}>{(p) => <Input {...p} type="email" value={form.contactEmail ?? ''} onChange={(e) => set('contactEmail', e.target.value)} />}</Field>
              <Field label="Visibilidad">
                {(p) => <Select {...p} value={form.visibility} onChange={(e) => set('visibility', e.target.value as RequestInput['visibility'])}><option value="public">Pública: visible para vendedores registrados</option><option value="private">Privada: solo empresas invitadas</option></Select>}
              </Field>
              {form.visibility === 'private' ? (
                <Field label="Empresas invitadas">
                  {(p) => (
                    <select {...p} multiple className="h-24 w-full rounded-md border border-slate-300 text-sm" value={form.invitedOrganizationIds ?? []} onChange={(e) => set('invitedOrganizationIds', Array.from(e.target.selectedOptions).map((o) => o.value))}>
                      {db.organizations.filter((o) => o.kinds.some((k) => k !== 'buyer')).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  )}
                </Field>
              ) : null}
              <Field label="Observaciones" className="sm:col-span-2">{(p) => <Textarea {...p} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
