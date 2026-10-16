import { ArrowRight, Boxes, ClipboardList, FileText, Plus, Ship, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OperationStatusBadge, ReconciliationBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, PageHeader, Progress, StatCard } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import { stockOf } from '@/data/derive';
import {
  dashboardAlerts,
  financeVisible,
  orgName,
  ownLots,
  visibleDocuments,
  visibleOperations,
  visibleQuotations,
  visibleRequests,
  visibleTraceEvents,
  userName,
} from '@/data/selectors';
import { todayISO, useCurrentOrg, useCurrentUser, useDb } from '@/data/store';
import { sum, toPlain } from '@/domain/decimal';
import { documentProgress } from '@/domain/documents';
import { fmtDateTime, fmtMoney, fmtTons } from '@/domain/format';

export default function DashboardPage() {
  const db = useDb();
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const asOf = todayISO();
  const alerts = dashboardAlerts(db, user, asOf);
  const operations = visibleOperations(db, user);
  const quotations = visibleQuotations(db, user);
  const requests = visibleRequests(db, user);
  const lots = ownLots(db, user).filter((l) => l.status === 'active');
  const available = toPlain(sum(lots.map((l) => stockOf(db, l.id).available)));
  const committed = toPlain(sum(lots.map((l) => stockOf(db, l.id).committed)));
  const isBuyer = can(user, 'request.manage') && !can(user, 'quotation.manage');
  const activeOps = operations.filter((o) => o.status !== 'closed' && o.status !== 'cancelled');
  const events = visibleTraceEvents(db, user).slice(-8).reverse();

  return (
    <div>
      <PageHeader
        title={`Hola, ${user.name.split(' ')[0]}`}
        description={`${org.name} · resumen de la operatoria comercial al ${asOf}. Todos los indicadores se calculan a partir de los registros del sistema.`}
        actions={
          <>
            {can(user, 'request.manage') ? (
              <Button asChild variant="secondary">
                <Link to="/solicitudes?nueva=1">
                  <Plus /> Nueva solicitud
                </Link>
              </Button>
            ) : null}
            {can(user, 'lot.manage') ? (
              <Button asChild variant="secondary">
                <Link to="/productos?tab=lotes">
                  <Plus /> Nuevo lote
                </Link>
              </Button>
            ) : null}
            {can(user, 'scenario.manage') ? (
              <Button asChild>
                <Link to="/nueva-operacion">
                  <Plus /> Nueva operación
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isBuyer ? (
          <>
            <StatCard label="Solicitudes propias abiertas" value={requests.filter((r) => r.buyerOrganizationId === user.organizationId && ['published', 'negotiating'].includes(r.status)).length} icon={ClipboardList} />
            <StatCard label="Cotizaciones recibidas" value={quotations.length} hint={`${quotations.filter((q) => q.status === 'sent').length} pendientes de respuesta`} icon={FileText} />
          </>
        ) : (
          <>
            <StatCard label="Stock libre en lotes propios" value={fmtTons(available, 1)} hint={`${fmtTons(committed, 1)} comprometidas`} icon={Boxes} tone="success" />
            <StatCard label="Solicitudes de compra visibles" value={requests.filter((r) => ['published', 'negotiating'].includes(r.status)).length} hint="Publicadas o en negociación" icon={ClipboardList} />
          </>
        )}
        <StatCard label="Operaciones activas" value={activeOps.length} hint={`${operations.length} en total`} icon={Ship} />
        <StatCard label="Alertas" value={alerts.length} hint={`${alerts.filter((a) => a.level !== 'info').length} requieren acción`} icon={TriangleAlert} tone={alerts.some((a) => a.level !== 'info') ? 'warning' : 'neutral'} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Operaciones en curso" description="Avance documental, logístico y de cobro de cada expediente" icon={<Ship />} actions={<Button asChild size="sm" variant="ghost"><Link to="/operaciones">Ver todas <ArrowRight /></Link></Button>} />
          {activeOps.length === 0 ? (
            <CardContent>
              <EmptyState icon={Ship} title="Sin operaciones activas" description="Las operaciones se crean cuando el comprador acepta una cotización." />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Operación</TH>
                  <TH>Contraparte</TH>
                  <TH>Estado</TH>
                  <TH className="w-40">Documentación</TH>
                  <TH>Cobro</TH>
                  <TH className="text-right">Importe</TH>
                </TR>
              </THead>
              <TBody>
                {activeOps.map((op) => {
                  const progress = documentProgress(visibleDocuments(db, user, op.id));
                  const rec = db.reconciliations.find((r) => r.operationId === op.id);
                  const counterpart = op.sellerOrganizationId === user.organizationId ? op.buyerOrganizationId : op.sellerOrganizationId;
                  return (
                    <TR key={op.id}>
                      <TD>
                        <Link to={`/operaciones/${op.id}`} className="font-medium text-petrol-700 hover:underline">
                          {op.code}
                        </Link>
                        <p className="text-[11px] text-slate-500">{fmtTons(op.quantityT)} · {op.incoterm} {op.namedPlace}</p>
                      </TD>
                      <TD>{orgName(db, counterpart)}</TD>
                      <TD><OperationStatusBadge status={op.status} /></TD>
                      <TD>
                        <Progress value={progress.pct} tone={progress.pct >= 80 ? 'success' : 'petrol'} label={`Documentación ${op.code}`} />
                        <p className="mt-1 text-[11px] text-slate-500">{progress.verified} verificados · {progress.pending + progress.inPreparation} pendientes</p>
                      </TD>
                      <TD>{financeVisible(db, user, op.id) && rec ? <ReconciliationBadge status={rec.status} /> : <span className="text-xs text-slate-400">No visible</span>}</TD>
                      <TD className="num text-right">{fmtMoney(op.totalAmount, op.currency)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Alertas" description="Datos vencidos, documentos y diferencias que requieren revisión" icon={<TriangleAlert />} />
          <CardContent className="space-y-2">
            {alerts.length === 0 ? <p className="text-sm text-slate-500">Sin alertas para tu organización.</p> : null}
            {alerts.slice(0, 8).map((a) => (
              <Alert key={a.id} tone={a.level === 'error' ? 'error' : a.level === 'warning' ? 'warning' : 'info'} title={a.title}
                action={a.link ? <Button asChild size="sm" variant="ghost"><Link to={a.link}>Abrir</Link></Button> : undefined}>
                {a.detail}
              </Alert>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={isBuyer ? 'Mis solicitudes' : 'Demanda publicada'} description="Solicitudes de compra con criterios estandarizados" icon={<ClipboardList />} actions={<Button asChild size="sm" variant="ghost"><Link to="/solicitudes">Ver todas <ArrowRight /></Link></Button>} />
          <Table>
            <THead>
              <TR><TH>Código</TH><TH>Comprador</TH><TH>Pedido</TH><TH /></TR>
            </THead>
            <TBody>
              {requests.filter((r) => r.status === 'published' || r.status === 'negotiating').slice(0, 5).map((r) => (
                <TR key={r.id}>
                  <TD><Link to={`/solicitudes/${r.id}`} className="font-medium text-petrol-700 hover:underline">{r.code}</Link></TD>
                  <TD>{orgName(db, r.buyerOrganizationId)}</TD>
                  <TD className="text-xs">{fmtTons(r.quantityT, 0)} · quebrado ≤ {r.maxBrokenPct} % · {r.destinationCountry}</TD>
                  <TD className="text-right"><Button asChild size="sm" variant="secondary"><Link to={`/matching?request=${r.id}`}>Matching</Link></Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Actividad reciente" description="Eventos de trazabilidad visibles para tu organización" />
          <CardContent>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-petrol-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{e.title}</p>
                    <p className="text-[11px] text-slate-500">{fmtDateTime(e.at)} · {userName(db, e.actorUserId)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
