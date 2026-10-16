import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useApp } from '@/data/store';
import { cn } from './ui/cn';

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CircleCheck : t.kind === 'error' ? CircleAlert : Info;
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex gap-2.5 rounded-lg border bg-white px-3 py-2.5 text-sm shadow-lg',
              t.kind === 'error' ? 'border-red-200' : t.kind === 'success' ? 'border-emerald-200' : 'border-sky-200',
            )}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', t.kind === 'error' ? 'text-red-600' : t.kind === 'success' ? 'text-emerald-600' : 'text-sky-600')} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{t.title}</p>
              {t.detail ? <p className="mt-0.5 text-xs text-slate-600">{t.detail}</p> : null}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Cerrar notificación">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
