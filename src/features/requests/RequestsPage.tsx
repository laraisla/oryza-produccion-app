import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RequestStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import { byId, presentationOf } from '@/data/derive';
import { countryName, orgName, portName, visibleRequests } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { PACKAGING_TYPES, PROCESSING, REQUEST_STATUS, RICE_TYPES, type RequestStatus } from '@/domain/catalogs';
import { fmtDate, fmtNum, fmtTons } from '@/domain/format';
import { RequestFormDialog } from './RequestForm';

export default function RequestsPage() {
  const db = useDb();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [scope, setScope] = useState<'all' | 'mine'>(can(user, 'request.manage') ? 'mine' : 'all');
  const creating = params.get('nueva') === '1';
  const fromLot = byId(db.lots, params.get('lote'));
  const lotProduct = byId(db.products, fromLot?.productId);
  const lotPresentation = presentationOf(lotProduct, fromLot?.presentationId);
  const initial = fromLot && lotProduct
    ? {
        commercialType: lotProduct.commercialType,
        processing: lotProduct.processing,
        maxBrokenPct: fromLot.quality.brokenPct ?? '5',
        packaging: { type: lotPresentation?.packaging ?? 'bag', netWeightKg: lotPresentation?.netWeightKg ?? null },
        notes: `Interés en el lote publicado ${fromLot.code} de ${orgName(db, fromLot.organizationId)}.`,
        visibility: 'private' as const,
        invitedOrganizationIds: [fromLot.organizationId],
      }
    : undefined;
  const requests = visibleRequests(db, user)
    .filter((r) => !status || r.status === status)
    .filter((r) => scope === 'all' || r.buyerOrganizationId === user.organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div>
      <PageHeader
        title="Solicitudes de compra"
        description="Demanda estandarizada: tipo, elaboración, calidad, volumen, presentación, destino y plazos. Una solicitud (RFQ) no es un contrato."
        actions={can(user, 'request.manage') ? <Button onClick={() => setParams({ nueva: '1' })}><Plus /> Nueva solicitud</Button> : undefined}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="Estado" className="w-48" value={status} onChange={(e) => setStatus(e.target.value as RequestStatus | '')}>
          <option value="">Todos los estados</option>
          {Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {can(user, 'request.manage') ? (
          <Select aria-label="Alcance" className="w-56" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'mine')}>
            <option value="mine">Solicitudes de mi empresa</option>
            <option value="all">Todas las visibles</option>
          </Select>
        ) : null}
      </div>
      {requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin solicitudes" description="No hay solicitudes con los filtros elegidos." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR><TH>Código</TH><TH>Comprador</TH><TH>Producto</TH><TH>Calidad</TH><TH className="text-right">Cantidad</TH><TH>Presentación</TH><TH>Destino</TH><TH>Plazo</TH><TH>Estado</TH><TH /></TR>
            </THead>
            <TBody>
              {requests.map((r) => (
                <TR key={r.id}>
                  <TD><Link to={`/solicitudes/${r.id}`} className="mono font-medium text-petrol-700 hover:underline">{r.code}</Link>{r.visibility === 'private' ? <div className="mt-1"><Badge tone="outline">Privada</Badge></div> : null}</TD>
                  <TD className="text-xs">{orgName(db, r.buyerOrganizationId)}</TD>
                  <TD className="text-xs">{RICE_TYPES[r.commercialType]}<br />{PROCESSING[r.processing]}</TD>
                  <TD className="text-xs">Quebrado ≤ {fmtNum(r.maxBrokenPct)} %{r.maxMoisturePct ? <><br />Humedad ≤ {fmtNum(r.maxMoisturePct)} %</> : null}</TD>
                  <TD className="num text-right">{fmtTons(r.quantityT, 0)}</TD>
                  <TD className="text-xs">{PACKAGING_TYPES[r.packaging.type]}{r.packaging.netWeightKg ? ` ${r.packaging.netWeightKg} kg` : ''}</TD>
                  <TD className="text-xs">{countryName(r.destinationCountry)}<br />{portName(db, r.destinationPortId)}</TD>
                  <TD className="text-xs">{fmtDate(r.availabilityDeadline)}</TD>
                  <TD><RequestStatusBadge status={r.status} /></TD>
                  <TD className="text-right"><Button asChild size="sm" variant="secondary"><Link to={`/matching?request=${r.id}`}>Matching</Link></Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {creating ? <RequestFormDialog initial={initial} open onOpenChange={(v) => !v && setParams({})} /> : null}
    </div>
  );
}
