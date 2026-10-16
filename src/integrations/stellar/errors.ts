/** Códigos de `Error` del contrato `agromatch_deals` (contracts/agromatch_deals/src/lib.rs). */
export const DEAL_CONTRACT_ERRORS: Record<number, string> = {
  1: 'Ya existe un acuerdo registrado con esa clave de operación.',
  2: 'No existe un acuerdo con esa clave en el contrato.',
  3: 'Comprador y vendedor deben ser cuentas distintas.',
  4: 'El acuerdo ya fue aceptado: la versión es inmutable.',
  5: 'El acuerdo fue cancelado por el vendedor.',
  6: 'El hash enviado no coincide con la versión de términos registrada.',
  7: 'La versión de términos es inválida (debe ser mayor a la vigente).',
  8: 'La cuenta no participa del acuerdo.',
  9: 'Esa huella documental ya fue registrada.',
  10: 'No existe la prueba documental solicitada.',
};

export class StellarContractError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'StellarContractError';
  }
}

/** Extrae `Error(Contract, #N)` de un error de simulación o envío. */
export function contractErrorFrom(raw: string): StellarContractError {
  const match = raw.match(/Error\(Contract, #(\d+)\)/);
  if (match) {
    const code = Number(match[1]);
    return new StellarContractError(DEAL_CONTRACT_ERRORS[code] ?? `Error de contrato #${code}`, code);
  }
  if (/Error\(Auth/.test(raw)) {
    return new StellarContractError('La cuenta firmante no está autorizada para esta acción.');
  }
  return new StellarContractError(raw.length > 400 ? `${raw.slice(0, 400)}…` : raw);
}
