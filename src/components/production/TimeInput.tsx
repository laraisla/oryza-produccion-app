import { Clock } from 'lucide-react';
import { nowHHMM } from '@/utils/time';

/** Selector de hora con botón "Ahora" para cargar la hora actual con un toque. */
export function TimeInput({
  id,
  value,
  onChange,
  invalid,
  withNow = true,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  withNow?: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      <input
        id={id}
        type="time"
        className={`input tabular-nums min-w-0 ${invalid ? 'input-error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {withNow && (
        <button type="button" className="btn btn-secondary !px-2.5 h-11 shrink-0" onClick={() => onChange(nowHHMM())} title="Usar la hora actual" aria-label="Usar la hora actual">
          <Clock size={16} />
        </button>
      )}
    </div>
  );
}
