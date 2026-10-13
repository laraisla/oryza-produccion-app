"use client";

import { CheckCircle2, OctagonAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface Notice {
  id: number;
  kind: "ok" | "error";
  text: string;
}

interface NoticeApi {
  notify: (kind: Notice["kind"], text: string) => void;
}

const NoticeContext = createContext<NoticeApi | null>(null);

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (kind: Notice["kind"], text: string) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { id, kind, text }]);
      if (kind === "ok") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <NoticeContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        <div aria-live="polite" role="status" className="contents">
          {items
            .filter((n) => n.kind === "ok")
            .map((n) => (
              <NoticeCard key={n.id} notice={n} onClose={() => dismiss(n.id)} />
            ))}
        </div>
        <div aria-live="assertive" role="alert" className="contents">
          {items
            .filter((n) => n.kind === "error")
            .map((n) => (
              <NoticeCard key={n.id} notice={n} onClose={() => dismiss(n.id)} />
            ))}
        </div>
      </div>
    </NoticeContext.Provider>
  );
}

function NoticeCard({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const ok = notice.kind === "ok";
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
        ok ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-950"
      }`}
    >
      {ok ? (
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-700" />
      ) : (
        <OctagonAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-red-700" />
      )}
      <p className="flex-1">{notice.text}</p>
      <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-black/5" aria-label="Cerrar aviso">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function useNotice(): NoticeApi {
  const ctx = useContext(NoticeContext);
  if (!ctx) throw new Error("useNotice debe usarse dentro de NoticeProvider");
  return ctx;
}
