import { Menu, UserCircle2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { ROLE_LABEL } from '@/utils/permissions';
import { initials } from '@/utils/format';

/** Barra superior con selector de usuario (sesión simulada para el prototipo). */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { db, user, setUserId } = useData();
  const active = db.users.filter((u) => u.active);
  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center gap-3 px-4 sm:px-6 no-print">
      <button className="btn-icon lg:hidden" onClick={onMenu} aria-label="Abrir menú">
        <Menu size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{db.settings.companyName}</div>
        <div className="text-xs text-slate-500 truncate">{db.settings.plantName}</div>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="hidden sm:flex h-9 w-9 rounded-full bg-brand-100 text-brand-700 items-center justify-center text-xs font-semibold" aria-hidden>
          {initials(user.name)}
        </div>
        <div className="flex flex-col">
          <label htmlFor="user-switch" className="sr-only">
            Usuario actual
          </label>
          <div className="relative">
            <UserCircle2 size={16} className="sm:hidden absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <select
              id="user-switch"
              value={user.id}
              onChange={(e) => setUserId(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 pl-7 sm:pl-2.5 pr-8 text-sm font-medium text-slate-800 hover:border-slate-300 max-w-[210px]"
              title="Sesión simulada: cambia de usuario para probar los permisos de cada rol"
            >
              {(['operator', 'supervisor', 'admin'] as const).map((role) => (
                <optgroup key={role} label={ROLE_LABEL[role]}>
                  {active
                    .filter((u) => u.role === role)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {ROLE_LABEL[u.role]}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
