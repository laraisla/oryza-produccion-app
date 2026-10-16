import { ArrowLeft, ClipboardList, GitCompareArrows, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RequestStatusBadge, VersionStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState, KeyValue, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can, canViewRequest } from '@/data/access';
import { byId } from '@/data/derive';
import { countryName, orgName, portName, visibleQuotations } from '@/data/selectors';
import { setRequestStatus } from '@/data/services/requests';
import { useApp, useCurrentUser, useDb } from '@/data/store';
import { PACKAGING_TYPES, PROCESSING, RICE_TYPES } from '@/domain/catalogs';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtTons } from '@/domain/format';
import { RequestFormDialog } from './RequestForm';

export default function RequestDetailPage() {
  const { requestId } = useParams();
  const db = useDb();
  const user = useCurrentUser();
  const run = useApp((s) => s.run);
  const [editing, setEditing] = useState(false);
  const request = byId(db.requests, requestId);
  if (!request || !canViewRequest(user, request)) {
    return <EmptyState icon={ClipboardList} title="Solicitud no disponible" description="No existe o no es visible para tu organización." action={<Button asChild variant="secondary"><Link to="/solicitudes">Volver</Link></Button>} />;
  }
  const own = request.buyerOrganizationId === user.organizationId && can(user, 'request.manage');
  const quotations = visibleQuotations(db, user).filter((q) => q.requestId === request.id);
  const open = request.status === 'published' || request.status === 'negotiating' || request.status === 'draft';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Solicitud ${request.code}`}
        badge={<RequestStatusBadge status={request.status} />}
        description={`${orgName(db, request.buyerOrganizationId)} · creada el ${fmtDateTime(request.createdAt)}`}
        actions={
          <>
            <Button asChild variant="ghost"><Link to="/solicitudes"><ArrowLeft /> Solicitudes</Link></Button>
            <Button asChild variant="secondary"><Link to={`/matching?request=${request.id}`}><GitCompareArrows /> Ver matching</Link></Button>
            {own && open ? <Button variant="secondary" onClick={() => setEditing(true)}><Pencil /> Editar</Button> : null}
            {own && request.status === 'draft' ? <Button onClick={() => run((d, ctx) => setRequestStatus(d, ctx, request.id, 'published'), 'Solicitud publicada')}>Publicar</Button> : null}
            {own && open ? <Button variant="danger" onClick={() => run((d, ctx) => setRequestStatus(d, ctx, request.id, 'cancelled'), 'Solicitud cancelada')}>Cancelar solicitud</Button> : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Requisitos del comprador" description="Los criterios excluyentes nunca se compensan con puntajes de otros atributos" />
          <CardContent>
            <KeyValue
              columns={3}
              items={[
                { label: 'Tipo comercial', value: RICE_TYPES[request.commercialType] },
                { label: 'Grado de elaboración', value: PROCESSING[request.processing] },
                { label: 'Variedad', value: request.varietyPolicy === 'exact' ? `${request.variety} (exacta)` : 'Admite equivalentes' },
                { label: 'Quebrado máximo', value: `${fmtNum(request.maxBrokenPct)} %` },
                { label: 'Humedad máxima', value: request.maxMoisturePct ? `${fmtNum(request.maxMoisturePct)} %` : 'No especificada' },
                { label: 'Impurezas máximas', value: request.maxImpuritiesPct ? `${fmtNum(request.maxImpuritiesPct)} %` : 'No especificadas' },
                { label: 'Cantidad mínima', value: fmtTons(request.quantityT) },
                { label: 'Presentación', value: `${PACKAGING_TYPES[request.packaging.type]}${request.packaging.netWeightKg ? ` ${request.packaging.netWeightKg} kg` : ''}${request.packagingFlexible ? ' (acepta otra)' : ' (excluyente)'}` },
                { label: 'Consolidación', value: request.allowConsolidation ? 'Admite consolidar lotes' : 'No admite' },
                { label: 'Destino', value: `${countryName(request.destinationCountry)} · ${portName(db, request.destinationPortId)}` },
                { label: 'Disponible antes del', value: fmtDate(request.availabilityDeadline) },
                { label: 'Entrega', value: fmtDate(request.deliveryDate) },
                { label: 'Moneda / Incoterm preferido', value: `${request.currency} · ${request.preferredIncoterm ?? 'sin preferencia'}` },
                { label: 'Certificaciones exigidas', value: request.requiredCertifications.join(', ') || 'Ninguna' },
                { label: 'Documentos del importador', value: request.buyerDocuments.map((d) => d.name).join(', ') || 'Ninguno' },
              ]}
            />
            {request.notes ? <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">{request.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Contacto" />
          <CardContent>
            <KeyValue columns={1} items={[{ label: 'Persona', value: request.contactName }, { label: 'Email', value: request.contactEmail || '—' }, { label: 'Visibilidad', value: request.visibility === 'public' ? 'Pública' : `Privada (${request.invitedOrganizationIds.map((id) => orgName(db, id)).join(', ') || 'sin invitados'})` }]} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader title="Cotizaciones vinculadas" description="Visibles según tu organización: el comprador no ve costos internos del vendedor" />
        {quotations.length === 0 ? (
          <CardContent><p className="text-sm text-slate-500">Todavía no hay cotizaciones para esta solicitud.</p></CardContent>
        ) : (
          <Table>
            <THead><TR><TH>Cotización</TH><TH>Vendedor</TH><TH>Versión vigente</TH><TH className="text-right">Precio</TH><TH>Estado</TH></TR></THead>
            <TBody>
              {quotations.map((q) => {
                const v = byId(db.quotationVersions, q.acceptedVersionId ?? q.currentVersionId);
                return (
                  <TR key={q.id}>
                    <TD><Link className="mono font-medium text-petrol-700 hover:underline" to={`/cotizaciones/${q.id}`}>{q.code}</Link></TD>
                    <TD>{orgName(db, q.sellerOrganizationId)}</TD>
                    <TD>v{v?.version} · {v?.incoterm} {v?.namedPlace}</TD>
                    <TD className="num text-right">{v ? `${fmtMoney(v.pricePerT, v.currency)}/t` : '—'}</TD>
                    <TD>{v ? <VersionStatusBadge status={v.status} /> : null}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {editing ? <RequestFormDialog request={request} open onOpenChange={setEditing} /> : null}
    </div>
  );
}
