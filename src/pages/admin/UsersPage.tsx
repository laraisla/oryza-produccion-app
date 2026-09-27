import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { upsertUser } from '@/services/masterDataService';
import { ROLE_LABEL } from '@/utils/permissions';
import type { Role, User } from '@/types/domain';
import { initials } from '@/utils/format';

const ROLE_DESC: Record<Role, string> = {
  operator: 'Carga producción, paradas, mermas y calidad. Envía registros a aprobación. Ve solo sus registros.',
  supervisor: 'Todo lo del operador + ve todos los registros, aprueba/rechaza, cierre diario, reportes y dashboards.',
  admin: 'Acceso total: usuarios, maestros, parámetros, importación, exportación y auditoría.',
};

export function UsersPage() {
  const { db, user } = useData();
  const { run } = useFeedback();
  const [editing, setEditing] = useState<User | null>(null);

  const save = async () => {
    if (!editing) return;
    const ok = await run(() => upsertUser(editing, user), 'Usuario guardado.');
    if (ok) setEditing(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Usuarios"
        subtitle="Prototipo con sesión simulada: el usuario activo se elige en la barra superior."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ id: '', name: '', role: 'operator', active: true, code: '' })}><Plus size={16} /> Nuevo usuario</button>}
      />
      <div className="grid gap-3 md:grid-cols-3 mb-5">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <div key={r} className="card px-4 py-3">
            <div className="text-sm font-semibold">{ROLE_LABEL[r]} <span className="text-slate-400 font-normal">· {db.users.filter((u) => u.role === r && u.active).length}</span></div>
            <p className="text-xs text-slate-500 mt-1">{ROLE_DESC[r]}</p>
          </div>
        ))}
      </div>
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Usuario</th><th>Legajo</th><th>Rol</th><th className="text-right">Registros</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="h-8 w-8 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center">{initials(u.name)}</span>
                      <span className="font-medium">{u.name}</span>
                      {u.id === user.id && <span className="text-[11px] text-slate-500">(sesión actual)</span>}
                    </div>
                  </td>
                  <td className="tabular-nums">{u.code || '—'}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td className="num">{db.records.filter((r) => r.operatorId === u.id).length}</td>
                  <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.active ? 'bg-ok-bg text-ok-text' : 'bg-slate-100 text-slate-600'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="text-right"><button className="btn-icon" onClick={() => setEditing({ ...u })} aria-label={`Editar ${u.name}`}><Pencil size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <Modal
          title={editing.id ? 'Editar usuario' : 'Nuevo usuario'}
          onClose={() => setEditing(null)}
          footer={<><button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="u-name">Nombre y apellido *</label>
              <input id="u-name" className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="u-code">Legajo</label>
              <input id="u-code" className="input" value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="u-role">Rol *</label>
              <select id="u-role" className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <p className="sm:col-span-2 text-xs text-slate-500">{ROLE_DESC[editing.role]}</p>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-700" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Usuario activo
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
