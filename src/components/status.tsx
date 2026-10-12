import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Circle,
  ClipboardCheck,
  Clock,
  Info,
  SearchX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { Attention, OrderStatus, Severity } from "@/domain/reconcile";

interface Look {
  label: string;
  icon: LucideIcon;
  className: string;
}

/** Verde = conciliado con el archivo importado; nunca "pago bancario garantizado". */
export const ORDER_STATUS: Record<OrderStatus, Look> = {
  conciliado: {
    label: "Conciliado con el archivo",
    icon: CircleCheck,
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
  parcial: {
    label: "Conciliación parcial",
    icon: CircleDashed,
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  sin_conciliar: {
    label: "Sin conciliar",
    icon: Circle,
    className: "border-slate-300 bg-white text-slate-700",
  },
};

export const ATTENTION: Record<Exclude<Attention, "ninguna">, Look> = {
  aprobacion: {
    label: "Propuesta para aprobar",
    icon: ClipboardCheck,
    className: "border-brand-300 bg-brand-50 text-brand-900",
  },
  revision: {
    label: "Revisión necesaria",
    icon: TriangleAlert,
    className: "border-red-300 bg-red-50 text-red-900",
  },
  sin_encontrar: {
    label: "No encontrado en movimientos importados",
    icon: SearchX,
    className: "border-slate-400 bg-slate-100 text-slate-800",
  },
  esperando: {
    label: "Saldo por conciliar",
    icon: Clock,
    className: "border-slate-300 bg-white text-slate-700",
  },
};

export const SEVERITY: Record<Severity, Look> = {
  ok: { label: "Coherente", icon: CircleCheck, className: "border-emerald-200 bg-emerald-50 text-emerald-950" },
  info: { label: "Información", icon: Info, className: "border-slate-200 bg-slate-50 text-slate-900" },
  atencion: { label: "Atención", icon: CircleAlert, className: "border-amber-300 bg-amber-50 text-amber-950" },
  advertencia: { label: "Advertencia", icon: TriangleAlert, className: "border-red-300 bg-red-50 text-red-950" },
};

export function Badge({ look, className = "" }: { look: Look; className?: string }) {
  const Icon = look.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${look.className} ${className}`}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {look.label}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge look={ORDER_STATUS[status]} />;
}

export function AttentionBadge({ attention }: { attention: Attention }) {
  if (attention === "ninguna") return null;
  return <Badge look={ATTENTION[attention]} />;
}

export const MOVEMENT_STATUS_LABEL = {
  acreditado: "Acreditado (según archivo)",
  pendiente: "Pendiente",
  revertido: "Revertido",
} as const;
