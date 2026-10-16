import { Check } from 'lucide-react';
import { cn } from './cn';

export function Stepper({
  steps,
  current,
  onSelect,
  completed,
}: {
  steps: string[];
  current: number;
  onSelect?: (index: number) => void;
  completed: boolean[];
}) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Pasos del asistente">
      {steps.map((step, index) => {
        const active = index === current;
        const done = completed[index];
        return (
          <li key={step}>
            <button
              type="button"
              onClick={() => onSelect?.(index)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
                active ? 'border-petrol-600 bg-petrol-50 text-petrol-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  done ? 'bg-emerald-600 text-white' : active ? 'bg-petrol-700 text-white' : 'bg-slate-200 text-slate-600',
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="font-medium leading-tight">{step}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
