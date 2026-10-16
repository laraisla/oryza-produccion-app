import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { VersionStatusBadge } from '@/components/status';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { byId } from '@/data/derive';
import { orgName, visibleQuotations, visibleVersions } from '@/data/selectors';
import { todayISO, useCurrentUser, useDb } from '@/data/store';
import { QUOTATION_STATUS, type QuotationStatus } from '@/domain/catalogs';
import { fmtDate, fmtMoney, fmtTons } from '@/domain/format';

export default function QuotationsPage() {
  const db = useDb();
  const user = useCurrentUser();
  const [status, setStatus] = useState<QuotationStatus | ''>('');
  const asOf = todayISO();
  const quotations = visibleQuotations(db, user)
    .filter((q) => !status || q.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div>
      <PageHeader title="Cotizaciones" description="Ofertas versionadas. Una versión enviada o aceptada no se modifica: los cambios generan una nueva versión." />
      <Select aria-label="Estado" className="mb-3 w-52" value={status} onChange={(e) => setStatus(e.target.value as QuotationStatus | '')}>
        <option value="">Todos los estados</option>
        {Object.entries(QUOTATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {quotations.length === 0 ? (
        <EmptyState icon={FileText} title="Sin cotizaciones" description="Se generan desde la Calculadora COMEX o el asistente de nueva operación." />
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Código</TH><TH>Vendedor</TH><TH>Comprador</TH><TH>Versión vigente</TH><TH className="text-right">Precio</TH><TH>Vigencia</TH><TH>Estado</TH></TR></THead>
            <TBody>
              {quotations.map((q) => {
                const versions = visibleVersions(db, user, q.id);
                const v = versions.find((x) => x.id === (q.acceptedVersionId ?? q.currentVersionId)) ?? versions.at(-1);
                const expired = v?.status === 'sent' && v.validUntil < asOf;
                return (
                  <TR key={q.id}>
                    <TD><Link to={`/cotizaciones/${q.id}`} className="mono font-medium text-petrol-700 hover:underline">{q.code}</Link><p className="text-[11px] text-slate-500">{byId(db.requests, q.requestId)?.code ?? 'Sin solicitud'}</p></TD>
                    <TD className="text-xs">{orgName(db, q.sellerOrganizationId)}</TD>
                    <TD className="text-xs">{orgName(db, q.buyerOrganizationId)}</TD>
                    <TD className="text-xs">v{v?.version} · {v?.incoterm} {v?.namedPlace} · {fmtTons(v?.quantityT)}</TD>
                    <TD className="num text-right">{v ? `${fmtMoney(v.pricePerT, v.currency)}/t` : '—'}</TD>
                    <TD className="text-xs">{fmtDate(v?.validUntil)}</TD>
                    <TD>{v ? <VersionStatusBadge status={expired ? 'expired' : v.status} /> : null}</TD>
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
