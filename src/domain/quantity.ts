import type { PackagingType } from './catalogs';
import { dec, sum, toPlain, type Dec } from './decimal';

/** Movimientos de inventario que afectan la disponibilidad de un lote. */
export type MovementType = 'reservation' | 'release' | 'commitment' | 'shipment' | 'adjustment';

export interface StockMovementLike {
  type: MovementType;
  /** Toneladas; positivo salvo en ajustes (que pueden ser negativos). */
  quantityT: string;
  /** Un compromiso que convierte una reserva previa la descuenta de lo reservado. */
  convertsReservation?: boolean;
}

export interface LotStock {
  physical: Dec;
  reserved: Dec;
  committed: Dec;
  /** Stock disponible = físico − reservado − comprometido. */
  available: Dec;
}

export function lotStock(physicalT: string, movements: StockMovementLike[]): LotStock {
  let physical = dec(physicalT);
  let reserved = dec(0);
  let committed = dec(0);
  for (const m of movements) {
    const q = dec(m.quantityT);
    switch (m.type) {
      case 'reservation':
        reserved = reserved.plus(q);
        break;
      case 'release':
        reserved = reserved.minus(q);
        break;
      case 'commitment':
        committed = committed.plus(q);
        if (m.convertsReservation) reserved = reserved.minus(q);
        break;
      case 'shipment':
        physical = physical.minus(q);
        committed = committed.minus(q);
        break;
      case 'adjustment':
        physical = physical.plus(q);
        break;
    }
  }
  return { physical, reserved, committed, available: physical.minus(reserved).minus(committed) };
}

export class InsufficientStockError extends Error {
  constructor(
    readonly requestedT: string,
    readonly availableT: string,
  ) {
    super(`Stock insuficiente: se solicitan ${requestedT} t y hay ${availableT} t disponibles.`);
    this.name = 'InsufficientStockError';
  }
}

/** Impide reservar o comprometer stock ya comprometido o inexistente. */
export function assertAvailable(stock: LotStock, requestedT: string): void {
  if (dec(requestedT).lte(0)) throw new Error('La cantidad debe ser mayor a cero.');
  if (dec(requestedT).gt(stock.available)) {
    throw new InsufficientStockError(toPlain(dec(requestedT)), toPlain(stock.available));
  }
}

export interface AvailabilityCheck {
  sufficient: boolean;
  requestedT: string;
  availableT: string;
  shortfallT: string;
}

export function checkAvailability(requestedT: string, availableT: string): AvailabilityCheck {
  const shortfall = dec(requestedT).minus(dec(availableT));
  return {
    sufficient: shortfall.lte(0),
    requestedT: toPlain(dec(requestedT)),
    availableT: toPlain(dec(availableT)),
    shortfallT: toPlain(shortfall.gt(0) ? shortfall : dec(0)),
  };
}

export interface PackagingSpec {
  type: PackagingType;
  /** Peso neto por envase en kg (no aplica a granel). */
  netWeightKg?: string | null;
  /** Peso del envase vacío en kg. */
  tareWeightKg?: string | null;
  unitsPerPallet?: number | null;
  palletTareKg?: string | null;
  packageVolumeM3?: string | null;
}

export type PackagingDecision = 'round_up' | 'round_down';

export interface PackagingResult {
  netKg: string;
  /** Envases exactos (puede ser fraccionario). */
  exactPackages: string;
  isWhole: boolean;
  /** Si no es entero y no hay decisión, el usuario debe elegir una opción. */
  needsDecision: boolean;
  options: { decision: PackagingDecision; packages: number; netT: string }[];
  packages: number;
  /** Cantidad neta efectiva luego de la decisión. */
  netT: string;
  pallets: number;
  tareKg: string;
  grossKg: string;
  grossT: string;
  volumeM3: string | null;
}

