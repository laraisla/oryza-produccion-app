import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  CalendarCheck,
  ClipboardList,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Package,
  PlusCircle,
  ScanSearch,
  Settings,
  Upload,
  Users,
  Wheat,
  Boxes,
  Factory,
  Clock,
  OctagonPause,
} from 'lucide-react';
import type { User } from '@/types/domain';
import { can } from '@/utils/permissions';

interface Item {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  show?: (u: User) => boolean;
  badge?: number;
}

export function Sidebar({ user, pending, alerts, onNavigate }: { user: User; pending: number; alerts: number; onNavigate?: () => void }) {
  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
    {
      title: 'Producción',
      items: [
        { to: '/registros/nuevo', label: 'Nuevo registro', icon: PlusCircle },
        { to: '/registros', label: 'Registros', icon: ClipboardList, badge: can.viewAllRecords(user) ? pending : undefined },
        { to: '/trazabilidad', label: 'Trazabilidad', icon: ScanSearch },
        { to: '/cierre', label: 'Cierre diario', icon: CalendarCheck, show: can.closeDay },
        { to: '/reportes', label: 'Reportes', icon: BarChart3, show: can.viewReports },
        { to: '/alertas', label: 'Alertas', icon: Bell, badge: alerts || undefined },
      ],
    },
    {
      title: 'Administración',
      items: [
        { to: '/admin/productos', label: 'Productos', icon: Package, show: can.admin },
        { to: '/admin/variedades', label: 'Variedades', icon: Wheat, show: can.admin },
        { to: '/admin/presentaciones', label: 'Presentaciones', icon: Boxes, show: can.admin },
        { to: '/admin/lineas', label: 'Líneas', icon: Factory, show: can.admin },
        { to: '/admin/turnos', label: 'Turnos', icon: Clock, show: can.admin },
        { to: '/admin/paradas', label: 'Tipos de parada', icon: OctagonPause, show: can.admin },
        { to: '/admin/usuarios', label: 'Usuarios', icon: Users, show: can.admin },
        { to: '/admin/importar', label: 'Importar datos', icon: Upload, show: can.admin },
        { to: '/admin/auditoria', label: 'Auditoría', icon: History, show: can.viewAudit },
        { to: '/admin/configuracion', label: 'Configuración', icon: Settings, show: can.admin },
      ],
    },
  ];

  return (
    <nav className="flex h-full flex-col bg-brand-900 text-slate-300" aria-label="Menú principal">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 shrink-0">
        <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
          <FileSpreadsheet size={17} className="text-white" aria-hidden />
        </div>
        <div className="leading-tight">
          <div className="text-white font-semibold tracking-wide">ORYZA</div>
          <div className="text-[11px] text-slate-400">Producción y Fraccionado</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        {groups.map((g, gi) => {
          const items = g.items.filter((i) => !i.show || i.show(user));
          if (!items.length) return null;
          return (
            <div key={gi} className="mb-3">
              {g.title && <div className="px-5 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</div>}
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/' || i.to === '/registros'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <i.icon size={17} aria-hidden />
                  <span className="flex-1">{i.label}</span>
                  {i.badge ? (
                    <span className="min-w-[20px] rounded-full bg-warn px-1.5 text-center text-[11px] font-semibold text-brand-900">{i.badge}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>
      <div className="px-5 py-3 text-[11px] text-slate-500 border-t border-white/10">Módulo: Fraccionamiento · MVP v1.0</div>
    </nav>
  );
}
