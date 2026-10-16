import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { byId, evaluateScenario, type ScenarioEvaluation } from '@/data/derive';
import type { CostScenario } from '@/data/model';
import { updateScenario } from '@/data/services/scenarios';
import { todayISO, useApp, useDb } from '@/data/store';

type Editable = Omit<CostScenario, 'id' | 'organizationId' | 'createdAt' | 'createdBy' | 'status' | 'quotationId' | 'updatedAt'>;

function editableFields(s: CostScenario): Partial<Editable> {
  const { id: _i, organizationId: _o, createdAt: _c, createdBy: _b, status: _s, quotationId: _q, updatedAt: _u, ...rest } = s;
  void _i; void _o; void _c; void _b; void _s; void _q; void _u;
  return rest;
}

export interface ScenarioDraft {
  scenario: CostScenario;
  evaluation: ScenarioEvaluation;
  update: (patch: Partial<CostScenario> | ((s: CostScenario) => Partial<CostScenario>)) => void;
  flush: () => void;
}

/**
 * Edición local con recálculo inmediato y persistencia diferida (400 ms):
 * cada cambio recalcula precios y asignaciones sin esperar al guardado.
 */
export function useScenarioDraft(scenarioId: string | undefined): ScenarioDraft | null {
  const db = useDb();
  const run = useApp((s) => s.run);
  const stored = byId(db.scenarios, scenarioId);
  const [draft, setDraft] = useState<CostScenario | undefined>(stored);
  const pending = useRef<CostScenario | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) run((d, ctx) => updateScenario(d, ctx, next.id, editableFields(next)));
  }, [run]);

  useEffect(() => {
    setDraft(stored);
    return () => persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  const merged = useMemo(
    () => (draft && stored ? { ...draft, status: stored.status, quotationId: stored.quotationId } : undefined),
    [draft, stored],
  );

  const update = useCallback(
    (patch: Partial<CostScenario> | ((s: CostScenario) => Partial<CostScenario>)) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
        pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(persist, 400);
        return next;
      });
    },
    [persist],
  );

  const asOf = todayISO();
  const evaluation = useMemo(() => (merged ? evaluateScenario(db, merged, asOf) : null), [db, merged, asOf]);
  if (!merged || !evaluation) return null;
  return { scenario: merged, evaluation, update, flush: persist };
}
