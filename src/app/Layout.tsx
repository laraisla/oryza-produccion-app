import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Menu, Plus, Sprout, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { DemoBadge } from '@/components/status';
import { Toaster } from '@/components/Toaster';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { TooltipProvider } from '@/components/ui/misc';
import { can } from '@/data/access';
import { useApp, useCurrentOrg, useCurrentUser, useDb } from '@/data/store';
import { ROLES } from '@/domain/catalogs';
import { NAV_ITEMS, type NavItem } from './nav';

const GROUPS: NavItem['group'][] = ['General', 'Comercial', 'Expediente', 'Control'];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const items = NAV_ITEMS.filter((item) => item.visible(user));
  return (
    <nav aria-label="Navegación principal" className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex size-8 items-center justify-center rounded-md bg-emerald-500/90 text-petrol-950">
          <Sprout className="size-5" aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-white">AgroMatch COMEX</span>
          <span className="block text-[11px] text-petrol-200">Arroz del NEA · MVP</span>
        </span>
      </Link>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="mt-3">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-petrol-300">{group}</p>
              <ul className="space-y-0.5">
                {groupItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                          isActive ? 'bg-petrol-700 text-white' : 'text-petrol-100 hover:bg-petrol-800 hover:text-white',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="border-t border-petrol-800 px-4 py-3 text-[10px] leading-snug text-petrol-300">
        Herramienta de apoyo: no emite permisos oficiales, no liquida divisas ni reemplaza a despachantes, SENASA, Aduana o bancos.
      </p>
    </nav>
  );
}

function UserSwitcher() {
  const db = useDb();
  const user = useCurrentUser();
  const org = useCurrentOrg();
  const switchUser = useApp((s) => s.switchUser);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs shadow-sm hover:bg-slate-50"
          aria-label="Cambiar usuario demo"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-petrol-100 text-[11px] font-semibold text-petrol-800">
            {user.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[180px] truncate font-medium text-slate-900">{user.name}</span>
            <span className="block max-w-[180px] truncate text-slate-500">
              {ROLES[user.role]} · {org.name}
            </span>
          </span>
          <ChevronDown className="size-4 text-slate-400" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-80 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          <DropdownMenu.Label className="px-2 py-1.5 text-[11px] text-slate-500">
            Usuarios demo — cada uno ve solo los datos de su organización y rol
          </DropdownMenu.Label>
          {db.organizations.map((o) => (
            <DropdownMenu.Group key={o.id}>
              <DropdownMenu.Label className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{o.name}</DropdownMenu.Label>
              {db.users
                .filter((u) => u.organizationId === o.id)
                .map((u) => (
                  <DropdownMenu.Item
                    key={u.id}
                    onSelect={() => switchUser(u.id)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-slate-100"
                  >
                    <span>
                      <span className="block text-slate-900">{u.name}</span>
                      <span className="block text-[11px] text-slate-500">{ROLES[u.role]}</span>
                    </span>
                    {u.id === user.id ? <Check className="size-4 text-petrol-700" /> : null}
                  </DropdownMenu.Item>
                ))}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const user = useCurrentUser();
  const location = useLocation();
  const current = NAV_ITEMS.filter((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to))).at(-1);
  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-petrol-900 lg:block">
          <Sidebar />
        </aside>
        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} aria-hidden />
            <aside className="absolute inset-y-0 left-0 w-64 bg-petrol-900">
              <button type="button" className="absolute right-2 top-3 rounded p-1 text-petrol-100" onClick={() => setOpen(false)} aria-label="Cerrar menú">
                <X className="size-5" />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        ) : null}
        <div className="lg:pl-60">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
            <button type="button" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700">{current?.label ?? 'AgroMatch COMEX'}</p>
            </div>
            <DemoBadge />
            {can(user, 'scenario.manage') ? (
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/nueva-operacion">
                  <Plus /> Nueva operación
                </Link>
              </Button>
            ) : null}
            <UserSwitcher />
          </header>
          <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
