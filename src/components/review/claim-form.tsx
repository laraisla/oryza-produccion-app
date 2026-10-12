"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { requireDb, useCobro } from "@/components/cobro-provider";
import { useNotice } from "@/components/notices";
import { parseArsText } from "@/domain/money";
import { LIMITS } from "@/domain/schemas";
import { suggestClaimFields } from "@/extraction/rules";
import { addClaim } from "@/storage/repository";

/**
 * Registrar una declaración de pago del cliente. Es un dato del cliente, no
 * un movimiento: nunca suma dinero conciliado.
 */
export function ClaimForm({ orderId, orderReference, onDone }: { orderId: string; orderReference: string; onDone: () => void }) {
  const { db } = useCobro();
  const { notify } = useNotice();
  const id = useId();
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [operation, setOperation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<string[]>([]);
  const running = useRef(false);

  async function save() {
    if (running.current) return;
    setError(null);
    if (text.trim() === "") {
      setError("Pegá el texto que envió el cliente.");
      return;
    }
    let declared: number | undefined;
    if (amount.trim() !== "") {
      const m = parseArsText(amount);
      if (!m.ok) {
        setError(m.error);
        return;
      }
      declared = m.minor;
    }
    running.current = true;
    setBusy(true);
    try {
      await addClaim(requireDb(db), {
        orderId,
        receivedText: text,
        ...(declared !== undefined ? { declaredAmountMinor: declared } : {}),
        ...(operation.trim() ? { mentionedOperation: operation.trim() } : {}),
      });
      notify("ok", "Declaración registrada. No suma dinero conciliado; se contrasta con los movimientos importados.");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <label htmlFor={`${id}-t`} className="field-label">
          Texto recibido del cliente
        </label>
        <textarea
          id={`${id}-t`}
          className="field-input min-h-20"
          maxLength={LIMITS.claimText}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ya te transferí los $18.000…"
        />
      </div>
      <div>
        <button
          type="button"
          className="btn-secondary"
          disabled={text.trim() === ""}
          onClick={() => {
            const s = suggestClaimFields(text, orderReference);
            if (s.amountText) setAmount(s.amountText);
            if (s.operation) setOperation(s.operation);
            setHints([
              ...(s.amountText || s.operation ? ["Campos sugeridos por reglas a partir del texto. Revisalos."] : ["No se reconoció importe ni operación: completalos si figuran en el texto."]),
              ...s.notes,
            ]);
          }}
        >
          Sugerir desde el texto (reglas)
        </button>
        {hints.map((h) => (
          <p key={h} className="field-hint" aria-live="polite">
            {h}
          </p>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-a`} className="field-label">
            Importe declarado <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <input id={`${id}-a`} className="field-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="18.000" />
        </div>
        <div>
          <label htmlFor={`${id}-o`} className="field-label">
            Operación mencionada <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <input id={`${id}-o`} className="field-input" maxLength={LIMITS.operation} value={operation} onChange={(e) => setOperation(e.target.value)} placeholder="MOV-001" />
        </div>
      </div>
      <p className="text-xs text-slate-600">
        Copiá solo lo que dice el texto. Una declaración no es un movimiento de cuenta y no aumenta lo conciliado.
      </p>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          Registrar declaración
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
