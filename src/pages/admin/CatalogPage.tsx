import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { CATALOG_LABEL, deleteCatalogItem, upsertCatalogItem } from '@/services/masterDataService';
import type { CatalogBase, CatalogKey, Database, DowntimeKind, ProcessModule } from '@/types/domain';
import { fmtNum } from '@/utils/format';
import { isValidHHMM } from '@/utils/time';

type FieldType = 'text' | 'number' | 'time' | 'select';
interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: (db: Database) => { value: string; label: string }[];
  hint?: string;
  format?: (v: unknown, db: Database) => string;
}

const KIND_LABEL: Record<DowntimeKind, string> = {
  falla: 'Falla (MTBF/MTTR)',
  operativa: 'Operativa',
  abastecimiento: 'Abastecimiento',
  planificada: 'Planificada',
  otra: 'Otra',
};

const MODULE_LABEL: Record<ProcessModule, string> = {
  recepcion: 'Recepción',
  secado: 'Secado',
  silos: 'Silos',
  produccion: 'Producción',
  laboratorio: 'Laboratorio',
  fraccionamiento: 'Fraccionamiento',
  deposito: 'Depósito',
  expedicion: 'Expedición',
};

const num = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : fmtNum(Number(v)));

const FIELDS: Record<CatalogKey, FieldDef[]> = {
  products: [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'code', label: 'Código', type: 'text' },
    {
      key: 'defaultVarietyId',
      label: 'Variedad sugerida',
      type: 'select',
      options: (db) => db.varieties.map((v) => ({ value: v.id, label: v.name })),
      hint: 'Se preselecciona al elegir el producto en el formulario.',
      format: (v, db) => db.varieties.find((x) => x.id === v)?.name ?? '—',
    },
  ],
  varieties: [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'code', label: 'Código', type: 'text' },
  ],
  presentations: [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'unitWeightKg', label: 'Peso unitario (kg)', type: 'number', required: true, format: num, hint: 'Se completa automáticamente en el formulario.' },
    { key: 'unitsPerPallet', label: 'Unidades por pallet', type: 'number', required: true, format: num },
  ],
  lines: [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'code', label: 'Código', type: 'text' },
    {
      key: 'module',
      label: 'Módulo de proceso',
      type: 'select',
      required: true,
      options: () => (Object.keys(MODULE_LABEL) as ProcessModule[]).map((m) => ({ value: m, label: MODULE_LABEL[m] })),
      format: (v) => MODULE_LABEL[v as ProcessModule] ?? '—',
    },
    { key: 'nominalCapacityKgH', label: 'Capacidad nominal (kg/h)', type: 'number', format: num, hint: 'Necesaria para calcular Rendimiento y OEE.' },
    { key: 'targetKgPerHour', label: 'Objetivo productividad (kg/h)', type: 'number', format: num },
    { key: 'targetKgPerShift', label: 'Objetivo por turno (kg)', type: 'number', format: num },
  ],
  shifts: [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'code', label: 'Código', type: 'text' },
    { key: 'start', label: 'Hora inicio', type: 'time', required: true },
    { key: 'end', label: 'Hora fin', type: 'time', required: true, hint: 'Si es menor que el inicio, el turno termina al día siguiente.' },
  ],
  downtimeCategories: [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    {
      key: 'kind',
      label: 'Tipo',
      type: 'select',
      required: true,
      options: () => (Object.keys(KIND_LABEL) as DowntimeKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
      format: (v) => KIND_LABEL[v as DowntimeKind] ?? '—',
      hint: '"Falla" se usa para MTBF/MTTR; "Planificada" se excluye de la disponibilidad.',
    },
  ],
};

const DEFAULTS: Partial<Record<CatalogKey, Record<string, unknown>>> = {
  lines: { module: 'fraccionamiento' },
  downtimeCategories: { kind: 'operativa' },
  shifts: { start: '06:00', end: '14:00' },
};

