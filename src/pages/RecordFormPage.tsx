import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock, RotateCcw } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ProductionForm } from '@/components/production/ProductionForm';
import { duplicateAsInput, isDayClosed, newRecordInput, recordToInput, saveRecord } from '@/services/productionService';
import { ValidationFailed, friendlyMessage } from '@/services/errors';
import { can, editBlockReason } from '@/utils/permissions';
import type { RecordInput } from '@/utils/validation';
import { fmtDate } from '@/utils/format';

const LOCAL_DRAFT_KEY = 'oryza.form.unsaved';

export function RecordFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const { db, user } = useData();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [forceErrors, setForceErrors] = useState(0);
  const dirty = useRef(false);

  const existing = id ? db.records.find((r) => r.id === id) : undefined;
  const source = fromId ? db.records.find((r) => r.id === fromId) : undefined;

  // El formulario inicial se calcula una sola vez por registro/usuario (no en cada cambio de la base).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo<RecordInput>(() => {
    if (existing) return recordToInput(existing);
    if (source) return duplicateAsInput(db, source, user);
    return newRecordInput(db, user);
  }, [id, fromId, user.id]);

  const [recovered, setRecovered] = useState<RecordInput | null>(null);
  const [formInitial, setFormInitial] = useState(initial);
  useEffect(() => setFormInitial(initial), [initial]);

  // Recuperación de un formulario nuevo no guardado (p. ej. se cerró la pestaña).
  useEffect(() => {
    if (id || fromId) return;
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { userId: string; input: RecordInput };
        if (parsed.userId === user.id && (parsed.input.units || parsed.input.lot || parsed.input.downtimes.length)) setRecovered(parsed.input);
      }
    } catch {
      /* sin recuperación */
    }
  }, [id, fromId, user.id]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const onChange = useCallback(
    (input: RecordInput) => {
      if (input !== formInitial) dirty.current = true;
      if (!id && input !== formInitial) {
        try {
          localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ userId: user.id, input }));
        } catch {
          /* ignorar */
        }
      }
    },
    [id, formInitial, user.id],
  );

  if (id && !existing)
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <p className="font-medium">El registro no existe o fue eliminado.</p>
        <Link to="/registros" className="btn btn-secondary mt-4">Volver a registros</Link>
      </div>
    );

  if (existing && !can.editRecord(user, existing))
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <Lock className="mx-auto text-slate-400" />
        <p className="font-medium mt-3">No es posible editar {existing.number}</p>
        <p className="text-sm text-slate-500 mt-1">{editBlockReason(user, existing)}</p>
        <Link to={`/registros/${existing.id}`} className="btn btn-secondary mt-4">Ver registro</Link>
      </div>
    );

  const handleSave = async (input: RecordInput, submit: boolean) => {
    setSaving(true);
    try {
      const rec = await saveRecord(input, user, submit);
      dirty.current = false;
      try {
        localStorage.removeItem(LOCAL_DRAFT_KEY);
      } catch {
        /* ignorar */
      }
      toast({
        kind: 'success',
        message: submit ? `Registro ${rec.number} enviado a aprobación.` : `Registro ${rec.number} guardado como borrador.`,
      });
      navigate(`/registros/${rec.id}`);
    } catch (e) {
      if (e instanceof ValidationFailed) setForceErrors((n) => n + 1);
      toast({ kind: 'error', message: friendlyMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const title = existing ? `Editar registro ${existing.number}` : source ? `Nuevo registro (copia de ${source.number})` : 'Nuevo registro de producción';
  const closed = isDayClosed(db, formInitial.date);

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={
          existing ? (
            <span className="inline-flex items-center gap-2">
              Estado: <StatusBadge status={existing.status} />
              {existing.status === 'rejected' && existing.reviewComment && <span className="text-bad-text">Motivo del rechazo: {existing.reviewComment}</span>}
            </span>
          ) : (
            'Completa los datos del turno. Los indicadores se calculan automáticamente.'
          )
        }
      />
      {recovered && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
          <span>Hay un formulario sin guardar de tu sesión anterior.</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => { localStorage.removeItem(LOCAL_DRAFT_KEY); setRecovered(null); }}>Descartar</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setFormInitial(recovered); setRecovered(null); }}>
              <RotateCcw size={14} /> Recuperar
            </button>
          </div>
        </div>
      )}
      {closed && user.role !== 'admin' && (
        <div className="mb-4 rounded-xl border border-warn bg-warn-bg px-4 py-3 text-sm text-warn-text">
          La jornada del {fmtDate(formInitial.date)} ya fue cerrada: no podrás guardar registros con esa fecha.
        </div>
      )}
      <ProductionForm
        db={db}
        user={user}
        initial={formInitial}
        saving={saving}
        forceShowErrors={forceErrors > 0}
        onChange={onChange}
        onSave={handleSave}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}
