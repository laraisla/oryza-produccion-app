import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { byId, isScenarioQuotable } from '@/data/derive';
import { orgName } from '@/data/selectors';
import { addDays, addQuotationVersion, createNegotiationOperation, createQuotationFromScenario } from '@/data/services/quotations';
import { todayISO, useApp, useDb } from '@/data/store';
import { fmtMoney } from '@/domain/format';
import type { ScenarioDraft } from './useScenarioDraft';

export function QuoteDialog({ draft, onClose, withOperation }: { draft: ScenarioDraft; onClose: () => void; withOperation?: boolean }) {
  const db = useDb();
  const run = useApp((st) => st.run);
  const navigate = useNavigate();
  const { scenario: s, evaluation, flush } = draft;
  const quotation = byId(db.quotations, s.quotationId);
  const [validUntil, setValidUntil] = useState(addDays(todayISO(), s.commercial.validityDays));
  const [note, setNote] = useState('');
  const quotable = isScenarioQuotable(evaluation);
  const blockers = [
    ...evaluation.result.alerts.filter((a) => a.level === 'error').map((a) => a.message),
    ...evaluation.extraAlerts.filter((a) => a.level === 'error').map((a) => a.message),
  ];
  if (!s.buyerOrganizationId) blockers.unshift('Seleccionar la empresa compradora.');
  const accepted = quotation?.status === 'accepted';

  const confirm = () => {
    flush();
    // Esperar a que el guardado diferido se aplique antes de versionar.
    setTimeout(() => {
      const result = run((d, ctx) => {
        if (quotation) {
          const v = addQuotationVersion(d, ctx, quotation.id, { scenarioId: s.id, validUntil, changeNote: note || null });
          return { db: v.db, value: quotation.id };
        }
        const created = createQuotationFromScenario(d, ctx, s.id, { validUntil, changeNote: note || null });
        if (withOperation) {
          const op = createNegotiationOperation(created.db, ctx, created.value.quotation.id);
          return { db: op.db, value: created.value.quotation.id };
        }
        return { db: created.db, value: created.value.quotation.id };
      }, quotation ? 'Nueva versión creada' : withOperation ? 'Cotización y expediente creados' : 'Cotización creada');
      if (result) {
        onClose();
        navigate(`/cotizaciones/${result}`);
      }
    }, 0);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={quotation ? `Nueva versión de ${quotation.code}` : withOperation ? 'Generar cotización y expediente' : 'Generar cotización'}
        description="La versión guarda una copia inmutable de entradas, resultados, supuestos y hash de términos."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button disabled={!quotable || !s.buyerOrganizationId || accepted} onClick={confirm}>{quotation ? 'Crear versión' : 'Generar'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {accepted ? <Alert tone="warning" title="La cotización ya fue aceptada">Su versión es inmutable. Para cambiar condiciones, duplicar el escenario e iniciar una renegociación.</Alert> : null}
          {blockers.length ? (
            <Alert tone="error" title="Hay datos que impiden cotizar">
              <ul className="list-disc pl-4">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </Alert>
          ) : (
            <Alert tone="success" title={`${fmtMoney(evaluation.result.pricePerT, s.commercial.currency)}/t · total ${fmtMoney(evaluation.result.totalPrice, s.commercial.currency)}`}>
              {s.commercial.incoterm} {s.commercial.namedPlace} · comprador {orgName(db, s.buyerOrganizationId)}
            </Alert>
          )}
          <Field label="Vigente hasta">{(p) => <Input {...p} type="date" min={todayISO()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />}</Field>
          <Field label="Nota de la versión" hint="Qué cambió y por qué (queda en el historial)">{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          {withOperation && !quotation ? <p className="text-xs text-slate-500">Se abrirá un expediente en estado "En negociación" con su checklist documental; el stock se compromete recién cuando el comprador acepta.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
