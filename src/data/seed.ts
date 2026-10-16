/**
 * Datos de demostración. TODO es ficticio: empresas, lotes, precios, tarifas y
 * documentos. Los requisitos regulatorios se cargan como "pendientes de
 * verificación" con enlace a la fuente oficial; ninguna tarifa es vigente.
 */
import type { CostLineInput } from '@/domain/costing';
import { sha256HexSync } from '@/integrations/stellar/terms';
import { sid } from './ids';
import {
  SCHEMA_VERSION,
  type CostCatalogItem,
  type Database,
  type DestinationRequirement,
  type Lot,
  type TraceEvent,
  type User,
  type VerificationRecord,
} from './model';
import { changeDocumentStatus, registerInvoice, registerPayment, saveShipment, uploadDocumentVersion } from './services/operations';
import { acceptQuotationVersion, addQuotationVersion, createQuotationFromScenario, sendQuotationVersion } from './services/quotations';
import { createScenario, updateScenario } from './services/scenarios';
import type { ServiceContext } from './services/context';

export const SEED_VERSION = 'demo-2026-10.1';

export const IDS = {
  orgLitoral: sid('org-litoral'),
  orgChaco: sid('org-chaco'),
  orgAndes: sid('org-andes'),
  orgLevante: sid('org-levante'),
  userLucia: sid('user-lucia'),
  userMartin: sid('user-martin'),
  userAdmin: sid('user-admin'),
  userRocio: sid('user-rocio'),
  userDiego: sid('user-diego'),
  userNoa: sid('user-noa'),
  portBue: sid('port-arbue'),
  portZae: sid('port-arzae'),
  portRos: sid('port-arros'),
  portCallao: sid('port-pecll'),
  portHaifa: sid('port-ilhfa'),
  ct20: sid('ct-20dv'),
  ct40: sid('ct-40dv'),
  ct40hc: sid('ct-40hc'),
  facMercedes: sid('fac-mercedes'),
  facLeonesa: sid('fac-leonesa'),
  prdLitLf: sid('prd-lit-lf'),
  prdLitPb: sid('prd-lit-pb'),
  prdChaLf: sid('prd-cha-lf'),
  presLit25: sid('pres-lit-25'),
  presLit50: sid('pres-lit-50'),
  presLitBb: sid('pres-lit-bb'),
  presLitPb25: sid('pres-lit-pb-25'),
  presLitPbBb: sid('pres-lit-pb-bb'),
  presCha25: sid('pres-cha-25'),
  presChaBb: sid('pres-cha-bb'),
  lot009: sid('lot-009'),
  lot014: sid('lot-014'),
  lot015: sid('lot-015'),
  lot016: sid('lot-016'),
  lot021: sid('lot-021'),
  lot022: sid('lot-022'),
  req001: sid('req-001'),
  req002: sid('req-002'),
  req003: sid('req-003'),
  req004: sid('req-004'),
  fxSep: sid('fx-2026-09'),
  fxOct: sid('fx-2026-10'),
};

const DEMO_SOURCE = 'Valor de ejemplo (demo) — no es una tarifa vigente';

function users(): User[] {
  return [
    { id: IDS.userMartin, name: 'Martín Acosta', email: 'martin@molino-litoral.example', organizationId: IDS.orgLitoral, role: 'exporter', isDemo: true },
    { id: IDS.userLucia, name: 'Lucía Benítez', email: 'lucia@molino-litoral.example', organizationId: IDS.orgLitoral, role: 'producer', isDemo: true },
    { id: IDS.userAdmin, name: 'Admin Molino Litoral', email: 'admin@molino-litoral.example', organizationId: IDS.orgLitoral, role: 'admin', isDemo: true },
    { id: IDS.userRocio, name: 'Rocío Fernández', email: 'rocio@arrocera-chaco.example', organizationId: IDS.orgChaco, role: 'producer', isDemo: true },
    { id: IDS.userDiego, name: 'Diego Paredes', email: 'diego@andes-import.example', organizationId: IDS.orgAndes, role: 'buyer', isDemo: true },
    { id: IDS.userNoa, name: 'Noa Levi', email: 'noa@levant-trading.example', organizationId: IDS.orgLevante, role: 'buyer', isDemo: true },
  ];
}

type CatalogSeed = Omit<CostCatalogItem, 'id' | 'organizationId' | 'updatedAt'>;

