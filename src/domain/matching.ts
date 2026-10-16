import {
  PACKAGING_TYPES,
  PROCESSING,
  RICE_TYPES,
  type PackagingType,
  type Processing,
  type ProductCategory,
  type RiceType,
  type VerificationStatus,
} from './catalogs';
import { dec, sum, toPlain } from './decimal';
import { fmtDate, fmtNum, fmtTons } from './format';

export const MATCHING_ENGINE_VERSION = 'matching/1.0.0';

export interface PackagingRef {
  type: PackagingType;
  netWeightKg?: string | null;
}

export interface MatchRequestCriteria {
  category: ProductCategory;
  commercialType: RiceType;
  varietyPolicy: 'exact' | 'equivalents_allowed';
  variety?: string | null;
  processing: Processing;
  maxBrokenPct: string;
  maxMoisturePct?: string | null;
  maxImpuritiesPct?: string | null;
  quantityT: string;
  packaging: PackagingRef;
  /** El comprador acepta otra presentación (p. ej., reenvasado). */
  packagingFlexible: boolean;
  /** Fecha límite en que la mercadería debe estar disponible para despacho. */
  availabilityDeadline?: string | null;
  requiredCertifications: string[];
  allowConsolidation: boolean;
}

export interface LotCertification {
  name: string;
  status: VerificationStatus;
}

export interface MatchLotOffer {
  lotId: string;
  lotCode: string;
  organizationId: string;
  organizationName: string;
  category: ProductCategory;
  commercialType: RiceType;
  variety?: string | null;
  processing: Processing;
  brokenPct: string | null;
  moisturePct: string | null;
  impuritiesPct: string | null;
  qualityStatus: VerificationStatus;
  analysisDate?: string | null;
  availableT: string;
  packaging: PackagingRef;
  /** Presentaciones a las que el molino declara poder reenvasar. */
  convertiblePackaging: PackagingRef[];
  availableFrom: string;
  certifications: LotCertification[];
  active: boolean;
}

export type MatchStatus = 'compatible' | 'conditional' | 'incompatible';
export type CheckStatus = 'pass' | 'fail' | 'conditional' | 'missing';

export type MatchCriterion =
  | 'lot_status'
  | 'category'
  | 'commercial_type'
  | 'variety'
  | 'processing'
  | 'broken'
  | 'moisture'
  | 'impurities'
  | 'quality_evidence'
  | 'volume'
  | 'packaging'
  | 'availability_date'
  | 'certifications';

export interface MatchCheck {
  criterion: MatchCriterion;
  label: string;
  /** Requisito excluyente: si falla, el lote es incompatible sin importar el resto. */
  mandatory: boolean;
  status: CheckStatus;
  required: string;
  offered: string;
  explanation: string;
}

export interface MatchResult {
  lotId: string;
  lotCode: string;
  organizationId: string;
  organizationName: string;
  status: MatchStatus;
  checks: MatchCheck[];
  failures: string[];
  conditions: string[];
  /** Solo ordena resultados del mismo estado; nunca cambia la clasificación. */
  rank: number;
  engineVersion: string;
}

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  compatible: 'Compatible',
  conditional: 'Compatible con condiciones',
  incompatible: 'Incompatible',
};

function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function packagingLabel(p: PackagingRef): string {
  if (p.type === 'bulk') return PACKAGING_TYPES.bulk;
  return `${PACKAGING_TYPES[p.type]}${p.netWeightKg ? ` ${fmtNum(p.netWeightKg)} kg` : ''}`;
}

function samePackaging(a: PackagingRef, b: PackagingRef): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'bulk') return true;
  if (!a.netWeightKg || !b.netWeightKg) return false;
  return dec(a.netWeightKg).eq(dec(b.netWeightKg));
}

