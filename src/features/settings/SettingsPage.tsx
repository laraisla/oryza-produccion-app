import { Database, Download, KeyRound, RotateCcw, Settings, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, KeyValue, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can, ROLE_ACTIONS, type Action } from '@/data/access';
import { fieldErrors, fxRateSchema, type FxRateInput } from '@/data/schemas';
import { addFxRate, setStellarAddress, updateSettings } from '@/data/services/admin';
import { todayISO, useApp, useCurrentOrg, useCurrentUser, useDb } from '@/data/store';
import { ROLES, VERIFICATION_STATUS, type VerificationStatus } from '@/domain/catalogs';
import { fmtDate, fmtNum } from '@/domain/format';
import { stellarRuntime } from '@/integrations/stellar/config';
import { supabaseStatus } from '@/integrations/supabase/status';

const ACTION_LABEL: Record<Action, string> = {
  'product.manage': 'Gestionar productos',
  'lot.manage': 'Gestionar lotes y stock',
  'facility.manage': 'Gestionar establecimientos',
  'request.manage': 'Crear solicitudes de compra',
  'scenario.manage': 'Calcular escenarios',
  'quotation.manage': 'Emitir cotizaciones',
  'quotation.respond': 'Aceptar o rechazar cotizaciones',
  'operation.manage': 'Gestionar operaciones y embarques',
  'operation.view': 'Ver operaciones propias',
  'document.manage': 'Aportar documentación',
  'document.verify': 'Verificar u observar documentos',
  'finance.view': 'Ver finanzas y conciliación',
  'finance.manage': 'Registrar facturas y cobros',
  'verification.manage': 'Actualizar verificaciones',
  'catalog.manage': 'Mantener catálogos y tipos de cambio',
  'settings.manage': 'Configuración general',
  'blockchain.sign': 'Firmar evidencias en Stellar',
};

