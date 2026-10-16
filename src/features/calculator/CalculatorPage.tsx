import { Archive, Calculator, Copy, FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { VersionStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { byId, evaluateScenario } from '@/data/derive';
import { orgName, visibleScenarios } from '@/data/selectors';
import { archiveScenario, createScenario, duplicateScenario } from '@/data/services/scenarios';
import { todayISO, useApp, useCurrentUser, useDb } from '@/data/store';
import { fmtDateTime, fmtMoney } from '@/domain/format';
import { QuoteDialog } from '../scenario/QuoteDialog';
import { ResultsPanel } from '../scenario/ResultsPanel';
import { CommercialSection, PartiesSection } from '../scenario/sections/CommercialSection';
import { CostLinesSection } from '../scenario/sections/CostLinesSection';
import { CustomsSection } from '../scenario/sections/CustomsSection';
import { FinanceSection } from '../scenario/sections/FinanceSection';
import { ProductSection } from '../scenario/sections/ProductSection';
import { useScenarioDraft } from '../scenario/useScenarioDraft';

function ScenarioList() {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const navigate = useNavigate();
  const scenarios = visibleScenarios(db, user).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const create = () => {
    const s = run((d, ctx) => createScenario(d, ctx, { name: 'Nuevo escenario' }), 'Escenario creado');
    if (s) navigate(`/calculadora/${s.id}`);
  };
  return (
    <div>
      <PageHeader
        title="Calculadora COMEX"
        description="Escenarios de costos y precio de exportación. Cada cambio recalcula el resultado; los escenarios nunca sobrescriben una cotización aceptada."
        actions={<Button onClick={create}><Plus /> Nuevo escenario</Button>}
      />
      {scenarios.length === 0 ? (
        <EmptyState icon={Calculator} title="Sin escenarios" description="Creá un escenario o iniciá uno desde Matching con un lote compatible." action={<Button onClick={create}><Plus /> Nuevo escenario</Button>} />
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Escenario</TH><TH>Comprador</TH><TH>Condición</TH><TH className="text-right">Precio/t</TH><TH>Cotización</TH><TH>Actualizado</TH></TR></THead>
            <TBody>
              {scenarios.map((s) => {
                const r = evaluateScenario(db, s, todayISO()).result;
                const q = byId(db.quotations, s.quotationId);
                return (
                  <TR key={s.id}>
                    <TD><Link to={`/calculadora/${s.id}`} className="font-medium text-petrol-700 hover:underline">{s.name}</Link></TD>
                    <TD className="text-xs">{orgName(db, s.buyerOrganizationId)}</TD>
                    <TD className="text-xs">{s.commercial.incoterm} {s.commercial.namedPlace} · {s.quantityT} t</TD>
                    <TD className="num text-right">{r.pricePerT ? fmtMoney(r.pricePerT, r.currency) : <span className="text-xs text-red-600">Incompleto</span>}</TD>
                    <TD>{q ? <Link to={`/cotizaciones/${q.id}`} className="mono text-xs text-petrol-700 hover:underline">{q.code}</Link> : <Badge>Sin cotizar</Badge>}</TD>
                    <TD className="text-xs">{fmtDateTime(s.updatedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function ScenarioEditor({ scenarioId }: { scenarioId: string }) {
  const db = useDb();
  const run = useApp((s) => s.run);
  const navigate = useNavigate();
  const draft = useScenarioDraft(scenarioId);
  const [quoting, setQuoting] = useState(false);
  if (!draft) {
    return <EmptyState icon={Calculator} title="Escenario no disponible" action={<Button asChild variant="secondary"><Link to="/calculadora">Volver</Link></Button>} />;
  }
  const { scenario: s, update } = draft;
  const quotation = byId(db.quotations, s.quotationId);
  const currentVersion = byId(db.quotationVersions, quotation?.currentVersionId);

  return (
    <div>
      <PageHeader
        title="Calculadora COMEX"
        badge={quotation ? <Link to={`/cotizaciones/${quotation.id}`}><Badge tone="petrol">{quotation.code} · v{currentVersion?.version}</Badge></Link> : <Badge>Escenario sin cotizar</Badge>}
        description={<span className="flex flex-wrap items-center gap-2">Escenario: <Input aria-label="Nombre del escenario" className="h-8 w-72" value={s.name} onChange={(e) => update({ name: e.target.value })} />{currentVersion ? <VersionStatusBadge status={currentVersion.status} /> : null}</span>}
        actions={
          <>
            <Button variant="secondary" onClick={() => { draft.flush(); const c = run((d, ctx) => duplicateScenario(d, ctx, s.id), 'Escenario duplicado'); if (c) navigate(`/calculadora/${c.id}`); }}><Copy /> Duplicar</Button>
            <Button variant="ghost" onClick={() => { draft.flush(); if (run((d, ctx) => archiveScenario(d, ctx, s.id), 'Escenario archivado')) navigate('/calculadora'); }}><Archive /> Archivar</Button>
            <Button onClick={() => setQuoting(true)}><FileText /> {quotation ? 'Nueva versión' : 'Generar cotización'}</Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <ProductSection draft={draft} />
          <PartiesSection draft={draft} />
          <CommercialSection draft={draft} />
          <CostLinesSection draft={draft} />
          <CustomsSection draft={draft} />
          <FinanceSection draft={draft} />
        </div>
        <div className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <ResultsPanel draft={draft} />
        </div>
      </div>
      {quoting ? <QuoteDialog draft={draft} onClose={() => setQuoting(false)} /> : null}
    </div>
  );
}

export default function CalculatorPage() {
  const { scenarioId } = useParams();
  return scenarioId ? <ScenarioEditor key={scenarioId} scenarioId={scenarioId} /> : <ScenarioList />;
}