function maxCheck(
  criterion: 'broken' | 'moisture' | 'impurities',
  label: string,
  max: string,
  offered: string | null,
): MatchCheck {
  if (offered === null || offered === '') {
    return {
      criterion,
      label,
      mandatory: true,
      status: 'missing',
      required: `≤ ${fmtNum(max)} %`,
      offered: 'Sin análisis',
      explanation: `Falta el dato de ${label.toLowerCase()} del lote: no puede confirmarse el cumplimiento.`,
    };
  }
  const ok = dec(offered).lte(dec(max));
  return {
    criterion,
    label,
    mandatory: true,
    status: ok ? 'pass' : 'fail',
    required: `≤ ${fmtNum(max)} %`,
    offered: `${fmtNum(offered)} %`,
    explanation: ok
      ? `${label}: ${fmtNum(offered)} % dentro del máximo de ${fmtNum(max)} %.`
      : `${label}: el lote tiene ${fmtNum(offered)} % y el máximo exigido es ${fmtNum(max)} %. Incumple un requisito excluyente.`,
  };
}

/** Evalúa un lote contra una solicitud aplicando primero los filtros excluyentes. */
export function evaluateLot(request: MatchRequestCriteria, lot: MatchLotOffer): MatchResult {
  const checks: MatchCheck[] = [];

  checks.push({
    criterion: 'lot_status',
    label: 'Lote disponible',
    mandatory: true,
    status: lot.active && dec(lot.availableT).gt(0) ? 'pass' : 'fail',
    required: 'Lote activo con stock libre',
    offered: lot.active ? fmtTons(lot.availableT) : 'Inactivo',
    explanation: lot.active
      ? dec(lot.availableT).gt(0)
        ? 'Lote activo con stock libre.'
        : 'El lote no tiene stock libre (todo está reservado o comprometido).'
      : 'El lote está marcado como inactivo.',
  });

  checks.push({
    criterion: 'category',
    label: 'Producto',
    mandatory: true,
    status: request.category === lot.category ? 'pass' : 'fail',
    required: request.category,
    offered: lot.category,
    explanation: request.category === lot.category ? 'Mismo producto.' : 'El producto ofrecido es otro.',
  });

  const typeOk = request.commercialType === lot.commercialType;
  checks.push({
    criterion: 'commercial_type',
    label: 'Tipo comercial',
    mandatory: true,
    status: typeOk ? 'pass' : 'fail',
    required: RICE_TYPES[request.commercialType],
    offered: RICE_TYPES[lot.commercialType],
    explanation: typeOk
      ? `Tipo comercial coincidente: ${RICE_TYPES[lot.commercialType]}.`
      : `Se solicita ${RICE_TYPES[request.commercialType]} y el lote es ${RICE_TYPES[lot.commercialType]}. Los tipos comerciales no son sustitutos automáticos: el precio o el volumen no compensan esta diferencia.`,
  });

  if (request.varietyPolicy === 'exact' && request.variety) {
    const hasVariety = Boolean(lot.variety?.trim());
    const varietyOk = hasVariety && normalize(lot.variety) === normalize(request.variety);
    checks.push({
      criterion: 'variety',
      label: 'Variedad',
      mandatory: true,
      status: !hasVariety ? 'missing' : varietyOk ? 'pass' : 'fail',
      required: request.variety,
      offered: lot.variety || 'No informada',
      explanation: !hasVariety
        ? 'El comprador exige una variedad exacta y el lote no la informa.'
        : varietyOk
          ? 'Variedad exacta coincidente.'
          : `El comprador exige la variedad ${request.variety} sin sustitutos; el lote es ${lot.variety}.`,
    });
  } else {
    checks.push({
      criterion: 'variety',
      label: 'Variedad',
      mandatory: false,
      status: 'pass',
      required: request.variety ? `${request.variety} o equivalente` : 'Sin exigencia',
      offered: lot.variety || 'No informada',
      explanation: 'El comprador admite variedades equivalentes dentro del tipo comercial.',
    });
  }

  const processingOk = request.processing === lot.processing;
  checks.push({
    criterion: 'processing',
    label: 'Grado de elaboración',
    mandatory: true,
    status: processingOk ? 'pass' : 'fail',
    required: PROCESSING[request.processing],
    offered: PROCESSING[lot.processing],
    explanation: processingOk
      ? 'Grado de elaboración coincidente.'
      : `Se solicita arroz ${PROCESSING[request.processing].toLowerCase()} y el lote es ${PROCESSING[lot.processing].toLowerCase()}.`,
  });

  checks.push(maxCheck('broken', 'Quebrado', request.maxBrokenPct, lot.brokenPct));
  if (request.maxMoisturePct) checks.push(maxCheck('moisture', 'Humedad', request.maxMoisturePct, lot.moisturePct));
  if (request.maxImpuritiesPct) {
    checks.push(maxCheck('impurities', 'Impurezas', request.maxImpuritiesPct, lot.impuritiesPct));
  }

  const evidenceOk = lot.qualityStatus === 'verified';
  checks.push({
    criterion: 'quality_evidence',
    label: 'Respaldo de calidad',
    mandatory: false,
    status: evidenceOk ? 'pass' : 'conditional',
    required: 'Análisis verificado',
    offered:
      lot.qualityStatus === 'verified'
        ? `Verificado${lot.analysisDate ? ` (${fmtDate(lot.analysisDate)})` : ''}`
        : lot.qualityStatus === 'expired'
          ? 'Análisis vencido'
          : 'Declarado sin verificar',
    explanation: evidenceOk
      ? 'La calidad cuenta con un análisis verificado.'
      : lot.qualityStatus === 'expired'
        ? 'El análisis de calidad está vencido: solicitar uno actualizado antes de confirmar.'
        : 'La calidad es declarada por el vendedor y no está verificada con un análisis: confirmar antes de cotizar en firme.',
  });

  const volumeOk = dec(lot.availableT).gte(dec(request.quantityT));
  const shortfall = dec(request.quantityT).minus(dec(lot.availableT));
  checks.push({
    criterion: 'volume',
    label: 'Volumen',
    mandatory: true,
    status: volumeOk ? 'pass' : 'fail',
    required: `≥ ${fmtTons(request.quantityT)}`,
    offered: `${fmtTons(lot.availableT)} libres`,
    explanation: volumeOk
      ? `Stock libre suficiente (${fmtTons(lot.availableT)} para ${fmtTons(request.quantityT)}).`
      : `Insuficiencia de stock: faltan ${fmtTons(toPlain(shortfall))}. ${request.allowConsolidation ? 'Puede evaluarse una consolidación con otros lotes compatibles.' : 'El comprador no admite consolidar lotes.'}`,
  });

  const packOk = samePackaging(request.packaging, lot.packaging);
  const convertible = !packOk && lot.convertiblePackaging.some((p) => samePackaging(p, request.packaging));
  checks.push({
    criterion: 'packaging',
    label: 'Presentación',
    mandatory: true,
    status: packOk ? 'pass' : convertible || request.packagingFlexible ? 'conditional' : 'fail',
    required: packagingLabel(request.packaging),
    offered: packagingLabel(lot.packaging),
    explanation: packOk
      ? 'Presentación coincidente.'
      : convertible
        ? `El molino declara poder reenvasar a ${packagingLabel(request.packaging)}: confirmar costo adicional y plazo antes de cotizar.`
        : request.packagingFlexible
          ? 'El comprador admite otra presentación: confirmar la alternativa con el comprador.'
          : `Se exige ${packagingLabel(request.packaging)} y el lote está en ${packagingLabel(lot.packaging)} sin capacidad declarada de reenvasado.`,
  });

  if (request.availabilityDeadline) {
    const onTime = lot.availableFrom <= request.availabilityDeadline;
    checks.push({
      criterion: 'availability_date',
      label: 'Disponibilidad en plazo',
      mandatory: true,
      status: onTime ? 'pass' : 'fail',
      required: `Disponible antes del ${fmtDate(request.availabilityDeadline)}`,
      offered: `Desde ${fmtDate(lot.availableFrom)}`,
      explanation: onTime
        ? 'El lote está disponible dentro del plazo solicitado.'
        : `El lote recién estará disponible el ${fmtDate(lot.availableFrom)}, después del plazo pedido.`,
    });
  }

  for (const cert of request.requiredCertifications) {
    const found = lot.certifications.find((c) => normalize(c.name) === normalize(cert));
    checks.push({
      criterion: 'certifications',
      label: `Certificación: ${cert}`,
      mandatory: false,
      status: found?.status === 'verified' ? 'pass' : 'conditional',
      required: cert,
      offered: found ? `${found.name} (${found.status === 'verified' ? 'verificada' : 'sin verificar'})` : 'No informada',
      explanation: found?.status === 'verified'
        ? `Certificación ${cert} verificada.`
        : found
          ? `La certificación ${cert} está informada pero sin verificación vigente.`
          : `El comprador exige ${cert}; el lote no la informa. Confirmar si puede obtenerse antes de cotizar.`,
    });
  }

  const failures = checks.filter((c) => c.mandatory && c.status === 'fail').map((c) => c.explanation);
  const conditions = checks
    .filter((c) => c.status === 'conditional' || c.status === 'missing')
    .map((c) => c.explanation);
  const status: MatchStatus = failures.length > 0 ? 'incompatible' : conditions.length > 0 ? 'conditional' : 'compatible';

  const brokenMargin = lot.brokenPct ? dec(request.maxBrokenPct).minus(dec(lot.brokenPct)).toNumber() : 0;
  const rank = (evidenceOk ? 10 : 0) + brokenMargin - conditions.length * 5;

  return {
    lotId: lot.lotId,
    lotCode: lot.lotCode,
    organizationId: lot.organizationId,
    organizationName: lot.organizationName,
    status,
    checks,
    failures,
    conditions,
    rank,
    engineVersion: MATCHING_ENGINE_VERSION,
  };
}

