/** Catálogos controlados del dominio y sus etiquetas en español. */

export type RiceType =
  | 'long_fine'
  | 'long_wide'
  | 'medium'
  | 'short'
  | 'jasmine'
  | 'basmati'
  | 'persian'
  | 'aromatic_other';

export const RICE_TYPES: Record<RiceType, string> = {
  long_fine: 'Largo fino',
  long_wide: 'Largo ancho',
  medium: 'Grano medio',
  short: 'Grano corto',
  jasmine: 'Jazmín (aromático)',
  basmati: 'Basmati (aromático)',
  persian: 'Persa (aromático)',
  aromatic_other: 'Otro aromático',
};

export type Processing = 'paddy' | 'brown' | 'white' | 'parboiled' | 'broken';

export const PROCESSING: Record<Processing, string> = {
  paddy: 'Con cáscara',
  brown: 'Integral',
  white: 'Blanco / pulido',
  parboiled: 'Parbolizado',
  broken: 'Partido',
};

export type ProductCategory = 'rice' | 'other';

export const PRODUCT_CATEGORIES: Record<ProductCategory, string> = {
  rice: 'Arroz',
  other: 'Otro producto agroindustrial',
};

export type PackagingType = 'bulk' | 'bag' | 'big_bag' | 'box';

export const PACKAGING_TYPES: Record<PackagingType, string> = {
  bulk: 'Granel',
  bag: 'Bolsa',
  big_bag: 'Big bag',
  box: 'Caja',
};

export type TransportMode = 'truck' | 'container' | 'bulk_vessel' | 'multimodal';

export const TRANSPORT_MODES: Record<TransportMode, string> = {
  truck: 'Camión',
  container: 'Contenedor marítimo',
  bulk_vessel: 'Buque granelero',
  multimodal: 'Multimodal',
};

/** Estados de verificación de cualquier dato que respalde un cálculo o requisito. */
export type VerificationStatus = 'estimated' | 'quoted' | 'verified' | 'pending' | 'expired';

export const VERIFICATION_STATUS: Record<VerificationStatus, string> = {
  estimated: 'Estimado',
  quoted: 'Cotizado',
  verified: 'Verificado',
  pending: 'Pendiente',
  expired: 'Vencido',
};

export const VERIFICATION_HELP: Record<VerificationStatus, string> = {
  estimated: 'Valor aproximado sin cotización ni respaldo verificado.',
  quoted: 'Valor cotizado por un proveedor; vigente según su fecha de vencimiento.',
  verified: 'Contrastado por un responsable contra una fuente o documento identificado.',
  pending: 'Dato faltante o requisito pendiente de verificación.',
  expired: 'El respaldo superó su fecha de vencimiento: debe actualizarse.',
};

export type Incoterm = 'FCA' | 'FOB' | 'CFR' | 'CIF' | 'DAP';
export const INCOTERMS: Incoterm[] = ['FCA', 'FOB', 'CFR', 'CIF', 'DAP'];

export type Role = 'producer' | 'buyer' | 'exporter' | 'admin';

export const ROLES: Record<Role, string> = {
  producer: 'Productor / Molino',
  buyer: 'Comprador / Importador',
  exporter: 'Exportador / Responsable COMEX',
  admin: 'Administrador',
};

export type DocumentType =
  | 'commercial_invoice'
  | 'packing_list'
  | 'export_permit'
  | 'bill_of_lading'
  | 'phytosanitary_certificate'
  | 'certificate_of_origin'
  | 'quality_certificate'
  | 'private_certification'
  | 'buyer_required'
  | 'import_permit'
  | 'insurance_policy'
  | 'bank_document'
  | 'contract'
  | 'other';

export const DOCUMENT_TYPES: Record<DocumentType, string> = {
  commercial_invoice: 'Factura comercial',
  packing_list: 'Packing list',
  export_permit: 'Permiso de embarque',
  bill_of_lading: 'Bill of Lading (B/L)',
  phytosanitary_certificate: 'Certificado fitosanitario',
  certificate_of_origin: 'Certificado de origen',
  quality_certificate: 'Certificado / análisis de calidad',
  private_certification: 'Certificación privada',
  buyer_required: 'Documento exigido por el comprador',
  import_permit: 'Permiso de importación',
  insurance_policy: 'Póliza de seguro',
  bank_document: 'Comprobante bancario',
  contract: 'Contrato / aceptación de cotización',
  other: 'Otro documento',
};

