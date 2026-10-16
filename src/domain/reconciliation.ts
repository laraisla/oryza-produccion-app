import type { ReconciliationStatus } from './catalogs';
import { dec, sum, toPlain } from './decimal';
import { fmtMoney, fmtTons } from './format';

export const RECONCILIATION_ENGINE_VERSION = 'reconciliation/1.0.0';

export const RECONCILIATION_DISCLAIMER =
  'Una diferencia no implica por sí misma un incumplimiento cambiario ni un bloqueo: debe identificarse su causa, ' +
  'conservar el comprobante y verificar su tratamiento con el banco interviniente y el despachante. ' +
  'AgroMatch no liquida divisas ni informa a SECOEXPO.';

export interface InvoiceLike {
  id: string;
  number: string;
  currency: string;
  amount: string;
  quantityT: string;
}

export interface ShipmentLike {
  id: string;
  shippedQuantityT: string | null;
}

export interface PaymentLike {
  id: string;
  reference: string;
  currency: string;
  grossAmount: string;
  foreignBankFees: string;
  localBankFees: string;
  otherDeductions: string;
  netAmount: string;
  isAdvance: boolean;
  /** Documentos que respaldan las deducciones del cobro. */
  deductionEvidenceCount: number;
}

export interface AllocationLike {
  paymentId: string;
  invoiceId: string;
  amount: string;
}

export interface ReconciliationInput {
  currency: string;
  contractPricePerT: string;
  invoices: InvoiceLike[];
  shipments: ShipmentLike[];
  payments: PaymentLike[];
  allocations: AllocationLike[];
  /** Tolerancia absoluta para importes (moneda de la operación). */
  amountTolerance?: string;
  /** Tolerancia para cantidades (t). */
  quantityTolerance?: string;
}

export type DifferenceKind =
  | 'currency_mismatch'
  | 'quantity_invoice_vs_shipment'
  | 'invoice_vs_contract'
  | 'foreign_bank_fee'
  | 'local_bank_fee'
  | 'other_deduction'
  | 'net_amount_mismatch'
  | 'unallocated_payment'
  | 'pending_collection'
  | 'over_collection';

export interface Difference {
  kind: DifferenceKind;
  label: string;
  amount: string;
  paymentId?: string;
  probableCause: string;
  requiredEvidence: string | null;
  status: 'explained' | 'needs_evidence' | 'to_review' | 'informative';
}

export interface ReconciliationResult {
  engineVersion: string;
  currency: string;
  invoiced: string;
  invoicedQuantityT: string;
  shippedQuantityT: string;
  shippedValue: string;
  grossCollected: string;
  netCollected: string;
  advances: string;
  foreignFees: string;
  localFees: string;
  otherDeductions: string;
  pendingBalance: string;
  differences: Difference[];
  suggestedStatus: Exclude<ReconciliationStatus, 'reconciled_by_operator'>;
  /** Todas las diferencias explicadas y sin saldo: el operador puede conciliar. */
  readyToReconcile: boolean;
}