const STATUS_ORDER: Record<MatchStatus, number> = { compatible: 0, conditional: 1, incompatible: 2 };

export function evaluateRequest(request: MatchRequestCriteria, lots: MatchLotOffer[]): MatchResult[] {
  return lots
    .map((lot) => evaluateLot(request, lot))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.rank - a.rank);
}

export interface ConsolidationSuggestion {
  status: 'conditional';
  sufficient: boolean;
  totalT: string;
  requestedT: string;
  parts: { lotId: string; lotCode: string; organizationId: string; organizationName: string; takeT: string }[];
  notes: string[];
}

/**
 * Sugiere combinar lotes que cumplen todo salvo el volumen. Nunca reserva stock:
 * es una propuesta "con condiciones" que exige verificar compatibilidad conjunta.
 */
export function suggestConsolidation(
  request: MatchRequestCriteria,
  results: MatchResult[],
  lots: MatchLotOffer[],
): ConsolidationSuggestion | null {
  if (!request.allowConsolidation) return null;
  if (results.some((r) => r.status !== 'incompatible')) return null;
  const candidates = results.filter(
    (r) => r.status === 'incompatible' && r.checks.every((c) => !c.mandatory || c.status !== 'fail' || c.criterion === 'volume'),
  );
  if (candidates.length < 2) return null;
  const byId = new Map(lots.map((l) => [l.lotId, l]));
  const ordered = candidates
    .map((r) => byId.get(r.lotId)!)
    .filter((l) => dec(l.availableT).gt(0))
    .sort((a, b) => dec(a.brokenPct ?? '100').comparedTo(dec(b.brokenPct ?? '100')));
  const parts: ConsolidationSuggestion['parts'] = [];
  let remaining = dec(request.quantityT);
  for (const lot of ordered) {
    if (remaining.lte(0)) break;
    const take = dec(lot.availableT).lt(remaining) ? dec(lot.availableT) : remaining;
    parts.push({
      lotId: lot.lotId,
      lotCode: lot.lotCode,
      organizationId: lot.organizationId,
      organizationName: lot.organizationName,
      takeT: toPlain(take),
    });
    remaining = remaining.minus(take);
  }
  if (parts.length < 2) return null;
  const total = sum(parts.map((p) => p.takeT));
  const notes = [
    'Propuesta sujeta a verificación conjunta de calidad y homogeneidad: no se reservó stock.',
    'Cada lote cumple individualmente tipo, elaboración, calidad y presentación exigidos.',
  ];
  if (new Set(parts.map((p) => p.organizationId)).size > 1) {
    notes.push('Intervienen distintos proveedores: requiere coordinar consolidación, documentación y responsabilidades.');
  }
  if (remaining.gt(0)) notes.push(`Aun consolidando faltan ${fmtTons(toPlain(remaining))}.`);
  return {
    status: 'conditional',
    sufficient: remaining.lte(0),
    totalT: toPlain(total),
    requestedT: toPlain(dec(request.quantityT)),
    parts,
    notes,
  };
}
