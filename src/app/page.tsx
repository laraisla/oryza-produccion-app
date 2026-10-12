"use client";

import { ArrowRight, ClipboardList, FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCobro, requireDb } from "@/components/cobro-provider";
import { useNotice } from "@/components/notices";
import { ATTENTION, AttentionBadge, OrderStatusBadge } from "@/components/status";
import { AsyncButton, ErrorBox, Loading, Money, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/domain/dates";
import { coverageText, type OrderEvaluation } from "@/domain/reconcile";
import { loadDemo } from "@/storage/repository";

type Filter = "todos" | "atencion" | "conciliados";

export default function HomePage() {
  const { ev, data, loadError, db } = useCobro();
  const { notify } = useNotice();
  const [filter, setFilter] = useState<Filter>("todos");

  if (loadError) return <ErrorBox title="No se pudieron leer los datos locales">{loadError}</ErrorBox>;
  if (!ev || !data) return <Loading />;

  const s = ev.summary;
  const needsAttention = (o: OrderEvaluation) => o.attention !== "ninguna";
  const orders = ev.orders.filter((o) =>
    filter === "todos" ? true : filter === "atencion" ? needsAttention(o) : o.status === "conciliado",
  );

  const header = (
    <PageHeader
      title="Pedidos"
      description="Cada pedido muestra cuánto está conciliado con los movimientos importados y qué falta revisar."
      actions={
        <Link href="/pedidos/nuevo" className="btn-primary">
          <Plus aria-hidden className="size-4" />
          Nuevo pedido
        </Link>
      }
    />
  );

  if (ev.orders.length === 0) {
    return (
      <>
        {header}
        <section className="card flex flex-col items-start gap-4 p-6 sm:p-8" aria-labelledby="vacio">
          <ClipboardList aria-hidden className="size-8 text-brand-700" />
          <div>
            <h2 id="vacio" className="text-lg font-semibold">
              Todavía no hay pedidos
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-700">
              Creá un pedido desde un mensaje o un formulario, o cargá el ejemplo con datos sintéticos para recorrer
              la demostración: 6 pedidos, 2 declaraciones de pago y un archivo con 3 movimientos. Los resultados se
              calculan al cargarlo; no hay resultados precargados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AsyncButton
              onClick={async () => {
                try {
                  await loadDemo(requireDb(db));
                  notify("ok", "Ejemplo cargado. Los resultados se calcularon con las reglas de conciliación.");
                } catch (e) {
                  notify("error", (e as Error).message);
                }
              }}
              pendingLabel="Cargando ejemplo…"
            >
              Cargar ejemplo
            </AsyncButton>
            <Link href="/pedidos/nuevo" className="btn-secondary">
              Crear un pedido
            </Link>
          </div>
        </section>
      </>
    );
  }

  const cards: Array<{ key: string; count: number; label: string; hint: string; href: string; tone: string }> = [
    {
      key: "aprobacion",
      count: s.proposals,
      label: s.proposals === 1 ? "propuesta para aprobar" : "propuestas para aprobar",
      hint: "Referencia explícita y movimiento acreditado. Requieren tu aprobación.",
      href: "/revision#aprobacion",
      tone: ATTENTION.aprobacion.className,
    },
    {
      key: "revision",
      count: s.review,
      label: s.review === 1 ? "pedido en revisión" : "pedidos en revisión",
      hint: "Movimientos ya utilizados, importes ambiguos o asignaciones que dejaron de contar.",
      href: "/revision#revision",
      tone: ATTENTION.revision.className,
    },
    {
      key: "sin_encontrar",
      count: s.notFound,
      label: s.notFound === 1 ? "declaración sin movimiento" : "declaraciones sin movimiento",
      hint: "No encontrado en los movimientos importados (no implica que no haya pagado).",
      href: "/revision#sin_encontrar",
      tone: ATTENTION.sin_encontrar.className,
    },
    {
      key: "saldo",
      count: s.waiting,
      label: s.waiting === 1 ? "pedido con saldo por conciliar" : "pedidos con saldo por conciliar",
      hint: "Sin propuestas con los archivos importados hasta ahora.",
      href: "/revision#esperando",
      tone: "border-slate-300 bg-white text-slate-800",
    },
  ];

  return (
    <>
      {header}

      <section aria-labelledby="atencion" className="mb-8">
        <h2 id="atencion" className="sr-only">
          Qué requiere atención
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <li key={c.key}>
              <Link href={c.href} className={`block h-full rounded-xl border p-4 transition-shadow hover:shadow-md ${c.tone}`}>
                <span className="num block text-3xl font-bold">{c.count}</span>
                <span className="block text-sm font-semibold">{c.label}</span>
                <span className="mt-1 block text-xs opacity-90">{c.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-medium text-slate-900">Movimientos: </span>
            {data.movements.length} importados. {coverageText(ev.coverage)}
            {ev.coverage.lastImportAt ? ` Última importación: ${formatDateTime(ev.coverage.lastImportAt)}.` : ""}
            {s.openConflicts > 0 ? (
              <>
                {" "}
                <Link href="/importar#conflictos" className="font-semibold text-red-800 underline">
                  {s.openConflicts} {s.openConflicts === 1 ? "conflicto de importación" : "conflictos de importación"}
                </Link>
                .
              </>
            ) : null}
          </p>
          <Link href="/importar" className="btn-secondary shrink-0">
            <FileUp aria-hidden className="size-4" />
            Importar movimientos
          </Link>
        </div>
      </section>

      <section aria-labelledby="lista">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="lista" className="section-title">
            Lista de pedidos <span className="num font-normal text-slate-600">({orders.length})</span>
          </h2>
          <div role="group" aria-label="Filtrar pedidos" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(
              [
                ["todos", "Todos"],
                ["atencion", "Requieren atención"],
                ["conciliados", "Conciliados"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === value ? "bg-brand-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="card p-6 text-sm text-slate-700">No hay pedidos con este filtro.</p>
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Pedidos con su estado de conciliación</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Pedido</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Asignado</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Saldo por conciliar</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Acción</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.order.id} className="hover:bg-slate-50">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <span className="block font-semibold text-slate-950">{o.order.reference}</span>
                        <span className="block text-slate-600">{o.order.customerName}</span>
                      </th>
                      <td className="num px-4 py-3 text-slate-700">{formatDate(o.order.orderDate)}</td>
                      <td className="px-4 py-3 text-right"><Money minor={o.order.totalMinor} /></td>
                      <td className="px-4 py-3 text-right"><Money minor={o.allocatedMinor} /></td>
                      <td className="px-4 py-3 text-right font-semibold"><Money minor={o.outstandingMinor} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <OrderStatusBadge status={o.status} />
                          <AttentionBadge attention={o.attention} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/revision?pedido=${encodeURIComponent(o.order.id)}`}
                          className="btn-ghost"
                          aria-label={`Revisar ${o.order.reference}`}
                        >
                          Revisar <ArrowRight aria-hidden className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas */}
            <ul className="flex flex-col gap-3 md:hidden">
              {orders.map((o) => (
                <li key={o.order.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{o.order.reference}</p>
                      <p className="text-sm text-slate-600">
                        {o.order.customerName} · {formatDate(o.order.orderDate)}
                      </p>
                    </div>
                    <Money minor={o.order.totalMinor} className="font-semibold" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    <AttentionBadge attention={o.attention} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    Asignado <Money minor={o.allocatedMinor} /> · Saldo <Money minor={o.outstandingMinor} className="font-semibold" />
                  </p>
                  <Link
                    href={`/revision?pedido=${encodeURIComponent(o.order.id)}`}
                    className="btn-secondary mt-3 w-full"
                    aria-label={`Revisar ${o.order.reference}`}
                  >
                    Revisar <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
