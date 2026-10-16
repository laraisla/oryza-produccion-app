import type {
  BankReportStatus,
  DocumentStatus,
  DocumentType,
  Incoterm,
  OperationStatus,
  PackagingType,
  Party,
  PaymentMethod,
  Processing,
  ProductCategory,
  QuotationStatus,
  ReconciliationStatus,
  RequestStatus,
  RequirementCategory,
  RiceType,
  Role,
  ShipmentStatus,
  TransportMode,
  VerificationStatus,
  VersionStatus,
} from '@/domain/catalogs';
import type { CostingInput, CostingResult, CostLineInput, FinancingInput, PricingInput } from '@/domain/costing';
import type { RoundingMode } from '@/domain/decimal';
import type { NamedPlaceKind } from '@/domain/incoterms';
import type { MatchResult, PackagingRef } from '@/domain/matching';
import type { MovementType, PackagingDecision } from '@/domain/quantity';
import type { ReconciliationResult } from '@/domain/reconciliation';
import type { Currency } from '@/domain/units';
import type { CanonicalValue } from '@/integrations/stellar/terms';

/** Identificadores UUID; los importes y cantidades se guardan como strings decimales. */
export type ID = string;
export type Dec = string;
export type ISODate = string;
export type ISODateTime = string;

export type OrgKind = 'producer' | 'mill' | 'exporter' | 'buyer';

export interface Organization {
  id: ID;
  name: string;
  kinds: OrgKind[];
  country: string;
  province?: string | null;
  city?: string | null;
  taxId?: string | null;
  /** Dirección pública Stellar para firmar acuerdos (nunca la clave secreta). */
  stellarAddress?: string | null;
  isDemo: boolean;
  createdAt: ISODateTime;
}

export interface User {
  id: ID;
  name: string;
  email: string;
  organizationId: ID;
  role: Role;
  isDemo: boolean;
}

