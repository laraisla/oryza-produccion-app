import { describe, expect, it } from 'vitest';
import { applicableRequirements, documentProgress, validateDocumentTransition } from './documents';
import { effectiveStatus, expiryAlerts, validateVerificationChange } from './verification';

describe('verificación de datos', () => {
  it('un dato cotizado o verificado vencido pasa a Vencido por fecha', () => {
    expect(effectiveStatus({ status: 'quoted', validUntil: '2026-10-01' }, '2026-10-16')).toBe('expired');
    expect(effectiveStatus({ status: 'verified', validUntil: '2026-12-01' }, '2026-10-16')).toBe('verified');
    expect(effectiveStatus({ status: 'pending', validUntil: '2026-01-01' }, '2026-10-16')).toBe('pending');
  });

  it('no permite verificar sin fuente, evidencia y responsable', () => {
    expect(validateVerificationChange({ to: 'verified', source: '', evidence: '', responsible: '' })).toHaveLength(3);
    expect(
      validateVerificationChange({ to: 'verified', source: 'Cotización naviera', evidence: 'https://x', responsible: 'COMEX' }),
    ).toHaveLength(0);
    expect(validateVerificationChange({ to: 'quoted', source: 'Proveedor', responsible: 'COMEX' })).toContain(
      'Una cotización debe tener fecha de vencimiento.',
    );
  });

  it('alerta vencidos y próximos a vencer', () => {
    const alerts = expiryAlerts(
      [
        { id: 'a', label: 'Flete', status: 'quoted', validUntil: '2026-10-10' },
        { id: 'b', label: 'THC', status: 'quoted', validUntil: '2026-10-20' },
        { id: 'c', label: 'Seguro', status: 'quoted', validUntil: '2027-01-20' },
      ],
      '2026-10-16',
    );
    expect(alerts.map((a) => [a.id, a.status])).toEqual([
      ['a', 'expired'],
      ['b', 'expiring'],
    ]);
  });
});

describe('reglas documentales', () => {
  const rules = [
    { id: 'inv', country: '*', category: 'commercial' as const, documentType: 'commercial_invoice' as const, name: 'Factura', responsibleParty: 'seller' as const, verificationStatus: 'pending' as const },
    { id: 'phyto', country: 'PE', ncmPrefix: '1006', category: 'official_destination' as const, documentType: 'phytosanitary_certificate' as const, name: 'Fito', responsibleParty: 'seller' as const, verificationStatus: 'pending' as const },
    { id: 'kosher', country: 'IL', buyerOrganizationId: 'buyer-1', category: 'buyer' as const, documentType: 'private_certification' as const, name: 'Kosher', responsibleParty: 'seller' as const, verificationStatus: 'pending' as const },
    { id: 'lc', country: '*', paymentMethods: ['letter_of_credit' as const], category: 'bank' as const, documentType: 'bank_document' as const, name: 'L/C', responsibleParty: 'bank' as const, verificationStatus: 'pending' as const },
  ];
  const ctx = { country: 'PE', ncm: '1006.30.21', processing: 'white' as const, transportMode: 'container' as const, paymentMethod: 'advance_transfer' as const, buyerOrganizationId: 'buyer-2' };

  it('la regla depende de país + NCM + comprador + medio de pago, no solo del país', () => {
    expect(applicableRequirements(rules, ctx).map((r) => r.id)).toEqual(['inv', 'phyto']);
    expect(applicableRequirements(rules, { ...ctx, country: 'IL', buyerOrganizationId: 'buyer-1' }).map((r) => r.id)).toEqual(['inv', 'kosher']);
    expect(applicableRequirements(rules, { ...ctx, paymentMethod: 'letter_of_credit' }).map((r) => r.id)).toContain('lc');
  });

  it('no se marca presentado ni verificado sin archivo; "no aplica" exige justificación', () => {
    expect(validateDocumentTransition('pending', 'submitted', { hasFile: false })).toMatch(/Adjuntar/);
    expect(validateDocumentTransition('submitted', 'verified', { hasFile: true })).toBeNull();
    expect(validateDocumentTransition('pending', 'verified', { hasFile: true })).toMatch(/No se puede pasar/);
    expect(validateDocumentTransition('pending', 'not_applicable', { hasFile: false })).toMatch(/Justificar/);
  });

  it('calcula el avance documental sobre los documentos aplicables', () => {
    const p = documentProgress([{ status: 'verified' }, { status: 'submitted' }, { status: 'pending' }, { status: 'not_applicable' }]);
    expect(p.applicable).toBe(3);
    expect(p.pct).toBe(50);
  });
});
