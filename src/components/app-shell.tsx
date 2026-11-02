import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Bell, Building2, RefreshCcw, Search, Sprout } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MODOS, NAV_POR_MODO, modosDisponibles, type Modo } from "@/data/organizaciones";
import { ROLES, type Rol } from "@/data/demo";
import { useAppStore, useOrganizacionActiva } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import molinoAzulLogo from "@/assets/molino-azul-logo.jpg";

// Logo oficial de la organización demo Molino Azul (solo presentación).
const LOGO_OFICIAL: Record<string, string> = { "ORG-B": molinoAzulLogo };

// Solo presentación: posiciona el indicador deslizante del sidebar.
const useEfectoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ROL_POR_MODO: Record<Modo, Rol> = {
  vendedor_local: "productor",
  comprador_nacional: "comprador",
  comprador_internacional: "comprador",
  exportador: "exportador",
};

function SelectorModo() {
  const { dispatch } = useAppStore();
  const org = useOrganizacionActiva();
  const opciones = modosDisponibles(org);
  return (
    <div data-selector-modo className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <h1 className="font-display text-xl font-bold">AgroGlobal COMEX</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {org.nombreComercial} — seleccioná el espacio de trabajo
        </p>
        <div className={cn("mt-6 grid gap-4", opciones.length > 1 ? "sm:grid-cols-2" : "")}>
          {opciones.map((modo) => {
            const info = MODOS[modo];
            return (
              <button
                key={modo}
                onClick={() => dispatch({ type: "elegirModo", rol: ROL_POR_MODO[modo], modo })}
                className="group flex flex-col items-center rounded-xl border border-border bg-background px-6 py-8 text-center transition-colors hover:border-primary hover:bg-accent"
              >
                <Sprout className="h-8 w-8 text-primary transition-transform group-hover:scale-110" />
                <span className="mt-4 font-display text-lg font-semibold">{info.label}</span>
                <span className="mt-2 text-sm leading-snug text-muted-foreground">{info.descripcion}</span>
                <span className="mt-4 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  {info.chip}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 text-center">
          <Link to="/registro-empresa" className="text-xs text-muted-foreground underline hover:text-foreground">
            Registrar otra empresa con branding automático
          </Link>
        </div>
      </div>
    </div>
  );
}

function LogoMarca({ className }: { className?: string }) {
  const org = useOrganizacionActiva();
  const logoOficial = LOGO_OFICIAL[org.id];
  if (logoOficial) {
    return (
      <div className={cn("h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-sidebar-primary/40", className)}>
        <img src={logoOficial} alt={org.nombreComercial} className="h-full w-full scale-[1.18] object-cover" />
      </div>
    );
  }
  if (org.tema?.logoUrl) {
    return <img src={org.tema.logoUrl} alt={org.nombreComercial} className={cn("h-9 w-9 rounded-lg object-contain", className)} />;
  }
  return (
    <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary", className)}>
      <Sprout className="h-5 w-5 text-sidebar-primary-foreground" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch, hidratado } = useAppStore();
  const org = useOrganizacionActiva();
  const location = useLocation();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");

  const rolActual = ROLES.find((r) => r.id === state.rol)!;
  const nav = NAV_POR_MODO[state.modo] ?? NAV_POR_MODO.exportador;
  const esActivo = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));

  // Indicador activo del sidebar: se desliza entre secciones (no altera la navegación).
  const navRef = useRef<HTMLElement>(null);
  const [indicador, setIndicador] = useState<{ top: number; height: number; animar: boolean } | null>(null);
  useEfectoLayout(() => {
    const activo = navRef.current?.querySelector<HTMLElement>('a[data-activo="true"]');
    if (!activo) {
      setIndicador(null);
      return;
    }
    setIndicador((prev) => ({ top: activo.offsetTop, height: activo.offsetHeight, animar: prev !== null }));
  }, [location.pathname, state.modo]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <LogoMarca />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold leading-tight">{org.nombreComercial}</p>
            <p className="text-[11px] text-sidebar-foreground/60">Powered by AgroGlobal COMEX · Demo</p>
          </div>
        </div>
        <nav ref={navRef} className="relative flex-1 space-y-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
          {indicador && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-3 top-0 rounded-md bg-sidebar-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] motion-reduce:transition-none",
                indicador.animar && "transition-[transform,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              )}
              style={{ height: indicador.height, transform: `translateY(${indicador.top}px)` }}
            >
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary" />
            </span>
          )}
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              data-activo={esActivo(to)}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                esActivo(to)
                  ? cn("font-semibold text-sidebar-accent-foreground", !indicador && "bg-sidebar-accent")
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
            Modo de trabajo
          </p>
          <p className="text-sm font-semibold text-sidebar-accent-foreground">{MODOS[state.modo].label}</p>
          <p className="mt-1 text-[11px] leading-snug text-sidebar-foreground/50">{rolActual.descripcion}</p>
          <button
            onClick={() => dispatch({ type: "cambiarModo" })}
            className="mt-2 text-[11px] text-sidebar-foreground/70 underline hover:text-sidebar-accent-foreground"
          >
            Cambiar espacio de trabajo
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <Sprout className="h-5 w-5 text-primary" />
            <span className="font-display text-sm font-bold">{org.nombreComercial}</span>
          </Link>
          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && busqueda.trim()) {
                  toast.info(`Búsqueda general demo: "${busqueda}"`, {
                    description: "Usá los buscadores y filtros de cada sección para resultados reales del prototipo.",
                  });
                }
              }}
              placeholder="Buscar productos, solicitudes, operaciones…"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() =>
                toast.info("Notificaciones (demo)", {
                  description: "3 alertas documentales y 1 cotización pendiente de respuesta.",
                })
              }
              className="relative rounded-md p-2 text-muted-foreground hover:bg-accent"
              aria-label="Notificaciones"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning" />
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              {!LOGO_OFICIAL[org.id] && <Building2 className="h-4 w-4 text-muted-foreground" />}
              <Select value={state.organizacionActivaId} onValueChange={(id) => dispatch({ type: "setOrganizacion", id })}>
                <SelectTrigger className="h-8 w-auto gap-1.5 border-border text-xs font-medium">
                  {LOGO_OFICIAL[org.id] && (
                    <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full bg-white">
                      <img src={LOGO_OFICIAL[org.id]} alt="" aria-hidden className="h-full w-full scale-[1.18] object-cover" />
                    </span>
                  )}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.organizaciones.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nombreComercial}
                    </SelectItem>
                  ))}
                  <div className="border-t border-border p-1">
                    <Link
                      to="/registro-empresa"
                      className="block rounded-sm px-2 py-1.5 text-xs text-primary hover:bg-accent"
                    >
                      + Registrar empresa
                    </Link>
                  </div>
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={() => navigate({ to: "/configuracion" })}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
              aria-label="Perfil"
            >
              LI
            </button>
          </div>
        </header>

        {/* Nav móvil */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2 lg:hidden">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
                esActivo(to) ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        <main data-ruta={location.pathname} className="flex-1 px-4 py-6 lg:px-8">{children}</main>

        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground lg:px-8">
          {org.nombreComercial} · Powered by AgroGlobal COMEX — Prototipo demostrativo con datos ficticios · Ideathon NEA TECH 2026 ·{" "}
          <button
            className="inline-flex items-center gap-1 underline hover:text-foreground"
            onClick={() => {
              dispatch({ type: "reset" });
              toast.success("Datos de demostración restablecidos");
            }}
          >
            <RefreshCcw className="h-3 w-3" /> Restablecer datos demo
          </button>
          {" · "}
          <button className="underline hover:text-foreground" onClick={() => dispatch({ type: "cambiarModo" })}>
            Cambiar espacio de trabajo
          </button>
        </footer>
      </div>
      <Toaster richColors position="bottom-right" />
      {hidratado && !state.modoElegido && <SelectorModo />}
    </div>
  );
}
