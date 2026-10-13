"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCobro } from "@/components/cobro-provider";
import { OrderReview } from "@/components/review/order-review";
import { ATTENTION, AttentionBadge, Badge, OrderStatusBadge, SEVERITY } from "@/components/status";
import { ErrorBox, Loading, Money, PageHeader } from "@/components/ui";
import type { Attention, OrderEvaluation } from "@/domain/reconcile";

export default function RevisionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Revision />
    </Suspense>
  );
}

function Revision() {
  const params = useSearchParams();
  const { ev, loadError } = useCobro();
  if (loadError) return <ErrorBox title="No se pudieron leer los datos locales">{loadError}</ErrorBox>;
  if (!ev) return <Loading />;
  const id = params.get("pedido");
  return id ? <OrderReview key={id} orderId={id} /> : <Queue />;
}

const SECTIONS: Array<{ attention: Exclude<Attention, "ninguna">; title: string; description: string }> = [
  {
    attention: "aprobacion",
    title: "Propuestas para aprobar",
    description: "Referencia explícita del pedido, moneda compatible y movimiento acreditado según el archivo.",
  },
  {
    attention: "revision",
    title: "Revisión necesaria",
    description: "Movimientos ya utilizados, importes que coinciden con varios pedidos o asignaciones que dejaron de contar.",
  },
  {
    attention: "sin_encontrar",
    title: "No encontrado en los movimientos importados",
    description: "Hay una declaración del cliente pero ningún movimiento compatible en los archivos. No implica que no haya pagado.",
  },
  {
    attention: "esperando",
    title: "Con saldo por conciliar",
    description: "Sin propuestas con los movimientos importados hasta ahora.",
  },
];

function QueueItem({ oe }: { oe: OrderEvaluation }) {
  const key = oe.findings.find((f) => f.severity === "advertencia") ?? oe.findings.find((f) => f.severity === "atencion") ?? oe.findings[0];
  return (
    <li>
      <Link
        href={`/revision?pedido=${encodeURIComponent(oe.order.id)}`}
        className="card flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-md"
        aria-label={`Revisar ${oe.order.reference}, ${oe.order.customerName}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-950">{oe.order.reference}</p>
            <p className="text-sm text-slate-600">{oe.order.customerName}</p>
          </div>
          <div className="text-right text-sm">
            <span className="block text-xs text-slate-600">Saldo</span>
            <Money minor={oe.outstandingMinor} className="font-semibold" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={oe.status} />
          <AttentionBadge attention={oe.attention} />
        </div>
        {oe.proposals.length > 0 ? (
          <p className="text-sm text-slate-700">
            {oe.proposals.length === 1 ? "1 propuesta" : `${oe.proposals.length} propuestas`}:{" "}
            {oe.proposals.map((p) => p.title.toLowerCase()).join("; ")}.
          </p>
        ) : key ? (
          <p className="text-sm text-slate-700">{key.title}</p>
        ) : null}
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-800">
          Revisar <ArrowRight aria-hidden className="size-4" />
        </span>
      </Link>
    </li>
  );
}

function Queue() {
  const { ev, data } = useCobro();
  if (!ev || !data) return null;
  const movementIssues = [...ev.movements.values()].filter((me) => me.findings.some((f) => f.severity !== "info"));
  const openConflicts = data.conflicts.filter((c) => c.status === "abierto");
  const empty = SECTIONS.every((s) => !ev.orders.some((o) => o.attention === s.attention)) && movementIssues.length === 0 && openConflicts.length === 0;

  return (
    <>
      <PageHeader
        title="Revisión"
        description="Propuestas y excepciones, ordenadas por lo que requiere una decisión. Cada resultado explica por qué aparece."
      />
      {ev.orders.length === 0 ? (
        <p className="card p-6 text-sm text-slate-700">
          No hay pedidos. <Link href="/" className="font-medium text-brand-800 underline">Cargá el ejemplo o creá un pedido</Link>.
        </p>
      ) : empty ? (
        <p className="card p-6 text-sm text-slate-700">No hay nada pendiente de revisión con los datos cargados.</p>
      ) : null}

      {SECTIONS.map((s) => {
        const items = ev.orders.filter((o) => o.attention === s.attention);
        if (items.length === 0) return null;
        return (
          <section key={s.attention} id={s.attention} className="mb-8 scroll-mt-6" aria-labelledby={`${s.attention}-t`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 id={`${s.attention}-t`} className="section-title">
                {s.title} <span className="num font-normal text-slate-600">({items.length})</span>
              </h2>
              <Badge look={ATTENTION[s.attention]} />
            </div>
            <p className="-mt-2 mb-3 text-sm text-slate-700">{s.description}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((o) => (
                <QueueItem key={o.order.id} oe={o} />
              ))}
            </ul>
          </section>
        );
      })}

      {movementIssues.length > 0 || openConflicts.length > 0 ? (
        <section className="mb-8" aria-labelledby="movs-t">
          <h2 id="movs-t" className="section-title mb-3">
            Movimientos para revisar
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {openConflicts.map((c) => (
              <li key={c.id} className={`rounded-xl border p-4 text-sm ${SEVERITY.advertencia.className}`}>
                <p className="font-semibold">Conflicto de importación: {c.incoming.externalId}</p>
                <p className="mt-1">Mismo identificador con datos distintos. No se sobrescribió nada.</p>
                <Link href="/importar#conflictos" className="mt-2 inline-block font-medium underline">
                  Revisar conflicto
                </Link>
              </li>
            ))}
            {movementIssues.flatMap((me) =>
              me.findings
                .filter((f) => f.severity !== "info")
                .map((f) => (
                  <li key={`${me.movement.key}-${f.code}`} className={`rounded-xl border p-4 text-sm ${SEVERITY[f.severity].className}`}>
                    <p className="font-semibold">
                      {f.title}: {me.movement.externalId}
                    </p>
                    <p className="mt-1">{f.explanation}</p>
                  </li>
                )),
            )}
          </ul>
        </section>
      ) : null}
    </>
  );
}