function catalog(): CatalogSeed[] {
  const base = { currency: 'USD' as const, rateDate: '2026-09-15', provider: undefined as string | undefined };
  return [
    { ...base, key: 'merchandise', name: 'Costo de mercadería (arroz elaborado)', stage: 'merchandise', point: 'merchandise', unit: 'per_ton', amount: '560', source: 'Costo interno estimado (demo)', verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'packaging_bags', name: 'Envases (bolsas)', stage: 'merchandise', point: 'export_packaging', unit: 'per_unit', unitBasis: 'package', amount: '0.35', provider: 'Envases Demo SRL', source: 'Cotización demo de proveedor ficticio', verificationStatus: 'quoted', validUntil: '2026-12-31', defaultEnabled: true },
    { ...base, key: 'plant_loading', name: 'Carga en planta', stage: 'origin', point: 'origin_loading', unit: 'per_ton', amount: '2', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'inland_freight', name: 'Flete terrestre planta → puerto', stage: 'origin', point: 'pre_carriage', unit: 'per_container', amount: '1250000', currency: 'ARS', provider: 'Transportes Demo SRL', source: 'Cotización demo de proveedor ficticio', verificationStatus: 'quoted', validUntil: '2026-11-30', required: true, defaultEnabled: true },
    { ...base, key: 'tolls', name: 'Peajes', stage: 'origin', point: 'pre_carriage', unit: 'per_container', amount: '25000', currency: 'ARS', source: DEMO_SOURCE, verificationStatus: 'estimated', mayBeIncludedIn: ['inland_freight'], defaultEnabled: false },
    { ...base, key: 'inland_insurance', name: 'Seguro de transporte terrestre', stage: 'origin', point: 'pre_carriage', unit: 'percent', percentBase: 'merchandise_value', amount: '0.15', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'warehouse', name: 'Depósito / consolidación fuera de planta', stage: 'origin', point: 'pre_carriage', unit: 'per_ton', amount: '4', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: false },
    { ...base, key: 'ohc', name: 'THC/OHC terminal de origen', stage: 'port', point: 'origin_terminal', unit: 'per_container', amount: '310', provider: 'Terminal Demo BA', source: 'Tarifa demo de terminal ficticia', verificationStatus: 'quoted', validUntil: '2026-10-10', required: true, defaultEnabled: true },
    { ...base, key: 'vgm', name: 'Pesaje / VGM', stage: 'port', point: 'origin_terminal', unit: 'per_container', amount: '35', source: DEMO_SOURCE, verificationStatus: 'estimated', mayBeIncludedIn: ['ohc'], defaultEnabled: true },
    { ...base, key: 'isps', name: 'Seguridad portuaria (ISPS)', stage: 'port', point: 'origin_terminal', unit: 'per_container', amount: '18', source: DEMO_SOURCE, verificationStatus: 'estimated', mayBeIncludedIn: ['ohc'], defaultEnabled: false },
    { ...base, key: 'positioning', name: 'Posicionamiento / consolidación de contenedor', stage: 'port', point: 'origin_terminal', unit: 'per_container', amount: '120', provider: 'Terminal Demo BA', source: 'Tarifa demo de terminal ficticia', verificationStatus: 'quoted', validUntil: '2026-12-31', defaultEnabled: true },
    { ...base, key: 'bl_fee', name: 'Documentación naviera (emisión B/L)', stage: 'port', point: 'origin_terminal', unit: 'per_operation', amount: '90', provider: 'Naviera Demo', source: 'Tarifa demo de naviera ficticia', verificationStatus: 'quoted', validUntil: '2026-12-31', defaultEnabled: true },
    { ...base, key: 'storage', name: 'Almacenaje en terminal', stage: 'port', point: 'origin_terminal', unit: 'per_day', amount: '15', quantity: '0', freeDays: 3, multiplyByContainers: true, source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: false },
    { ...base, key: 'ocean_freight', name: 'Flete marítimo Buenos Aires → destino', stage: 'international', point: 'main_carriage', unit: 'per_container', amount: '1900', provider: 'Naviera Demo', source: 'Cotización demo de naviera ficticia', verificationStatus: 'quoted', validUntil: '2026-11-15', defaultEnabled: true },
    { ...base, key: 'baf', name: 'Recargo de combustible (BAF)', stage: 'international', point: 'main_carriage', unit: 'per_container', amount: '150', provider: 'Naviera Demo', source: 'Cotización demo de naviera ficticia', verificationStatus: 'quoted', validUntil: '2026-11-15', mayBeIncludedIn: ['ocean_freight'], defaultEnabled: false },
    { ...base, key: 'intl_insurance', name: 'Seguro internacional de la carga', stage: 'international', point: 'insurance', unit: 'percent', percentBase: 'insured_value', amount: '0.25', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'dest_thc', name: 'THC / descarga en puerto de destino', stage: 'port', point: 'destination_terminal', unit: 'per_container', amount: '230', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'broker_fees', name: 'Honorarios del despachante', stage: 'customs', point: 'export_clearance', unit: 'per_operation', amount: '280', provider: 'Despachante Demo', source: 'Presupuesto demo de despachante ficticio', verificationStatus: 'quoted', validUntil: '2026-12-31', defaultEnabled: true },
    { ...base, key: 'origin_cert', name: 'Certificado de origen', stage: 'customs', point: 'export_clearance', unit: 'per_operation', amount: '45', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'phyto_fee', name: 'Certificación fitosanitaria (arancel)', stage: 'customs', point: 'export_clearance', unit: 'per_operation', amount: '0', source: 'Pendiente: consultar arancel vigente en SENASA', sourceUrl: 'https://www.argentina.gob.ar/senasa', verificationStatus: 'pending', defaultEnabled: true },
    { ...base, key: 'inspection', name: 'Inspección / análisis de calidad', stage: 'customs', point: 'export_clearance', unit: 'per_operation', amount: '120', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'export_duty', name: 'Derechos de exportación', stage: 'customs', point: 'export_clearance', unit: 'percent', percentBase: 'fob_value', amount: '0', source: 'Pendiente: alícuota no verificada para la posición exacta (ARCA — Arancel Integrado)', sourceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/', verificationStatus: 'pending', defaultEnabled: false, notes: 'No se aplica sin norma, base y posición verificadas.' },
    { ...base, key: 'broker_commission', name: 'Comisión del intermediario', stage: 'commercial', point: 'commercial', unit: 'percent', percentBase: 'sale_value', amount: '2', provider: 'Broker demo', source: 'Acuerdo de comisión demo', verificationStatus: 'quoted', validUntil: '2027-03-31', defaultEnabled: true },
    { ...base, key: 'samples', name: 'Envío de muestras', stage: 'commercial', point: 'commercial', unit: 'per_operation', amount: '60', source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: false },
    { ...base, key: 'bank_fee', name: 'Comisión bancaria por cobro', stage: 'financial', point: 'financial', unit: 'percent', percentBase: 'sale_value', amount: '0.3', source: 'Tarifario demo de banco ficticio', verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'swift', name: 'Gastos de transferencia (SWIFT)', stage: 'financial', point: 'financial', unit: 'per_operation', amount: '50', source: 'Tarifario demo de banco ficticio', verificationStatus: 'estimated', defaultEnabled: true },
    { ...base, key: 'demurrage', name: 'Demurrage (sobreestadía de contenedor)', stage: 'contingency', point: 'origin_terminal', unit: 'per_day', amount: '0', quantity: '0', freeDays: 0, multiplyByContainers: true, tiers: [{ fromDay: 1, toDay: 5, amountPerDay: '80' }, { fromDay: 6, toDay: null, amountPerDay: '120' }], source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: false },
    { ...base, key: 'detention', name: 'Detention (uso de equipo fuera de terminal)', stage: 'contingency', point: 'pre_carriage', unit: 'per_day', amount: '45', quantity: '0', freeDays: 7, multiplyByContainers: true, source: DEMO_SOURCE, verificationStatus: 'estimated', defaultEnabled: false },
  ] as CatalogSeed[];
}

function requirements(): DestinationRequirement[] {
  const arca = 'https://www.arca.gob.ar/aduana/';
  const senasa = 'https://www.argentina.gob.ar/senasa/portal-de-certificacion-fitosanitaria-de-exportacion';
  return [
    { id: sid('rule-invoice'), country: '*', category: 'commercial', documentType: 'commercial_invoice', name: 'Factura de exportación', description: 'Factura comercial de la operación (en Argentina, comprobante de exportación).', issuer: 'Exportador', responsibleParty: 'seller', sourceName: 'Documento operativo habitual — confirmar formato con el despachante', sourceUrl: 'https://www.arca.gob.ar/', verificationStatus: 'pending', dueDaysBeforeShipment: 0 },
    { id: sid('rule-packing'), country: '*', category: 'logistics', documentType: 'packing_list', name: 'Packing list', description: 'Detalle de bultos, pesos neto/bruto y contenedores.', issuer: 'Exportador', responsibleParty: 'seller', sourceName: 'Documento operativo habitual de exportación', verificationStatus: 'pending', dueDaysBeforeShipment: 2 },
    { id: sid('rule-permit'), country: '*', category: 'official_origin', documentType: 'export_permit', name: 'Permiso de embarque', description: 'Declaración aduanera de exportación tramitada por despachante.', issuer: 'Aduana (ARCA) vía despachante', responsibleParty: 'customs_broker', sourceName: 'ARCA — Aduana', sourceUrl: arca, verificationStatus: 'pending', dueDaysBeforeShipment: 3 },
    { id: sid('rule-bl'), country: '*', category: 'logistics', documentType: 'bill_of_lading', name: 'Bill of Lading (B/L)', description: 'Documento de transporte marítimo emitido por la naviera.', issuer: 'Naviera / agente marítimo', responsibleParty: 'forwarder', transportModes: ['container', 'bulk_vessel'], sourceName: 'Contrato de transporte', verificationStatus: 'pending', dueDaysBeforeShipment: -2 },
    { id: sid('rule-quality'), country: '*', category: 'commercial', documentType: 'quality_certificate', name: 'Informe de calidad del lote', description: 'Análisis de laboratorio que respalda la calidad declarada.', issuer: 'Laboratorio', responsibleParty: 'laboratory', sourceName: 'Práctica comercial: respaldo de la calidad pactada', verificationStatus: 'pending', dueDaysBeforeShipment: 5 },
    { id: sid('rule-bank'), country: '*', category: 'bank', documentType: 'bank_document', name: 'Comprobante bancario del cobro', description: 'Aviso de crédito / liquidación con detalle de gastos.', issuer: 'Banco interviniente', responsibleParty: 'bank', sourceName: 'Seguimiento interno de cobros', verificationStatus: 'pending', dueDaysBeforeShipment: null },
    { id: sid('rule-phyto-pe'), country: 'PE', ncmPrefix: '1006', category: 'official_destination', documentType: 'phytosanitary_certificate', name: 'Certificado fitosanitario de exportación', description: 'Emitido por SENASA cuando el país importador lo exige.', issuer: 'SENASA', responsibleParty: 'seller', requiredIf: 'Pendiente de verificación: confirmar en SENASA si el destino lo exige para arroz elaborado.', sourceName: 'SENASA — Portal de certificación fitosanitaria de exportación', sourceUrl: senasa, verificationStatus: 'pending', dueDaysBeforeShipment: 5 },
    { id: sid('rule-origin-pe'), country: 'PE', category: 'official_origin', documentType: 'certificate_of_origin', name: 'Certificado de origen', description: 'Necesario si el importador solicita preferencia arancelaria.', issuer: 'Entidad certificante habilitada', responsibleParty: 'seller', requiredIf: 'Solo si se invoca preferencia arancelaria (verificar acuerdo aplicable).', sourceName: 'Acuerdo comercial aplicable — verificar con despachante', verificationStatus: 'pending', dueDaysBeforeShipment: 3 },
    { id: sid('rule-import-pe'), country: 'PE', category: 'official_destination', documentType: 'import_permit', name: 'Autorización de importación en destino', description: 'Habilitaciones o registros del importador en el país de destino.', issuer: 'Autoridad del país importador', responsibleParty: 'buyer', requiredIf: 'Pendiente de verificación con el importador.', sourceName: 'Información a aportar por el comprador', verificationStatus: 'pending', dueDaysBeforeShipment: 10 },
    { id: sid('rule-phyto-il'), country: 'IL', ncmPrefix: '1006', category: 'official_destination', documentType: 'phytosanitary_certificate', name: 'Certificado fitosanitario de exportación', description: 'Emitido por SENASA cuando el país importador lo exige.', issuer: 'SENASA', responsibleParty: 'seller', requiredIf: 'Pendiente de verificación: confirmar requisitos vigentes del destino.', sourceName: 'SENASA — Portal de certificación fitosanitaria de exportación', sourceUrl: senasa, verificationStatus: 'pending', dueDaysBeforeShipment: 5 },
    { id: sid('rule-import-il'), country: 'IL', category: 'official_destination', documentType: 'import_permit', name: 'Autorización de importación en destino', description: 'Habilitaciones del importador en el país de destino.', issuer: 'Autoridad del país importador', responsibleParty: 'buyer', requiredIf: 'Pendiente de verificación con el importador.', sourceName: 'Información a aportar por el comprador', verificationStatus: 'pending', dueDaysBeforeShipment: 10 },
    { id: sid('rule-kosher-levante'), country: 'IL', buyerOrganizationId: IDS.orgLevante, category: 'buyer', documentType: 'private_certification', name: 'Certificación Kosher', description: 'Exigencia particular del comprador; no es un requisito normativo general.', issuer: 'Certificadora aceptada por el comprador', responsibleParty: 'seller', sourceName: 'Solicitud RFQ-2026-002 del comprador', verifiedAt: '2026-10-02', verificationStatus: 'verified', dueDaysBeforeShipment: 10 },
  ];
}

const T = (date: string, time = '12:00') => `${date}T${time}:00.000Z`;

function lot(partial: Omit<Lot, 'createdAt' | 'updatedAt' | 'status' | 'certifications' | 'notes'> & Partial<Lot>, created: string): Lot {
  return {
    status: 'active',
    certifications: [],
    notes: null,
    createdAt: T(created, '13:00'),
    updatedAt: T(created, '13:00'),
    ...partial,
  };
}

export function buildBaseSeed(): Database {
  const db: Database = {
    schemaVersion: SCHEMA_VERSION,
    seedVersion: SEED_VERSION,
    organizations: [
      { id: IDS.orgLitoral, name: 'Molino Demo Litoral S.A.', kinds: ['mill', 'exporter'], country: 'AR', province: 'Corrientes', city: 'Mercedes', taxId: null, stellarAddress: null, isDemo: true, createdAt: T('2026-08-01') },
      { id: IDS.orgChaco, name: 'Arrocera Demo Chaco S.R.L.', kinds: ['producer', 'mill'], country: 'AR', province: 'Chaco', city: 'La Leonesa', taxId: null, stellarAddress: null, isDemo: true, createdAt: T('2026-08-01') },
      { id: IDS.orgAndes, name: 'Importadora Demo Andes S.A.C.', kinds: ['buyer'], country: 'PE', province: 'Lima', city: 'Callao', taxId: null, stellarAddress: null, isDemo: true, createdAt: T('2026-08-05') },
      { id: IDS.orgLevante, name: 'Demo Levant Trading Ltd.', kinds: ['buyer'], country: 'IL', province: 'Haifa', city: 'Haifa', taxId: null, stellarAddress: null, isDemo: true, createdAt: T('2026-08-05') },
    ],
    users: users(),
    facilities: [
      { id: IDS.facMercedes, organizationId: IDS.orgLitoral, name: 'Planta Mercedes', type: 'mill', country: 'AR', province: 'Corrientes', city: 'Mercedes', address: 'Parque Industrial, lote 4 (dirección demo)', exitPortId: IDS.portBue, distanceToPortKm: '720', distanceSource: 'manual', loadingConditions: 'Carga de contenedores en playa propia, lunes a sábado (demo).', logisticsNotes: 'Distancia estimada por ingreso manual; no se convierte en costo sin tarifa.', createdAt: T('2026-08-01'), updatedAt: T('2026-08-01') },
      { id: IDS.facLeonesa, organizationId: IDS.orgChaco, name: 'Planta La Leonesa', type: 'mill', country: 'AR', province: 'Chaco', city: 'La Leonesa', address: 'Ruta provincial, km 18 (dirección demo)', exitPortId: IDS.portBue, distanceToPortKm: '1050', distanceSource: 'manual', loadingConditions: 'Carga sobre camión con autoelevador; turnos previa coordinación (demo).', logisticsNotes: null, createdAt: T('2026-08-01'), updatedAt: T('2026-08-01') },
    ],
    ports: [
      { id: IDS.portBue, name: 'Puerto de Buenos Aires', country: 'AR', city: 'Buenos Aires', code: 'ARBUE', kind: 'origin' },
      { id: IDS.portZae, name: 'Puerto de Zárate', country: 'AR', city: 'Zárate', code: 'ARZAE', kind: 'origin' },
      { id: IDS.portRos, name: 'Puerto de Rosario', country: 'AR', city: 'Rosario', code: 'ARROS', kind: 'origin' },
      { id: IDS.portCallao, name: 'Puerto del Callao', country: 'PE', city: 'Callao', code: 'PECLL', kind: 'destination' },
      { id: IDS.portHaifa, name: 'Puerto de Haifa', country: 'IL', city: 'Haifa', code: 'ILHFA', kind: 'destination' },
    ],
    containerTypes: [
      { id: IDS.ct20, code: '20DV', name: "Contenedor 20' seco", maxPayloadKg: '28200', operationalLimitKg: '26000', usableVolumeM3: '33', maxPallets: 10, source: 'Valores de referencia (demo): verificar con naviera y restricción vial', verificationStatus: 'estimated' },
      { id: IDS.ct40, code: '40DV', name: "Contenedor 40' seco", maxPayloadKg: '26700', operationalLimitKg: '26000', usableVolumeM3: '67', maxPallets: 21, source: 'Valores de referencia (demo): verificar con naviera y restricción vial', verificationStatus: 'estimated' },
      { id: IDS.ct40hc, code: '40HC', name: "Contenedor 40' high cube", maxPayloadKg: '26500', operationalLimitKg: null, usableVolumeM3: '76', maxPallets: 21, source: 'Valores de referencia (demo): verificar con naviera', verificationStatus: 'estimated' },
    ],
    products: [
      {
        id: IDS.prdLitLf, organizationId: IDS.orgLitoral, code: 'PRD-2026-001', name: 'Arroz blanco largo fino', category: 'rice', commercialType: 'long_fine', variety: 'L-110 (variedad demo)', processing: 'white',
        ncm: '1006.30', ncmDescription: 'Arroz semiblanqueado o blanqueado (subposición exacta pendiente de clasificación)', ncmStatus: 'pending', ncmSource: 'ARCA — Arancel Integrado: clasificación exacta pendiente',
        description: 'Arroz blanco largo fino elaborado en Corrientes. Ficha demo.',
        presentations: [
          { id: IDS.presLit25, label: 'Bolsa 25 kg', packaging: 'bag', netWeightKg: '25', tareWeightKg: '0.12', unitsPerPallet: null, palletTareKg: null, packageVolumeM3: '0.0333' },
          { id: IDS.presLit50, label: 'Bolsa 50 kg', packaging: 'bag', netWeightKg: '50', tareWeightKg: '0.18', unitsPerPallet: null, palletTareKg: null, packageVolumeM3: '0.0666' },
          { id: IDS.presLitBb, label: 'Big bag 1.000 kg', packaging: 'big_bag', netWeightKg: '1000', tareWeightKg: '2.5', unitsPerPallet: null, palletTareKg: null, packageVolumeM3: '1.35' },
        ],
        convertibleTo: [{ type: 'bag', netWeightKg: '5' }, { type: 'bag', netWeightKg: '1' }],
        status: 'active', createdAt: T('2026-08-02'), updatedAt: T('2026-08-02'), createdBy: IDS.userLucia,
      },
      {
        id: IDS.prdLitPb, organizationId: IDS.orgLitoral, code: 'PRD-2026-002', name: 'Arroz parbolizado largo fino', category: 'rice', commercialType: 'long_fine', variety: null, processing: 'parboiled',
        ncm: '1006.30', ncmDescription: 'Subposición exacta pendiente de clasificación', ncmStatus: 'pending', ncmSource: 'ARCA — Arancel Integrado',
        description: 'Ficha demo.',
        presentations: [
          { id: IDS.presLitPb25, label: 'Bolsa 25 kg', packaging: 'bag', netWeightKg: '25', tareWeightKg: '0.12', unitsPerPallet: null, palletTareKg: null, packageVolumeM3: '0.0333' },
          { id: IDS.presLitPbBb, label: 'Big bag 1.000 kg', packaging: 'big_bag', netWeightKg: '1000', tareWeightKg: '2.5', unitsPerPallet: null, palletTareKg: null, packageVolumeM3: '1.35' },
        ],
        convertibleTo: [], status: 'active', createdAt: T('2026-08-02'), updatedAt: T('2026-08-02'), createdBy: IDS.userLucia,
      },
      {
        id: IDS.prdChaLf, organizationId: IDS.orgChaco, code: 'PRD-2026-001', name: 'Arroz blanco largo fino', category: 'rice', commercialType: 'long_fine', variety: null, processing: 'white',
        ncm: '1006.30', ncmDescription: 'Subposición exacta pendiente de clasificación', ncmStatus: 'pending', ncmSource: 'ARCA — Arancel Integrado',
        description: 'Arroz blanco largo fino de Chaco. Ficha demo.',
        presentations: [
          { id: IDS.presCha25, label: 'Bolsa 25 kg', packaging: 'bag', netWeightKg: '25', tareWeightKg: '0.12', unitsPerPallet: null, palletTareKg: null, packageVolumeM3: '0.0333' },
          { id: IDS.presChaBb, label: 'Big bag 1.000 kg', packaging: 'big_bag', netWeightKg: '1000', tareWeightKg: '2.5', unitsPerPallet: null, palletTareKg: null, packageVolumeM3: '1.35' },
        ],
        convertibleTo: [{ type: 'bag', netWeightKg: '25' }], status: 'active', createdAt: T('2026-08-03'), updatedAt: T('2026-08-03'), createdBy: IDS.userRocio,
      },
    ],
    lots: [
      lot({ id: IDS.lot009, organizationId: IDS.orgLitoral, productId: IDS.prdLitLf, code: 'LOT-2026-009', facilityId: IDS.facMercedes, presentationId: IDS.presLit25, physicalStockT: '40', harvest: '2025/26', availableFrom: '2026-09-01', published: false, createdBy: IDS.userLucia,
        quality: { brokenPct: '3.5', moisturePct: '13.6', impuritiesPct: '0.1', other: [{ name: 'Granos yesosos', value: '1.2', unit: '%' }], analysisDate: '2026-08-28', analyst: 'Laboratorio Demo NEA', documentRef: 'Informe LAB-DEMO-0828', verificationStatus: 'verified', validUntil: '2026-12-31' } }, '2026-08-27'),
      lot({ id: IDS.lot014, organizationId: IDS.orgLitoral, productId: IDS.prdLitLf, code: 'LOT-2026-014', facilityId: IDS.facMercedes, presentationId: IDS.presLit25, physicalStockT: '60', harvest: '2025/26', availableFrom: '2026-10-05', published: true, createdBy: IDS.userLucia,
        quality: { brokenPct: '3', moisturePct: '13.5', impuritiesPct: '0.08', other: [], analysisDate: '2026-09-28', analyst: 'Laboratorio Demo NEA', documentRef: 'Informe LAB-DEMO-0928', verificationStatus: 'verified', validUntil: '2027-01-31' } }, '2026-09-26'),
      lot({ id: IDS.lot015, organizationId: IDS.orgLitoral, productId: IDS.prdLitLf, code: 'LOT-2026-015', facilityId: IDS.facMercedes, presentationId: IDS.presLit25, physicalStockT: '30', harvest: '2025/26', availableFrom: '2026-10-05', published: true, createdBy: IDS.userLucia,
        quality: { brokenPct: '7', moisturePct: '13.8', impuritiesPct: '0.12', other: [], analysisDate: '2026-09-28', analyst: 'Laboratorio Demo NEA', documentRef: 'Informe LAB-DEMO-0929', verificationStatus: 'verified', validUntil: '2027-01-31' } }, '2026-09-26'),
      lot({ id: IDS.lot016, organizationId: IDS.orgLitoral, productId: IDS.prdLitPb, code: 'LOT-2026-016', facilityId: IDS.facMercedes, presentationId: IDS.presLitPbBb, physicalStockT: '40', harvest: '2025/26', availableFrom: '2026-10-10', published: true, createdBy: IDS.userLucia,
        quality: { brokenPct: '2', moisturePct: '12.9', impuritiesPct: '0.05', other: [], analysisDate: '2026-10-01', analyst: 'Laboratorio Demo NEA', documentRef: 'Informe LAB-DEMO-1001', verificationStatus: 'verified', validUntil: '2027-02-28' } }, '2026-09-30'),
      lot({ id: IDS.lot021, organizationId: IDS.orgChaco, productId: IDS.prdChaLf, code: 'LOT-2026-021', facilityId: IDS.facLeonesa, presentationId: IDS.presCha25, physicalStockT: '25', harvest: '2025/26', availableFrom: '2026-10-08', published: true, createdBy: IDS.userRocio,
        quality: { brokenPct: '4', moisturePct: '13.7', impuritiesPct: '0.1', other: [], analysisDate: '2026-09-30', analyst: 'Control interno de planta', documentRef: null, verificationStatus: 'estimated', validUntil: null } }, '2026-09-30'),
      lot({ id: IDS.lot022, organizationId: IDS.orgChaco, productId: IDS.prdChaLf, code: 'LOT-2026-022', facilityId: IDS.facLeonesa, presentationId: IDS.presChaBb, physicalStockT: '50', harvest: '2025/26', availableFrom: '2026-10-15', published: true, createdBy: IDS.userRocio,
        quality: { brokenPct: '4.5', moisturePct: '13.9', impuritiesPct: '0.11', other: [], analysisDate: '2026-10-02', analyst: 'Laboratorio Demo Chaco', documentRef: 'Informe LAB-CH-1002', verificationStatus: 'verified', validUntil: '2027-02-28' } }, '2026-10-02'),
    ],
    inventoryMovements: [],
    requests: [
      { id: IDS.req001, code: 'RFQ-2026-001', buyerOrganizationId: IDS.orgAndes, contactName: 'Diego Paredes', contactEmail: 'diego@andes-import.example', status: 'published', visibility: 'public', invitedOrganizationIds: [], category: 'rice', commercialType: 'long_fine', varietyPolicy: 'equivalents_allowed', variety: null, processing: 'white', maxBrokenPct: '5', maxMoisturePct: '14', maxImpuritiesPct: null, quantityT: '40', packaging: { type: 'bag', netWeightKg: '25' }, packagingFlexible: false, allowConsolidation: false, destinationCountry: 'PE', destinationCity: 'Callao', destinationPortId: IDS.portCallao, finalAddress: null, availabilityDeadline: '2026-10-01', deliveryDate: '2026-11-10', currency: 'USD', preferredIncoterm: 'FOB', requiredCertifications: [], buyerDocuments: [{ name: 'Datos de registro del importador', note: 'A confirmar por el importador' }], notes: 'Pedido demo.', createdAt: T('2026-09-10', '13:00'), updatedAt: T('2026-09-10', '13:00'), createdBy: IDS.userDiego },
      { id: IDS.req002, code: 'RFQ-2026-002', buyerOrganizationId: IDS.orgLevante, contactName: 'Noa Levi', contactEmail: 'noa@levant-trading.example', status: 'published', visibility: 'public', invitedOrganizationIds: [], category: 'rice', commercialType: 'jasmine', varietyPolicy: 'equivalents_allowed', variety: null, processing: 'white', maxBrokenPct: '5', maxMoisturePct: null, maxImpuritiesPct: null, quantityT: '25', packaging: { type: 'bag', netWeightKg: '25' }, packagingFlexible: false, allowConsolidation: false, destinationCountry: 'IL', destinationCity: 'Haifa', destinationPortId: IDS.portHaifa, finalAddress: null, availabilityDeadline: '2026-11-30', deliveryDate: '2026-12-20', currency: 'USD', preferredIncoterm: 'CIF', requiredCertifications: ['Kosher'], buyerDocuments: [], notes: 'Busca arroz aromático tipo jazmín (pedido demo).', createdAt: T('2026-10-02', '09:00'), updatedAt: T('2026-10-02', '09:00'), createdBy: IDS.userNoa },
      { id: IDS.req003, code: 'RFQ-2026-003', buyerOrganizationId: IDS.orgAndes, contactName: 'Diego Paredes', contactEmail: 'diego@andes-import.example', status: 'published', visibility: 'public', invitedOrganizationIds: [], category: 'rice', commercialType: 'long_fine', varietyPolicy: 'equivalents_allowed', variety: null, processing: 'white', maxBrokenPct: '5', maxMoisturePct: '14', maxImpuritiesPct: null, quantityT: '40', packaging: { type: 'bag', netWeightKg: '25' }, packagingFlexible: false, allowConsolidation: true, destinationCountry: 'PE', destinationCity: 'Callao', destinationPortId: IDS.portCallao, finalAddress: null, availabilityDeadline: '2026-11-20', deliveryDate: '2026-12-15', currency: 'USD', preferredIncoterm: 'CFR', requiredCertifications: [], buyerDocuments: [], notes: 'Reposición: arroz blanco largo fino, máximo 5 % de quebrado, bolsas de 25 kg (pedido demo).', createdAt: T('2026-10-12', '14:00'), updatedAt: T('2026-10-12', '14:00'), createdBy: IDS.userDiego },
      { id: IDS.req004, code: 'RFQ-2026-004', buyerOrganizationId: IDS.orgAndes, contactName: 'Diego Paredes', contactEmail: 'diego@andes-import.example', status: 'published', visibility: 'public', invitedOrganizationIds: [], category: 'rice', commercialType: 'long_fine', varietyPolicy: 'equivalents_allowed', variety: null, processing: 'white', maxBrokenPct: '5', maxMoisturePct: '14', maxImpuritiesPct: null, quantityT: '80', packaging: { type: 'bag', netWeightKg: '25' }, packagingFlexible: false, allowConsolidation: true, destinationCountry: 'PE', destinationCity: 'Callao', destinationPortId: IDS.portCallao, finalAddress: null, availabilityDeadline: '2026-12-10', deliveryDate: '2027-01-20', currency: 'USD', preferredIncoterm: 'CFR', requiredCertifications: [], buyerDocuments: [], notes: 'Programa trimestral: admite consolidar lotes compatibles (pedido demo).', createdAt: T('2026-10-14', '16:00'), updatedAt: T('2026-10-14', '16:00'), createdBy: IDS.userDiego },
    ],
    matchSnapshots: [],
    costCatalog: catalog().map((item) => ({
      ...item,
      id: sid(`cat-${item.key}`),
      organizationId: IDS.orgLitoral,
      updatedAt: T('2026-09-15'),
    })),
    fxRates: [
      { id: IDS.fxSep, organizationId: IDS.orgLitoral, base: 'USD', quote: 'ARS', rate: '1180', date: '2026-09-20', source: 'Tipo de cambio de referencia cargado por el usuario (valor demo, no oficial)', sourceUrl: null, status: 'estimated', createdAt: T('2026-09-20') },
      { id: IDS.fxOct, organizationId: IDS.orgLitoral, base: 'USD', quote: 'ARS', rate: '1205', date: '2026-10-15', source: 'Tipo de cambio de referencia cargado por el usuario (valor demo, no oficial)', sourceUrl: null, status: 'estimated', createdAt: T('2026-10-15') },
    ],
    scenarios: [],
    quotations: [],
    quotationVersions: [],
    operations: [],
    shipments: [],
    requirements: requirements(),
    documents: [],
    documentVersions: [],
    invoices: [],
    payments: [],
    paymentAllocations: [],
    reconciliations: [],
    verifications: [],
    traceEvents: [],
    blockchainRecords: [],
    auditLog: [],
    settings: {
      rounding: { decimals: 2, mode: 'half_up', target: 'per_ton' },
      stellar: { network: 'testnet', contractId: null, rpcUrl: null },
    },
  };

  db.traceEvents.push(...lotEvents(db));
  db.verifications.push(...verificationRecords(db));
  return db;
}

function lotEvents(db: Database): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const l of db.lots) {
    const product = db.products.find((p) => p.id === l.productId)!;
    const actor = l.createdBy;
    events.push({ id: sid(`ev-created-${l.id}`), at: l.createdAt, actorUserId: actor, organizationId: l.organizationId, type: 'lot_created', title: `Lote ${l.code} creado`, detail: `${l.physicalStockT} t de ${product.name}`, lotIds: [l.id], entity: { kind: 'lot', id: l.id }, shared: true });
    if (l.quality.analysisDate) {
      events.push({ id: sid(`ev-quality-${l.id}`), at: T(l.quality.analysisDate, '15:00'), actorUserId: actor, organizationId: l.organizationId, type: 'quality_recorded', title: `Calidad registrada para ${l.code}`, detail: `Quebrado ${l.quality.brokenPct} %, humedad ${l.quality.moisturePct} % — ${l.quality.analyst} (${l.quality.verificationStatus === 'verified' ? 'verificado' : 'declarado sin verificar'})`, lotIds: [l.id], entity: { kind: 'lot', id: l.id }, shared: true });
    }
    if (l.published || l.id === IDS.lot009) {
      events.push({ id: sid(`ev-published-${l.id}`), at: T(l.availableFrom, '10:00') < l.createdAt ? l.createdAt : T(l.createdAt.slice(0, 10), '18:00'), actorUserId: actor, organizationId: l.organizationId, type: 'offer_published', title: `Oferta publicada: ${l.code}`, detail: `Disponible desde ${l.availableFrom}`, lotIds: [l.id], entity: { kind: 'lot', id: l.id }, shared: true });
    }
  }
  return events;
}

