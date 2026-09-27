import { useCallback, useState } from 'react';
import { emptyFilters, type RecordFilters } from '@/utils/analytics';
import { addDays, startOfMonth, today } from '@/utils/time';

export function defaultPeriod(): { from: string; to: string } {
  const t = today();
  return { from: addDays(t, -29), to: t };
}

/** Filtros persistidos durante la sesión del navegador (por pantalla). */
export function useFilters(key: string, initial?: Partial<RecordFilters>) {
  const make = () => ({ ...emptyFilters(defaultPeriod().from, defaultPeriod().to), ...initial });
  const [filters, setFiltersState] = useState<RecordFilters>(() => {
    try {
      const raw = sessionStorage.getItem(`oryza.filters.${key}`);
      if (raw) return { ...make(), ...(JSON.parse(raw) as RecordFilters) };
    } catch {
      /* ignorar */
    }
    return make();
  });
  const setFilters = useCallback(
    (f: RecordFilters) => {
      setFiltersState(f);
      try {
        sessionStorage.setItem(`oryza.filters.${key}`, JSON.stringify(f));
      } catch {
        /* ignorar */
      }
    },
    [key],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reset = useCallback(() => setFilters(make()), [setFilters]);
  return { filters, setFilters, reset };
}

export const PERIOD_PRESETS: { id: string; label: string; range: () => { from: string; to: string } }[] = [
  { id: 'today', label: 'Hoy', range: () => ({ from: today(), to: today() }) },
  { id: '7d', label: '7 días', range: () => ({ from: addDays(today(), -6), to: today() }) },
  { id: 'month', label: 'Este mes', range: () => ({ from: startOfMonth(today()), to: today() }) },
  { id: '30d', label: '30 días', range: () => ({ from: addDays(today(), -29), to: today() }) },
];
