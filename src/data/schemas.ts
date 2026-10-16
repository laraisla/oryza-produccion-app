import { z } from 'zod';
import { INCOTERMS } from '@/domain/catalogs';
import { DECIMAL_PATTERN } from '@/domain/decimal';
import { ValidationError } from './services/context';

const decimal = (label: string) =>
  z
    .string({ required_error: `${label}: requerido` })
    .trim()
    .regex(DECIMAL_PATTERN, `${label}: ingresar un número válido (usar punto decimal)`);

const positive = (label: string) =>
  decimal(label).refine((v) => Number(v) > 0, `${label}: debe ser mayor a cero`);

const percent = (label: string) =>
  decimal(label).refine((v) => Number(v) >= 0 && Number(v) <= 100, `${label}: debe estar entre 0 y 100`);

const optionalPercent = (label: string) =>
  z.union([percent(label), z.literal(''), z.null(), z.undefined()]).transform((v) => (v ? v : null));

const isoDate = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: fecha inválida`);
const optionalDate = (label: string) =>
  z.union([isoDate(label), z.literal(''), z.null(), z.undefined()]).transform((v) => (v ? v : null));

export const riceTypeSchema = z.enum(['long_fine', 'long_wide', 'medium', 'short', 'jasmine', 'basmati', 'persian', 'aromatic_other']);
export const processingSchema = z.enum(['paddy', 'brown', 'white', 'parboiled', 'broken']);
export const packagingTypeSchema = z.enum(['bulk', 'bag', 'big_bag', 'box']);
export const verificationStatusSchema = z.enum(['estimated', 'quoted', 'verified', 'pending', 'expired']);

export const presentationSchema = z
  .object({
    id: z.string().optional(),
    label: z.string().trim().min(1, 'Presentación: indicar un nombre'),
    packaging: packagingTypeSchema,
    netWeightKg: z.union([positive('Peso por envase'), z.literal(''), z.null()]).optional(),
    tareWeightKg: z.union([decimal('Peso del envase'), z.literal(''), z.null()]).optional(),
    unitsPerPallet: z.number().int().positive().nullable().optional(),
    palletTareKg: z.union([decimal('Tara de pallet'), z.literal(''), z.null()]).optional(),
  })
  .refine((p) => p.packaging === 'bulk' || Boolean(p.netWeightKg), {
    message: 'Presentación: los envases requieren peso neto por unidad',
    path: ['netWeightKg'],
  });

export const productSchema = z.object({
  name: z.string().trim().min(3, 'Nombre: mínimo 3 caracteres'),
  category: z.enum(['rice', 'other']),
  commercialType: riceTypeSchema,
  variety: z.string().trim().optional().nullable(),
  processing: processingSchema,
  ncm: z
    .union([z.string().trim().regex(/^\d{4}(\.\d{2}){0,3}[A-Z]?$/, 'NCM: formato 1006.30.21 (subposición opcional)'), z.literal('')])
    .optional()
    .nullable(),
  ncmDescription: z.string().optional().nullable(),
  ncmStatus: verificationStatusSchema,
  ncmSource: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  presentations: z.array(presentationSchema).min(1, 'Registrar al menos una presentación'),
  convertibleTo: z.array(z.object({ type: packagingTypeSchema, netWeightKg: z.string().nullable().optional() })).default([]),
});
export type ProductInput = z.input<typeof productSchema>;

export const qualitySchema = z.object({
  brokenPct: optionalPercent('Quebrado'),
  moisturePct: optionalPercent('Humedad'),
  impuritiesPct: optionalPercent('Impurezas'),
  other: z.array(z.object({ name: z.string().min(1), value: z.string().min(1), unit: z.string() })).default([]),
  analysisDate: optionalDate('Fecha de análisis'),
  analyst: z.string().optional().nullable(),
  documentRef: z.string().optional().nullable(),
  verificationStatus: verificationStatusSchema,
  validUntil: optionalDate('Vigencia del análisis'),
});

export const lotSchema = z.object({
  productId: z.string().min(1, 'Seleccionar el producto'),
  facilityId: z.string().min(1, 'Seleccionar la planta o depósito'),
  presentationId: z.string().min(1, 'Seleccionar la presentación'),
  physicalStockT: positive('Stock físico'),
  harvest: z.string().optional().nullable(),
  availableFrom: isoDate('Disponible desde'),
  quality: qualitySchema,
  certifications: z
    .array(z.object({ name: z.string().min(1), status: verificationStatusSchema, documentRef: z.string().nullable().optional() }))
    .default([]),
  published: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});
export type LotInput = z.input<typeof lotSchema>;

export const facilitySchema = z.object({
  name: z.string().trim().min(2, 'Nombre: requerido'),
  type: z.enum(['mill', 'plant', 'warehouse', 'farm']),
  country: z.string().length(2, 'País: código ISO de 2 letras'),
  province: z.string().trim().min(2, 'Provincia: requerida'),
  city: z.string().trim().min(2, 'Localidad: requerida'),
  address: z.string().trim().min(3, 'Dirección de carga: requerida'),
  exitPortId: z.string().nullable().optional(),
  distanceToPortKm: z.union([decimal('Distancia'), z.literal(''), z.null()]).optional(),
  distanceSource: z.enum(['manual', 'service']).nullable().optional(),
  loadingConditions: z.string().optional().nullable(),
  logisticsNotes: z.string().optional().nullable(),
});
export type FacilityInput = z.input<typeof facilitySchema>;

export const requestSchema = z
  .object({
    contactName: z.string().trim().min(2, 'Persona de contacto: requerida'),
    contactEmail: z.union([z.string().email('Email inválido'), z.literal(''), z.null()]).optional(),
    visibility: z.enum(['public', 'private']),
    invitedOrganizationIds: z.array(z.string()).default([]),
    category: z.enum(['rice', 'other']),
    commercialType: riceTypeSchema,
    varietyPolicy: z.enum(['exact', 'equivalents_allowed']),
    variety: z.string().trim().optional().nullable(),
    processing: processingSchema,
    maxBrokenPct: percent('Quebrado máximo'),
    maxMoisturePct: optionalPercent('Humedad máxima'),
    maxImpuritiesPct: optionalPercent('Impurezas máximas'),
    quantityT: positive('Cantidad'),
    packaging: z.object({ type: packagingTypeSchema, netWeightKg: z.string().nullable().optional() }),
    packagingFlexible: z.boolean(),
    allowConsolidation: z.boolean(),
    destinationCountry: z.string().length(2, 'País de destino: requerido'),
    destinationCity: z.string().optional().nullable(),
    destinationPortId: z.string().optional().nullable(),
    finalAddress: z.string().optional().nullable(),
    availabilityDeadline: optionalDate('Fecha límite de disponibilidad'),
    deliveryDate: optionalDate('Fecha de entrega'),
    currency: z.enum(['USD', 'EUR', 'ARS', 'BRL']),
    preferredIncoterm: z.enum(INCOTERMS as [string, ...string[]]).nullable().optional(),
    requiredCertifications: z.array(z.string().trim().min(1)).default([]),
    buyerDocuments: z.array(z.object({ name: z.string().min(1), note: z.string().nullable().optional() })).default([]),
    notes: z.string().optional().nullable(),
  })
  .refine((r) => r.varietyPolicy !== 'exact' || Boolean(r.variety?.trim()), {
    message: 'Indicar la variedad exigida o admitir equivalentes',
    path: ['variety'],
  })
  .refine((r) => r.packaging.type === 'bulk' || Boolean(r.packaging.netWeightKg), {
    message: 'Indicar el peso por envase',
    path: ['packaging'],
  });
export type RequestInput = z.input<typeof requestSchema>;

export const shipmentSchema = z.object({
  status: z.enum(['planned', 'dispatched', 'shipped', 'received', 'exception']),
  containerTypeId: z.string().nullable().optional(),
  containers: z
    .array(z.object({ number: z.string().trim().min(4), seal: z.string().nullable().optional(), grossKg: z.string().nullable().optional(), vgmKg: z.string().nullable().optional() }))
    .default([]),
  vessel: z.string().nullable().optional(),
  voyage: z.string().nullable().optional(),
  bookingNumber: z.string().nullable().optional(),
  blNumber: z.string().nullable().optional(),
  exportPermitNumber: z.string().nullable().optional(),
  portOfLoadingId: z.string().nullable().optional(),
  portOfDischargeId: z.string().nullable().optional(),
  plannedDate: optionalDate('Fecha planificada'),
  dispatchedAt: optionalDate('Fecha de despacho'),
  shippedAt: optionalDate('Fecha de embarque'),
  receivedAt: optionalDate('Fecha de recepción'),
  shippedQuantityT: z.union([positive('Cantidad embarcada'), z.literal(''), z.null()]).optional(),
  packages: z.number().int().nonnegative().nullable().optional(),
  grossWeightKg: z.union([decimal('Peso bruto'), z.literal(''), z.null()]).optional(),
  notes: z.string().nullable().optional(),
});
export type ShipmentInput = z.input<typeof shipmentSchema>;

export const invoiceSchema = z.object({
  number: z.string().trim().min(3, 'Número de factura: requerido'),
  issueDate: isoDate('Fecha de emisión'),
  currency: z.enum(['USD', 'EUR', 'ARS', 'BRL']),
  amount: positive('Importe'),
  quantityT: positive('Cantidad facturada'),
  exportPermitNumber: z.string().nullable().optional(),
});
export type InvoiceInput = z.input<typeof invoiceSchema>;

export const paymentSchema = z.object({
  reference: z.string().trim().min(2, 'Referencia bancaria: requerida'),
  receivedDate: isoDate('Fecha de acreditación'),
  currency: z.enum(['USD', 'EUR', 'ARS', 'BRL']),
  grossAmount: positive('Cobro bruto'),
  foreignBankFees: decimal('Comisiones del exterior'),
  localBankFees: decimal('Comisiones locales'),
  otherDeductions: decimal('Otras deducciones'),
  netAmount: positive('Cobro neto'),
  isAdvance: z.boolean(),
  bankName: z.string().nullable().optional(),
  bankReportStatus: z.enum(['informed_by_user', 'consulted_in_source', 'verified_by_bank']),
  invoiceId: z.string().nullable().optional(),
  allocatedAmount: z.union([positive('Importe imputado'), z.literal(''), z.null()]).optional(),
  notes: z.string().nullable().optional(),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const fxRateSchema = z.object({
  base: z.enum(['USD', 'EUR', 'ARS', 'BRL']),
  quote: z.enum(['USD', 'EUR', 'ARS', 'BRL']),
  rate: positive('Tipo de cambio'),
  date: isoDate('Fecha'),
  source: z.string().trim().min(3, 'Fuente: requerida'),
  sourceUrl: z.union([z.string().url('URL inválida'), z.literal(''), z.null()]).optional(),
  status: verificationStatusSchema,
});
export type FxRateInput = z.input<typeof fxRateSchema>;

/** Valida con Zod y convierte los errores en mensajes legibles. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message);
    throw new ValidationError(issues[0] ?? 'Datos inválidos', issues);
  }
  return result.data;
}

export function fieldErrors(schema: z.ZodTypeAny, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
