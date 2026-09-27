import type { ReactNode } from 'react';

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  warning,
  children,
  className = '',
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  warning?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label} {required && <span className="text-bad" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-bad-text" role="alert">{error}</p>
      ) : warning ? (
        <p className="mt-1 text-xs text-warn-text">{warning}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
