"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { DomainError } from "@/domain/allocate";
import { parseArsText } from "@/domain/money";
import { orderInputSchema, type Order, type OrderInput } from "@/domain/schemas";
import { createOrder } from "@/storage/repository";
import { requireDb, useCobro } from "./cobro-provider";
import { useNotice } from "./notices";

export interface OrderFormValues {
  reference: string;
  customerName: string;
  total: string;
  orderDate: string;
  detail: string;
  delivery: string;
  deliveryDate: string;
}

export type FieldKey = keyof OrderFormValues;

export interface FieldNote {
  kind: "extraido" | "falta" | "confirmar" | "predeterminado";
  text: string;
}

const NOTE_STYLE: Record<FieldNote["kind"], string> = {
  extraido: "text-brand-800",
  falta: "text-amber-800",
  confirmar: "text-amber-800 font-semibold",
  predeterminado: "text-slate-600",
};

export function emptyOrderValues(today: string): OrderFormValues {
  return { reference: "", customerName: "", total: "", orderDate: today, detail: "", delivery: "", deliveryDate: "" };
}

function toInput(v: OrderFormValues, sourceText?: string): { input?: OrderInput; errors: Partial<Record<FieldKey, string>> } {
  const errors: Partial<Record<FieldKey, string>> = {};
  const money = parseArsText(v.total);
  if (!money.ok) errors.total = v.total.trim() === "" ? "Completá el total del pedido." : money.error;
  const candidate = {
    reference: v.reference,
    customerName: v.customerName,
    totalMinor: money.ok ? money.minor : 1,
    currency: "ARS" as const,
    orderDate: v.orderDate,
    ...(v.detail.trim() ? { detail: v.detail } : {}),
    ...(v.delivery.trim() ? { delivery: v.delivery } : {}),
    ...(v.deliveryDate ? { deliveryDate: v.deliveryDate } : {}),
    ...(sourceText?.trim() ? { sourceText: sourceText.slice(0, 2000) } : {}),
  };
  const parsed = orderInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const map: Record<string, FieldKey> = { totalMinor: "total" };
      const key = (map[String(field)] ?? field) as FieldKey;
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { errors };
  return { input: parsed.data, errors };
}

export function OrderForm({
  initial,
  notes = {},
  sourceText,
  submitLabel = "Guardar pedido",
  onSaved,
  requireReviewCheck = false,
}: {
  initial: OrderFormValues;
  notes?: Partial<Record<FieldKey, FieldNote>>;
  sourceText?: string;
  submitLabel?: string;
  onSaved: (order: Order) => void;
  requireReviewCheck?: boolean;
}) {
  const { db } = useCobro();
  const { notify } = useNotice();
  const [values, setValues] = useState<OrderFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [reviewed, setReviewed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const base = useId();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function save() {
    if (running.current) return; // doble envío
    running.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const { input, errors: errs } = toInput(values, sourceText);
      setErrors(errs);
      if (!input) {
        setFormError("Revisá los campos marcados.");
        return;
      }
      const order = await createOrder(requireDb(db), input);
      notify("ok", `Pedido ${order.reference} guardado en este navegador.`);
      onSaved(order);
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof DomainError && e.code === "REFERENCIA_DUPLICADA") setErrors({ reference: msg });
      setFormError(msg);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const field = (
    k: FieldKey,
    label: string,
    opts: { type?: string; required?: boolean; hint?: string; inputMode?: "decimal"; placeholder?: string; maxLength?: number } = {},
  ) => {
    const id = `${base}-${k}`;
    const note = notes[k];
    const err = errors[k];
    const describedBy = [note ? `${id}-note` : "", opts.hint ? `${id}-hint` : "", err ? `${id}-err` : ""].filter(Boolean).join(" ");
    return (
      <div>
        <label htmlFor={id} className="field-label">
          {label} {opts.required ? <span className="text-red-700" aria-hidden>*</span> : <span className="font-normal text-slate-500">(opcional)</span>}
        </label>
        <input
          id={id}
          name={k}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          placeholder={opts.placeholder}
          maxLength={opts.maxLength}
          required={opts.required}
          aria-invalid={err ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`field-input ${err ? "border-red-500" : ""} ${note?.kind === "confirmar" ? "border-amber-500 bg-amber-50" : ""}`}
          value={values[k]}
          onChange={set(k)}
        />
        {note ? (
          <p id={`${id}-note`} className={`mt-1 text-xs ${NOTE_STYLE[note.kind]}`}>
            {note.text}
          </p>
        ) : null}
        {opts.hint ? (
          <p id={`${id}-hint`} className="field-hint">
            {opts.hint}
          </p>
        ) : null}
        {err ? (
          <p id={`${id}-err`} className="field-error">
            {err}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (requireReviewCheck && !reviewed) return;
        void save();
      }}
      className="flex flex-col gap-4"
      aria-describedby={formError ? `${base}-form-err` : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field("reference", "Referencia del pedido", { required: true, placeholder: "PED-101", maxLength: 30, hint: "Letras y números. Se usa para buscarla en los movimientos." })}
        {field("customerName", "Cliente", { required: true, maxLength: 80, hint: "Usá datos ficticios en esta demostración." })}
        {field("total", "Total (ARS)", { required: true, inputMode: "decimal", placeholder: "45.000", hint: "Formato argentino: 45.000 o 45.000,50. Solo pesos." })}
        {field("orderDate", "Fecha del pedido", { required: true, type: "date" })}
      </div>
      {field("detail", "Detalle", { maxLength: 300, placeholder: "3 productos" })}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("delivery", "Entrega o retiro", { maxLength: 200, placeholder: "Retiro en el local" })}
        {field("deliveryDate", "Fecha de entrega confirmada", { type: "date" })}
      </div>

      {requireReviewCheck ? (
        <label className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          <span>Revisé los campos frente al mensaje original. Los datos sugeridos pueden tener errores.</span>
        </label>
      ) : null}

      {formError ? (
        <p id={`${base}-form-err`} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={busy || (requireReviewCheck && !reviewed)} aria-busy={busy}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          {busy ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