export function reconcile(input: ReconciliationInput): ReconciliationResult {
  const tol = dec(input.amountTolerance ?? '0.01');
  const qtyTol = dec(input.quantityTolerance ?? '0.001');
  const differences: Difference[] = [];

  const invoices = input.invoices.filter((inv) => {
    if (inv.currency !== input.currency) {
      differences.push({
        kind: 'currency_mismatch',
        label: `Factura ${inv.number} en ${inv.currency}`,
        amount: inv.amount,
        probableCause: `La factura está emitida en ${inv.currency} y la operación en ${input.currency}.`,
        requiredEvidence: 'Tipo de cambio aplicado y criterio acordado con el banco.',
        status: 'to_review',
      });
      return false;
    }
    return true;
  });
  const payments = input.payments.filter((p) => p.currency === input.currency);

  const invoiced = sum(invoices.map((i) => i.amount));
  const invoicedQty = sum(invoices.map((i) => i.quantityT));
  const shippedQty = sum(input.shipments.map((s) => s.shippedQuantityT ?? '0'));
  const shippedValue = shippedQty.times(dec(input.contractPricePerT || 0));
  const hasShipment = input.shipments.some((s) => s.shippedQuantityT !== null);

  if (invoices.length > 0 && hasShipment && invoicedQty.minus(shippedQty).abs().gt(qtyTol)) {
    const diffQty = invoicedQty.minus(shippedQty);
    differences.push({
      kind: 'quantity_invoice_vs_shipment',
      label: 'Facturado vs. embarcado',
      amount: toPlain(diffQty.times(dec(input.contractPricePerT || 0))),
      probableCause: `Se facturaron ${fmtTons(toPlain(invoicedQty))} y se embarcaron ${fmtTons(toPlain(shippedQty))}.`,
      requiredEvidence: 'Packing list y certificado de peso; eventual rectificación de factura o del permiso de embarque.',
      status: 'to_review',
    });
  }

  for (const inv of invoices) {
    const expected = dec(inv.quantityT).times(dec(input.contractPricePerT || 0));
    if (dec(input.contractPricePerT || 0).gt(0) && dec(inv.amount).minus(expected).abs().gt(tol)) {
      differences.push({
        kind: 'invoice_vs_contract',
        label: `Factura ${inv.number} vs. precio pactado`,
        amount: toPlain(dec(inv.amount).minus(expected)),
        probableCause: `La factura (${fmtMoney(inv.amount, input.currency)}) difiere de cantidad × precio pactado (${fmtMoney(toPlain(expected), input.currency)}).`,
        requiredEvidence: 'Versión de cotización aceptada y nota de débito/crédito si corresponde.',
        status: 'to_review',
      });
    }
  }

  const invoiceIds = new Set(invoices.map((i) => i.id));
  const allocatedByPayment = new Map<string, ReturnType<typeof dec>>();
  for (const a of input.allocations) {
    if (!invoiceIds.has(a.invoiceId)) continue;
    allocatedByPayment.set(a.paymentId, (allocatedByPayment.get(a.paymentId) ?? dec(0)).plus(dec(a.amount)));
  }

  for (const p of payments) {
    const fees = dec(p.foreignBankFees || 0).plus(dec(p.localBankFees || 0)).plus(dec(p.otherDeductions || 0));
    const expectedNet = dec(p.grossAmount).minus(fees);
    const evidence = p.deductionEvidenceCount > 0;
    if (dec(p.netAmount).minus(expectedNet).abs().gt(tol)) {
      differences.push({
        kind: 'net_amount_mismatch',
        label: `Cobro ${p.reference}: neto no explicado`,
        amount: toPlain(expectedNet.minus(dec(p.netAmount))),
        paymentId: p.id,
        probableCause: 'El neto acreditado no coincide con bruto menos comisiones y deducciones informadas.',
        requiredEvidence: 'Liquidación bancaria completa del cobro.',
        status: 'to_review',
      });
    }
    const feeDiff = (
      kind: DifferenceKind,
      amount: string,
      label: string,
      cause: string,
      evidenceText: string,
    ) => {
      if (dec(amount || 0).gt(0)) {
        differences.push({
          kind,
          label,
          amount: toPlain(dec(amount)),
          paymentId: p.id,
          probableCause: cause,
          requiredEvidence: evidenceText,
          status: evidence ? 'explained' : 'needs_evidence',
        });
      }
    };
    feeDiff(
      'foreign_bank_fee',
      p.foreignBankFees,
      `Comisión banco del exterior (${p.reference})`,
      `El banco del exterior o corresponsal descontó ${fmtMoney(p.foreignBankFees, input.currency)} del importe girado.`,
      'Comprobante bancario que detalle la comisión (aviso de crédito o detalle de gastos del mensaje SWIFT).',
    );
    feeDiff(
      'local_bank_fee',
      p.localBankFees,
      `Comisión banco local (${p.reference})`,
      `El banco local aplicó ${fmtMoney(p.localBankFees, input.currency)} de comisiones.`,
      'Liquidación del banco local.',
    );
    feeDiff(
      'other_deduction',
      p.otherDeductions,
      `Otras deducciones (${p.reference})`,
      `Se informaron ${fmtMoney(p.otherDeductions, input.currency)} de otras deducciones.`,
      'Documento que justifique la deducción (nota de crédito, reclamo de calidad, acuerdo comercial).',
    );
    if (!allocatedByPayment.has(p.id) && invoices.length > 0) {
      differences.push({
        kind: 'unallocated_payment',
        label: `Cobro ${p.reference} sin imputar`,
        amount: toPlain(dec(p.grossAmount)),
        paymentId: p.id,
        probableCause: 'El cobro no está imputado a ninguna factura de la operación.',
        requiredEvidence: 'Imputación del cobro a la(s) factura(s) correspondiente(s).',
        status: 'to_review',
      });
    }
  }

  const grossAllocated = sum([...allocatedByPayment.values()]);
  const pending = invoiced.minus(grossAllocated);
  if (invoices.length > 0 && pending.gt(tol)) {
    differences.push({
      kind: 'pending_collection',
      label: 'Saldo pendiente de cobro',
      amount: toPlain(pending),
      probableCause: `Facturado ${fmtMoney(toPlain(invoiced), input.currency)}; imputado ${fmtMoney(toPlain(grossAllocated), input.currency)}.`,
      requiredEvidence: null,
      status: 'informative',
    });
  } else if (pending.lt(tol.negated())) {
    differences.push({
      kind: 'over_collection',
      label: 'Cobrado por encima de lo facturado',
      amount: toPlain(pending.negated()),
      probableCause: 'Los cobros imputados superan el total facturado.',
      requiredEvidence: 'Revisar imputaciones o emitir el documento comercial correspondiente.',
      status: 'to_review',
    });
  }

  const reviewNeeded = differences.some((d) => d.status === 'needs_evidence' || d.status === 'to_review');
  const suggestedStatus: ReconciliationResult['suggestedStatus'] =
    invoices.length === 0 && payments.length === 0
      ? 'no_data'
      : reviewNeeded
        ? 'difference_to_review'
        : 'partial';

  return {
    engineVersion: RECONCILIATION_ENGINE_VERSION,
    currency: input.currency,
    invoiced: toPlain(invoiced),
    invoicedQuantityT: toPlain(invoicedQty),
    shippedQuantityT: toPlain(shippedQty),
    shippedValue: toPlain(shippedValue),
    grossCollected: toPlain(sum(payments.map((p) => p.grossAmount))),
    netCollected: toPlain(sum(payments.map((p) => p.netAmount))),
    advances: toPlain(sum(payments.filter((p) => p.isAdvance).map((p) => p.grossAmount))),
    foreignFees: toPlain(sum(payments.map((p) => p.foreignBankFees || '0'))),
    localFees: toPlain(sum(payments.map((p) => p.localBankFees || '0'))),
    otherDeductions: toPlain(sum(payments.map((p) => p.otherDeductions || '0'))),
    pendingBalance: toPlain(pending),
    differences,
    suggestedStatus,
    readyToReconcile: invoices.length > 0 && !reviewNeeded && pending.abs().lte(tol),
  };
}
