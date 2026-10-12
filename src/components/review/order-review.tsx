"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Plus, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { requireDb, useCobro } from "@/components/cobro-provider";
import { useNotice } from "@/components/notices";
import { AttentionBadge, OrderStatusBadge, SEVERITY } from "@/components/status";
import { AsyncButton, ConfirmDialog, CopyableDraft, Dl, Money, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/domain/dates";
import { messageDrafts } from "@/domain/messages";
import { formatArs, formatArsInput, parseArsText } from "@/domain/money";
import type { Candidate, Evaluation, Finding, NextAction, OrderEvaluation, Proposal } from "@/domain/reconcile";
import { LIMITS } from "@/domain/schemas";
import {
  approveProposal,
  assignManually,
  loadHistory,
  rejectProposal,
  releaseAllocation,
  undoRejection,
} from "@/storage/repository";
import { ClaimForm } from "./claim-form";
import { MovementDetails, Panel } from "./movement-card";

const ATTENTION_ORDER = ["revision", "aprobacion", "sin_encontrar", "esperando"] as const;

export function nextInQueue(ev: Evaluation, currentId: string): OrderEvaluation | undefined {
  const queue = ATTENTION_ORDER.flatMap((a) => ev.orders.filter((o) => o.attention === a));
  const idx = queue.findIndex((o) => o.order.id === currentId);
  const candidate = idx === -1 ? queue[0] : (queue[idx + 1] ?? queue[0]);
  return candidate && candidate.order.id !== currentId ? candidate : undefined;
}

function resultSentence(oe: OrderEvaluation): string {
  const review = oe.findings.find((f) => f.severity === "advertencia") ?? oe.findings.find((f) => f.severity === "atencion");
  switch (oe.attention) {
    case "revision":
      return `Requiere revisión: ${review?.title.toLowerCase() ?? "hay una excepción"}. No se asigna nada automáticamente.`;
    case "aprobacion":
      return oe.proposals.length === 1
        ? "Hay una propuesta: referencia explícita del pedido, moneda compatible y movimiento acreditado según el archivo. Necesita tu aprobación."
        : `Hay ${oe.proposals.length} propuestas con referencia explícita. Cada una necesita tu aprobación.`;
    case "sin_encontrar":
      return "No encontrado en los movimientos importados. Esto no significa que el cliente no haya pagado.";
    case "esperando":
      return `Quedan ${formatArs(oe.outstandingMinor)} por conciliar con los movimientos importados hasta ahora.`;
    case "ninguna":
      return "Conciliado con el archivo: las asignaciones aprobadas cubren el total. Refleja los datos importados, no una verificación bancaria.";
  }
}

export function OrderReview({ orderId }: { orderId: string }) {
  const { ev } = useCobro();
  const oe = ev?.byOrderId.get(orderId);
  const [selected, setSelected] = useState<string | null>(null);

  if (!ev) return null;
  if (!oe) {
    return (
      <div className="card p-6">
        <p className="font-semibold">Pedido no encontrado</p>
        <p className="mt-1 text-sm text-slate-700">Puede haberse borrado o reiniciado la demostración.</p>
        <Link href="/revision" className="btn-secondary mt-3">
          Volver a revisión
        </Link>
      </div>
    );
  }

  const o = oe.order;
  const selectedProposal = oe.proposals.find((p) => p.movementKey === selected) ?? oe.proposals[0];
  const next = nextInQueue(ev, o.id);

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Link href="/revision" className="btn-ghost -ml-3">
          <ArrowLeft aria-hidden className="size-4" /> Revisión
        </Link>
        {next ? (
          <Link href={`/revision?pedido=${encodeURIComponent(next.order.id)}`} className="btn-ghost">
            Siguiente: {next.order.reference} <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
      <PageHeader
        title={`${o.reference} · ${o.customerName}`}
        description={
          <span className="flex flex-wrap gap-1.5">
            <OrderStatusBadge status={oe.status} />
            <AttentionBadge attention={oe.attention} />
          </span>
        }
      />

      <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Importes del pedido">
        <div className="card p-4">
          <dt className="text-sm text-slate-600">Total del pedido</dt>
          <dd className="mt-1 text-2xl font-bold"><Money minor={o.totalMinor} /></dd>
        </div>
        <div className="card p-4">
          <dt className="text-sm text-slate-600">Asignado (aprobado por vos)</dt>
          <dd className="mt-1 text-2xl font-bold" data-testid="asignado"><Money minor={oe.allocatedMinor} /></dd>
        </div>
        <div className={`card p-4 ${oe.outstandingMinor > 0 ? "border-amber-300" : "border-emerald-300"}`}>
          <dt className="text-sm text-slate-600">Saldo por conciliar</dt>
          <dd className="mt-1 text-2xl font-bold" data-testid="saldo"><Money minor={oe.outstandingMinor} /></dd>
        </div>
      </dl>

      <nav aria-label="Secciones de la revisión" className="mb-4 flex flex-wrap gap-2 lg:hidden">
        <a href="#movimientos" className="btn-secondary min-h-9 px-3 py-1.5">Movimientos</a>
        <a href="#por-que" className="btn-secondary min-h-9 px-3 py-1.5">¿Por qué?</a>
        <a href="#mensajes" className="btn-secondary min-h-9 px-3 py-1.5">Mensajes</a>
      </nav>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <OrderColumn oe={oe} />
        <MovementsColumn oe={oe} ev={ev} selected={selectedProposal?.movementKey} onSelect={setSelected} />
        <WhyColumn oe={oe} ev={ev} proposal={selectedProposal} />
      </div>

      <div className="mt-4">
        <OrderHistory orderId={o.id} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function OrderColumn({ oe }: { oe: OrderEvaluation }) {
  const { db } = useCobro();
  const { notify } = useNotice();
  const [addingClaim, setAddingClaim] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const o = oe.order;

  return (
    <div className="flex flex-col gap-4">
      <Panel id="pedido" title="Pedido">
        <Dl
          items={[
            ["Referencia", o.reference],
            ["Cliente", o.customerName],
            ["Fecha", formatDate(o.orderDate)],
            ["Total", <Money key="t" minor={o.totalMinor} />],
            ["Moneda", o.currency],
            ...(o.detail ? ([["Detalle", o.detail]] as Array<[string, string]>) : []),
            ...(o.delivery ? ([["Entrega", o.delivery]] as Array<[string, string]>) : []),
            ...(o.deliveryDate ? ([["Fecha de entrega", formatDate(o.deliveryDate)]] as Array<[string, string]>) : []),
          ]}
        />
        {o.sourceText ? (
          <figure className="mt-3">
            <figcaption className="text-xs font-medium text-slate-600">Mensaje original</figcaption>
            <blockquote className="mt-1 rounded-lg border-l-4 border-brand-300 bg-brand-50 p-3 text-sm whitespace-pre-wrap break-words text-slate-900">
              {o.sourceText}
            </blockquote>
          </figure>
        ) : null}
      </Panel>

      <Panel id="declaraciones" title="Declaraciones de pago" subtitle="Lo que dice el cliente. No suma dinero conciliado.">
        {oe.claims.length === 0 ? <p className="text-sm text-slate-700">Sin declaraciones registradas.</p> : null}
        <ul className="flex flex-col gap-2">
          {oe.claims.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="whitespace-pre-wrap break-words">“{c.receivedText}”</p>
              <p className="mt-1 text-xs text-slate-600">
                {c.declaredAmountMinor ? <>Importe declarado: {formatArs(c.declaredAmountMinor)} · </> : null}
                {c.mentionedOperation ? <>Operación mencionada: {c.mentionedOperation} · </> : null}
                Registrada {formatDateTime(c.createdAt)}
              </p>
            </li>
          ))}
        </ul>
        {addingClaim ? (
          <ClaimForm orderId={o.id} onDone={() => setAddingClaim(false)} />
        ) : (
          <button type="button" className="btn-secondary mt-3" onClick={() => setAddingClaim(true)}>
            <Plus aria-hidden className="size-4" /> Registrar declaración
          </button>
        )}
      </Panel>

      <Panel id="asignaciones" title="Asignaciones aprobadas">
        {oe.allocations.length === 0 ? (
          <p className="text-sm text-slate-700">Todavía no hay asignaciones. Nada se asigna sin tu aprobación.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {oe.allocations.map((v) => (
              <li key={v.allocation.id} className={`rounded-lg border p-3 text-sm ${v.counts ? "border-emerald-200 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <p className="font-semibold">
                  <Money minor={v.allocation.amountMinor} /> de {v.movement?.externalId ?? "movimiento desconocido"}
                </p>
                <p className="text-xs text-slate-700">
                  {v.allocation.kind === "manual" ? "Asignación manual" : "Propuesta aprobada"} el{" "}
                  {formatDateTime(v.allocation.confirmedAt)}
                  {v.allocation.note ? ` · Motivo: ${v.allocation.note}` : ""}
                </p>
                {!v.counts ? <p className="mt-1 text-xs font-semibold text-red-900">No cuenta: el movimiento ya no figura acreditado.</p> : null}
                <button type="button" className="btn-ghost mt-1 -ml-3 text-xs" onClick={() => { setReleasing(v.allocation.id); setReason(""); }}>
                  Liberar asignación…
                </button>
              </li>
            ))}
          </ul>
        )}
        <ConfirmDialog
          open={releasing !== null}
          title="Liberar asignación"
          confirmLabel="Liberar"
          danger
          onClose={() => setReleasing(null)}
          onConfirm={async () => {
            try {
              await releaseAllocation(requireDb(db), releasing!, reason);
              notify("ok", "Asignación liberada. El importe vuelve a quedar disponible en el movimiento.");
              setReleasing(null);
            } catch (e) {
              notify("error", (e as Error).message);
            }
          }}
        >
          <p>El importe deja de contar para este pedido y queda disponible en el movimiento. Queda registrado en el historial.</p>
          <label htmlFor={reasonId} className="field-label mt-3">
            Motivo (obligatorio)
          </label>
          <textarea id={reasonId} className="field-input" maxLength={LIMITS.note} value={reason} onChange={(e) => setReason(e.target.value)} />
        </ConfirmDialog>
      </Panel>

    </div>
  );
}

function OrderHistory({ orderId }: { orderId: string }) {
  const { db } = useCobro();
  const history = useLiveQuery(
    async () => (db ? (await loadHistory(db, 500)).filter((h) => h.orderIds.includes(orderId)) : []),
    [db, orderId],
  );
  return (
    <Panel id="historial" title="Historial de este pedido" subtitle="Registro local del navegador. Puede modificarse técnicamente; no es prueba legal.">
        {!history || history.length === 0 ? (
          <p className="text-sm text-slate-700">Sin entradas.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {history.slice(0, 12).map((h) => (
              <li key={h.seq} className="border-l-2 border-slate-300 pl-3">
                <p className="text-xs text-slate-600">{formatDateTime(h.at)}</p>
                <p>{h.summary}</p>
                {h.reason ? <p className="text-xs text-slate-600">Motivo: {h.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function MovementsColumn({
  oe,
  ev,
  selected,
  onSelect,
}: {
  oe: OrderEvaluation;
  ev: Evaluation;
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  const { db } = useCobro();
  const { notify } = useNotice();
  const [rejecting, setRejecting] = useState<Proposal | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [manual, setManual] = useState<Candidate | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const ids = useId();
  const refOf = (id: string) => ev.byOrderId.get(id)?.order.reference ?? "?";

  const shownKeys = new Set([...oe.proposals.map((p) => p.movementKey), ...oe.candidates.map((c) => c.movementKey)]);
  const related = [
    ...new Set(oe.findings.flatMap((f) => f.movementKeys).filter((k) => !shownKeys.has(k))),
  ]
    .map((k) => ev.movements.get(k))
    .filter((x) => x !== undefined);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        id="movimientos"
        title="Movimientos candidatos"
        subtitle="Datos del archivo importado. Elegí una propuesta para ver su evidencia."
      >
        {oe.proposals.length === 0 && oe.candidates.length === 0 && related.length === 0 ? (
          <p className="text-sm text-slate-700">
            No hay movimientos importados relacionados con este pedido.{" "}
            <Link href="/importar" className="font-medium text-brand-800 underline">
              Importar movimientos
            </Link>
          </p>
        ) : null}

        <ul className="flex flex-col gap-3">
          {oe.proposals.map((p) => {
            const me = ev.movements.get(p.movementKey)!;
            const isSel = selected === p.movementKey;
            return (
              <li
                key={p.id}
                className={`rounded-xl border-2 p-3 ${isSel ? "border-brand-600 bg-brand-50/50" : "border-brand-200"}`}
                data-testid="propuesta"
              >
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-800">{p.title}</p>
                <MovementDetails me={me} refOf={refOf} />
                <p className="mt-2 rounded-lg bg-white p-2 text-sm">
                  Asignar <Money minor={p.amountMinor} className="font-bold" /> · saldo después:{" "}
                  <Money minor={p.outstandingAfterMinor} className="font-semibold" />
                  {p.movementLeftoverMinor > 0 ? (
                    <span className="block text-xs text-amber-900">
                      Quedarían {formatArs(p.movementLeftoverMinor)} sin asignar en el movimiento, para revisión.
                    </span>
                  ) : null}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AsyncButton
                    pendingLabel="Guardando…"
                    onClick={async () => {
                      try {
                        await approveProposal(requireDb(db), p.orderId, p.movementKey, p.amountMinor);
                        notify(
                          "ok",
                          `Asociación aprobada: ${formatArs(p.amountMinor)} de ${me.movement.externalId} a ${oe.order.reference}. Saldo por conciliar: ${formatArs(p.outstandingAfterMinor)}.`,
                        );
                      } catch (e) {
                        notify("error", (e as Error).message);
                      }
                    }}
                  >
                    <Check aria-hidden className="size-4" /> Aprobar asociación
                  </AsyncButton>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setRejecting(p);
                      setRejectReason("");
                    }}
                  >
                    <X aria-hidden className="size-4" /> Rechazar
                  </button>
                  {!isSel ? (
                    <button type="button" className="btn-ghost" onClick={() => onSelect(p.movementKey)}>
                      <CircleHelp aria-hidden className="size-4" /> Ver evidencia
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}

          {oe.candidates.map((c) => {
            const me = ev.movements.get(c.movementKey)!;
            return (
              <li key={`c-${c.movementKey}`} className="rounded-xl border-2 border-dashed border-amber-400 p-3" data-testid="candidato">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-900">
                  {c.basis === "declaracion" ? "Señalado por la declaración del cliente" : "Coincide solo el importe"}
                  {c.ambiguousWith.length > 0 ? ` · también coincide con ${c.ambiguousWith.map(refOf).join(", ")}` : ""}
                </p>
                <MovementDetails me={me} refOf={refOf} />
                <p className="mt-2 text-xs text-slate-700">
                  No es una propuesta: no se concilia por monto solamente. Verificá con el cliente antes de asignar.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-2"
                  onClick={() => {
                    setManual(c);
                    setManualAmount(formatArsInput(c.suggestedMinor));
                    setManualNote("");
                    setManualError(null);
                  }}
                >
                  Asignar manualmente…
                </button>
              </li>
            );
          })}

          {related.map((me) => (
            <li key={`r-${me.movement.key}`} className="rounded-xl border border-slate-300 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Movimiento relacionado (sin propuesta)</p>
              <MovementDetails me={me} refOf={refOf} />
            </li>
          ))}
        </ul>
      </Panel>

      <ConfirmDialog
        open={rejecting !== null}
        title="Rechazar propuesta"
        confirmLabel="Rechazar propuesta"
        danger
        onClose={() => setRejecting(null)}
        onConfirm={async () => {
          try {
            await rejectProposal(requireDb(db), rejecting!.orderId, rejecting!.movementKey, rejectReason);
            notify("ok", "Propuesta rechazada. No se vuelve a proponer salvo que deshagas el rechazo.");
            setRejecting(null);
          } catch (e) {
            notify("error", (e as Error).message);
          }
        }}
      >
        <p>No se asigna nada. Queda registrado en el historial y podés deshacerlo.</p>
        <label htmlFor={`${ids}-rr`} className="field-label mt-3">
          Motivo <span className="font-normal text-slate-500">(opcional)</span>
        </label>
        <textarea id={`${ids}-rr`} className="field-input" maxLength={LIMITS.note} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
      </ConfirmDialog>

      <ConfirmDialog
        open={manual !== null}
        title="Asignación manual"
        confirmLabel="Confirmar asignación"
        onClose={() => setManual(null)}
        onConfirm={async () => {
          setManualError(null);
          const amount = parseArsText(manualAmount);
          if (!amount.ok) {
            setManualError(amount.error);
            return;
          }
          try {
            await assignManually(requireDb(db), oe.order.id, manual!.movementKey, amount.minor, manualNote);
            notify("ok", `Asignación manual guardada: ${formatArs(amount.minor)} a ${oe.order.reference}.`);
            setManual(null);
          } catch (e) {
            setManualError((e as Error).message);
          }
        }}
      >
        <p>
          Esta asociación no surge de una referencia explícita. Confirmala solo si verificaste que corresponde (por
          ejemplo, con el cliente). No se puede asignar más que el disponible del movimiento ni más que el saldo.
        </p>
        <label htmlFor={`${ids}-ma`} className="field-label mt-3">
          Importe a asignar (ARS)
        </label>
        <input id={`${ids}-ma`} className="field-input" inputMode="decimal" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} />
        <label htmlFor={`${ids}-mn`} className="field-label mt-3">
          Motivo (obligatorio)
        </label>
        <textarea
          id={`${ids}-mn`}
          className="field-input"
          maxLength={LIMITS.note}
          value={manualNote}
          onChange={(e) => setManualNote(e.target.value)}
          placeholder="El cliente confirmó por mensaje que la transferencia del 17/09 es de este pedido."
        />
        {manualError ? (
          <p role="alert" className="field-error">
            {manualError}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

const ACTION_LABEL: Record<NextAction, string> = {
  aprobar_propuesta: "Aprobar la propuesta",
  revisar_referencia: "Revisar el movimiento y su referencia",
  importar_recientes: "Importar movimientos más recientes",
  copiar_mensaje: "Copiar un mensaje de consulta",
  asignar_manual: "Ver candidatos para asignar manualmente",
  liberar_asignacion: "Revisar asignaciones",
  deshacer_rechazo: "Deshacer el rechazo",
  revisar_conflicto: "Revisar conflictos de importación",
};

function ActionLink({ action, finding, orderId }: { action: NextAction; finding: Finding; orderId: string }) {
  const { db } = useCobro();
  const { notify } = useNotice();
  const cls = "inline-flex items-center gap-1 text-sm font-medium text-brand-800 underline underline-offset-2 hover:text-brand-950";
  switch (action) {
    case "importar_recientes":
      return <Link className={cls} href="/importar">{ACTION_LABEL[action]}</Link>;
    case "revisar_conflicto":
      return <Link className={cls} href="/importar#conflictos">{ACTION_LABEL[action]}</Link>;
    case "copiar_mensaje":
      return <a className={cls} href="#mensajes">{ACTION_LABEL[action]}</a>;
    case "revisar_referencia":
    case "asignar_manual":
      return <a className={cls} href="#movimientos">{ACTION_LABEL[action]}</a>;
    case "liberar_asignacion":
      return <a className={cls} href="#asignaciones">{ACTION_LABEL[action]}</a>;
    case "deshacer_rechazo":
      return (
        <AsyncButton
          className="btn-secondary"
          onClick={async () => {
            try {
              await undoRejection(requireDb(db), orderId, finding.movementKeys[0]!);
              notify("ok", "Rechazo deshecho. El movimiento vuelve a evaluarse.");
            } catch (e) {
              notify("error", (e as Error).message);
            }
          }}
        >
          {ACTION_LABEL[action]}
        </AsyncButton>
      );
    default:
      return null;
  }
}

function WhyColumn({
  oe,
  ev,
  proposal,
}: {
  oe: OrderEvaluation;
  ev: Evaluation;
  proposal: Proposal | undefined;
}) {
  const drafts = messageDrafts(oe, ev);
  const movement = proposal ? ev.movements.get(proposal.movementKey)?.movement : undefined;
  return (
    <div className="flex flex-col gap-4">
      <Panel id="por-que" title="¿Por qué aparece este resultado?">
        <p className="rounded-lg bg-slate-100 p-3 text-sm font-medium text-slate-900">{resultSentence(oe)}</p>

        {proposal && movement ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">
              Evidencia de la propuesta con {movement.externalId}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {proposal.checks.map((c) => (
                <li key={c.label} className="flex gap-2 text-sm">
                  <span
                    className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      c.result === "cumple" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                    }`}
                    aria-hidden
                  >
                    {c.result === "cumple" ? "✓" : "!"}
                  </span>
                  <span>
                    <span className="font-semibold">{c.label}</span>{" "}
                    <span className="sr-only">{c.result === "cumple" ? "(cumple)" : "(observación)"}</span>
                    <span className="block text-slate-700">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-600">
              Regla: referencia explícita + moneda compatible + movimiento acreditado ⇒ propuesta. Nunca se concilia por
              monto solamente y nada se asigna sin tu aprobación.
            </p>
          </div>
        ) : null}

        {oe.findings.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Observaciones y excepciones</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {oe.findings.map((f, i) => {
                const look = SEVERITY[f.severity];
                const Icon = look.icon;
                return (
                  <li key={`${f.code}-${i}`} className={`rounded-lg border p-3 text-sm ${look.className}`} data-code={f.code}>
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className="sr-only">{look.label}: </span>
                      {f.title}
                    </p>
                    <p className="mt-1">{f.explanation}</p>
                    {f.nextActions.length > 0 ? (
                      <div className="mt-2 flex flex-col items-start gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Siguiente paso</span>
                        {f.nextActions.map((a) => (
                          <ActionLink key={a} action={a} finding={f} orderId={oe.order.id} />
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Qué no verifica</p>
          <p className="mt-1">
            COBRO CLARO compara el pedido con el archivo importado. No autentica el origen del archivo, no consulta al
            banco y no certifica que el dinero esté acreditado. «Conciliado» significa «coincide con el archivo».
          </p>
        </div>
      </Panel>

      <Panel id="mensajes" title="Mensajes sugeridos" subtitle="Borradores editables. No se envían solos.">
        {drafts.length === 0 ? (
          <p className="text-sm text-slate-700">No hay consultas sugeridas para este pedido.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {drafts.map((d) => (
              <CopyableDraft key={`${d.id}-${d.text}`} label={d.title} initialText={d.text} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
