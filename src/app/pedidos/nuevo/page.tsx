"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCobro } from "@/components/cobro-provider";
import { emptyOrderValues, OrderForm } from "@/components/order-form";
import { ErrorBox, Loading, PageHeader } from "@/components/ui";
import { localTodayIso } from "@/domain/dates";

export default function NewOrderPage() {
  const router = useRouter();
  const { ev, loadError } = useCobro();
  if (loadError) return <ErrorBox title="No se pudieron leer los datos locales">{loadError}</ErrorBox>;
  if (!ev) return <Loading />;

  return (
    <>
      <Link href="/" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft aria-hidden className="size-4" /> Pedidos
      </Link>
      <PageHeader title="Nuevo pedido" description="Completá los datos del pedido. Revisalos antes de guardar." />
      <section className="card max-w-3xl p-4 sm:p-6" aria-label="Formulario de pedido">
        <OrderForm
          initial={emptyOrderValues(localTodayIso())}
          notes={{ orderDate: { kind: "predeterminado", text: "Por defecto, la fecha de hoy. Podés cambiarla." } }}
          onSaved={(o) => router.push(`/revision?pedido=${encodeURIComponent(o.id)}`)}
        />
      </section>
    </>
  );
}
