import { describe, expect, it } from 'vitest';
import { reconcile, RECONCILIATION_DISCLAIMER, type ReconciliationInput } from './reconciliation';

const scenarioF = (over: Partial<ReconciliationInput> = {}): ReconciliationInput => ({
  currency: 'USD',
  contractPricePerT: '750',
  invoices: [{ id: 'inv-1', number: 'E-0001-00000123', currency: 'USD', amount: '30000', quantityT: '40' }],
  shipments: [{ id: 'sh-1', shippedQuantityT: '40' }],
  payments: [
    {
      id: 'pay-1',
      reference: 'SWIFT-001',
      currency: 'USD',
      grossAmount: '30000',
      foreignBankFees: '150',
      localBankFees: '0',
      otherDeductions: '0',
      netAmount: '29850',
      isAdvance: false,
      deductionEvidenceCount: 0,
    },
  ],
  allocations: [{ paymentId: 'pay-1', invoiceId: 'inv-1', amount: '30000' }],
  ...over,
});

describe('conciliación de cobros', () => {
  it('Escenario F: factura 30.000, bruto 30.000, comisión exterior 150, neto 29.850', () => {
    const r = reconcile(scenarioF());
    expect(r.invoiced).toBe('30000');
    expect(r.shippedValue).toBe('30000');
    expect(r.grossCollected).toBe('30000');
    expect(r.netCollected).toBe('29850');
    expect(r.pendingBalance).toBe('0');
    expect(r.differences).toHaveLength(1);
    const fee = r.differences[0];
    expect(fee.kind).toBe('foreign_bank_fee');
    expect(fee.amount).toBe('150');
    expect(fee.status).toBe('needs_evidence');
    expect(fee.requiredEvidence).toMatch(/Comprobante bancario/);
    expect(r.suggestedStatus).toBe('difference_to_review');
    expect(r.readyToReconcile).toBe(false);
  });

  it('con comprobante adjunto la diferencia queda explicada, pero la conciliación final la decide el operador', () => {
    const input = scenarioF();
    input.payments[0].deductionEvidenceCount = 1;
    const r = reconcile(input);
    expect(r.differences[0].status).toBe('explained');
    expect(r.readyToReconcile).toBe(true);
    expect(r.suggestedStatus).toBe('partial');
  });

  it('nunca declara incumplimiento cambiario', () => {
    expect(RECONCILIATION_DISCLAIMER).toMatch(/no implica por sí misma un incumplimiento/);
    const text = JSON.stringify(reconcile(scenarioF()));
    expect(text).not.toMatch(/incumplimiento|bloqueo|infracci/i);
  });

  it('detecta saldo pendiente y diferencias entre facturado y embarcado', () => {
    const r = reconcile(
      scenarioF({
        shipments: [{ id: 'sh-1', shippedQuantityT: '39.5' }],
        allocations: [{ paymentId: 'pay-1', invoiceId: 'inv-1', amount: '20000' }],
      }),
    );
    expect(r.differences.find((d) => d.kind === 'quantity_invoice_vs_shipment')?.amount).toBe('375');
    expect(r.differences.find((d) => d.kind === 'pending_collection')?.amount).toBe('10000');
  });

  it('detecta un neto inconsistente con bruto − deducciones y cobros sin imputar', () => {
    const input = scenarioF({ allocations: [] });
    input.payments[0].netAmount = '29800';
    const r = reconcile(input);
    expect(r.differences.find((d) => d.kind === 'net_amount_mismatch')?.amount).toBe('50');
    expect(r.differences.some((d) => d.kind === 'unallocated_payment')).toBe(true);
  });

  it('un pago puede cubrir varias facturas y una factura recibir varios pagos', () => {
    const r = reconcile({
      currency: 'USD',
      contractPricePerT: '750',
      invoices: [
        { id: 'a', number: 'A', currency: 'USD', amount: '15000', quantityT: '20' },
        { id: 'b', number: 'B', currency: 'USD', amount: '15000', quantityT: '20' },
      ],
      shipments: [{ id: 's', shippedQuantityT: '40' }],
      payments: [
        { id: 'p1', reference: 'P1', currency: 'USD', grossAmount: '20000', foreignBankFees: '0', localBankFees: '0', otherDeductions: '0', netAmount: '20000', isAdvance: true, deductionEvidenceCount: 0 },
        { id: 'p2', reference: 'P2', currency: 'USD', grossAmount: '10000', foreignBankFees: '0', localBankFees: '0', otherDeductions: '0', netAmount: '10000', isAdvance: false, deductionEvidenceCount: 0 },
      ],
      allocations: [
        { paymentId: 'p1', invoiceId: 'a', amount: '15000' },
        { paymentId: 'p1', invoiceId: 'b', amount: '5000' },
        { paymentId: 'p2', invoiceId: 'b', amount: '10000' },
      ],
    });
    expect(r.pendingBalance).toBe('0');
    expect(r.advances).toBe('20000');
    expect(r.differences).toHaveLength(0);
    expect(r.readyToReconcile).toBe(true);
  });

  it('sin datos', () => {
    expect(reconcile({ currency: 'USD', contractPricePerT: '0', invoices: [], shipments: [], payments: [], allocations: [] }).suggestedStatus).toBe('no_data');
  });
});
