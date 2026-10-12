import type { ReactNode } from "react";
import { MOVEMENT_STATUS_LABEL } from "@/components/status";
import { Money } from "@/components/ui";
import { formatDate, formatDateTime } from "@/domain/dates";
import type { MovementEvaluation } from "@/domain/reconcile";

/** Datos del movimiento tal como vienen del archivo, con su procedencia. */
export function MovementDetails({ me, refOf }: { me: MovementEvaluation; refOf: (orderId: string) => string }) {
  const m = me.movement;
  const prov = m.statusUpdatedBy ?? m.provenance;
  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-all text-slate-950">{m.externalId}</p>
          <p className="text-xs text-slate-600">
            {m.account} · {formatDate(m.date)}
          </p>
        </div>
        <Money minor={m.amountMinor} className="text-base font-bold" />
      </div>
      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1">
        <dt className="text-slate-600">Estado</dt>
        <dd>{MOVEMENT_STATUS_LABEL[m.status]}</dd>
        <dt className="text-slate-600">Referencia</dt>
        <dd className="break-words">{m.reference || "(sin referencia)"}</dd>
        {m.description ? (
          <>
            <dt className="text-slate-600">Descripción</dt>
            <dd className="break-words">{m.description}</dd>
          </>
        ) : null}
        <dt className="text-slate-600">Disponible</dt>
        <dd>
          <Money minor={me.availableMinor} />
          {me.allocations.length > 0 ? (
            <span className="text-slate-600"> (asignado a {me.allocations.map((a) => refOf(a.orderId)).join(", ")})</span>
          ) : null}
        </dd>
      </dl>
      <p className="mt-2 text-xs text-slate-600">
        Procedencia: archivo «{prov.fileName}», fila {prov.rowNumber}, importado {formatDateTime(prov.importedAt)}.
      </p>
    </div>
  );
}

export function Panel({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="card scroll-mt-6 p-4 sm:p-5">
      <h2 id={`${id}-t`} className="section-title">
        {title}
      </h2>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}
