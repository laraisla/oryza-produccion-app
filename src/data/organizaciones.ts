// ============================================================
// AgroGlobal COMEX — Organizaciones, actividades y modos de trabajo
// Todas las organizaciones son ficticias (demostración).
// Una organización puede habilitar varias actividades; el modo de
// trabajo define qué navegación y formularios ve el usuario.
// ============================================================

import {
  Blocks,
  Building2,
  Calculator,
  FileText,
  Files,
  Globe2,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Scale,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type Actividad =
  | "productor"
  | "molino"
  | "vendedor_local"
  | "comprador_nacional"
  | "comprador_internacional"
  | "exportador"
  | "importador"
  | "intermediario";

export const ACTIVIDADES: { id: Actividad; label: string }[] = [
  { id: "productor", label: "Productor agrícola" },
  { id: "molino", label: "Molino o procesador" },
  { id: "vendedor_local", label: "Vendedor local" },
  { id: "comprador_nacional", label: "Comprador nacional" },
  { id: "comprador_internacional", label: "Comprador internacional" },
  { id: "exportador", label: "Exportador" },
  { id: "importador", label: "Importador" },
  { id: "intermediario", label: "Intermediario comercial" },
];

export type Modo = "vendedor_local" | "comprador_nacional" | "comprador_internacional" | "exportador";

export const MODOS: Record<Modo, { label: string; descripcion: string; chip: string }> = {
  vendedor_local: {
    label: "Vendedor local",
    descripcion: "Comercialización dentro de Argentina: productos, inventario, compradores y ventas.",
    chip: "Interfaz simple",
  },
  comprador_nacional: {
    label: "Comprador nacional",
    descripcion: "Buscá productos, gestioná solicitudes y seguí tus compras.",
    chip: "Compras locales",
  },
  comprador_internacional: {
    label: "Comprador internacional",
    descripcion: "Solicitudes de compra, matching, cotizaciones y operaciones.",
    chip: "Compras internacionales",
  },
  exportador: {
    label: "Exportador / COMEX",
    descripcion: "Plataforma completa de comercio exterior: calculadora, documentación y embarques.",
    chip: "Herramientas avanzadas",
  },
};

/** Modos de trabajo habilitados según las actividades de la organización. */
export function modosDisponibles(org: Pick<Organizacion, "actividades">): Modo[] {
  const a = org.actividades;
  const modos: Modo[] = [];
  if (a.some((x) => x === "productor" || x === "molino" || x === "vendedor_local" || x === "intermediario"))
    modos.push("vendedor_local");
  if (a.includes("comprador_nacional")) modos.push("comprador_nacional");
  if (a.some((x) => x === "comprador_internacional" || x === "importador")) modos.push("comprador_internacional");
  if (a.includes("exportador")) modos.push("exportador");
  return modos.length ? modos : ["vendedor_local"];
}

export interface TemaMarca {
  primario: string;
  secundario: string;
  acento: string;
  logoUrl?: string;
  faviconUrl?: string;
  tipografia?: string;
  urlAnalizada?: string;
  fechaAnalisis?: string;
}

export interface Organizacion {
  id: string;
  razonSocial: string;
  nombreComercial: string;
  pais: string;
  provincia: string;
  actividades: Actividad[];
  sitioWeb?: string | undefined;
  contacto?: string | undefined;
  tema?: TemaMarca | undefined;
  demo: true;
}

// ---- Organizaciones ficticias de demostración ----
export const ORGANIZACIONES_DEMO: Organizacion[] = [
  {
    id: "ORG-A",
    razonSocial: "La Costera Arrocera S.A. (ficticia)",
    nombreComercial: "Arroz La Costera",
    pais: "Argentina",
    provincia: "Corrientes",
    actividades: ["productor", "vendedor_local"],
    contacto: "ventas@lacostera-demo.example",
    tema: { primario: "#15803d", secundario: "#166534", acento: "#22c55e" },
    demo: true,
  },
  {
    id: "ORG-B",
    razonSocial: "Molino Azul del Litoral S.A. (ficticia)",
    nombreComercial: "Molino Azul",
    pais: "Argentina",
    provincia: "Chaco",
    actividades: ["molino", "vendedor_local", "exportador"],
    sitioWeb: "https://www.molinoazul-demo.example",
    contacto: "comex@molinoazul-demo.example",
    tema: { primario: "#173C32", secundario: "#34765B", acento: "#D5B36B" },
    demo: true,
  },
  {
    id: "ORG-C",
    razonSocial: "Comercial Bordó S.R.L. (ficticia)",
    nombreComercial: "Bordó Alimentos",
    pais: "Argentina",
    provincia: "Buenos Aires",
    actividades: ["comprador_nacional", "comprador_internacional"],
    contacto: "compras@bordo-demo.example",
    tema: { primario: "#9f1239", secundario: "#881337", acento: "#e11d48" },
    demo: true,
  },
];

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const COMUNES: NavItem[] = [
  { to: "/asistente", label: "Asistente WhatsApp", icon: MessageSquareText },
  { to: "/mi-empresa", label: "Mi empresa", icon: Building2 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export const NAV_POR_MODO: Record<Modo, NavItem[]> = {
  vendedor_local: [
    { to: "/", label: "Mi negocio", icon: LayoutDashboard },
    { to: "/mis-productos", label: "Mis productos", icon: Package },
    { to: "/marketplace", label: "Encontrar compradores", icon: Search },
    { to: "/solicitudes", label: "Mis negociaciones", icon: FileText },
    { to: "/cotizaciones", label: "Mis ventas", icon: Files },
    { to: "/operaciones", label: "Mis operaciones", icon: Truck },
    { to: "/evidencia-stellar", label: "Evidencia Stellar", icon: Blocks },
    ...COMUNES,
  ],
  comprador_nacional: [
    { to: "/", label: "Inicio", icon: LayoutDashboard },
    { to: "/marketplace", label: "Buscar productos", icon: ShoppingCart },
    { to: "/solicitudes", label: "Mis solicitudes", icon: FileText },
    { to: "/cotizaciones", label: "Ofertas recibidas", icon: Files },
    { to: "/operaciones", label: "Mis compras", icon: Truck },
    { to: "/evidencia-stellar", label: "Evidencia Stellar", icon: Blocks },
    { to: "/asistente", label: "Mensajes", icon: MessageSquareText },
    { to: "/mi-empresa", label: "Mi empresa", icon: Building2 },
    { to: "/configuracion", label: "Configuración", icon: Settings },
  ],
  comprador_internacional: [
    { to: "/marketplace", label: "Buscar productos", icon: ShoppingCart },
    { to: "/solicitudes", label: "Solicitudes de compra", icon: FileText },
    { to: "/matching", label: "Matching", icon: Sparkles },
    { to: "/cotizaciones", label: "Cotizaciones", icon: Files },
    { to: "/documentacion", label: "Documentación compartida", icon: Files },
    { to: "/operaciones", label: "Operaciones", icon: Truck },
    { to: "/evidencia-stellar", label: "Evidencia Stellar", icon: Blocks },
    { to: "/asistente", label: "Mensajes", icon: MessageSquareText },
    { to: "/mi-empresa", label: "Mi empresa", icon: Building2 },
    { to: "/configuracion", label: "Configuración", icon: Settings },
  ],
  exportador: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/asistente", label: "Asistente WhatsApp", icon: MessageSquareText },
    { to: "/marketplace", label: "Marketplace", icon: ShoppingCart },
    { to: "/mis-productos", label: "Mis productos", icon: Package },
    { to: "/solicitudes", label: "Solicitudes de compra", icon: FileText },
    { to: "/matching", label: "Matching inteligente", icon: Sparkles },
    { to: "/inteligencia-mercados", label: "Inteligencia de mercados", icon: Globe2 },
    { to: "/calculadora", label: "Calculadora COMEX", icon: Calculator },
    { to: "/cotizaciones", label: "Cotizaciones", icon: Files },
    { to: "/documentacion", label: "Documentación", icon: Files },
    { to: "/operaciones", label: "Operaciones y embarques", icon: Truck },
    { to: "/conciliacion", label: "Conciliación financiera", icon: Scale },
    { to: "/trazabilidad", label: "Trazabilidad", icon: Waypoints },
    { to: "/evidencia-stellar", label: "Evidencia Stellar", icon: Blocks },
    { to: "/mi-empresa", label: "Mi empresa", icon: Building2 },
    { to: "/configuracion", label: "Configuración", icon: Settings },
  ],
};
