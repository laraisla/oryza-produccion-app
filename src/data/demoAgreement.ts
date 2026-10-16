import type { CanonicalValue } from '@/integrations/stellar/terms';
import { buildSeed } from './seed';

/**
 * Términos aceptados de la operación demo OP-2026-0001, tal como los recalcula la
 * aplicación a partir del seed. El script de Stellar registra su hash on-chain.
 */
export function demoAgreement(): {
  operationId: string;
  operationCode: string;
  quotationVersionId: string;
  termsVersion: number;
  terms: CanonicalValue;
} {
  const db = buildSeed();
  const op = db.operations.find((o) => o.code === 'OP-2026-0001');
  if (!op?.acceptedVersionId) throw new Error('El seed no contiene la operación demo OP-2026-0001.');
  const version = db.quotationVersions.find((v) => v.id === op.acceptedVersionId)!;
  return {
    operationId: op.id,
    operationCode: op.code,
    quotationVersionId: version.id,
    termsVersion: version.version,
    terms: version.terms as CanonicalValue,
  };
}
