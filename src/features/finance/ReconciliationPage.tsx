import { Landmark } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Select } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { canViewFinance } from '@/data/access';
import { byId } from '@/data/derive';
import { orgName, visibleOperations } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { ReconciliationPanel } from './ReconciliationPanel';

export default function ReconciliationPage() {
  const db = useDb();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const operations = visibleOperations(db, user).filter((o) => canViewFinance(user, o) && o.status !== 'negotiation');
  const op = byId(operations, params.get('op')) ?? operations[0];
  return (
    <div className="space-y-4">
      <PageHeader title="Conciliación financiera" description="Compara valores facturados, embarcados y cobrados; identifica diferencias y su respaldo. No realiza liquidaciones bancarias reales." />
      {!op ? (
        <EmptyState icon={Landmark} title="Sin operaciones con datos financieros visibles" />
      ) : (
        <>
          <Select aria-label="Operación" className="max-w-lg" value={op.id} onChange={(e) => setParams({ op: e.target.value })}>
            {operations.map((o) => <option key={o.id} value={o.id}>{o.code} · {orgName(db, o.buyerOrganizationId)}</option>)}
          </Select>
          <ReconciliationPanel key={op.id} operationId={op.id} />
        </>
      )}
    </div>
  );
}