function verificationRecords(db: Database): VerificationRecord[] {
  const records: VerificationRecord[] = [];
  const responsible = 'Martín Acosta (demo)';
  for (const item of db.costCatalog) {
    records.push({
      id: sid(`ver-${item.id}`),
      organizationId: item.organizationId,
      subject: { kind: 'cost_catalog', id: item.id, field: 'amount' },
      dataLabel: item.name,
      value: item.amount,
      unit: item.unit === 'percent' ? '%' : `${item.currency} ${item.unit.replace('per_', 'por ')}`,
      source: item.source,
      evidenceUrl: item.sourceUrl ?? null,
      consultedAt: item.rateDate ?? '2026-09-15',
      validUntil: item.validUntil ?? null,
      responsible,
      status: item.verificationStatus,
      notes: item.notes ?? null,
      history: [{ at: item.updatedAt, by: IDS.userMartin, from: 'pending', to: item.verificationStatus, value: item.amount, note: 'Alta del concepto (demo)' }],
    });
  }
  for (const rate of db.fxRates) {
    records.push({ id: sid(`ver-${rate.id}`), organizationId: rate.organizationId, subject: { kind: 'fx_rate', id: rate.id, field: 'rate' }, dataLabel: `Tipo de cambio ${rate.base}/${rate.quote} (${rate.date})`, value: rate.rate, unit: `${rate.quote} por ${rate.base}`, source: rate.source, evidenceUrl: null, consultedAt: rate.date, validUntil: null, responsible, status: rate.status, history: [{ at: rate.createdAt, by: IDS.userMartin, from: 'pending', to: rate.status, value: rate.rate, note: 'Alta (demo)' }] });
  }
  for (const req of db.requirements) {
    records.push({ id: sid(`ver-${req.id}`), organizationId: IDS.orgLitoral, subject: { kind: 'requirement', id: req.id }, dataLabel: `Requisito: ${req.name} (${req.country === '*' ? 'todo destino' : req.country})`, value: req.requiredIf ?? 'Aplicable según regla', unit: 'texto', source: req.sourceName, evidenceUrl: req.sourceUrl ?? null, consultedAt: req.verifiedAt ?? '2026-09-15', validUntil: null, responsible, status: req.verificationStatus, history: [{ at: T('2026-09-15'), by: IDS.userMartin, from: 'pending', to: req.verificationStatus, note: 'Alta de la regla (demo)' }] });
  }
  for (const l of db.lots.filter((x) => x.organizationId === IDS.orgLitoral)) {
    records.push({ id: sid(`ver-q-${l.id}`), organizationId: l.organizationId, subject: { kind: 'lot_quality', id: l.id, field: 'brokenPct' }, dataLabel: `Quebrado lote ${l.code}`, value: l.quality.brokenPct ?? '', unit: '%', source: l.quality.analyst ?? 'Sin análisis', evidenceUrl: null, evidenceDocumentId: null, consultedAt: l.quality.analysisDate ?? l.createdAt.slice(0, 10), validUntil: l.quality.validUntil ?? null, responsible: 'Lucía Benítez (demo)', status: l.quality.verificationStatus, notes: l.quality.documentRef ?? null, history: [{ at: l.createdAt, by: IDS.userLucia, from: 'pending', to: l.quality.verificationStatus, value: l.quality.brokenPct, note: l.quality.documentRef ?? 'Alta (demo)' }] });
  }
  for (const p of db.products.filter((x) => x.organizationId === IDS.orgLitoral)) {
    records.push({ id: sid(`ver-ncm-${p.id}`), organizationId: p.organizationId, subject: { kind: 'product_ncm', id: p.id, field: 'ncm' }, dataLabel: `NCM ${p.name}`, value: p.ncm ?? '', unit: 'texto', source: p.ncmSource ?? '', evidenceUrl: 'https://www.arca.gob.ar/aduana/arancelintegrado/', consultedAt: '2026-08-02', validUntil: null, responsible, status: p.ncmStatus, notes: 'Familia 1006 identificada; subposición exacta pendiente.', history: [{ at: p.createdAt, by: IDS.userMartin, from: 'pending', to: p.ncmStatus, note: 'Alta (demo)' }] });
  }
  for (const c of db.containerTypes) {
    records.push({ id: sid(`ver-ct-${c.id}`), organizationId: IDS.orgLitoral, subject: { kind: 'container_type', id: c.id, field: 'operationalLimitKg' }, dataLabel: `Límite operativo ${c.code}`, value: c.operationalLimitKg ?? c.maxPayloadKg, unit: 'kg', source: c.source, evidenceUrl: null, consultedAt: '2026-08-01', validUntil: null, responsible, status: c.verificationStatus, history: [{ at: T('2026-08-01'), by: IDS.userMartin, from: 'pending', to: c.verificationStatus, note: 'Alta (demo)' }] });
  }
  return records;
}

