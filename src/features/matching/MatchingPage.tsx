import { ChevronDown, ChevronRight, CircleCheck, CircleHelp, CircleX, GitCompareArrows, Layers, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MatchBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { Alert, EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import { byId, lotOffer, requestCriteria } from '@/data/derive';
import { countryName, orgName, visibleLots, visibleRequests } from '@/data/selectors';
import { saveMatchSnapshot } from '@/data/services/requests';
import { createScenario } from '@/data/services/scenarios';
import { todayISO, useApp, useCurrentUser, useDb } from '@/data/store';
import { PACKAGING_TYPES, PROCESSING, RICE_TYPES } from '@/domain/catalogs';
import { fmtNum, fmtTons } from '@/domain/format';
import { evaluateRequest, MATCH_STATUS_LABEL, suggestConsolidation, type CheckStatus, type MatchResult, type MatchStatus } from '@/domain/matching';

const CHECK_ICON: Record<CheckStatus, ReactNode> = {
  pass: <CircleCheck className="size-4 text-emerald-600" aria-label="Cumple" />,
  fail: <CircleX className="size-4 text-red-600" aria-label="No cumple" />,
  conditional: <TriangleAlert className="size-4 text-amber-600" aria-label="Con condiciones" />,
  missing: <CircleHelp className="size-4 text-slate-500" aria-label="Falta información" />,
};

function ResultCard({ result, requestId, ownOrg }: { result: MatchResult; requestId: string; ownOrg: string }) {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const navigate = useNavigate();
  const [open, setOpen] = useState(result.status !== 'incompatible');
  const lot = byId(db.lots, result.lotId);
  const product = byId(db.products, lot?.productId);
  const isOwn = result.organizationId === ownOrg;
  const canQuote = isOwn && can(user, 'scenario.manage') && result.status !== 'incompatible';

  const quote = () => {
    const scenario = run((d, ctx) => {
      const snap = saveMatchSnapshot(d, ctx, requestId, result.lotId);
      return createScenario(snap.db, ctx, { requestId, lotId: result.lotId });
    }, 'Escenario de cotización creado con los datos del lote y la solicitud');
    if (scenario) navigate(`/calculadora/${scenario.id}`);
  };

  return (
    <Card className={result.status === 'incompatible' ? 'border-red-100' : result.status === 'conditional' ? 'border-amber-200' : 'border-emerald-200'}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
          <span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="mono font-semibold text-slate-900">{result.lotCode}</span>
              <MatchBadge status={result.status} />
              {isOwn ? <Badge tone="petrol">Lote propio</Badge> : null}
            </span>
            <span className="block text-xs text-slate-500">
              {result.organizationName} · {product ? `${RICE_TYPES[product.commercialType]} · ${PROCESSING[product.processing]}` : ''}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          {canQuote ? (
            <Button size="sm" variant={result.status === 'compatible' ? 'success' : 'secondary'} onClick={quote}>
              {result.status === 'compatible' ? 'Cotizar con este lote' : 'Cotizar con condiciones'}
            </Button>
          ) : result.status === 'incompatible' ? (
            <span className="text-xs text-slate-500">Sin acción: incumple requisitos excluyentes</span>
          ) : !isOwn ? (
            <span className="text-xs text-slate-500">Lo cotiza su vendedor</span>
          ) : null}
        </div>
      </div>
      {result.failures.length > 0 ? (
        <div className="border-t border-red-100 bg-red-50/60 px-4 py-2 text-sm text-red-800">
          {result.failures.map((f) => <p key={f}>• {f}</p>)}
        </div>
      ) : null}
      {result.status === 'conditional' ? (
        <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-2 text-sm text-amber-900">
          {result.conditions.map((c) => <p key={c}>• {c}</p>)}
        </div>
      ) : null}
      {open ? (
        <Table>
          <THead><TR><TH className="w-8" /><TH>Criterio</TH><TH>Requerido</TH><TH>Ofrecido</TH><TH>Tipo</TH><TH>Explicación</TH></TR></THead>
          <TBody>
            {result.checks.map((c) => (
              <TR key={`${c.criterion}-${c.label}`}>
                <TD>{CHECK_ICON[c.status]}</TD>
                <TD className="font-medium text-slate-800">{c.label}</TD>
                <TD className="text-xs">{c.required}</TD>
                <TD className="text-xs">{c.offered}</TD>
                <TD>{c.mandatory ? <Badge tone="outline">Excluyente</Badge> : <Badge>Condicionante</Badge>}</TD>
                <TD className="text-xs text-slate-600">{c.explanation}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}
    </Card>
  );
}

export default function MatchingPage() {
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requests = visibleRequests(db, user).filter((r) => r.status === 'published' || r.status === 'negotiating' || r.buyerOrganizationId === user.organizationId);
  const request = byId(db.requests, params.get('request')) ?? requests[0];
  const asOf = todayISO();
  const lots = visibleLots(db, user).filter((l) => l.status === 'active');
  const offers = useMemo(() => lots.map((l) => lotOffer(db, l, asOf)).filter((o) => o !== null), [db, lots, asOf]);
  const results = useMemo(() => (request ? evaluateRequest(requestCriteria(request), offers) : []), [request, offers]);
  const consolidation = useMemo(() => (request ? suggestConsolidation(requestCriteria(request), results, offers) : null), [request, results, offers]);
  const groups: MatchStatus[] = ['compatible', 'conditional', 'incompatible'];

  if (!request) {
    return (
      <div>
        <PageHeader title="Matching inteligente" />
        <EmptyState icon={GitCompareArrows} title="No hay solicitudes para evaluar" description="Publicá o seleccioná una solicitud de compra." action={<Button asChild><Link to="/solicitudes">Ir a solicitudes</Link></Button>} />
      </div>
    );
  }

  const ownConsolidation = consolidation?.parts.every((p) => p.organizationId === user.organizationId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Matching inteligente"
        description="Compara la solicitud con los lotes publicados y propios. Primero aplica filtros excluyentes; ningún puntaje compensa un incumplimiento."
      />
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="w-full max-w-md">
            <label htmlFor="req" className="mb-1 block text-xs font-medium text-slate-700">Solicitud de compra</label>
            <Select id="req" value={request.id} onChange={(e) => setParams({ request: e.target.value })}>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {orgName(db, r.buyerOrganizationId)} · {RICE_TYPES[r.commercialType]} {fmtNum(r.quantityT)} t
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge tone="petrol">{RICE_TYPES[request.commercialType]}</Badge>
            <Badge tone="petrol">{PROCESSING[request.processing]}</Badge>
            <Badge tone="petrol">Quebrado ≤ {fmtNum(request.maxBrokenPct)} %</Badge>
            {request.maxMoisturePct ? <Badge tone="petrol">Humedad ≤ {fmtNum(request.maxMoisturePct)} %</Badge> : null}
            <Badge tone="petrol">{fmtTons(request.quantityT, 0)}</Badge>
            <Badge tone="petrol">{PACKAGING_TYPES[request.packaging.type]} {request.packaging.netWeightKg ?? ''} kg</Badge>
            <Badge tone="petrol">{countryName(request.destinationCountry)}</Badge>
            {request.requiredCertifications.map((c) => <Badge key={c} tone="warning">{c}</Badge>)}
            {request.allowConsolidation ? <Badge tone="info">Admite consolidación</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {groups.map((g) => (
          <div key={g} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-xs text-slate-500">{MATCH_STATUS_LABEL[g]}</p>
            <p className="num text-xl font-semibold">{results.filter((r) => r.status === g).length}</p>
          </div>
        ))}
      </div>

      {results.every((r) => r.status === 'incompatible') ? (
        <Alert tone="warning" title="Ningún lote cumple los requisitos excluyentes">
          La solicitud pide {RICE_TYPES[request.commercialType].toLowerCase()} {PROCESSING[request.processing].toLowerCase()}; revisá las causas específicas de cada lote. Una diferencia de tipo comercial no se resuelve modificando el precio.
        </Alert>
      ) : null}

      {consolidation ? (
        <Card className="border-sky-200">
          <CardHeader title="Sugerencia de consolidación (con condiciones)" description="Combina lotes que cumplen todo salvo el volumen. No se reservó stock." icon={<Layers />} />
          <Table>
            <THead><TR><TH>Lote</TH><TH>Proveedor</TH><TH className="text-right">Toma</TH></TR></THead>
            <TBody>
              {consolidation.parts.map((p) => (
                <TR key={p.lotId}><TD className="mono">{p.lotCode}</TD><TD>{p.organizationName}</TD><TD className="num text-right">{fmtTons(p.takeT)}</TD></TR>
              ))}
            </TBody>
          </Table>
          <CardContent className="space-y-1 text-xs text-slate-600">
            <p className="font-medium text-slate-800">Total {fmtTons(consolidation.totalT)} de {fmtTons(consolidation.requestedT)} solicitadas</p>
            {consolidation.notes.map((n) => <p key={n}>• {n}</p>)}
            {ownConsolidation && can(user, 'scenario.manage') ? (
              <Button
                className="mt-2"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const s = run((d, ctx) => createScenario(d, ctx, { requestId: request.id, lots: consolidation.parts.map((p) => ({ lotId: p.lotId, quantityT: p.takeT })), name: `Consolidación ${request.code}` }), 'Escenario consolidado creado');
                  if (s) navigate(`/calculadora/${s.id}`);
                }}
              >
                Crear escenario consolidado
              </Button>
            ) : (
              <p className="pt-1 text-amber-800">Incluye lotes de otros proveedores: coordinar la consolidación fuera del escenario de un solo vendedor.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {results.map((r) => <ResultCard key={`${request.id}-${r.lotId}`} result={r} requestId={request.id} ownOrg={user.organizationId} />)}
      </div>
      <p className="text-[11px] text-slate-500">
        Motor {results[0]?.engineVersion ?? 'matching/1.0.0'} · reglas centralizadas y deterministas, sin IA generativa. El orden dentro de cada grupo no altera la clasificación.
      </p>
    </div>
  );
}
