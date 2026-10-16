import { ArrowLeft, ArrowRight, FilePlus2, Save, Wand } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Alert, EmptyState, KeyValue, PageHeader } from '@/components/ui/misc';
import { Stepper } from '@/components/ui/stepper';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import { byId } from '@/data/derive';
import { countryName, orgName, portName, visibleRequests, visibleScenarios } from '@/data/selectors';
import { createScenario } from '@/data/services/scenarios';
import { useApp, useCurrentUser, useDb } from '@/data/store';
import { PAYMENT_METHODS } from '@/domain/catalogs';
import { dec, isDecimalString, sum } from '@/domain/decimal';
import { fmtDateTime, fmtMoney, fmtTons } from '@/domain/format';
import { QuoteDialog } from '../scenario/QuoteDialog';
import { ResultsPanel } from '../scenario/ResultsPanel';
import { CommercialSection, PartiesSection } from '../scenario/sections/CommercialSection';
import { CostLinesSection } from '../scenario/sections/CostLinesSection';
import { RequirementsPreview } from '../scenario/sections/CustomsSection';
import { FinanceSection } from '../scenario/sections/FinanceSection';
import { ProductSection } from '../scenario/sections/ProductSection';
import { useScenarioDraft, type ScenarioDraft } from '../scenario/useScenarioDraft';

const STEPS = ['Producto y cantidad', 'Comprador, origen y destino', 'Condiciones comerciales', 'Logística y costos', 'Documentación', 'Revisión y cotización'];

/** Valida solo los campos necesarios de cada paso. */
export function stepIssues(draft: ScenarioDraft, step: number): string[] {
  const { scenario: s, evaluation } = draft;
  const issues: string[] = [];
  if (step === 0) {
    if (!s.productId) issues.push('Elegir el producto.');
    if (!s.presentationId) issues.push('Elegir la presentación.');
    if (!isDecimalString(s.quantityT) || dec(s.quantityT).lte(0)) issues.push('Indicar una cantidad mayor a cero.');
    if (s.lots.length === 0) issues.push('Asignar al menos un lote.');
    const assigned = sum(s.lots.map((l) => (isDecimalString(l.quantityT) ? l.quantityT : '0')));
    if (s.lots.length && isDecimalString(s.quantityT) && !assigned.eq(dec(s.quantityT))) issues.push('La suma por lote debe igualar la cantidad.');
    if (evaluation.logistics.packaging.needsDecision) issues.push('Resolver el ajuste de envases no enteros.');
    for (const a of evaluation.extraAlerts.filter((x) => x.level === 'error' && x.message.includes('libres'))) issues.push(a.message);
  }
  if (step === 1) {
    if (!s.buyerOrganizationId) issues.push('Elegir la empresa compradora.');
    if (!s.destinationCountry) issues.push('Elegir el país de destino.');
  }
  if (step === 2) {
    if (!s.commercial.namedPlace.trim()) issues.push('Indicar el lugar convenido del Incoterm.');
    if (s.pricing.mode === 'margin_on_sale' && !isDecimalString(s.pricing.marginPct ?? '')) issues.push('Indicar el margen objetivo.');
    if (s.pricing.mode === 'markup_on_cost' && !isDecimalString(s.pricing.markupPct ?? '')) issues.push('Indicar el recargo.');
    if (s.pricing.mode === 'fixed_price' && !isDecimalString(s.pricing.pricePerT ?? '')) issues.push('Indicar el precio negociado.');
  }
  if (step === 3) {
    for (const a of evaluation.result.alerts.filter((x) => x.level === 'error' && ['missing_fx', 'required_missing', 'margin_overflow', 'sale_charges'].includes(x.code))) issues.push(a.message);
  }
  if (step === 5) {
    for (const a of evaluation.result.alerts.filter((x) => x.level === 'error')) issues.push(a.message);
  }
  return [...new Set(issues)];
}

