"use client";

import { Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { localTodayIso } from "@/domain/dates";
import { apiExtractor, isApiExtractionAvailable } from "@/extraction/api-client";
import { rulesExtractor } from "@/extraction/rules";
import {
  EXTRACTION_LABEL,
  MAX_MESSAGE_CHARS,
  type DraftField,
  type ExtractionMode,
  type ExtractionResult,
} from "@/extraction/types";
import type { Order } from "@/domain/schemas";
import { emptyOrderValues, OrderForm, type FieldKey, type FieldNote, type OrderFormValues } from "./order-form";

const FIELD_TO_FORM: Record<DraftField, FieldKey> = {
  reference: "reference",
  customerName: "customerName",
  total: "total",
  detail: "detail",
  delivery: "delivery",
  deliveryDate: "deliveryDate",
};

const FIELD_LABEL: Record<DraftField, string> = {
  reference: "Referencia",
  customerName: "Cliente",
  total: "Total",
  detail: "Detalle",
  delivery: "Entrega",
  deliveryDate: "Fecha de entrega",
};

function toForm(result: ExtractionResult): { values: OrderFormValues; notes: Partial<Record<FieldKey, FieldNote>> } {
  const values = emptyOrderValues(localTodayIso());
  const notes: Partial<Record<FieldKey, FieldNote>> = {
    orderDate: { kind: "predeterminado", text: "No figura en el mensaje: se propone la fecha de hoy. Podés cambiarla." },
  };
  for (const [field, v] of Object.entries(result.draft) as Array<[DraftField, { value: string; evidence: string }]>) {
    const key = FIELD_TO_FORM[field];
    values[key] = v.value;
    notes[key] = { kind: "extraido", text: `Tomado del mensaje: «${v.evidence}»` };
  }
  for (const field of result.missing) {
    notes[FIELD_TO_FORM[field]] = { kind: "falta", text: "No está en el mensaje: completalo." };
  }
  for (const c of result.confirm) {
    notes[FIELD_TO_FORM[c.field]] = { kind: "confirmar", text: c.message };
  }
  return { values, notes };
}

type Phase =
  | { kind: "editing" }
  | { kind: "draft"; result: ExtractionResult; formKey: number }
  | { kind: "manual"; formKey: number };

export function MessageExtract({ onSaved }: { onSaved: (o: Order) => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ExtractionMode>("reglas");
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    let alive = true;
    void isApiExtractionAvailable().then((ok) => {
      if (alive) setApiAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function run(useMode: ExtractionMode) {
    setError(null);
    if (text.trim() === "") {
      setError("Pegá el mensaje del cliente.");
      return;
    }
    setBusy(true);
    try {
      const extractor = useMode === "api" ? apiExtractor : rulesExtractor;
      const result = await extractor.extract(text);
      counter.current += 1;
      setPhase({ kind: "draft", result, formKey: counter.current });
    } catch (e) {
      // El texto se conserva siempre; se ofrece seguir manualmente.
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const draft = phase.kind === "draft" ? toForm(phase.result) : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="card p-4 sm:p-6" aria-labelledby={`${id}-msg`}>
        <h2 id={`${id}-msg`} className="section-title">
          Mensaje del cliente
        </h2>
        <p className="mt-1 text-sm text-slate-700">
          Pegá el texto tal como llegó. Se trata como dato: las instrucciones que contenga no cambian reglas ni estados.
        </p>
        <label htmlFor={`${id}-t`} className="field-label mt-3">
          Texto recibido
        </label>
        <textarea
          id={`${id}-t`}
          className="field-input min-h-36 leading-relaxed"
          maxLength={MAX_MESSAGE_CHARS}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Soy Ana. Confirmo el pedido de 3 productos por un total de $45.000. Retiro el viernes. Referencia PED-101."
          aria-describedby={`${id}-count`}
        />
        <p id={`${id}-count`} className="field-hint num">
          {text.length} / {MAX_MESSAGE_CHARS} caracteres
        </p>

        <fieldset className="mt-3">
          <legend className="field-label">Tipo de asistencia</legend>
          <div className="mt-1 flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name={`${id}-mode`} className="mt-1" checked={mode === "reglas"} onChange={() => setMode("reglas")} />
              <span>
                <span className="font-medium">{EXTRACTION_LABEL.reglas}</span>
                <span className="block text-xs text-slate-600">
                  Sin conexión. Reconoce formatos simples («Soy …», «total de $…», «Referencia …»). Si no entiende algo, lo
                  deja para completar.
                </span>
              </span>
            </label>
            <label className={`flex items-start gap-2 text-sm ${apiAvailable ? "" : "opacity-70"}`}>
              <input
                type="radio"
                name={`${id}-mode`}
                className="mt-1"
                checked={mode === "api"}
                disabled={!apiAvailable}
                onChange={() => setMode("api")}
              />
              <span>
                <span className="font-medium">{EXTRACTION_LABEL.api}</span>
                <span className="block text-xs text-slate-600">
                  {apiAvailable === null
                    ? "Verificando si el servidor la tiene configurada…"
                    : apiAvailable
                      ? "Envía solo este texto al servidor, que consulta un modelo. Devuelve un borrador; no decide pagos."
                      : "No está configurada en este servidor (opcional; requiere credenciales y autorización)."}
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(mode)}>
            {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
            {busy ? "Analizando…" : "Sugerir campos"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              counter.current += 1;
              setError(null);
              setPhase({ kind: "manual", formKey: counter.current });
            }}
          >
            Completar manualmente
          </button>
        </div>

        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950">
            <p className="font-semibold">No se pudieron sugerir campos</p>
            <p className="mt-1">{error}</p>
            <p className="mt-1">El texto se conserva.</p>
            {mode === "api" ? (
              <button type="button" className="btn-secondary mt-2" onClick={() => void run("reglas")}>
                Probar con asistencia por reglas
              </button>
            ) : null}
          </div>
        ) : null}

        {phase.kind === "draft" ? <ExtractionNotes result={phase.result} /> : null}
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby={`${id}-draft`}>
        <h2 id={`${id}-draft`} className="section-title">
          Borrador del pedido
        </h2>
        {phase.kind === "editing" ? (
          <p className="mt-2 text-sm text-slate-700">
            Pegá un mensaje y elegí «Sugerir campos», o «Completar manualmente». Nada se guarda hasta que revises y
            confirmes.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-700">
              {phase.kind === "draft"
                ? `Sugerido por «${EXTRACTION_LABEL[phase.result.mode]}». Revisá cada campo frente al mensaje: puede tener errores.`
                : "Completá los campos. El mensaje original se guarda junto al pedido."}
            </p>
            <div className="mt-4">
              <OrderForm
                key={phase.formKey}
                initial={draft?.values ?? emptyOrderValues(localTodayIso())}
                notes={draft?.notes ?? {}}
                sourceText={text}
                requireReviewCheck={phase.kind === "draft"}
                submitLabel="Guardar pedido revisado"
                onSaved={onSaved}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ExtractionNotes({ result }: { result: ExtractionResult }) {
  const found = Object.keys(result.draft).length;
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm" aria-live="polite">
      <p className="rounded-lg bg-slate-100 p-3">
        {found === 0
          ? "No se reconoció ningún dato. Completá el borrador manualmente."
          : `Se sugirieron ${found} ${found === 1 ? "campo" : "campos"} con fragmentos del mensaje.`}{" "}
        {result.missing.length > 0 ? `Faltan: ${result.missing.map((f) => FIELD_LABEL[f]).join(", ")}.` : ""}
      </p>
      {result.notices.map((n) => (
        <p key={n} className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {n}
        </p>
      ))}
      {result.discarded.length > 0 ? (
        <div className="rounded-lg border border-slate-300 p-3">
          <p className="flex items-center gap-1.5 font-semibold">
            <Info aria-hidden className="size-4" /> Valores descartados
          </p>
          <ul className="mt-1 list-disc pl-5 text-slate-700">
            {result.discarded.map((d, i) => (
              <li key={`${d.field}-${i}`}>
                {FIELD_LABEL[d.field]}: «{d.value}» — {d.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
