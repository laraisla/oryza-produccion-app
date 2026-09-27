interface Option {
  value: string;
  label: string;
  sub?: string;
}

/** Selección con botones grandes (táctil): evita desplegables cuando hay pocas opciones. */
export function ChipSelect({
  options,
  value,
  onChange,
  ariaLabel,
  invalid,
  cols,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  invalid?: boolean;
  cols?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`grid gap-2 ${cols ?? 'grid-cols-2 sm:grid-cols-3'} ${invalid ? 'rounded-lg ring-2 ring-bad/40 ring-offset-2' : ''}`}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o.value}
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`chip flex-col !items-start text-left py-2 ${value === o.value ? 'chip-active' : ''}`}
        >
          <span className="leading-tight">{o.label}</span>
          {o.sub && <span className={`text-[11px] font-normal leading-tight ${value === o.value ? 'text-brand-100' : 'text-slate-500'}`}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
