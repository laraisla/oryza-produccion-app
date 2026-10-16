import type { Incoterm, Party, TransportMode } from './catalogs';

/**
 * Punto de la cadena donde se genera un gasto. La asignación vendedor/comprador
 * depende del Incoterm 2020 y del tipo de lugar convenido; no de la categoría
 * contable del gasto. Así, cambiar de Incoterm reasigna sin borrar importes.
 */
export type CostPoint =
  | 'merchandise'
  | 'export_packaging'
  | 'origin_loading'
  | 'pre_carriage'
  | 'export_clearance'
  | 'origin_terminal'
  | 'main_carriage'
  | 'insurance'
  | 'destination_terminal'
  | 'on_carriage'
  | 'import_clearance'
  | 'destination_unloading'
  | 'commercial'
  | 'financial';

export const COST_POINTS: Record<CostPoint, string> = {
  merchandise: 'Mercadería',
  export_packaging: 'Envasado y marcado',
  origin_loading: 'Carga en origen',
  pre_carriage: 'Transporte interno hasta entrega/puerto',
  export_clearance: 'Despacho de exportación',
  origin_terminal: 'Terminal / puerto de origen hasta bordo',
  main_carriage: 'Transporte internacional',
  insurance: 'Seguro internacional',
  destination_terminal: 'Puerto / terminal de destino',
  on_carriage: 'Transporte en destino',
  import_clearance: 'Despacho de importación y tributos',
  destination_unloading: 'Descarga en lugar final',
  commercial: 'Comercial (comisiones, muestras)',
  financial: 'Financiero / bancario',
};

/** Tipo de lugar convenido: define el punto de entrega en FCA y DAP. */
export type NamedPlaceKind =
  | 'seller_premises'
  | 'origin_terminal'
  | 'port_of_shipment'
  | 'port_of_destination'
  | 'destination_terminal'
  | 'inland_destination';

export const NAMED_PLACE_KINDS: Record<NamedPlaceKind, string> = {
  seller_premises: 'Instalaciones del vendedor',
  origin_terminal: 'Terminal / depósito del transportista en origen',
  port_of_shipment: 'Puerto de embarque',
  port_of_destination: 'Puerto de destino',
  destination_terminal: 'Terminal en destino',
  inland_destination: 'Lugar interior en destino',
};

export interface IncotermDefinition {
  code: Incoterm;
  name: string;
  delivery: string;
  placeKinds: NamedPlaceKind[];
  defaultPlaceKind: NamedPlaceKind;
  seaOnly: boolean;
}

export const INCOTERM_DEFINITIONS: Record<Incoterm, IncotermDefinition> = {
  FCA: {
    code: 'FCA',
    name: 'Free Carrier — Franco transportista',
    delivery:
      'El vendedor entrega la mercadería, despachada para exportación, al transportista designado por el comprador en el lugar convenido.',
    placeKinds: ['seller_premises', 'origin_terminal'],
    defaultPlaceKind: 'origin_terminal',
    seaOnly: false,
  },
  FOB: {
    code: 'FOB',
    name: 'Free On Board — Franco a bordo',
    delivery:
      'El vendedor entrega a bordo del buque designado por el comprador en el puerto de embarque convenido. Pensado para carga marítima convencional o a granel.',
    placeKinds: ['port_of_shipment'],
    defaultPlaceKind: 'port_of_shipment',
    seaOnly: true,
  },
  CFR: {
    code: 'CFR',
    name: 'Cost and Freight — Costo y flete',
    delivery:
      'Entrega a bordo en origen (el riesgo pasa allí), pero el vendedor contrata y paga el flete hasta el puerto de destino convenido.',
    placeKinds: ['port_of_destination'],
    defaultPlaceKind: 'port_of_destination',
    seaOnly: true,
  },
  CIF: {
    code: 'CIF',
    name: 'Cost, Insurance and Freight — Costo, seguro y flete',
    delivery:
      'Como CFR, y además el vendedor contrata un seguro con cobertura mínima (Cláusulas C, 110 % del valor) a favor del comprador.',
    placeKinds: ['port_of_destination'],
    defaultPlaceKind: 'port_of_destination',
    seaOnly: true,
  },
  DAP: {
    code: 'DAP',
    name: 'Delivered At Place — Entregado en lugar',
    delivery:
      'El vendedor entrega en el lugar de destino convenido, sobre el medio de transporte y lista para descargar. Importación a cargo del comprador.',
    placeKinds: ['destination_terminal', 'inland_destination'],
    defaultPlaceKind: 'inland_destination',
    seaOnly: false,
  },
};

export interface AllocationRule {
  payer: Party;
  explanation: string;
}

const S = (explanation: string): AllocationRule => ({ payer: 'seller', explanation });
const B = (explanation: string): AllocationRule => ({ payer: 'buyer', explanation });

