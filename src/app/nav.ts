import {
  Calculator,
  ClipboardList,
  FileText,
  FolderCheck,
  GitCompareArrows,
  History,
  Landmark,
  LayoutDashboard,
  Package,
  Settings,
  Ship,
  ShieldCheck,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { can } from '@/data/access';
import type { User } from '@/data/model';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: 'General' | 'Comercial' | 'Expediente' | 'Control';
  visible: (user: User) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'General', visible: () => true },
  { to: '/marketplace', label: 'Marketplace', icon: Store, group: 'Comercial', visible: () => true },
  { to: '/productos', label: 'Mis productos', icon: Package, group: 'Comercial', visible: (u) => can(u, 'product.manage') || can(u, 'lot.manage') },
  { to: '/solicitudes', label: 'Solicitudes de compra', icon: ClipboardList, group: 'Comercial', visible: () => true },
  { to: '/matching', label: 'Matching inteligente', icon: GitCompareArrows, group: 'Comercial', visible: () => true },
  { to: '/calculadora', label: 'Calculadora COMEX', icon: Calculator, group: 'Comercial', visible: (u) => can(u, 'scenario.manage') },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, group: 'Comercial', visible: () => true },
  { to: '/operaciones', label: 'Operaciones y embarques', icon: Ship, group: 'Expediente', visible: (u) => can(u, 'operation.view') },
  { to: '/documentacion', label: 'Documentación', icon: FolderCheck, group: 'Expediente', visible: (u) => can(u, 'operation.view') },
  { to: '/conciliacion', label: 'Conciliación financiera', icon: Landmark, group: 'Expediente', visible: (u) => can(u, 'finance.view') },
  { to: '/trazabilidad', label: 'Trazabilidad', icon: History, group: 'Expediente', visible: () => true },
  { to: '/verificacion', label: 'Verificación', icon: ShieldCheck, group: 'Control', visible: () => true },
  { to: '/configuracion', label: 'Configuración', icon: Settings, group: 'Control', visible: () => true },
];