export default function SettingsPage() {
  const db = useDb();
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const run = useApp((s) => s.run);
  const switchUser = useApp((s) => s.switchUser);
  const resetDemo = useApp((s) => s.resetDemo);
  const persisted = useApp((s) => s.persisted);
  const [address, setAddress] = useState(org.stellarAddress ?? '');
  const [fx, setFx] = useState<FxRateInput>({ base: 'USD', quote: 'ARS', rate: '', date: todayISO(), source: '', sourceUrl: '', status: 'estimated' });
  const [fxTouched, setFxTouched] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const runtime = stellarRuntime(db.settings.stellar);
  const [stellar, setStellar] = useState(db.settings.stellar);
  const fxErrors = fxTouched ? fieldErrors(fxRateSchema, fx) : {};
  const supa = supabaseStatus();
  const rates = db.fxRates.filter((r) => r.organizationId === user.organizationId).sort((a, b) => b.date.localeCompare(a.date));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agromatch-respaldo-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Configuración" description="Sesión demo, organización, catálogos de referencia, parámetros de cálculo, Stellar y datos." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Sesión y permisos" description="Usuarios ficticios para recorrer el flujo con distintos roles" icon={<Users />} />
          <CardContent className="space-y-3">
            <Field label="Usuario demo activo">
              {(p) => (
                <Select {...p} value={user.id} onChange={(e) => switchUser(e.target.value)}>
                  {db.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLES[u.role]} · {db.organizations.find((o) => o.id === u.organizationId)?.name}</option>)}
                </Select>
              )}
            </Field>
            <p className="text-xs font-medium text-slate-700">Permisos del rol {ROLES[user.role]}</p>
            <div className="flex flex-wrap gap-1.5">{ROLE_ACTIONS[user.role].map((a) => <Badge key={a} tone="petrol">{ACTION_LABEL[a]}</Badge>)}</div>
            <p className="text-[11px] text-slate-500">Los permisos se aplican en los servicios (no solo en la interfaz): una acción no autorizada se rechaza aunque se invoque directamente.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Organización" icon={<Settings />} />
          <CardContent className="space-y-3">
            <KeyValue columns={2} items={[{ label: 'Nombre', value: org.name }, { label: 'País', value: org.country }, { label: 'Perfil', value: org.kinds.join(', ') }, { label: 'Datos', value: org.isDemo ? 'Ficticios (demo)' : 'Reales' }]} />
            <Field label="Dirección pública Stellar (G…)" hint="Solo la dirección pública: nunca ingresar claves secretas. Se usa para asociar comprador y vendedor en el contrato.">
              {(p) => (
                <div className="flex gap-2">
                  <Input {...p} className="mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="GABC…" />
                  <Button variant="secondary" onClick={() => run((d, ctx) => setStellarAddress(d, ctx, address || null), 'Dirección Stellar guardada')}>Guardar</Button>
                </div>
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Tipos de cambio documentados" description="La conversión monetaria solo usa cotizaciones con fecha y fuente" />
          <Table>
            <THead><TR><TH>Par</TH><TH className="text-right">Tipo</TH><TH>Fecha</TH><TH>Fuente</TH><TH>Estado</TH></TR></THead>
            <TBody>{rates.map((r) => <TR key={r.id}><TD className="mono">{r.base}/{r.quote}</TD><TD className="num text-right">{fmtNum(r.rate, 4)}</TD><TD className="text-xs">{fmtDate(r.date)}</TD><TD className="max-w-[220px] text-xs">{r.source}</TD><TD><VerificationBadge status={r.status} /></TD></TR>)}</TBody>
          </Table>
          {can(user, 'catalog.manage') ? (
            <CardContent className="grid grid-cols-2 gap-2 border-t border-slate-100 sm:grid-cols-4">
              <Field label="Base">{(p) => <Select {...p} value={fx.base} onChange={(e) => setFx({ ...fx, base: e.target.value as FxRateInput['base'] })}>{['USD', 'EUR', 'ARS', 'BRL'].map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
              <Field label="Cotiza en">{(p) => <Select {...p} value={fx.quote} onChange={(e) => setFx({ ...fx, quote: e.target.value as FxRateInput['quote'] })}>{['ARS', 'USD', 'EUR', 'BRL'].map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
              <Field label="Tipo de cambio" error={fxErrors.rate}>{(p) => <Input {...p} inputMode="decimal" value={fx.rate} onChange={(e) => setFx({ ...fx, rate: e.target.value })} />}</Field>
              <Field label="Fecha" error={fxErrors.date}>{(p) => <Input {...p} type="date" value={fx.date} onChange={(e) => setFx({ ...fx, date: e.target.value })} />}</Field>
              <Field label="Fuente" error={fxErrors.source} className="col-span-2">{(p) => <Input {...p} value={fx.source} onChange={(e) => setFx({ ...fx, source: e.target.value })} placeholder="Ej.: cotización del banco, fecha y hora" />}</Field>
              <Field label="URL de respaldo" error={fxErrors.sourceUrl}>{(p) => <Input {...p} value={fx.sourceUrl ?? ''} onChange={(e) => setFx({ ...fx, sourceUrl: e.target.value })} />}</Field>
              <Field label="Estado">{(p) => <Select {...p} value={fx.status} onChange={(e) => setFx({ ...fx, status: e.target.value as VerificationStatus })}>{(['estimated', 'quoted', 'verified'] as VerificationStatus[]).map((k) => <option key={k} value={k}>{VERIFICATION_STATUS[k]}</option>)}</Select>}</Field>
              <div className="col-span-2 sm:col-span-4"><Button onClick={() => { setFxTouched(true); if (Object.keys(fieldErrors(fxRateSchema, fx)).length) return; if (run((d, ctx) => addFxRate(d, ctx, fx), 'Tipo de cambio registrado')) { setFx({ ...fx, rate: '', source: '', sourceUrl: '' }); setFxTouched(false); } }}>Agregar tipo de cambio</Button></div>
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Parámetros de cálculo" description="Valores por defecto para escenarios nuevos" />
          <CardContent className="space-y-3">
            <Field label="Redondeo del precio cotizado" hint={can(user, 'settings.manage') ? undefined : 'Solo administradores'}>
              {(p) => (
                <Select {...p} disabled={!can(user, 'settings.manage')} value={`${db.settings.rounding.target}:${db.settings.rounding.decimals}:${db.settings.rounding.mode}`} onChange={(e) => {
                  const [target, decimals, mode] = e.target.value.split(':');
                  run((d, ctx) => updateSettings(d, ctx, { rounding: { target: target as 'per_ton' | 'total', decimals: Number(decimals), mode: mode as 'half_up' | 'up' } }), 'Redondeo actualizado');
                }}>
                  <option value="per_ton:2:half_up">Por tonelada, 2 decimales</option>
                  <option value="per_ton:0:up">Por tonelada, entero hacia arriba</option>
                  <option value="total:2:half_up">Sobre el total, 2 decimales</option>
                </Select>
              )}
            </Field>
            <Table>
              <THead><TR><TH>Contenedor</TH><TH className="text-right">Carga útil</TH><TH className="text-right">Límite operativo</TH><TH>Estado</TH></TR></THead>
              <TBody>{db.containerTypes.map((c) => <TR key={c.id}><TD className="text-xs">{c.name}</TD><TD className="num text-right text-xs">{fmtNum(c.maxPayloadKg, 0)} kg</TD><TD className="num text-right text-xs">{c.operationalLimitKg ? `${fmtNum(c.operationalLimitKg, 0)} kg` : '—'}</TD><TD><VerificationBadge status={c.verificationStatus} /></TD></TR>)}</TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Stellar" description="Red, contrato y RPC usados por los expedientes" icon={<ShieldCheck />} />
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Red">{(p) => <Select {...p} disabled={!can(user, 'settings.manage')} value={stellar.network} onChange={(e) => setStellar({ ...stellar, network: e.target.value as 'testnet' | 'local' })}><option value="testnet">Stellar Testnet</option><option value="local">Red local (desarrollo)</option></Select>}</Field>
              <Field label="RPC (opcional)" hint="Vacío = RPC público de la red">{(p) => <Input {...p} disabled={!can(user, 'settings.manage')} value={stellar.rpcUrl ?? ''} onChange={(e) => setStellar({ ...stellar, rpcUrl: e.target.value || null })} />}</Field>
              <Field label="ID de contrato (opcional)" hint="Vacío = el registrado en deployments/" className="sm:col-span-2">{(p) => <Input {...p} className="mono" disabled={!can(user, 'settings.manage')} value={stellar.contractId ?? ''} onChange={(e) => setStellar({ ...stellar, contractId: e.target.value || null })} placeholder="C…" />}</Field>
            </div>
            {can(user, 'settings.manage') ? <Button variant="secondary" onClick={() => run((d, ctx) => updateSettings(d, ctx, { stellar }), 'Configuración Stellar guardada')}>Guardar</Button> : <p className="text-[11px] text-slate-500">Solo administradores pueden cambiar la red.</p>}
            {runtime.deployment ? (
              <KeyValue columns={1} items={[
                { label: 'Contrato desplegado', value: <span className="mono break-all">{runtime.deployment.contractId}</span> },
                { label: 'Hash del wasm', value: <span className="mono break-all">{runtime.deployment.wasmHash}</span> },
                { label: 'Transacción de creación', value: <span className="mono break-all">{runtime.deployment.createTx.hash}</span> },
                { label: 'Desplegado', value: runtime.deployment.deployedAt },
              ]} />
            ) : <Alert tone="warning">No hay un despliegue registrado para {runtime.network.label} en este build. Ver README: npm run stellar:deploy.</Alert>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Datos e integraciones" icon={<Database />} />
          <CardContent className="space-y-3 text-sm">
            <KeyValue columns={1} items={[
              { label: 'Persistencia activa', value: `Modo demo local: base en este navegador (localStorage) y archivos en IndexedDB${persisted ? '' : ' — sin almacenamiento disponible: los cambios se pierden al recargar'}` },
              { label: 'Supabase', value: supa.configured ? `Variables detectadas (${supa.url}). Esquema y políticas RLS en supabase/migrations; la sincronización remota no está activa en este MVP.` : 'No configurado: ver supabase/migrations y .env.example' },
              { label: 'WebCOMEX / SECOEXPO', value: 'Sin conexión: requieren autorización y APIs oficiales. No se simulan.' },
            ]} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportData}><Download /> Exportar respaldo (.json)</Button>
              <Button variant="danger" onClick={() => setConfirmReset(true)}><RotateCcw /> Restablecer datos demo</Button>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-slate-500"><KeyRound className="size-3" /> No se almacenan secretos en el navegador ni en el repositorio.</p>
          </CardContent>
        </Card>
      </div>
      {confirmReset ? (
        <Dialog open onOpenChange={setConfirmReset}>
          <DialogContent title="Restablecer datos demo" description="Se descartan los cambios hechos en este navegador y se vuelve al escenario inicial." footer={<><Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancelar</Button><Button variant="danger" onClick={() => { resetDemo(); setConfirmReset(false); }}>Restablecer</Button></>}>
            <p className="text-sm text-slate-600">Los archivos cargados en IndexedDB quedan huérfanos y no se muestran.</p>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
