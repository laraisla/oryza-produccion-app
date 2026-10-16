import { ArrowLeft, FileText, FolderCheck, History, Landmark, LayoutList, Ship, ShieldCheck } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { OperationStatusBadge, ReconciliationBadge, ShipmentStatusBadge, VerificationBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, Hash, KeyValue, PageHeader, Progress } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canViewFinance, canViewOperation } from '@/data/access';
import { byId } from '@/data/derive';
import { countryName, orgName, portName, presentationLabel, productLabel, visibleDocuments } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { PAYMENT_METHODS } from '@/domain/catalogs';
import { documentProgress } from '@/domain/documents';
import { fmtDate, fmtDateTime, fmtMoney, fmtTons } from '@/domain/format';
import { DocumentChecklist } from '../documents/DocumentChecklist';
import { ReconciliationPanel } from '../finance/ReconciliationPanel';
import { OperationTrace } from '../traceability/TraceabilityPage';
import { ShipmentPanel } from './ShipmentPanel';

const StellarPanel = lazy(() => import('../stellar/StellarPanel'));

export default function OperationDetailPage() {
  const { operationId } = useParams();
  const [params, setParams] = useSearchParams();
  const db = useDb();
  const user = useCurrentUser();
  const op = byId(db.operations, operationId);
  if (!op || !canViewOperation(user, op)) {
    return <EmptyState icon={Ship} title="Operación no disponible" description="No existe o tu organización no participa en ella." action={<Button asChild variant="secondary"><Link to="/operaciones">Volver</Link></Button>} />;
  }
  const tab = params.get('tab') ?? 'resumen';
  const quotation = byId(db.quotations, op.quotationId);
  const version = byId(db.quotationVersions, op.acceptedVersionId);
  const product = byId(db.products, op.productId);
  const progress = documentProgress(visibleDocuments(db, user, op.id));
  const shipment = db.shipments.find((s) => s.operationId === op.id);
  const rec = db.reconciliations.find((r) => r.operationId === op.id);
  const finance = canViewFinance(user, op);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Expediente ${op.code}`}
        badge={<OperationStatusBadge status={op.status} />}
        description={`${orgName(db, op.sellerOrganizationId)} → ${orgName(db, op.buyerOrganizationId)} · creado el ${fmtDateTime(op.createdAt)}`}
        actions={<Button asChild variant="ghost"><Link to="/operaciones"><ArrowLeft /> Operaciones</Link></Button>}
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="resumen"><LayoutList /> Resumen</TabsTrigger>
          <TabsTrigger value="documentos"><FolderCheck /> Documentos</TabsTrigger>
          <TabsTrigger value="embarque"><Ship /> Embarque</TabsTrigger>
          {finance ? <TabsTrigger value="finanzas"><Landmark /> Finanzas</TabsTrigger> : null}
          <TabsTrigger value="trazabilidad"><History /> Trazabilidad</TabsTrigger>
          <TabsTrigger value="stellar"><ShieldCheck /> Stellar</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-5">
          {op.status === 'negotiation' ? <Alert tone="info" title="Expediente en negociación">La documentación puede prepararse; el stock se compromete cuando el comprador acepta la cotización.</Alert> : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-slate-500">Documentación</p><Progress value={progress.pct} tone={progress.pct >= 80 ? 'success' : 'petrol'} /><p className="mt-1 text-sm">{progress.pct} % · {progress.verified} verificados de {progress.applicable}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Logística</p><div className="mt-1">{shipment ? <ShipmentStatusBadge status={shipment.status} /> : <span className="text-sm text-slate-500">Sin embarque planificado</span>}</div>{shipment?.shippedQuantityT ? <p className="mt-1 text-sm">{fmtTons(shipment.shippedQuantityT)} embarcadas el {fmtDate(shipment.shippedAt)}</p> : null}</Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Cobro y conciliación</p><div className="mt-1">{finance && rec ? <ReconciliationBadge status={rec.status} /> : <span className="text-sm text-slate-500">{finance ? 'Sin datos' : 'Privado del vendedor'}</span>}</div></Card>
          </div>
          <Card>
            <CardHeader title="Condiciones pactadas" description="Provienen de la versión aceptada: no se editan en el expediente" icon={<FileText />} actions={quotation ? <Button asChild size="sm" variant="secondary"><Link to={`/cotizaciones/${quotation.id}`}>{quotation.code} · v{version?.version ?? '—'}</Link></Button> : undefined} />
            <CardContent>
              <KeyValue
                columns={3}
                items={[
                  { label: 'Producto', value: productLabel(product) },
                  { label: 'Cantidad', value: fmtTons(op.quantityT) },
                  { label: 'Precio', value: `${fmtMoney(op.pricePerT, op.currency)}/t` },
                  { label: 'Importe total', value: fmtMoney(op.totalAmount, op.currency) },
                  { label: 'Incoterm', value: `${op.incoterm} 2020 · ${op.namedPlace}` },
                  { label: 'Fecha de embarque', value: fmtDate(op.shipmentDate) },
                  { label: 'Forma de pago', value: PAYMENT_METHODS[op.paymentMethod] },
                  { label: 'Condición de pago', value: op.paymentTerms },
                  { label: 'Destino', value: `${countryName(op.destinationCountry)} · ${portName(db, op.destinationPortId)}` },
                  { label: 'Confirmada', value: fmtDateTime(op.confirmedAt) },
                  { label: 'Hash de términos', value: <Hash value={op.termsHash} length={16} /> },
                  { label: 'Solicitud', value: byId(db.requests, op.requestId)?.code ?? '—' },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Lotes de la operación" description="Un lote puede asignarse parcialmente a distintas operaciones" />
            <Table>
              <THead><TR><TH>Lote</TH><TH>Presentación</TH><TH>Calidad</TH><TH className="text-right">Cantidad asignada</TH></TR></THead>
              <TBody>
                {op.lots.map((part) => {
                  const lot = byId(db.lots, part.lotId);
                  const p = byId(db.products, lot?.productId);
                  return (
                    <TR key={part.lotId}>
                      <TD className="mono">{lot?.code ?? 'Lote de otra organización'}</TD>
                      <TD className="text-xs">{presentationLabel(p?.presentations.find((x) => x.id === lot?.presentationId))}</TD>
                      <TD className="text-xs">Quebrado {lot?.quality.brokenPct ?? '—'} % · humedad {lot?.quality.moisturePct ?? '—'} % {lot ? <VerificationBadge status={lot.quality.verificationStatus} /> : null}</TD>
                      <TD className="num text-right">{fmtTons(part.quantityT)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="documentos"><DocumentChecklist operationId={op.id} /></TabsContent>
        <TabsContent value="embarque"><ShipmentPanel operationId={op.id} /></TabsContent>
        {finance ? <TabsContent value="finanzas"><ReconciliationPanel operationId={op.id} /></TabsContent> : null}
        <TabsContent value="trazabilidad"><OperationTrace operationId={op.id} /></TabsContent>
        <TabsContent value="stellar">
          <Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">Cargando módulo Stellar…</p>}>
            <StellarPanel operationId={op.id} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