/** Regla de asignación por defecto (sin pactos particulares). */
export function allocationRule(incoterm: Incoterm, point: CostPoint, place: NamedPlaceKind): AllocationRule {
  switch (point) {
    case 'merchandise':
      return S('Costo propio de la mercadería del vendedor; no depende del Incoterm.');
    case 'export_packaging':
      return S('Embalaje y marcado aptos para el transporte corren por cuenta del vendedor en todas las reglas.');
    case 'origin_loading':
      return S(
        incoterm === 'FCA' && place === 'seller_premises'
          ? 'FCA en instalaciones del vendedor: la entrega ocurre con la mercadería cargada en el vehículo del comprador; la carga la hace el vendedor.'
          : 'La carga en planta es anterior al punto de entrega: la asume el vendedor.',
      );
    case 'pre_carriage':
      if (incoterm === 'FCA' && place === 'seller_premises') {
        return B('FCA en instalaciones del vendedor: el traslado desde la planta lo contrata y paga el comprador.');
      }
      return S(
        incoterm === 'FCA'
          ? 'FCA en terminal u otro lugar: el vendedor paga el traslado hasta el lugar convenido.'
          : 'El vendedor paga el traslado hasta el puerto de embarque o el punto de entrega.',
      );
    case 'export_clearance':
      return S('El despacho de exportación corresponde al vendedor en FCA, FOB, CFR, CIF y DAP (solo EXW lo traslada al comprador).');
    case 'origin_terminal':
      if (incoterm === 'FCA') {
        return B('FCA: luego de entregar al transportista, el manipuleo en terminal y la carga a bordo corresponden al comprador, salvo pacto.');
      }
      return S(
        incoterm === 'FOB'
          ? 'FOB: el vendedor asume los gastos hasta que la mercadería queda a bordo del buque.'
          : 'El vendedor contrata el transporte principal y asume los gastos de embarque en origen.',
      );
    case 'main_carriage':
      if (incoterm === 'FCA' || incoterm === 'FOB') {
        return B(`${incoterm}: el transporte principal lo contrata y paga el comprador.`);
      }
      return S(
        incoterm === 'DAP'
          ? 'DAP: el vendedor paga el transporte hasta el lugar de destino convenido.'
          : `${incoterm}: el vendedor paga el flete hasta el puerto de destino; el riesgo pasa al comprador al embarcar.`,
      );
    case 'insurance':
      if (incoterm === 'CIF') {
        return S('CIF: el vendedor debe contratar seguro con cobertura mínima (Cláusulas C) por el 110 % del valor.');
      }
      if (incoterm === 'DAP') {
        return S('DAP: el vendedor soporta el riesgo hasta destino; el seguro no es obligatorio pero suele contratarlo él.');
      }
      return B(`${incoterm}: no hay obligación de asegurar; el riesgo del transporte principal es del comprador, que suele contratarlo.`);
    case 'destination_terminal':
      if (incoterm === 'DAP' && place === 'inland_destination') {
        return S('DAP en lugar interior: los gastos portuarios en destino necesarios para el tránsito los paga el vendedor.');
      }
      if (incoterm === 'CFR' || incoterm === 'CIF') {
        return B(
          `${incoterm}: la descarga en destino es del comprador, salvo que esté incluida en el contrato de transporte del vendedor (marcar como incluida en el flete).`,
        );
      }
      return B('La entrega ocurre antes de la descarga en destino: estos gastos los asume el comprador.');
    case 'on_carriage':
      if (incoterm === 'DAP' && place === 'inland_destination') {
        return S('DAP: el vendedor paga el transporte hasta el lugar de destino convenido.');
      }
      return B('El transporte posterior al punto de entrega lo paga el comprador.');
    case 'import_clearance':
      return B('Despacho de importación, permisos y tributos de importación: comprador (solo DDP los traslada al vendedor).');
    case 'destination_unloading':
      return B('La descarga en el lugar final corresponde al comprador (DAP entrega lista para descargar).');
    case 'commercial':
      return S('Comisiones y gastos comerciales: según contrato; por defecto los asume el vendedor que contrató al intermediario.');
    case 'financial':
      return S('Gastos bancarios y financieros del vendedor según la condición de pago pactada.');
  }
}

export interface IncotermAdvice {
  level: 'info' | 'warning' | 'error';
  code: 'named_place_missing' | 'place_kind' | 'container_sea_term' | 'truck_sea_term';
  message: string;
}

export function incotermAdvice(
  incoterm: Incoterm,
  transportMode: TransportMode,
  place: NamedPlaceKind,
  namedPlace: string,
): IncotermAdvice[] {
  const advice: IncotermAdvice[] = [];
  const def = INCOTERM_DEFINITIONS[incoterm];
  if (!namedPlace.trim()) {
    advice.push({
      level: 'error',
      code: 'named_place_missing',
      message: `Falta el lugar convenido para ${incoterm}: la cotización no puede enviarse sin él.`,
    });
  }
  if (!def.placeKinds.includes(place)) {
    advice.push({
      level: 'warning',
      code: 'place_kind',
      message: `El tipo de lugar "${NAMED_PLACE_KINDS[place]}" no es coherente con ${incoterm}.`,
    });
  }
  if (def.seaOnly && transportMode === 'container') {
    advice.push({
      level: 'info',
      code: 'container_sea_term',
      message: `${incoterm} está pensado para transporte marítimo convencional; para carga en contenedores suele recomendarse FCA en la terminal.`,
    });
  }
  if (def.seaOnly && transportMode === 'truck') {
    advice.push({
      level: 'warning',
      code: 'truck_sea_term',
      message: `${incoterm} solo aplica a transporte marítimo o fluvial.`,
    });
  }
  return advice;
}
