/**
 * Datos maestros iniciales de ORYZA.
 *
 * HIPÓTESIS (configurables desde Administración):
 *  - Tres líneas de fraccionado con capacidades nominales estimadas.
 *  - Unidades por pallet estándar por presentación (≈1 tn por pallet).
 *  - Big Bag de 1.000 kg.
 *  - Objetivos de producción/productividad por línea.
 */
import type {
  AppSettings,
  DowntimeCategory,
  Line,
  Presentation,
  Product,
  Shift,
  User,
  Variety,
} from '@/types/domain';

export const DEFAULT_USERS: User[] = [
  { id: 'u-jperez', name: 'Juan Pérez', role: 'operator', active: true, code: 'OP-014' },
  { id: 'u-lfernandez', name: 'Lucía Fernández', role: 'operator', active: true, code: 'OP-022' },
  { id: 'u-cgomez', name: 'Carlos Gómez', role: 'operator', active: true, code: 'OP-031' },
  { id: 'u-mruiz', name: 'Martín Ruiz', role: 'operator', active: true, code: 'OP-037' },
  { id: 'u-mgonzalez', name: 'María González', role: 'supervisor', active: true, code: 'SP-004' },
  { id: 'u-dbenitez', name: 'Diego Benítez', role: 'supervisor', active: true, code: 'SP-007' },
  { id: 'u-alopez', name: 'Ana López', role: 'admin', active: true, code: 'AD-001' },
];

export const DEFAULT_VARIETIES: Variety[] = [
  { id: 'v-irga424', name: 'IRGA 424', active: true, code: 'IRGA424' },
  { id: 'v-nupoty', name: 'Ñu Poty', active: true, code: 'NUPOTY' },
  { id: 'v-otras', name: 'Otras', active: true, code: 'OTRAS' },
];

export const DEFAULT_PRODUCTS: Product[] = [
  { id: 'p-largofino', name: 'Arroz Largo Fino', active: true, code: 'LF', defaultVarietyId: 'v-irga424' },
  { id: 'p-blanco', name: 'Arroz Blanco', active: true, code: 'BL', defaultVarietyId: 'v-nupoty' },
  { id: 'p-quebrado', name: 'Arroz Quebrado', active: true, code: 'QB', defaultVarietyId: 'v-otras' },
];

export const DEFAULT_PRESENTATIONS: Presentation[] = [
  { id: 'pr-1', name: '1 kg', active: true, unitWeightKg: 1, unitsPerPallet: 1000 },
  { id: 'pr-5', name: '5 kg', active: true, unitWeightKg: 5, unitsPerPallet: 200 },
  { id: 'pr-10', name: '10 kg', active: true, unitWeightKg: 10, unitsPerPallet: 100 },
  { id: 'pr-25', name: '25 kg', active: true, unitWeightKg: 25, unitsPerPallet: 40 },
  { id: 'pr-45', name: '45 kg', active: true, unitWeightKg: 45, unitsPerPallet: 22 },
  { id: 'pr-50', name: '50 kg', active: true, unitWeightKg: 50, unitsPerPallet: 20 },
  { id: 'pr-bb', name: 'Big Bag 1.000 kg', active: true, unitWeightKg: 1000, unitsPerPallet: 1 },
];

export const DEFAULT_LINES: Line[] = [
  {
    id: 'l-1',
    name: 'Línea 1 · Fraccionadora 1-5 kg',
    code: 'L1',
    active: true,
    module: 'fraccionamiento',
    nominalCapacityKgH: 3200,
    targetKgPerHour: 2600,
    targetKgPerShift: 17000,
  },
  {
    id: 'l-2',
    name: 'Línea 2 · Embolsadora 10-50 kg',
    code: 'L2',
    active: true,
    module: 'fraccionamiento',
    nominalCapacityKgH: 6000,
    targetKgPerHour: 4800,
    targetKgPerShift: 30000,
  },
  {
    id: 'l-3',
    name: 'Línea 3 · Big Bag',
    code: 'L3',
    active: true,
    module: 'fraccionamiento',
    nominalCapacityKgH: 9000,
    targetKgPerHour: 7000,
    targetKgPerShift: 42000,
  },
];

export const DEFAULT_SHIFTS: Shift[] = [
  { id: 's-m', name: 'Mañana', code: 'M', start: '06:00', end: '14:00', active: true },
  { id: 's-t', name: 'Tarde', code: 'T', start: '14:00', end: '22:00', active: true },
  { id: 's-n', name: 'Noche', code: 'N', start: '22:00', end: '06:00', active: true },
];

export const DEFAULT_DOWNTIME_CATEGORIES: DowntimeCategory[] = [
  { id: 'dc-mec', name: 'Mecánica', kind: 'falla', active: true },
  { id: 'dc-ele', name: 'Eléctrica', kind: 'falla', active: true },
  { id: 'dc-mp', name: 'Falta de materia prima', kind: 'abastecimiento', active: true },
  { id: 'dc-cambio', name: 'Cambio de producto', kind: 'planificada', active: true },
  { id: 'dc-limp', name: 'Limpieza', kind: 'planificada', active: true },
  { id: 'dc-ajuste', name: 'Ajuste de máquina', kind: 'operativa', active: true },
  { id: 'dc-env', name: 'Falta de envases', kind: 'abastecimiento', active: true },
  { id: 'dc-cc', name: 'Control de calidad', kind: 'operativa', active: true },
  { id: 'dc-pers', name: 'Personal', kind: 'otra', active: true },
  { id: 'dc-otros', name: 'Otros', kind: 'otra', active: true },
  { id: 'dc-hist', name: 'Sin clasificar (histórico)', kind: 'otra', active: false },
];

/** Motivos frecuentes por categoría: se ofrecen como autocompletado en el formulario. */
export const COMMON_REASONS: Record<string, string[]> = {
  'dc-mec': ['Rotura de correa', 'Atasco en tolva', 'Falla de cosedora', 'Rodamiento con ruido', 'Cadena de transporte trabada'],
  'dc-ele': ['Corte de energía', 'Falla de sensor', 'Disparo de térmica', 'Falla en tablero'],
  'dc-mp': ['Silo pulmón vacío', 'Demora en elevador', 'Espera de liberación de laboratorio'],
  'dc-cambio': ['Cambio de presentación', 'Cambio de producto', 'Cambio de bobina de film'],
  'dc-limp': ['Limpieza programada', 'Limpieza por cambio de variedad', 'Limpieza de balanza'],
  'dc-ajuste': ['Ajuste de dosificador', 'Calibración de balanza', 'Ajuste de mordazas', 'Ajuste de fechador'],
  'dc-env': ['Sin bolsas en línea', 'Demora de proveedor de envases', 'Film defectuoso'],
  'dc-cc': ['Retención por humedad', 'Control de peso fuera de rango', 'Verificación de impresión'],
  'dc-pers': ['Falta de operario', 'Capacitación', 'Reunión de seguridad'],
  'dc-otros': ['Inspección externa', 'Autoelevador no disponible'],
  'dc-hist': [],
};

export const SCRAP_REASONS = [
  'Bolsas rotas',
  'Derrame en tolva',
  'Producto barrido',
  'Arranque de máquina',
  'Ajuste de peso',
  'Sellado defectuoso',
  'Contaminación / material extraño',
];

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'ORYZA S.A.',
  plantName: 'Planta de Fraccionado',
  targets: {
    targetKgPerShift: 22000,
    targetKgPerHour: 3500,
    maxScrapPct: 2,
    maxStopMinutes: 45,
    maxDowntimePct: 15,
    pendingAlertHours: 24,
  },
};