export type DocumentStatus =
  | 'pending'
  | 'in_preparation'
  | 'submitted'
  | 'verified'
  | 'observed'
  | 'not_applicable';

export const DOCUMENT_STATUS: Record<DocumentStatus, string> = {
  pending: 'Pendiente',
  in_preparation: 'En preparación',
  submitted: 'Presentado',
  verified: 'Verificado',
  observed: 'Observado',
  not_applicable: 'No aplica',
};

export type RequirementCategory =
  | 'official_origin'
  | 'official_destination'
  | 'buyer'
  | 'bank'
  | 'logistics'
  | 'commercial';

export const REQUIREMENT_CATEGORIES: Record<RequirementCategory, string> = {
  official_origin: 'Oficial — origen',
  official_destination: 'Oficial — destino',
  buyer: 'Exigencia del comprador',
  bank: 'Bancario',
  logistics: 'Logístico',
  commercial: 'Comercial',
};

export type Party = 'seller' | 'buyer';

export const PARTIES: Record<Party, string> = {
  seller: 'Vendedor',
  buyer: 'Comprador',
};

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export const QUOTATION_STATUS: Record<QuotationStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
};

export type VersionStatus = QuotationStatus | 'superseded';

export const VERSION_STATUS: Record<VersionStatus, string> = {
  ...QUOTATION_STATUS,
  superseded: 'Reemplazada',
};

export type RequestStatus = 'draft' | 'published' | 'negotiating' | 'closed' | 'cancelled';

export const REQUEST_STATUS: Record<RequestStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  negotiating: 'En negociación',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

export type OperationStatus =
  | 'negotiation'
  | 'confirmed'
  | 'in_preparation'
  | 'shipped'
  | 'collected'
  | 'closed'
  | 'cancelled';

export const OPERATION_STATUS: Record<OperationStatus, string> = {
  negotiation: 'En negociación',
  confirmed: 'Confirmada',
  in_preparation: 'En preparación',
  shipped: 'Embarcada',
  collected: 'Cobrada',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

export type ShipmentStatus = 'planned' | 'dispatched' | 'shipped' | 'received' | 'exception';

export const SHIPMENT_STATUS: Record<ShipmentStatus, string> = {
  planned: 'Planificado',
  dispatched: 'Despachado',
  shipped: 'Embarcado',
  received: 'Recibido',
  exception: 'Excepción',
};

export type ReconciliationStatus =
  | 'no_data'
  | 'partial'
  | 'difference_to_review'
  | 'reconciled_by_operator';

export const RECONCILIATION_STATUS: Record<ReconciliationStatus, string> = {
  no_data: 'Sin datos',
  partial: 'Parcialmente conciliado',
  difference_to_review: 'Diferencia a revisar',
  reconciled_by_operator: 'Conciliado por operador',
};

/** Estado informado por la entidad financiera: nunca "cumplido BCRA" sin evidencia. */
export type BankReportStatus = 'informed_by_user' | 'consulted_in_source' | 'verified_by_bank';

export const BANK_REPORT_STATUS: Record<BankReportStatus, string> = {
  informed_by_user: 'Informado por el usuario',
  consulted_in_source: 'Consultado en fuente',
  verified_by_bank: 'Verificado por el banco',
};

export type PaymentMethod =
  | 'advance_transfer'
  | 'open_account'
  | 'documentary_collection'
  | 'letter_of_credit'
  | 'cash_against_documents';

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  advance_transfer: 'Transferencia anticipada',
  open_account: 'Cuenta abierta (transferencia a plazo)',
  documentary_collection: 'Cobranza documentaria',
  letter_of_credit: 'Carta de crédito',
  cash_against_documents: 'Pago contra documentos',
};

export function label<T extends string>(map: Record<T, string>, key: T | null | undefined): string {
  return key ? (map[key] ?? key) : '—';
}
