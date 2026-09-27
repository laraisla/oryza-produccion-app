/**
 * Modelo de dominio de ORYZA.
 *
 * Las entidades reflejan el modelo lógico relacional (ver docs/MODELO_DATOS.md).
 * Cada tabla de maestros comparte la forma `CatalogBase` para que la
 * administración (ABM) sea genérica y nuevos módulos del MES (Recepción,
 * Secado, Silos, etc.) puedan reutilizarla.
 */

export type ID = string;

/** Módulos de proceso de la planta. El MVP implementa solo `fraccionamiento`. */
export type ProcessModule =
  | 'recepcion'
  | 'secado'
  | 'silos'
  | 'produccion'
  | 'laboratorio'
  | 'fraccionamiento'
  | 'deposito'
  | 'expedicion';

export type Role = 'operator' | 'supervisor' | 'admin';

export interface User {
  id: ID;
  name: string;
  role: Role;
  active: boolean;
  /** Legajo / código interno (opcional). */
  code?: string;
}

export interface CatalogBase {
  id: ID;
  name: string;
  active: boolean;
  code?: string;
}

export interface Product extends CatalogBase {
  /** Variedad sugerida al seleccionar el producto. */
  defaultVarietyId?: ID;
}

export type Variety = CatalogBase;

export interface Presentation extends CatalogBase {
  /** Peso nominal por unidad (kg). */
  unitWeightKg: number;
  /** Unidades por pallet (estándar de palletizado). */
  unitsPerPallet: number;
}

export interface Line extends CatalogBase {
  module: ProcessModule;
  /**
   * Capacidad nominal (kg/h). Hipótesis: dato a validar con Ingeniería.
   * Permite calcular Rendimiento y OEE estimado.
   */
  nominalCapacityKgH?: number;
  /** Objetivos propios de la línea. Si no se definen, se usan los objetivos generales. */
  targetKgPerHour?: number;
  targetKgPerShift?: number;
}

export interface Shift extends CatalogBase {
  /** HH:mm */
  start: string;
  /** HH:mm (si es menor que start, el turno cruza la medianoche) */
  end: string;
}

/** Clasificación de parada, necesaria para MTBF/MTTR y análisis de pérdidas. */
export type DowntimeKind = 'falla' | 'operativa' | 'abastecimiento' | 'planificada' | 'otra';

export interface DowntimeCategory extends CatalogBase {
  kind: DowntimeKind;
}

export interface Targets {
  /** Producción objetivo por turno (kg). */
  targetKgPerShift: number;
  /** Productividad objetivo (kg / hora productiva). */
  targetKgPerHour: number;
  /** Merma máxima admitida (%). */
  maxScrapPct: number;
  /** Duración máxima de una parada individual antes de alertar (min). */
  maxStopMinutes: number;
  /** Porcentaje máximo de tiempo detenido por registro (%). */
  maxDowntimePct: number;
  /** Horas tras las que un registro pendiente se considera demorado. */
  pendingAlertHours: number;
}

export interface AppSettings {
  targets: Targets;
  companyName: string;
  plantName: string;
}

export type RecordStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type QualityValue = 'ok' | 'obs' | 'nc' | null;

export interface QualityCheck {
  lotOk: QualityValue;
  packagingOk: QualityValue;
  printingOk: QualityValue;
  weightOk: QualityValue;
  productOk: QualityValue;
  observations: string;
  hasIncident: boolean;
  incidentDescription: string;
}

export interface Downtime {
  id: ID;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  /** Calculado y persistido para facilitar consultas / exportaciones. */
  durationMinutes: number;
  categoryId: ID;
  reason: string;
  observations: string;
}

export interface ProductionRecord {
  id: ID;
  /** Número legible correlativo: PR-000231 */
  number: string;
  module: ProcessModule;
  /** YYYY-MM-DD (fecha de inicio del turno) */
  date: string;
  shiftId: ID;
  operatorId: ID;
  lineId: ID;
  productId: ID;
  varietyId: ID;
  lot: string;
  presentationId: ID;
  startTime: string;
  endTime: string;
  units: number;
  /** Copia del peso unitario al momento de la carga (no cambia si luego se edita la presentación). */
  unitWeightKg: number;
  totalKg: number;
  pallets: number;
  unitsPerPallet: number;
  scrapKg: number;
  rejectedKg: number;
  scrapReason: string;
  scrapObservations: string;
  observations: string;
  downtimes: Downtime[];
  quality: QualityCheck;
  status: RecordStatus;
  source: 'manual' | 'import';
  createdBy: ID;
  createdAt: string;
  updatedBy: ID;
  updatedAt: string;
  submittedAt?: string;
  approvedBy?: ID;
  approvedAt?: string;
  rejectedBy?: ID;
  rejectedAt?: string;
  reviewComment?: string;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'submit'
  | 'withdraw'
  | 'approve'
  | 'reject'
  | 'reopen'
  | 'delete'
  | 'duplicate'
  | 'import'
  | 'close_day'
  | 'config'
  | 'reset';

export interface FieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface AuditEntry {
  id: ID;
  at: string;
  userId: ID;
  action: AuditAction;
  entity: string;
  entityId: ID;
  entityLabel: string;
  changes: FieldChange[];
  comment?: string;
}

export interface DailyClosure {
  id: ID;
  date: string;
  closedBy: ID;
  closedAt: string;
  notes: string;
  /** Resumen congelado al momento del cierre (documento operativo). */
  summary: {
    totalKg: number;
    records: number;
    pending: number;
    productiveMin: number;
    downtimeMin: number;
    scrapKg: number;
    scrapPct: number;
    incidents: number;
  };
}

/** Estado completo persistido. Cada clave equivale a una tabla. */
export interface Database {
  schemaVersion: number;
  users: User[];
  products: Product[];
  varieties: Variety[];
  presentations: Presentation[];
  lines: Line[];
  shifts: Shift[];
  downtimeCategories: DowntimeCategory[];
  records: ProductionRecord[];
  audit: AuditEntry[];
  closures: DailyClosure[];
  settings: AppSettings;
  counters: { record: number };
}

export type CatalogKey =
  | 'products'
  | 'varieties'
  | 'presentations'
  | 'lines'
  | 'shifts'
  | 'downtimeCategories';
