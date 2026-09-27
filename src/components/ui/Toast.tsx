import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 sm:top-auto sm:bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96 no-print" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info;
        const color = t.kind === 'success' ? 'text-ok' : t.kind === 'error' ? 'text-bad' : 'text-brand-500';
        return (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <Icon size={18} className={`${color} mt-0.5 shrink-0`} />
            <p className="text-sm text-slate-800 flex-1">{t.message}</p>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => onDismiss(t.id)} aria-label="Cerrar aviso">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