export function computePackaging(
  netT: string,
  spec: PackagingSpec,
  decision?: PackagingDecision,
): PackagingResult {
  const netKg = dec(netT).times(1000);
  if (spec.type === 'bulk' || !spec.netWeightKg || dec(spec.netWeightKg).lte(0)) {
    return {
      netKg: toPlain(netKg),
      exactPackages: '0',
      isWhole: true,
      needsDecision: false,
      options: [],
      packages: 0,
      netT: toPlain(dec(netT)),
      pallets: 0,
      tareKg: '0',
      grossKg: toPlain(netKg),
      grossT: toPlain(dec(netT)),
      volumeM3: null,
    };
  }
  const perPackage = dec(spec.netWeightKg);
  const exact = netKg.div(perPackage);
  const isWhole = exact.isInteger();
  const floor = exact.floor().toNumber();
  const ceil = exact.ceil().toNumber();
  const options = isWhole
    ? []
    : [
        { decision: 'round_down' as const, packages: floor, netT: toPlain(perPackage.times(floor).div(1000)) },
        { decision: 'round_up' as const, packages: ceil, netT: toPlain(perPackage.times(ceil).div(1000)) },
      ];
  const packages = isWhole ? exact.toNumber() : decision === 'round_down' ? floor : decision === 'round_up' ? ceil : ceil;
  const effectiveNetKg = isWhole ? netKg : perPackage.times(packages);
  const pallets = spec.unitsPerPallet && spec.unitsPerPallet > 0 ? Math.ceil(packages / spec.unitsPerPallet) : 0;
  const tare = dec(spec.tareWeightKg || 0)
    .times(packages)
    .plus(dec(spec.palletTareKg || 0).times(pallets));
  const gross = effectiveNetKg.plus(tare);
  return {
    netKg: toPlain(effectiveNetKg),
    exactPackages: toPlain(exact),
    isWhole,
    needsDecision: !isWhole && !decision,
    options,
    packages,
    netT: toPlain(effectiveNetKg.div(1000)),
    pallets,
    tareKg: toPlain(tare),
    grossKg: toPlain(gross),
    grossT: toPlain(gross.div(1000)),
    volumeM3: spec.packageVolumeM3 ? toPlain(dec(spec.packageVolumeM3).times(packages)) : null,
  };
}

export interface ContainerSpec {
  name: string;
  /** Carga útil máxima declarada por el equipo (kg). */
  maxPayloadKg: string;
  /** Restricción operativa configurada (ruta, balanza, naviera). Si existe, prevalece. */
  operationalLimitKg?: string | null;
  usableVolumeM3?: string | null;
  maxPallets?: number | null;
}

export interface ContainerPlan {
  count: number;
  effectiveLimitKg: string;
  byWeight: number;
  byVolume: number | null;
  byPallets: number | null;
  limitingFactor: 'weight' | 'volume' | 'pallets' | 'none';
  averageGrossPerContainerKg: string | null;
  notes: string[];
}

export function containersRequired(
  grossKg: string,
  volumeM3: string | null,
  pallets: number,
  container: ContainerSpec,
): ContainerPlan {
  const notes: string[] = [];
  const limits = [dec(container.maxPayloadKg)];
  if (container.operationalLimitKg) limits.push(dec(container.operationalLimitKg));
  const effective = limits.reduce((a, b) => (a.lt(b) ? a : b));
  if (container.operationalLimitKg && dec(container.operationalLimitKg).lt(container.maxPayloadKg)) {
    notes.push(`Se aplica el límite operativo configurado (${container.operationalLimitKg} kg) en lugar de la carga útil máxima.`);
  }
  const gross = dec(grossKg);
  const byWeight = gross.lte(0) || effective.lte(0) ? 0 : gross.div(effective).ceil().toNumber();
  const byVolume =
    volumeM3 && container.usableVolumeM3 && dec(container.usableVolumeM3).gt(0)
      ? dec(volumeM3).div(container.usableVolumeM3).ceil().toNumber()
      : null;
  const byPallets =
    pallets > 0 && container.maxPallets && container.maxPallets > 0 ? Math.ceil(pallets / container.maxPallets) : null;
  const count = Math.max(byWeight, byVolume ?? 0, byPallets ?? 0);
  let limitingFactor: ContainerPlan['limitingFactor'] = 'none';
  if (count > 0) {
    if (count === byWeight) limitingFactor = 'weight';
    if (byVolume !== null && count === byVolume && byVolume > byWeight) limitingFactor = 'volume';
    if (byPallets !== null && count === byPallets && byPallets > Math.max(byWeight, byVolume ?? 0)) limitingFactor = 'pallets';
  }
  if (byVolume === null) notes.push('Sin volumen por envase o capacidad volumétrica: el cálculo considera solo peso.');
  return {
    count,
    effectiveLimitKg: toPlain(effective),
    byWeight,
    byVolume,
    byPallets,
    limitingFactor,
    averageGrossPerContainerKg: count > 0 ? toPlain(gross.div(count)) : null,
    notes,
  };
}

/** Suma toneladas de varios lotes (consolidación) con precisión decimal. */
export function totalTons(values: string[]): string {
  return toPlain(sum(values));
}
