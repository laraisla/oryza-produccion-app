import { FolderCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Select } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { byId } from '@/data/derive';
import { orgName, visibleOperations } from '@/data/selectors';
import { useCurrentUser, useDb } from '@/data/store';
import { DocumentChecklist } from './DocumentChecklist';

export default function DocumentsPage() {
  const db = useDb();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const operations = visibleOperations(db, user).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const op = byId(operations, params.get('op')) ?? operations[0];
  return (
    <div className="space-y-4">
      <PageHeader title="Documentación" description="Checklist por operación con responsable, estado, fecha límite, versiones y fuente de cada requisito." />
      {!op ? (
        <EmptyState icon={FolderCheck} title="Sin operaciones" description="El checklist se genera cuando se abre un expediente o se acepta una cotización." />
      ) : (
        <>
          <Select aria-label="Operación" className="max-w-lg" value={op.id} onChange={(e) => setParams({ op: e.target.value })}>
            {operations.map((o) => <option key={o.id} value={o.id}>{o.code} · {orgName(db, o.sellerOrganizationId === user.organizationId ? o.buyerOrganizationId : o.sellerOrganizationId)}</option>)}
          </Select>
          <DocumentChecklist key={op.id} operationId={op.id} />
        </>
      )}
    </div>
  );
}