/** Contexto determinístico para generar la historia demo con los servicios reales. */
function flowContext(db: Database, userId: string, clock: { at: string }, counter: { n: number }): ServiceContext {
  const user = db.users.find((u) => u.id === userId)!;
  return {
    user,
    now: () => clock.at,
    today: () => clock.at.slice(0, 10),
    newId: () => sid(`flow-${++counter.n}`),
  };
}

function demoDoc(name: string, body: string) {
  const content = `DOCUMENTO FICTICIO DE DEMOSTRACIÓN — AgroMatch COMEX\n${name}\n\n${body}\n\nNo tiene validez comercial, aduanera ni bancaria.`;
  return {
    fileName: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`,
    mimeType: 'text/plain',
    sizeBytes: new TextEncoder().encode(content).length,
    sha256: sha256HexSync(content),
    storageKey: null,
    demoContent: content,
  };
}

/**
 * Historia completa de OP-2026-0001 (escenarios D, E y F) generada con los
 * mismos servicios que usa la aplicación: cotización v1 y v2, aceptación,
 * documentos, embarque, factura y cobro con comisión del exterior.
 */
export function runDemoFlow(base: Database): Database {
  let db = base;
  const clock = { at: T('2026-09-20', '14:00') };
  const counter = { n: 0 };
  const seller = () => flowContext(db, IDS.userMartin, clock, counter);
  const buyer = () => flowContext(db, IDS.userDiego, clock, counter);

  let r = createScenario(db, seller(), { requestId: IDS.req001, lotId: IDS.lot009, name: 'RFQ-2026-001 · FOB Buenos Aires' });
  db = r.db;
  const scenarioId = r.value.id;
  const lines: CostLineInput[] = r.value.lines.map((l) => (l.catalogId === 'dest_thc' ? { ...l, enabled: true } : l));
  db = updateScenario(db, seller(), scenarioId, {
    fxRateIds: [IDS.fxSep],
    lines,
    commercial: {
      ...r.value.commercial,
      incoterm: 'FOB',
      namedPlace: 'Puerto de Buenos Aires',
      namedPlaceKind: 'port_of_shipment',
      shipmentDate: '2026-10-08',
      paymentTerms: 'Transferencia a 30 días de la fecha de B/L',
      validityDays: 10,
    },
    finance: { ...r.value.finance, paymentMethod: 'open_account', bank: 'Banco Demo', advancePct: '0', fxRateId: IDS.fxSep, expectedCollectionDate: '2026-11-07' },
    pricing: { mode: 'margin_on_sale', marginPct: '12' },
  }).db;

  clock.at = T('2026-09-21', '15:00');
  const created = createQuotationFromScenario(db, seller(), scenarioId, { changeNote: 'Primera oferta con margen objetivo 12 % sobre venta' });
  db = created.db;
  db = sendQuotationVersion(db, seller(), created.value.version.id).db;

  clock.at = T('2026-09-28', '17:30');
  db = updateScenario(db, seller(), scenarioId, { pricing: { mode: 'fixed_price', pricePerT: '750' } }).db;
  const v2 = addQuotationVersion(db, seller(), created.value.quotation.id, { changeNote: 'Precio negociado: USD 750/t FOB (demo)' });
  db = v2.db;
  db = sendQuotationVersion(db, seller(), v2.value.id).db;

  clock.at = T('2026-09-30', '15:00');
  const accepted = acceptQuotationVersion(db, buyer(), v2.value.id);
  db = accepted.db;
  const opId = accepted.value.operation.id;

  const docs = () => db.documents.filter((d) => d.operationId === opId);
  const byType = (type: string) => docs().find((d) => d.documentType === type)!;

  clock.at = T('2026-10-01', '10:00');
  db = saveShipment(db, seller(), opId, { status: 'planned', containerTypeId: IDS.ct20, plannedDate: '2026-10-08', bookingNumber: 'BKG-DEMO-7781', portOfLoadingId: IDS.portBue, portOfDischargeId: IDS.portCallao, containers: [] }).db;
  const shipmentId = db.shipments.find((s) => s.operationId === opId)!.id;

  const quality = byType('quality_certificate');
  db = uploadDocumentVersion(db, seller(), quality.id, demoDoc('Informe de calidad LOT-2026-009', 'Quebrado 3,5 %, humedad 13,6 %, impurezas 0,1 % (valores demo).')).db;
  db = changeDocumentStatus(db, seller(), quality.id, 'submitted').db;
  db = changeDocumentStatus(db, seller(), quality.id, 'verified').db;

  clock.at = T('2026-10-05', '08:30');
  db = saveShipment(db, seller(), opId, { status: 'dispatched', containerTypeId: IDS.ct20, plannedDate: '2026-10-08', dispatchedAt: '2026-10-05', bookingNumber: 'BKG-DEMO-7781', portOfLoadingId: IDS.portBue, portOfDischargeId: IDS.portCallao, containers: [{ number: 'AGMU1000014', seal: 'SL-DEMO-1' }, { number: 'AGMU1000029', seal: 'SL-DEMO-2' }] }, shipmentId).db;
  const packing = byType('packing_list');
  db = uploadDocumentVersion(db, seller(), packing.id, demoDoc('Packing list OP-2026-0001', '1.600 bolsas de 25 kg; 2 contenedores de 20 pies; peso bruto 40.192 kg (demo).')).db;
  db = changeDocumentStatus(db, seller(), packing.id, 'submitted').db;
  db = changeDocumentStatus(db, seller(), packing.id, 'verified').db;
  const permit = byType('export_permit');
  db = uploadDocumentVersion(db, seller(), permit.id, demoDoc('Permiso de embarque (demo)', 'Número ficticio 26001EC01000045D. Oficializado por despachante demo.')).db;
  db = changeDocumentStatus(db, seller(), permit.id, 'submitted').db;

  clock.at = T('2026-10-08', '19:00');
  db = saveShipment(db, seller(), opId, { status: 'shipped', containerTypeId: IDS.ct20, plannedDate: '2026-10-08', dispatchedAt: '2026-10-05', shippedAt: '2026-10-08', vessel: 'MV Demo Pacific', voyage: '042S', bookingNumber: 'BKG-DEMO-7781', blNumber: 'BL-DEMO-55021', exportPermitNumber: '26001EC01000045D (demo)', portOfLoadingId: IDS.portBue, portOfDischargeId: IDS.portCallao, shippedQuantityT: '40', packages: 1600, grossWeightKg: '40192', containers: [{ number: 'AGMU1000014', seal: 'SL-DEMO-1', grossKg: '20096', vgmKg: '22296' }, { number: 'AGMU1000029', seal: 'SL-DEMO-2', grossKg: '20096', vgmKg: '22296' }] }, shipmentId).db;
  const bl = byType('bill_of_lading');
  db = uploadDocumentVersion(db, seller(), bl.id, demoDoc('Bill of Lading BL-DEMO-55021', 'MV Demo Pacific, viaje 042S, Buenos Aires → Callao (demo).')).db;
  db = changeDocumentStatus(db, seller(), bl.id, 'submitted').db;
  const invoiceDoc = byType('commercial_invoice');
  db = uploadDocumentVersion(db, seller(), invoiceDoc.id, demoDoc('Factura E-0001-00000045', '40 t arroz blanco largo fino × USD 750/t FOB = USD 30.000 (demo).')).db;
  db = changeDocumentStatus(db, seller(), invoiceDoc.id, 'submitted').db;
  db = registerInvoice(db, seller(), opId, { number: 'E-0001-00000045', issueDate: '2026-10-08', currency: 'USD', amount: '30000', quantityT: '40', exportPermitNumber: '26001EC01000045D (demo)' }).db;

  clock.at = T('2026-10-14', '16:20');
  const invoiceId = db.invoices.find((i) => i.operationId === opId)!.id;
  db = registerPayment(db, seller(), opId, {
    reference: 'MT103-DEMO-0001',
    receivedDate: '2026-10-14',
    currency: 'USD',
    grossAmount: '30000',
    foreignBankFees: '150',
    localBankFees: '0',
    otherDeductions: '0',
    netAmount: '29850',
    isAdvance: false,
    bankName: 'Banco Demo',
    bankReportStatus: 'informed_by_user',
    invoiceId,
    allocatedAmount: '30000',
    notes: 'Crédito informado por el usuario (registro demo, no es una operación bancaria).',
  }).db;
  return db;
}

export function buildSeed(): Database {
  return runDemoFlow(buildBaseSeed());
}
