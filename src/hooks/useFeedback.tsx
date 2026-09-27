import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { friendlyMessage } from '@/services/errors';
import { ConfirmDialog, type ConfirmOptions } from '@/components/ui/ConfirmDialog';
import { ToastViewport, type Toast } from '@/components/ui/Toast';

interface FeedbackValue {
  toast: (t: Omit<Toast, 'id'>) => void;
  /** Solicita confirmación. Si `requireText`, devuelve el texto ingresado (comentario/motivo). */
  confirm: (o: ConfirmOptions) => Promise<{ ok: boolean; text: string }>;
  /** Ejecuta una acción mostrando un mensaje amigable si falla. */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: { ok: boolean; text: string }) => void>();

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.kind === 'error' ? 7000 : 4000);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    setDialog(o);
    return new Promise<{ ok: boolean; text: string }>((res) => (resolver.current = res));
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string) => {
      try {
        const r = await fn();
        if (success) toast({ kind: 'success', message: success });
        return r;
      } catch (e) {
        toast({ kind: 'error', message: friendlyMessage(e) });
        return undefined;
      }
    },
    [toast],
  );

  const close = (ok: boolean, text: string) => {
    resolver.current?.({ ok, text });
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm, run }}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}
