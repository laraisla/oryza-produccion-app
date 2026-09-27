import { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useData } from '@/hooks/useData';
import { computeAlerts } from '@/utils/alerts';
import { addDays, today } from '@/utils/time';
import { can } from '@/utils/permissions';

export function AppLayout() {
  const { db, user } = useData();
  const [open, setOpen] = useState(false);
  const { pending, alerts } = useMemo(() => {
    const from = addDays(today(), -7);
    const visible = db.records.filter((r) => can.viewRecord(user, r));
    return {
      pending: db.records.filter((r) => r.status === 'pending').length,
      alerts: computeAlerts(db, visible.filter((r) => r.date >= from)).filter((a) => a.severity === 'critical').length,
    };
  }, [db, user]);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-40 no-print">
        <Sidebar user={user} pending={pending} alerts={alerts} />
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex no-print">
          <div className="w-72 max-w-[85vw] h-full shadow-xl">
            <Sidebar user={user} pending={pending} alerts={alerts} onNavigate={() => setOpen(false)} />
          </div>
          <button className="flex-1 bg-slate-900/40" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
        </div>
      )}
      <Topbar onMenu={() => setOpen(true)} />
      <main className="px-4 sm:px-6 py-5 sm:py-6 max-w-[1600px] mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
