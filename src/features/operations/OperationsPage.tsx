import { Ship } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OperationStatusBadge, ReconciliationBadge, ShipmentStatusBadge } from '@/components/status';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader, Progress } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { byId } from '@/data/derive';
import { financeVisible, orgName, productLabel, visibleDocuments, visibleOperations } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { documentProgress } from '@/domain/documents';
import { fmtDate, fmtMoney, fmtTons } from '@/domain/format';

export default function OperationsPage() {
  const db = useDb();
  const user = useCurrentUser();
  const operations = visibleOperations(db, user).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div>
      <PageHeader title="Operaciones y embarques" description="Cada expediente reúne comprador, vendedor, lotes, versión aceptada, documentos, embarque, cobros y evidencia Stellar." />
      {operations.length === 0 ? (
        <EmptyState icon={Ship} title="Sin operaciones" description="Se crean al aceptar una cotización o desde el asistente de nueva operación." />
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Operación</TH><TH>Vendedor / comprador</TH><TH>Producto</TH><TH className="text-right">Cantidad / importe</TH><TH>Embarque</TH><TH className="w-40">Documentos</TH><TH>Cobro</TH><TH>Estado</TH></TR></THead>
            <TBody>
              {operations.map((op) => {
                const progress = documentProgress(visibleDocuments(db, user, op.id));
                const shipment = db.shipments.find((s) => s.operationId === op.id);
                const rec = db.reconciliations.find((r) => r.operationId === op.id);
                return (
                  <TR key={op.id}>
                    <TD><Link to={`/operaciones/${op.id}`} className="mono font-medium text-petrol-700 hover:underline">{op.code}</Link><p className="text-[11px] text-slate-500">{op.incoterm} {op.namedPlace} · embarque {fmtDate(op.shipmentDate)}</p></TD>
                    <TD className="text-xs">{orgName(db, op.sellerOrganizationId)}<br />→ {orgName(db, op.buyerOrganizationId)}</TD>
                    <TD className="text-xs">{productLabel(byId(db.products, op.productId))}</TD>
                    <TD className="num text-right text-xs">{fmtTons(op.quantityT)}<br />{fmtMoney(op.totalAmount, op.currency)}</TD>
                    <TD>{shipment ? <ShipmentStatusBadge status={shipment.status} /> : <span className="text-xs text-slate-400">Sin planificar</span>}</TD>
                    <TD><Progress value={progress.pct} tone={progress.pct >= 80 ? 'success' : 'petrol'} label={`Documentación ${op.code}`} /><p className="mt-1 text-[11px] text-slate-500">{progress.pct} %</p></TD>
                    <TD>{financeVisible(db, user, op.id) && rec ? <ReconciliationBadge status={rec.status} /> : <span className="text-xs text-slate-400">—</span>}</TD>
                    <TD><OperationStatusBadge status={op.status} /></TD>
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
