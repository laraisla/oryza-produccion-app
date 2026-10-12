"use client";

import { Check, Copy, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatArs } from "@/domain/money";

export function Money({ minor, className = "" }: { minor: number; className?: string }) {
  return <span className={`num whitespace-nowrap ${className}`}>{formatArs(minor)}</span>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">{title}</h1>
        {description ? <div className="mt-1 max-w-3xl text-sm text-slate-700">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Loading({ label = "Cargando datos locales…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-10 text-sm text-slate-700">
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
      <p className="font-semibold">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Botón que ejecuta una acción asíncrona y se deshabilita mientras corre. */
export function AsyncButton({
  onClick,
  children,
  className = "btn-primary",
  pendingLabel,
  ...rest
}: {
  onClick: () => Promise<void>;
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className" | "children">) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  return (
    <button
      type="button"
      {...rest}
      className={className}
      disabled={busy || rest.disabled}
      aria-busy={busy}
      onClick={async () => {
        if (running.current) return; // evita doble clic antes de re-renderizar
        running.current = true;
        setBusy(true);
        try {
          await onClick();
        } finally {
          running.current = false;
          setBusy(false);
        }
      }}
    >
      {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
      {busy && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Diálogo modal nativo (<dialog>): foco atrapado y Escape para cerrar. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 p-0 shadow-2xl backdrop:bg-slate-950/50"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
        <div className="mt-3 text-sm text-slate-700">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm}>
            {confirmLabel}
          </AsyncButton>
        </div>
      </div>
    </dialog>
  );
}

/** Borrador editable con botón Copiar. Nunca se envía automáticamente. */
export function CopyableDraft({ label, initialText }: { label: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState<"no" | "ok" | "error">("no");
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea
        id={id}
        className="field-input min-h-28 resize-y leading-relaxed"
        value={text}
        maxLength={1000}
        onChange={(e) => {
          setText(e.target.value);
          setCopied("no");
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied("ok");
            } catch {
              setCopied("error");
            }
          }}
        >
          {copied === "ok" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied === "ok" ? "Copiado" : "Copiar mensaje"}
        </button>
        <span className="text-xs text-slate-600" aria-live="polite">
          {copied === "error"
            ? "No se pudo copiar automáticamente: seleccioná el texto y copialo."
            : "Borrador editable. No se envía automáticamente."}
        </span>
      </div>
    </div>
  );
}

export function Dl({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-600">{k}</dt>
          <dd className="min-w-0 break-words text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Selector de archivo con textos en español (el control nativo muestra el
 * idioma del navegador). El input real sigue siendo accesible y enfocable.
 */
export function FileInput({
  label,
  accept,
  onFile,
  inputRef,
  variant = "primary",
}: {
  label: string;
  accept: string;
  onFile: (file: File | undefined) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  variant?: "primary" | "secondary";
}) {
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="peer sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setName(f?.name ?? null);
          onFile(f);
        }}
      />
      <label
        htmlFor={id}
        className={`${variant === "primary" ? "btn-primary" : "btn-secondary"} cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500`}
      >
        {label}
      </label>
      <span className="min-w-0 text-sm break-all text-slate-700" aria-live="polite">
        {name ?? "Ningún archivo elegido"}
      </span>
    </div>
  );
}