function Review({ draft }: { draft: ScenarioDraft }) {
  const db = useDb();
  const { scenario: s, evaluation } = draft;
  const r = evaluation.result;
  return (
    <Card>
      <CardHeader title="Resumen del expediente" description="Al guardar se genera la cotización (v1) y el expediente en negociación con su checklist" />
      <CardContent className="space-y-4">
        <KeyValue
          columns={3}
          items={[
            { label: 'Producto', value: byId(db.products, s.productId)?.name ?? '—' },
            { label: 'Lotes', value: s.lots.map((l) => `${byId(db.lots, l.lotId)?.code} (${fmtTons(l.quantityT)})`).join(' · ') },
            { label: 'Cantidad', value: `${fmtTons(r.quantityT)} · ${evaluation.logistics.packaging.packages} envases · ${evaluation.logistics.containers} contenedor(es)` },
            { label: 'Comprador', value: orgName(db, s.buyerOrganizationId) },
            { label: 'Origen', value: `${byId(db.facilities, s.originFacilityId)?.name ?? '—'} → ${portName(db, s.exitPortId)}` },
            { label: 'Destino', value: `${countryName(s.destinationCountry)} · ${portName(db, s.destinationPortId)}` },
            { label: 'Incoterm', value: `${s.commercial.incoterm} ${s.commercial.namedPlace}` },
            { label: 'Pago', value: `${PAYMENT_METHODS[s.finance.paymentMethod]} · ${s.commercial.paymentTerms}` },
            { label: 'Precio', value: r.pricePerT ? `${fmtMoney(r.pricePerT, r.currency)}/t · total ${fmtMoney(r.totalPrice, r.currency)}` : 'Sin precio válido' },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function WizardEditor({ scenarioId }: { scenarioId: string }) {
  const draft = useScenarioDraft(scenarioId);
  const notify = useApp((s) => s.notify);
  const [quoting, setQuoting] = useState(false);
  if (!draft) return <EmptyState icon={Wand} title="Borrador no disponible" action={<Button asChild variant="secondary"><Link to="/nueva-operacion">Volver</Link></Button>} />;
  const { scenario: s, update, flush } = draft;
  const step = Math.min(s.wizardStep ?? 0, STEPS.length - 1);
  const completed = STEPS.map((_, i) => i < step && stepIssues(draft, i).length === 0);
  const issues = stepIssues(draft, step);
  const firstInvalid = STEPS.findIndex((_, i) => i < step && stepIssues(draft, i).length > 0);
  const go = (target: number) => {
    if (target > step) {
      const blocking = STEPS.slice(0, target).findIndex((_, i) => stepIssues(draft, i).length > 0);
      if (blocking >= 0 && blocking < target) {
        update({ wizardStep: blocking });
        notify({ kind: 'error', title: `Completar el paso ${blocking + 1}: ${STEPS[blocking]}`, detail: stepIssues(draft, blocking).join(' ') });
        return;
      }
    }
    update({ wizardStep: target });
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Nueva operación"
        description={`Borrador "${s.name}" · los datos se guardan automáticamente y no se pierden al retroceder`}
        actions={<><Button asChild variant="ghost"><Link to="/nueva-operacion"><ArrowLeft /> Borradores</Link></Button><Button variant="secondary" onClick={() => { flush(); notify({ kind: 'success', title: 'Borrador guardado' }); }}><Save /> Guardar borrador</Button></>}
      />
      <Stepper steps={STEPS} current={step} completed={completed} onSelect={go} />
      {firstInvalid >= 0 ? <Alert tone="warning">El paso {firstInvalid + 1} quedó incompleto tras un cambio: revisalo antes de cotizar.</Alert> : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          {step === 0 ? <ProductSection draft={draft} /> : null}
          {step === 1 ? <PartiesSection draft={draft} /> : null}
          {step === 2 ? <CommercialSection draft={draft} /> : null}
          {step === 3 ? <><CostLinesSection draft={draft} /><FinanceSection draft={draft} /></> : null}
          {step === 4 ? <Card><CardHeader title="Documentación requerida" description="Según destino, NCM, presentación, comprador, modo de transporte y medio de pago" /><CardContent><RequirementsPreview draft={draft} /></CardContent></Card> : null}
          {step === 5 ? <Review draft={draft} /> : null}
          {issues.length ? <Alert tone="warning" title="Para continuar">{issues.join(' ')}</Alert> : null}
          <div className="flex justify-between">
            <Button variant="secondary" disabled={step === 0} onClick={() => go(step - 1)}><ArrowLeft /> Anterior</Button>
            {step < STEPS.length - 1 ? (
              <Button disabled={issues.length > 0} onClick={() => go(step + 1)}>Siguiente <ArrowRight /></Button>
            ) : (
              <Button variant="success" disabled={issues.length > 0 || Boolean(s.quotationId)} onClick={() => setQuoting(true)}><FilePlus2 /> Generar cotización y expediente</Button>
            )}
          </div>
        </div>
        <div className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"><ResultsPanel draft={draft} /></div>
      </div>
      {quoting ? <QuoteDialog draft={draft} withOperation onClose={() => setQuoting(false)} /> : null}
    </div>
  );
}

export default function WizardPage() {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [requestId, setRequestId] = useState('');
  const scenarioId = params.get('s');
  if (!can(user, 'scenario.manage')) {
    return <EmptyState icon={Wand} title="Tu rol no prepara cotizaciones" description="El asistente es para vendedores y responsables COMEX." />;
  }
  if (scenarioId) return <WizardEditor key={scenarioId} scenarioId={scenarioId} />;
  const drafts = visibleScenarios(db, user).filter((s) => s.status === 'draft' && !s.quotationId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const requests = visibleRequests(db, user).filter((r) => r.status === 'published' || r.status === 'negotiating');
  const start = () => {
    const s = run((d, ctx) => createScenario(d, ctx, { requestId: requestId || null, name: requestId ? `Operación ${byId(db.requests, requestId)?.code}` : 'Nueva operación' }), 'Borrador creado');
    if (s) navigate(`/nueva-operacion?s=${s.id}`);
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Nueva operación" description="Asistente en 6 pasos: producto y cantidad → comprador, origen y destino → condiciones → logística y costos → documentación → revisión y cotización." />
      <Card>
        <CardHeader title="Comenzar" />
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-md">
            <label htmlFor="rq" className="mb-1 block text-xs font-medium text-slate-700">Partir de una solicitud de compra (opcional)</label>
            <Select id="rq" value={requestId} onChange={(e) => setRequestId(e.target.value)}>
              <option value="">Sin solicitud (operación negociada fuera de la plataforma)</option>
              {requests.map((r) => <option key={r.id} value={r.id}>{r.code} · {orgName(db, r.buyerOrganizationId)} · {fmtTons(r.quantityT, 0)}</option>)}
            </Select>
          </div>
          <Button onClick={start}><Wand /> Iniciar asistente</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Borradores guardados" />
        {drafts.length === 0 ? <CardContent><p className="text-sm text-slate-500">Sin borradores.</p></CardContent> : (
          <Table>
            <THead><TR><TH>Borrador</TH><TH>Paso</TH><TH>Comprador</TH><TH>Actualizado</TH><TH /></TR></THead>
            <TBody>
              {drafts.map((d) => (
                <TR key={d.id}>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="text-xs">{(d.wizardStep ?? 0) + 1}. {STEPS[d.wizardStep ?? 0]}</TD>
                  <TD className="text-xs">{orgName(db, d.buyerOrganizationId)}</TD>
                  <TD className="text-xs">{fmtDateTime(d.updatedAt)}</TD>
                  <TD className="text-right"><Button size="sm" variant="secondary" asChild><Link to={`/nueva-operacion?s=${d.id}`}>Continuar</Link></Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
