// ============================================================
// Guía de bienvenida: se muestra debajo del selector de espacio
// de trabajo. Explica qué es AgroGlobal, qué problema resuelve,
// cómo funciona y reserva un espacio para el video explicativo.
// Solo presentación: no modifica datos del store.
// ============================================================

import {
  ArrowRight,
  ArrowUp,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Factory,
  FileCheck2,
  FilePlus2,
  FileText,
  Globe2,
  Handshake,
  Lock,
  MessageCircle,
  Play,
  Scale,
  Search,
  ShieldCheck,
  Ship,
  Sparkles,
  Sprout,
  Store,
  Truck,
  Undo2,
  Users,
  Waypoints,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { MODOS, NAV_POR_MODO, type Modo } from "@/data/organizaciones";
import { cn } from "@/lib/utils";

/**
 * Video explicativo de la plataforma (archivos en `public/`).
 * Con `null` se muestra el espacio reservado en su lugar.
 */
const VIDEO_GUIA: { src: string; portada: string; duracion: string } | null = {
  src: "/agroglobal-guia.mp4",
  portada: "/agroglobal-guia-portada.jpg",
  duracion: "3:45",
};

const PARA_QUIEN: Record<Modo, string> = {
  vendedor_local: "Para quien vende su producción dentro de Argentina y quiere algo simple.",
  comprador_nacional: "Para quien compra arroz en el mercado interno.",
  comprador_internacional: "Para quien importa arroz y busca proveedores argentinos.",
  exportador:
    "Para quien exporta o quiere empezar a exportar, con todas las herramientas de comercio exterior.",
};

// ---------- piezas comunes ----------

function Encabezado({
  n,
  etiqueta,
  titulo,
  bajada,
  claro,
}: {
  n: string;
  etiqueta: string;
  titulo: string;
  bajada?: string;
  claro?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
        <span className="font-display text-sidebar-primary">{n}</span>
        <span className={claro ? "text-primary-foreground/70" : "text-chart-1"}>{etiqueta}</span>
      </p>
      <h2
        className={cn(
          "mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl",
          claro ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {titulo}
      </h2>
      {bajada && (
        <p
          className={cn(
            "mt-4 text-base leading-relaxed",
            claro ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {bajada}
        </p>
      )}
    </div>
  );
}

function Seccion({ id, children, oscuro }: { id: string; children: ReactNode; oscuro?: boolean }) {
  return (
    <section id={id} className={cn("scroll-mt-4", oscuro && "bg-primary text-primary-foreground")}>
      <div className="guia-revelar mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        {children}
      </div>
    </section>
  );
}

function Icono({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary",
        className,
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

// ---------- 01 · Qué es ----------

const ACTORES: { icon: LucideIcon; label: string; angulo: number }[] = [
  { icon: Wheat, label: "Productores", angulo: -90 },
  { icon: Factory, label: "Molinos", angulo: -18 },
  { icon: Ship, label: "Importadores", angulo: 54 },
  { icon: Store, label: "Compradores nacionales", angulo: 126 },
  { icon: Globe2, label: "Exportadores", angulo: 198 },
];

function Ecosistema() {
  const pos = (a: number) => ({
    x: 50 + 38 * Math.cos((a * Math.PI) / 180),
    y: 50 + 38 * Math.sin((a * Math.PI) / 180),
  });
  return (
    <div className="relative mx-auto aspect-square w-[92%] max-w-[440px] sm:w-full">
      <div className="absolute inset-[8%] rounded-full bg-gradient-to-br from-accent to-transparent" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="38" fill="none" className="stroke-border" strokeWidth="0.4" />
        {ACTORES.map(({ angulo }) => {
          const p = pos(angulo);
          return (
            <line
              key={angulo}
              x1="50"
              y1="50"
              x2={p.x}
              y2={p.y}
              className="guia-flujo stroke-chart-1"
              strokeWidth="0.6"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-8 ring-background sm:h-28 sm:w-28">
        <Sprout className="h-7 w-7 text-sidebar-primary sm:h-8 sm:w-8" />
        <span className="mt-1 font-display text-xs font-bold sm:text-sm">AgroGlobal</span>
      </div>
      {ACTORES.map(({ icon: Icon, label, angulo }) => {
        const p = pos(angulo);
        return (
          <div
            key={label}
            className="absolute flex w-[5.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-1.5 py-2.5 text-center shadow-sm sm:w-28 sm:px-2 sm:py-3"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-primary sm:h-9 sm:w-9">
              <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </span>
            <span className="text-[10px] font-semibold leading-tight sm:text-[11px]">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function QueEs() {
  const pilares: { icon: LucideIcon; titulo: string; texto: string }[] = [
    {
      icon: Users,
      titulo: "Conectar",
      texto: "Productores, molinos y compradores en un mismo mercado.",
    },
    {
      icon: Calculator,
      titulo: "Calcular",
      texto: "Costos y precios por Incoterm, sin planillas.",
    },
    {
      icon: ShieldCheck,
      titulo: "Confiar",
      texto: "Acuerdos con garantía verificable por cualquiera.",
    },
  ];
  return (
    <Seccion id="guia-que-es">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Encabezado
            n="01"
            etiqueta="Qué es AgroGlobal"
            titulo="Un solo lugar para comercializar arroz, en el país y en el mundo"
            bajada="AgroGlobal conecta a quienes producen, procesan y compran arroz del NEA. Publicás tu producción, encontrás compradores compatibles, calculás costos de exportación y seguís cada operación de punta a punta."
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {pilares.map((p) => (
              <div
                key={p.titulo}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <Icono icon={p.icon} />
                <p className="mt-3 font-display text-sm font-semibold">{p.titulo}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
        <Ecosistema />
      </div>
    </Seccion>
  );
}

// ---------- 02 · Qué resolvemos ----------

const PROBLEMAS: { hoy: string; solucion: string; detalle: string; icon: LucideIcon }[] = [
  {
    hoy: "Compradores y lotes dispersos entre llamadas, WhatsApp y planillas.",
    solucion: "Marketplace y matching",
    detalle: "Cada pedido se cruza automáticamente con los lotes disponibles.",
    icon: Search,
  },
  {
    hoy: "Costos de exportación calculados a mano, con errores según el Incoterm.",
    solucion: "Calculadora COMEX",
    detalle: "Costo total y precio por tonelada para cada Incoterm.",
    icon: Calculator,
  },
  {
    hoy: "Requisitos documentales distintos en cada destino, difíciles de seguir.",
    solucion: "Checklist documental",
    detalle: "Documentos por país e Incoterm, con responsable y fecha.",
    icon: FileCheck2,
  },
  {
    hoy: "Desconfianza sobre quién paga o entrega primero.",
    solucion: "Depósito en garantía",
    detalle: "Un contrato inteligente retiene los fondos hasta cumplir.",
    icon: Lock,
  },
  {
    hoy: "Poca información sobre a dónde se vende el arroz argentino.",
    solucion: "Inteligencia de mercados",
    detalle: "Exportaciones históricas y requisitos por destino.",
    icon: Globe2,
  },
];

function QueResolvemos() {
  return (
    <Seccion id="guia-problema">
      <Encabezado
        n="02"
        etiqueta="Qué resolvemos"
        titulo="Del caos de mensajes y planillas a un flujo ordenado"
        bajada="Vender arroz, sobre todo al exterior, hoy implica muchas herramientas sueltas. AgroGlobal reúne cada paso en una sola plataforma."
      />
      <div className="mt-10 hidden grid-cols-[1fr_3rem_1fr] gap-3 px-1 text-xs font-semibold uppercase tracking-wider md:grid">
        <span className="flex items-center gap-2 text-destructive">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          Hoy
        </span>
        <span />
        <span className="flex items-center gap-2 text-success">
          <span className="h-2 w-2 rounded-full bg-success" />
          Con AgroGlobal
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {PROBLEMAS.map((p) => (
          <div
            key={p.solucion}
            className="grid items-stretch gap-2 md:grid-cols-[1fr_3rem_1fr] md:gap-3"
          >
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/15 bg-danger-muted/60 p-4">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive/80" />
              <p className="text-sm leading-snug text-foreground/80">{p.hoy}</p>
            </div>
            <div className="flex items-center justify-center">
              <span className="flex h-9 w-9 rotate-90 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-sm md:rotate-0">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-success/20 bg-success-muted/70 p-4">
              <Icono icon={p.icon} className="h-9 w-9 bg-card text-success" />
              <div>
                <p className="flex items-center gap-1.5 font-display text-sm font-semibold">
                  {p.solucion} <CheckCircle2 className="h-4 w-4 text-success" />
                </p>
                <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{p.detalle}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Seccion>
  );
}

// ---------- 03 · Cómo funciona ----------

const PASOS: { icon: LucideIcon; titulo: string; texto: string }[] = [
  {
    icon: FileText,
    titulo: "Solicitud de compra",
    texto: "El comprador indica variedad, toneladas, calidad y destino.",
  },
  {
    icon: Sparkles,
    titulo: "Matching",
    texto: "Cada lote se clasifica como compatible, con condiciones o incompatible.",
  },
  {
    icon: Calculator,
    titulo: "Cotización",
    texto: "Se arma con los costos COMEX del Incoterm elegido.",
  },
  {
    icon: Handshake,
    titulo: "Aceptación",
    texto: "Al aceptar se crea la operación y se reserva el stock.",
  },
  { icon: Truck, titulo: "Operación", texto: "Hitos de embarque y documentos en un mismo lugar." },
  {
    icon: Scale,
    titulo: "Cobro y conciliación",
    texto: "Lo cobrado se concilia con lo facturado.",
  },
  {
    icon: Waypoints,
    titulo: "Trazabilidad",
    texto: "Expediente del lote con evidencia verificable.",
  },
];

const LOTES_EJEMPLO: {
  lote: string;
  detalle: string;
  estado: "ok" | "condicion" | "no";
  motivo: string;
}[] = [
  {
    lote: "Lote A",
    detalle: "Largo fino · 4% quebrado · 60 tn",
    estado: "ok",
    motivo: "Cumple todo lo pedido",
  },
  {
    lote: "Lote B",
    detalle: "Largo fino · 7% quebrado · 40 tn",
    estado: "condicion",
    motivo: "Quebrado mayor al pedido",
  },
  {
    lote: "Lote C",
    detalle: "Doble Carolina · 3% quebrado · 80 tn",
    estado: "no",
    motivo: "Otra variedad",
  },
];

const ESTADO_MATCH = {
  ok: { label: "Compatible", clase: "bg-success-muted text-success border-success/25" },
  condicion: {
    label: "Con condiciones",
    clase: "bg-warning-muted text-warning-foreground border-warning/30",
  },
  no: { label: "Incompatible", clase: "bg-danger-muted text-destructive border-destructive/20" },
} as const;

function ComoFunciona() {
  return (
    <Seccion id="guia-como-funciona">
      <Encabezado
        n="03"
        etiqueta="Cómo funciona"
        titulo="De la solicitud al expediente, en 7 pasos"
        bajada="Cada paso queda vinculado al anterior: la cotización sabe de qué solicitud viene, la operación de qué cotización y el expediente reúne todo."
      />
      <ol className="relative mt-12 grid gap-6 lg:grid-cols-7 lg:gap-3">
        <span aria-hidden className="absolute bottom-6 left-6 top-6 w-0.5 bg-border lg:hidden" />
        <span
          aria-hidden
          className="absolute left-[7%] right-[7%] top-6 hidden h-0.5 bg-gradient-to-r from-chart-1 via-sidebar-primary to-chart-1 lg:block"
        />
        {PASOS.map((p, i) => (
          <li
            key={p.titulo}
            className="relative flex gap-4 lg:flex-col lg:items-center lg:text-center"
          >
            <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-background">
              <p.icon className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-primary text-[10px] font-bold text-sidebar-primary-foreground">
                {i + 1}
              </span>
            </span>
            <div className="pt-1 lg:pt-3">
              <p className="font-display text-sm font-semibold leading-tight">{p.titulo}</p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Muestra visual del matching */}
      <div className="mt-14 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-5 py-3 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4 text-chart-1" /> Así se ve el matching (ejemplo)
        </div>
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] md:p-6">
          <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-primary">
              Solicitud de compra
            </p>
            <p className="mt-2 font-display text-lg font-bold">Distribuidora Caribe</p>
            <p className="text-xs text-primary-foreground/60">Empresa ficticia</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Volumen", "50 tn"],
                ["Variedad", "Largo fino"],
                ["Quebrado", "≤ 5%"],
                ["Entrega", "CFR"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-primary-foreground/10 px-3 py-2">
                  <dt className="text-[11px] text-primary-foreground/60">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ul className="space-y-3">
            {LOTES_EJEMPLO.map((l) => {
              const e = ESTADO_MATCH[l.estado];
              return (
                <li
                  key={l.lote}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4"
                >
                  <Icono icon={Wheat} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-semibold">{l.lote}</p>
                    <p className="text-xs text-muted-foreground">{l.detalle}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={cn(
                        "inline-block rounded-full border px-2.5 py-1 text-xs font-semibold",
                        e.clase,
                      )}
                    >
                      {e.label}
                    </span>
                    <p className="mt-1 text-[11px] text-muted-foreground">{l.motivo}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Seccion>
  );
}

// ---------- 04 · Espacios de trabajo ----------

function Espacios({ opciones, onElegir }: { opciones: Modo[]; onElegir: (m: Modo) => void }) {
  return (
    <Seccion id="guia-espacios">
      <Encabezado
        n="04"
        etiqueta="Elegí tu espacio"
        titulo="Dos formas de trabajar, según cómo vendés"
        bajada="Podés cambiar de espacio cuando quieras desde el menú lateral. Los datos de tu empresa son los mismos en ambos."
      />
      <div className={cn("mt-10 grid gap-5", opciones.length > 1 && "md:grid-cols-2")}>
        {opciones.map((modo, i) => {
          const info = MODOS[modo];
          const modulos = (NAV_POR_MODO[modo] ?? []).filter(
            (n) => n.to !== "/mi-empresa" && n.to !== "/configuracion",
          );
          const destacado = i === opciones.length - 1 && opciones.length > 1;
          return (
            <div
              key={modo}
              className={cn(
                "flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm",
                destacado ? "border-sidebar-primary/60" : "border-border",
              )}
            >
              <div
                className={cn(
                  "relative px-6 pb-6 pt-7",
                  destacado ? "bg-primary text-primary-foreground" : "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "inline-block rounded-full px-3 py-1 text-xs font-medium",
                    destacado
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "bg-card text-secondary-foreground",
                  )}
                >
                  {info.chip}
                </span>
                <h3 className="mt-4 font-display text-2xl font-bold">{info.label}</h3>
                <p
                  className={cn(
                    "mt-2 text-sm leading-snug",
                    destacado ? "text-primary-foreground/75" : "text-muted-foreground",
                  )}
                >
                  {PARA_QUIEN[modo]}
                </p>
                {destacado ? (
                  <Globe2 className="absolute right-6 top-6 h-10 w-10 text-sidebar-primary/80" />
                ) : (
                  <Sprout className="absolute right-6 top-6 h-10 w-10 text-chart-1/70" />
                )}
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Qué incluye
                </p>
                {/* la lista no se estira: el botón queda al pie con mt-auto */}
                <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
                  {modulos.map(({ to, label, icon: Icon }) => (
                    <li key={to} className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 shrink-0 text-chart-1" />
                      {label}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <button
                    onClick={() => onElegir(modo)}
                    className={cn(
                      "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
                      destacado
                        ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    Entrar como {info.label} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Seccion>
  );
}

// ---------- 05 · Confianza verificable ----------

const PASOS_GARANTIA: { icon: LucideIcon; titulo: string; texto: string }[] = [
  {
    icon: FilePlus2,
    titulo: "El comprador crea el acuerdo",
    texto: "Monto, partes y referencia de la orden.",
  },
  { icon: Handshake, titulo: "El vendedor acepta", texto: "Las condiciones quedan fijadas." },
  {
    icon: Lock,
    titulo: "El comprador deposita",
    texto: "Los fondos quedan en el contrato, no en manos de una parte.",
  },
  {
    icon: CheckCircle2,
    titulo: "Liberación al vendedor",
    texto: "Al cumplirse la entrega. Si hay conflicto, el árbitro puede reembolsar.",
  },
];

function Confianza() {
  return (
    <Seccion id="guia-confianza" oscuro>
      <Encabezado
        claro
        n="05"
        etiqueta="Confianza verificable"
        titulo="Acuerdos con depósito en garantía sobre Stellar"
        bajada="Un contrato inteligente retiene el pago hasta que se cumple lo pactado. Cualquiera puede verificar el estado del acuerdo en el explorador de la red, sin depender de AgroGlobal."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-4">
        {PASOS_GARANTIA.map((p, i) => (
          <div
            key={p.titulo}
            className="relative rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <p.icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/50">
              Paso {i + 1}
            </p>
            <p className="mt-1 font-display text-base font-semibold">{p.titulo}</p>
            <p className="mt-1 text-sm leading-snug text-primary-foreground/70">{p.texto}</p>
            {i < PASOS_GARANTIA.length - 1 && (
              <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 rounded-full bg-primary p-1.5 text-sidebar-primary ring-1 ring-primary-foreground/15 md:block" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-8 grid items-center gap-4 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-5 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 shrink-0 text-sidebar-primary" />
          <div>
            <p className="text-sm font-semibold">Condiciones comerciales</p>
            <p className="text-xs text-primary-foreground/60">Quedan en AgroGlobal, en privado</p>
          </div>
        </div>
        <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-primary-foreground/40 md:rotate-0" />
        <div className="text-center">
          <p className="font-mono text-sm font-semibold text-sidebar-primary">SHA-256</p>
          <p className="text-xs text-primary-foreground/60">Huella digital única</p>
        </div>
        <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-primary-foreground/40 md:rotate-0" />
        <div className="flex items-center gap-3 md:justify-end">
          <div className="md:text-right">
            <p className="text-sm font-semibold">Solo la huella viaja a la red</p>
            <p className="font-mono text-xs text-primary-foreground/60">9f2c…41ab (ejemplo)</p>
          </div>
          <ShieldCheck className="h-6 w-6 shrink-0 text-sidebar-primary" />
        </div>
      </div>
      <p className="mt-5 text-xs text-primary-foreground/55">
        Stellar Testnet — demostración con activos sin valor monetario real. No son pagos bancarios
        ni contratos comerciales reales.
      </p>
    </Seccion>
  );
}

// ---------- 06 · WhatsApp ----------

function WhatsApp() {
  const acciones = [
    "Publicar una oferta",
    "Actualizar stock",
    "Consultar compradores",
    "Ver tus operaciones",
  ];
  return (
    <Seccion id="guia-whatsapp">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Encabezado
            n="06"
            etiqueta="También por WhatsApp"
            titulo="Escribí como le escribirías a un comprador"
            bajada="El asistente entiende tu mensaje, te muestra los datos que encontró y publica solo cuando confirmás. Nada se carga sin tu aprobación."
          />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {acciones.map((a) => (
              <li
                key={a}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> {a}
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto w-full max-w-[340px] rounded-[2.25rem] border-[10px] border-foreground/90 bg-foreground/90 shadow-2xl">
          <div className="overflow-hidden rounded-[1.6rem] bg-[#ECE5DD]">
            <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                <Sprout className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">Asistente AgroGlobal</p>
                <p className="text-[11px] text-primary-foreground/60">en línea</p>
              </div>
              <MessageCircle className="ml-auto h-5 w-5 text-primary-foreground/60" />
            </div>
            <div className="space-y-3 px-3 py-4 text-[13px] leading-snug text-[#182a2c]">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#D9FDD3] px-3 py-2 shadow-sm">
                Tengo 80 toneladas de arroz blanco largo fino, 5% de quebrado, en bolsas de 25 kilos
                <p className="mt-1 text-right text-[10px] text-[#182a2c]/50">10:24 ✓✓</p>
              </div>
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                <p>Encontré estos datos para tu publicación:</p>
                <ul className="mt-1.5 space-y-0.5 text-[12px]">
                  <li>• Arroz blanco · Largo fino</li>
                  <li>• 80 toneladas</li>
                  <li>• Quebrado máximo 5%</li>
                  <li>• Bolsas de 25 kg</li>
                </ul>
                <p className="mt-1.5">¿Querés publicar esta oferta?</p>
                <p className="mt-1 text-right text-[10px] text-[#182a2c]/50">10:24</p>
              </div>
              <div className="grid max-w-[88%] gap-1.5">
                <span className="rounded-xl bg-white py-2 text-center text-[12px] font-semibold text-[#34765B] shadow-sm">
                  Confirmar publicación
                </span>
                <span className="rounded-xl bg-white py-2 text-center text-[12px] font-semibold text-[#34765B] shadow-sm">
                  Corregir información
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Seccion>
  );
}

// ---------- 07 · Video ----------

/**
 * Portada con el botón de la guía; al tocarla arranca el video con los controles
 * nativos. `preload="none"`: el archivo no se descarga hasta que se reproduce.
 */
function ReproductorGuia({ src, portada, duracion }: NonNullable<typeof VIDEO_GUIA>) {
  const ref = useRef<HTMLVideoElement>(null);
  const [iniciado, setIniciado] = useState(false);
  const reproducir = () => {
    setIniciado(true);
    // Si el navegador no deja reproducir, quedan los controles nativos a mano.
    ref.current?.play().catch(() => {});
  };
  return (
    <div className="relative aspect-video w-full bg-black">
      <video
        ref={ref}
        src={src}
        poster={portada}
        controls={iniciado}
        preload="none"
        playsInline
        onPlay={() => setIniciado(true)}
        className="h-full w-full"
      />
      {!iniciado && (
        <button
          type="button"
          onClick={reproducir}
          aria-label={`Reproducir video explicativo (${duracion})`}
          className="group absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-primary/85 via-primary/25 to-primary/10 px-6 text-center text-primary-foreground"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg ring-8 ring-sidebar-primary/25 transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none sm:h-20 sm:w-20">
            <Play className="ml-1 h-6 w-6 fill-current sm:h-8 sm:w-8" />
          </span>
          <span className="mt-5 font-display text-lg font-semibold sm:mt-6 sm:text-xl">
            Video explicativo
          </span>
          <span className="mt-1 text-xs text-primary-foreground/80 sm:text-sm">
            {duracion} · Tocá para reproducir
          </span>
        </button>
      )}
    </div>
  );
}

function Video() {
  return (
    <Seccion id="guia-video">
      <div className="mx-auto max-w-2xl text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
          <span className="font-display text-sidebar-primary">07</span>
          <span className="text-chart-1">Video explicativo</span>
        </p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Mirá AgroGlobal en acción
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Un recorrido guiado por la plataforma: de publicar un lote al seguimiento completo de la
          operación.
        </p>
      </div>
      <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-3xl border border-border bg-primary shadow-xl">
        {VIDEO_GUIA ? (
          <ReproductorGuia {...VIDEO_GUIA} />
        ) : (
          <div className="relative flex aspect-video min-h-[230px] w-full flex-col items-center justify-center overflow-hidden px-6 text-center text-primary-foreground">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <div
              aria-hidden
              className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-chart-1/40 blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-sidebar-primary/25 blur-3xl"
            />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg ring-8 ring-sidebar-primary/25 sm:h-20 sm:w-20">
              <Play className="ml-1 h-6 w-6 fill-current sm:h-8 sm:w-8" />
            </span>
            <p className="relative mt-5 font-display text-lg font-semibold sm:mt-6 sm:text-xl">
              Video explicativo
            </p>
            <p className="relative mt-1 max-w-sm text-xs text-primary-foreground/65 sm:max-w-none sm:text-sm">
              Próximamente — espacio reservado para el video de la plataforma
            </p>
          </div>
        )}
      </div>
    </Seccion>
  );
}

// ---------- cierre ----------

function Cierre({
  opciones,
  onElegir,
  onIrArriba,
}: {
  opciones: Modo[];
  onElegir: (m: Modo) => void;
  onIrArriba: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="guia-revelar relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-sidebar-accent px-6 py-12 text-center text-primary-foreground sm:px-12">
        <Sprout
          aria-hidden
          className="absolute -right-6 -top-6 h-40 w-40 text-primary-foreground/5"
        />
        <h2 className="font-display text-3xl font-bold">¿Por dónde empezás?</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-primary-foreground/70">
          Elegí tu espacio de trabajo. Podés cambiarlo en cualquier momento.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {opciones.map((modo, i) => (
            <button
              key={modo}
              onClick={() => onElegir(modo)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors",
                i === opciones.length - 1
                  ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                  : "bg-primary-foreground/10 text-primary-foreground ring-1 ring-primary-foreground/25 hover:bg-primary-foreground/15",
              )}
            >
              {MODOS[modo].label} <ArrowRight className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button
          onClick={onIrArriba}
          className="mt-6 inline-flex items-center gap-1 text-xs text-primary-foreground/60 underline hover:text-primary-foreground"
        >
          <ArrowUp className="h-3 w-3" /> Volver al inicio
        </button>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Prototipo demostrativo · Empresas y datos comerciales ficticios · Ideathon NEA TECH 2026
      </p>
    </div>
  );
}

// ---------- componente principal ----------

/** Indicador para deslizar, ubicado al pie de la primera pantalla. */
export function IndicadorDeslizar({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground"
    >
      Conocé cómo funciona AgroGlobal
      <span className="flex h-9 w-9 animate-bounce items-center justify-center rounded-full border border-border bg-card text-chart-1 shadow-sm motion-reduce:animate-none">
        <ChevronDown className="h-5 w-5" />
      </span>
    </button>
  );
}

/** Acceso rápido al selector: visible solo mientras se recorre la guía. */
export function AtajoSelector({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        "fixed bottom-5 right-5 z-[60] inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg ring-1 ring-sidebar-primary/40 transition-[opacity,transform] duration-300 hover:bg-primary/90 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp className="h-3.5 w-3.5" /> Elegir espacio de trabajo
    </button>
  );
}

export function GuiaBienvenida({
  opciones,
  onElegir,
  onIrArriba,
}: {
  opciones: Modo[];
  onElegir: (m: Modo) => void;
  onIrArriba: () => void;
}) {
  return (
    <div className="border-t border-border bg-background">
      <div>
        <QueEs />
        <QueResolvemos />
        <ComoFunciona />
        <Espacios opciones={opciones} onElegir={onElegir} />
        <Confianza />
        <WhatsApp />
        <Video />
      </div>
      <Cierre opciones={opciones} onElegir={onElegir} onIrArriba={onIrArriba} />
    </div>
  );
}