export interface Facility {
  id: ID;
  organizationId: ID;
  name: string;
  type: 'mill' | 'plant' | 'warehouse' | 'farm';
  country: string;
  province: string;
  city: string;
  address: string;
  exitPortId?: ID | null;
  distanceToPortKm?: Dec | null;
  distanceSource?: 'manual' | 'service' | null;
  loadingConditions?: string | null;
  logisticsNotes?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Port {
  id: ID;
  name: string;
  country: string;
  city: string;
  code?: string | null;
  kind: 'origin' | 'destination' | 'both';
}

export interface ContainerType {
  id: ID;
  code: string;
  name: string;
  maxPayloadKg: Dec;
  operationalLimitKg?: Dec | null;
  usableVolumeM3?: Dec | null;
  maxPallets?: number | null;
  source: string;
  verificationStatus: VerificationStatus;
}

export interface Presentation {
  id: ID;
  label: string;
  packaging: PackagingType;
  netWeightKg?: Dec | null;
  tareWeightKg?: Dec | null;
  unitsPerPallet?: number | null;
  palletTareKg?: Dec | null;
  packageVolumeM3?: Dec | null;
}

export interface Product {
  id: ID;
  organizationId: ID;
  code: string;
  name: string;
  category: ProductCategory;
  commercialType: RiceType;
  variety?: string | null;
  processing: Processing;
  ncm?: string | null;
  ncmDescription?: string | null;
  ncmStatus: VerificationStatus;
  ncmSource?: string | null;
  description?: string | null;
  presentations: Presentation[];
  /** Presentaciones a las que la planta declara poder reenvasar. */
  convertibleTo: PackagingRef[];
  status: 'active' | 'inactive';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy: ID;
}

export interface QualityParam {
  name: string;
  value: string;
  unit: string;
}

export interface QualityAnalysis {
  brokenPct: Dec | null;
  moisturePct: Dec | null;
  impuritiesPct: Dec | null;
  other: QualityParam[];
  analysisDate?: ISODate | null;
  analyst?: string | null;
  documentRef?: string | null;
  verificationStatus: VerificationStatus;
  validUntil?: ISODate | null;
}

export interface LotCertificationEntry {
  name: string;
  status: VerificationStatus;
  documentRef?: string | null;
}

export interface Lot {
  id: ID;
  organizationId: ID;
  productId: ID;
  code: string;
  facilityId: ID;
  presentationId: ID;
  /** Stock físico inicial; los movimientos de inventario lo ajustan. */
  physicalStockT: Dec;
  harvest?: string | null;
  availableFrom: ISODate;
  quality: QualityAnalysis;
  certifications: LotCertificationEntry[];
  published: boolean;
  status: 'active' | 'inactive';
  notes?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy: ID;
}

export interface InventoryMovement {
  id: ID;
  organizationId: ID;
  lotId: ID;
  type: MovementType;
  quantityT: Dec;
  convertsReservation?: boolean;
  reference: { kind: 'quotation' | 'operation' | 'shipment' | 'manual'; id: ID | null };
  note?: string | null;
  createdAt: ISODateTime;
  createdBy: ID;
}

export interface BuyerRequest {
  id: ID;
  code: string;
  buyerOrganizationId: ID;
  contactName: string;
  contactEmail?: string | null;
  status: RequestStatus;
  visibility: 'public' | 'private';
  invitedOrganizationIds: ID[];
  category: ProductCategory;
  commercialType: RiceType;
  varietyPolicy: 'exact' | 'equivalents_allowed';
  variety?: string | null;
  processing: Processing;
  maxBrokenPct: Dec;
  maxMoisturePct?: Dec | null;
  maxImpuritiesPct?: Dec | null;
  quantityT: Dec;
  packaging: PackagingRef;
  packagingFlexible: boolean;
  allowConsolidation: boolean;
  destinationCountry: string;
  destinationCity?: string | null;
  destinationPortId?: ID | null;
  finalAddress?: string | null;
  availabilityDeadline?: ISODate | null;
  deliveryDate?: ISODate | null;
  currency: Currency;
  preferredIncoterm?: Incoterm | null;
  requiredCertifications: string[];
  buyerDocuments: { name: string; note?: string | null }[];
  notes?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy: ID;
}

export interface MatchSnapshot {
  id: ID;
  organizationId: ID;
  requestId: ID;
  result: MatchResult;
  evaluatedAt: ISODateTime;
  evaluatedBy: ID;
}

export interface CostCatalogItem extends Omit<CostLineInput, 'id' | 'enabled'> {
  id: ID;
  organizationId: ID;
  key: string;
  defaultEnabled: boolean;
  updatedAt: ISODateTime;
}

export interface FxRate {
  id: ID;
  organizationId: ID;
  base: Currency;
  quote: Currency;
  rate: Dec;
  date: ISODate;
  source: string;
  sourceUrl?: string | null;
  status: VerificationStatus;
  createdAt: ISODateTime;
}

export interface CustomsInfo {
  ncm: string;
  ncmDescription: string;
  exportDutyStatus: VerificationStatus;
  exportDutyNote: string;
  refundStatus: VerificationStatus;
  refundNote: string;
  normativeSource: string;
  verifiedAt?: ISODate | null;
}

export interface FinancePlan {
  bank: string;
  paymentMethod: PaymentMethod;
  expectedCollectionDate?: ISODate | null;
  advancePct: Dec;
  fxRateId?: ID | null;
  notes?: string | null;
}

export interface CommercialTerms {
  incoterm: Incoterm;
  namedPlace: string;
  namedPlaceKind: NamedPlaceKind;
  transportMode: TransportMode;
  currency: Currency;
  shipmentDate?: ISODate | null;
  paymentTerms: string;
  validityDays: number;
  commissionNote?: string | null;
}

/** Escenario de cálculo: documento de trabajo editable de la calculadora y del asistente. */
export interface CostScenario {
  id: ID;
  organizationId: ID;
  name: string;
  status: 'draft' | 'quoted' | 'archived';
  wizardStep: number;
  requestId?: ID | null;
  buyerOrganizationId?: ID | null;
  productId?: ID | null;
  lots: { lotId: ID; quantityT: Dec }[];
  quantityT: Dec;
  presentationId?: ID | null;
  packagingDecision?: PackagingDecision | null;
  originFacilityId?: ID | null;
  exitPortId?: ID | null;
  destinationCountry?: string | null;
  destinationCity?: string | null;
  destinationPortId?: ID | null;
  containerTypeId?: ID | null;
  containersOverride?: number | null;
  commercial: CommercialTerms;
  lines: CostLineInput[];
  pricing: PricingInput;
  rounding: { decimals: number; mode: RoundingMode; target: 'per_ton' | 'total' };
  financing: FinancingInput;
  customs: CustomsInfo;
  finance: FinancePlan;
  fxRateIds: ID[];
  quotationId?: ID | null;
  notes?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy: ID;
}

export interface Quotation {
  id: ID;
  code: string;
  sellerOrganizationId: ID;
  buyerOrganizationId: ID;
  requestId?: ID | null;
  scenarioId?: ID | null;
  productId: ID;
  operationId?: ID | null;
  status: QuotationStatus;
  currentVersionId: ID;
  acceptedVersionId?: ID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy: ID;
}

/** Copia inmutable de lo pactado: lo único que ve el comprador de una cotización. */
export interface AgreementTerms {
  [key: string]: CanonicalValue | undefined;
}

export interface QuotationVersion {
  id: ID;
  quotationId: ID;
  version: number;
  status: VersionStatus;
  /** Escenario completo al momento de crear la versión (privado del vendedor). */
  scenario: CostScenario;
  costingInput: CostingInput;
  result: CostingResult;
  pricePerT: Dec;
  totalAmount: Dec;
  currency: Currency;
  quantityT: Dec;
  incoterm: Incoterm;
  namedPlace: string;
  validUntil: ISODate;
  terms: AgreementTerms;
  termsHash: string;
  changeNote?: string | null;
  createdAt: ISODateTime;
  createdBy: ID;
  sentAt?: ISODateTime | null;
  acceptedAt?: ISODateTime | null;
  acceptedBy?: ID | null;
  rejectedAt?: ISODateTime | null;
  rejectedBy?: ID | null;
  rejectionReason?: string | null;
}

export interface TradeOperation {
  id: ID;
  code: string;
  sellerOrganizationId: ID;
  buyerOrganizationId: ID;
  quotationId: ID;
  acceptedVersionId?: ID | null;
  requestId?: ID | null;
  productId: ID;
  lots: { lotId: ID; quantityT: Dec }[];
  quantityT: Dec;
  pricePerT: Dec;
  totalAmount: Dec;
  currency: Currency;
  incoterm: Incoterm;
  namedPlace: string;
  paymentMethod: PaymentMethod;
  paymentTerms: string;
  shipmentDate?: ISODate | null;
  destinationCountry: string;
  destinationPortId?: ID | null;
  termsHash?: string | null;
  status: OperationStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy: ID;
  confirmedAt?: ISODateTime | null;
}

export interface ContainerRecord {
  number: string;
  seal?: string | null;
  grossKg?: Dec | null;
  vgmKg?: Dec | null;
}

export interface Shipment {
  id: ID;
  operationId: ID;
  organizationId: ID;
  status: ShipmentStatus;
  containerTypeId?: ID | null;
  containers: ContainerRecord[];
  vessel?: string | null;
  voyage?: string | null;
  bookingNumber?: string | null;
  blNumber?: string | null;
  exportPermitNumber?: string | null;
  portOfLoadingId?: ID | null;
  portOfDischargeId?: ID | null;
  plannedDate?: ISODate | null;
  dispatchedAt?: ISODate | null;
  shippedAt?: ISODate | null;
  receivedAt?: ISODate | null;
  shippedQuantityT?: Dec | null;
  packages?: number | null;
  grossWeightKg?: Dec | null;
  notes?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ResponsibleParty = Party | 'forwarder' | 'customs_broker' | 'bank' | 'laboratory';

export interface DestinationRequirement {
  id: ID;
  country: string;
  ncmPrefix?: string | null;
  processing?: Processing[] | null;
  transportModes?: TransportMode[] | null;
  paymentMethods?: PaymentMethod[] | null;
  buyerOrganizationId?: ID | null;
  category: RequirementCategory;
  documentType: DocumentType;
  name: string;
  description: string;
  issuer: string;
  responsibleParty: ResponsibleParty;
  requiredIf?: string | null;
  sourceName: string;
  sourceUrl?: string | null;
  verifiedAt?: ISODate | null;
  verificationStatus: VerificationStatus;
  dueDaysBeforeShipment?: number | null;
}

export interface OperationDocument {
  id: ID;
  operationId: ID;
  /** Organización dueña del documento (quien lo aporta). */
  organizationId: ID;
  requirementId?: ID | null;
  documentType: DocumentType;
  name: string;
  responsibleParty: ResponsibleParty;
  status: DocumentStatus;
  dueDate?: ISODate | null;
  issuer?: string | null;
  currentVersion: number;
  requirementSource?: string | null;
  requirementStatus?: VerificationStatus | null;
  notes?: string | null;
  observation?: string | null;
  sharedWithCounterparty: boolean;
  isFinancial: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface DocumentVersion {
  id: ID;
  documentId: ID;
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  /** Clave del archivo en IndexedDB; null en documentos demo sin archivo binario. */
  storageKey: string | null;
  /** Contenido de texto de los documentos ficticios del seed. */
  demoContent?: string | null;
  uploadedAt: ISODateTime;
  uploadedBy: ID;
  note?: string | null;
}

export interface Invoice {
  id: ID;
  operationId: ID;
  organizationId: ID;
  number: string;
  issueDate: ISODate;
  currency: Currency;
  amount: Dec;
  quantityT: Dec;
  exportPermitNumber?: string | null;
  createdAt: ISODateTime;
  createdBy: ID;
}

export interface Payment {
  id: ID;
  operationId: ID;
  organizationId: ID;
  reference: string;
  receivedDate: ISODate;
  currency: Currency;
  grossAmount: Dec;
  foreignBankFees: Dec;
  localBankFees: Dec;
  otherDeductions: Dec;
  netAmount: Dec;
  isAdvance: boolean;
  bankName?: string | null;
  bankReportStatus: BankReportStatus;
  evidenceDocumentIds: ID[];
  /** Registro informativo cargado por el usuario: nunca una operación bancaria efectiva. */
  recordKind: 'informational';
  notes?: string | null;
  createdAt: ISODateTime;
  createdBy: ID;
}

export interface PaymentAllocation {
  id: ID;
  paymentId: ID;
  invoiceId: ID;
  amount: Dec;
}

export interface Reconciliation {
  id: ID;
  operationId: ID;
  organizationId: ID;
  status: ReconciliationStatus;
  lastResult?: ReconciliationResult | null;
  operatorNote?: string | null;
  reconciledBy?: ID | null;
  reconciledAt?: ISODateTime | null;
  updatedAt: ISODateTime;
}

export type VerificationSubjectKind =
  | 'cost_catalog'
  | 'fx_rate'
  | 'requirement'
  | 'lot_quality'
  | 'product_ncm'
  | 'container_type'
  | 'price'
  | 'blockchain';

export interface VerificationHistoryEntry {
  at: ISODateTime;
  by: ID;
  from: VerificationStatus;
  to: VerificationStatus;
  value?: string | null;
  note?: string | null;
}

export interface VerificationRecord {
  id: ID;
  organizationId: ID;
  subject: { kind: VerificationSubjectKind; id: ID; field?: string | null };
  dataLabel: string;
  value: string;
  unit: string;
  source: string;
  evidenceUrl?: string | null;
  evidenceDocumentId?: ID | null;
  consultedAt: ISODate;
  validUntil?: ISODate | null;
  responsible: string;
  status: VerificationStatus;
  notes?: string | null;
  history: VerificationHistoryEntry[];
}

export type TraceEventType =
  | 'lot_created'
  | 'quality_recorded'
  | 'offer_published'
  | 'request_created'
  | 'request_accepted'
  | 'quotation_created'
  | 'quotation_sent'
  | 'quotation_confirmed'
  | 'quotation_rejected'
  | 'operation_created'
  | 'documents_prepared'
  | 'document_updated'
  | 'dispatched'
  | 'shipped'
  | 'received'
  | 'payment_received'
  | 'reconciled'
  | 'reconciliation_review'
  | 'blockchain_recorded'
  | 'stock_movement';

export interface TraceEvent {
  id: ID;
  at: ISODateTime;
  actorUserId: ID;
  organizationId: ID;
  type: TraceEventType;
  title: string;
  detail?: string | null;
  operationId?: ID | null;
  lotIds?: ID[];
  entity: { kind: string; id: ID };
  /** Eventos compartidos son visibles para la contraparte de la operación. */
  shared: boolean;
}

export interface BlockchainRecord {
  id: ID;
  operationId: ID;
  network: 'testnet' | 'local';
  contractId: string;
  action: 'create_deal' | 'accept_deal' | 'amend_terms' | 'record_proof';
  dealKey: string;
  termsHash: string;
  termsVersion: number;
  txHash: string;
  ledger: number;
  confirmedAt: ISODateTime;
  signer: string;
  /** Solo se guarda tras confirmación SUCCESS del RPC; nunca hay registros simulados. */
  status: 'confirmed';
  createdBy: ID;
}

export interface AuditEntry {
  id: ID;
  at: ISODateTime;
  actorUserId: ID;
  organizationId: ID;
  entity: string;
  entityId: ID;
  action: string;
  summary: string;
  changes?: { field: string; before: unknown; after: unknown }[];
}

export interface AppSettings {
  rounding: { decimals: number; mode: RoundingMode; target: 'per_ton' | 'total' };
  stellar: { network: 'testnet' | 'local'; contractId: string | null; rpcUrl: string | null };
}

export interface Database {
  schemaVersion: number;
  seedVersion: string;
  organizations: Organization[];
  users: User[];
  facilities: Facility[];
  ports: Port[];
  containerTypes: ContainerType[];
  products: Product[];
  lots: Lot[];
  inventoryMovements: InventoryMovement[];
  requests: BuyerRequest[];
  matchSnapshots: MatchSnapshot[];
  costCatalog: CostCatalogItem[];
  fxRates: FxRate[];
  scenarios: CostScenario[];
  quotations: Quotation[];
  quotationVersions: QuotationVersion[];
  operations: TradeOperation[];
  shipments: Shipment[];
  requirements: DestinationRequirement[];
  documents: OperationDocument[];
  documentVersions: DocumentVersion[];
  invoices: Invoice[];
  payments: Payment[];
  paymentAllocations: PaymentAllocation[];
  reconciliations: Reconciliation[];
  verifications: VerificationRecord[];
  traceEvents: TraceEvent[];
  blockchainRecords: BlockchainRecord[];
  auditLog: AuditEntry[];
  settings: AppSettings;
}

export const SCHEMA_VERSION = 1;

export type CollectionKey = {
  [K in keyof Database]: Database[K] extends unknown[] ? K : never;
}[keyof Database];
