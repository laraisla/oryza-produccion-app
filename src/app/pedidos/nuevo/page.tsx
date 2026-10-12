"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCobro } from "@/components/cobro-provider";
import { MessageExtract } from "@/components/message-extract";
import { emptyOrderValues, OrderForm } from "@/components/order-form";
import { ErrorBox, Loading, PageHeader } from "@/components/ui";
import { localTodayIso } from "@/domain/dates";
import type { Order } from "@/domain/schemas";

type Tab = "mensaje" | "formulario";

export default function NewOrderPage() {
  const router = useRouter();
  const { ev, loadError } = useCobro();
  const [tab, setTab] = useState<Tab>("mensaje");
  if (loadError) return <ErrorBox title="No se pudieron leer los datos locales">{loadError}</ErrorBox>;
  if (!ev) return <Loading />;

  const onSaved = (o: Order) => router.push(`/revision?pedido=${encodeURIComponent(o.id)}`);

  return (
    <>
      <Link href="/" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft aria-hidden className="size-4" /> Pedidos
      </Link>
      <PageHeader
        title="Nuevo pedido"
        description="Desde un mensaje del cliente (se arma un borrador para revisar) o con el formulario. Nada se guarda sin tu revisión."
      />
      <div role="group" aria-label="Forma de carga" className="mb-4 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
        {(
          [
            ["mensaje", "Desde un mensaje"],
            ["formulario", "Formulario"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-md px-4 py-2 text-sm font-medium ${tab === value ? "bg-brand-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "mensaje" ? (
        <MessageExtract onSaved={onSaved} />
      ) : (
        <section className="card max-w-3xl p-4 sm:p-6" aria-label="Formulario de pedido">
          <OrderForm
            initial={emptyOrderValues(localTodayIso())}
            notes={{ orderDate: { kind: "predeterminado", text: "Por defecto, la fecha de hoy. Podés cambiarla." } }}
            onSaved={onSaved}
          />
        </section>
      )}
    </>
  );
}