export function CatalogPage({ catalog }: { catalog: CatalogKey }) {
  const { db, user } = useData();
  const { confirm, run, toast } = useFeedback();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const fields = FIELDS[catalog];
  const items = db[catalog] as unknown as (CatalogBase & Record<string, unknown>)[];
  const label = CATALOG_LABEL[catalog];

  const save = async () => {
    if (!editing) return;
    for (const f of fields) {
      const v = editing[f.key];
      if (f.required && (v === undefined || v === null || v === '')) return toast({ kind: 'error', message: `Completa el campo "${f.label}".` });
      if (f.type === 'number' && v !== undefined && v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0))
        return toast({ kind: 'error', message: `"${f.label}" debe ser un número mayor o igual a cero.` });
      if (f.type === 'time' && v && !isValidHHMM(String(v))) return toast({ kind: 'error', message: `"${f.label}" debe tener formato HH:MM.` });
    }
    if (catalog === 'presentations' && Number(editing.unitWeightKg) <= 0) return toast({ kind: 'error', message: 'El peso unitario debe ser mayor a cero.' });
    const clean: Record<string, unknown> = { ...editing };
    fields.filter((f) => f.type === 'number').forEach((f) => (clean[f.key] = clean[f.key] === '' || clean[f.key] === undefined ? undefined : Number(clean[f.key])));
    const ok = await run(() => upsertCatalogItem(catalog, clean as unknown as CatalogBase, user), 'Cambios guardados.');
    if (ok) setEditing(null);
  };

  const toggle = (item: CatalogBase) => run(() => upsertCatalogItem(catalog, { ...item, active: !item.active }, user), item.active ? 'Desactivado: ya no aparecerá en nuevas cargas.' : 'Activado.');

  const remove = async (item: CatalogBase) => {
    const { ok } = await confirm({ title: `Eliminar ${label.singular}`, message: `¿Eliminar "${item.name}"? Si está en uso, se sugerirá desactivarlo.`, confirmLabel: 'Eliminar', tone: 'danger' });
    if (ok) await run(() => deleteCatalogItem(catalog, item.id, user), 'Eliminado.');
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title={label.plural}
        subtitle="Alta, baja y modificación. Los elementos en uso se desactivan en lugar de eliminarse para conservar la trazabilidad."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ id: '', name: '', active: true, ...DEFAULTS[catalog] })}><Plus size={16} /> Agregar {label.singular}</button>}
      />
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                {fields.map((f) => <th key={f.key} className={f.type === 'number' ? 'text-right' : ''}>{f.label}</th>)}
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={it.active ? '' : 'opacity-60'}>
                  {fields.map((f) => (
                    <td key={f.key} className={f.type === 'number' ? 'num' : f.key === 'name' ? 'font-medium' : ''}>
                      {f.format ? f.format(it[f.key], db) : String(it[f.key] ?? '—')}
                    </td>
                  ))}
                  <td>
                    <button onClick={() => toggle(it)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${it.active ? 'bg-ok-bg text-ok-text' : 'bg-slate-100 text-slate-600'}`} title="Clic para cambiar">
                      {it.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button className="btn-icon" onClick={() => setEditing({ ...it })} aria-label={`Editar ${it.name}`}><Pencil size={16} /></button>
                      <button className="btn-icon hover:!text-bad" onClick={() => remove(it)} aria-label={`Eliminar ${it.name}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal
          title={editing.id ? `Editar ${label.singular}` : `Nuevo/a ${label.singular}`}
          onClose={() => setEditing(null)}
          footer={<><button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}
        >
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {fields.map((f) => (
              <div key={f.key} className={f.key === 'name' ? 'sm:col-span-2' : ''}>
                <label className="label" htmlFor={`cf-${f.key}`}>{f.label} {f.required && <span className="text-bad">*</span>}</label>
                {f.type === 'select' ? (
                  <select id={`cf-${f.key}`} className="input" value={String(editing[f.key] ?? '')} onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value || undefined })}>
                    {!f.required && <option value="">— Ninguna —</option>}
                    {f.options!(db).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    id={`cf-${f.key}`}
                    className="input"
                    type={f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text'}
                    step={f.type === 'number' ? 'any' : undefined}
                    min={f.type === 'number' ? 0 : undefined}
                    value={String(editing[f.key] ?? '')}
                    onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                  />
                )}
                {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-700" checked={Boolean(editing.active)} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Activo (disponible para nuevas cargas)
            </label>
            <button type="submit" className="hidden" />
          </form>
        </Modal>
      )}
    </div>
  );
}
