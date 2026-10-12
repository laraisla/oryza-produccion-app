"use client";

import { Download, FileSpreadsheet, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { requireDb, useCobro } from "@/components/cobro-provider";
import { downloadText } from "@/components/download";
import { useNotice } from "@/components/notices";
import { MOVEMENT_STATUS_LABEL, SEVERITY } from "@/components/status";
import { AsyncButton, ErrorBox, FileInput, Loading, Money, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/domain/dates";
import { DEMO_CSV_2, DEMO_CSV_2_NAME } from "@/demo/dataset";
import { CSV_LIMITS, CSV_TEMPLATE } from "@/importing/csv";
import { describeValue, FIELD_LABELS, type ImportPlan, type PlanKind } from "@/importing/plan";
import { confirmImport, markConflictReviewed, previewImport, type ImportResult } from "@/storage/repository";

const KIND_LABEL: Record<PlanKind, { label: string; className: string }> = {
  nuevo: { label: "Nuevo", className: "border-brand-300 bg-brand-50 text-brand-900" },
  sin_cambios: { label: "Ya importado (sin cambios)", className: "border-slate-300 bg-slate-50 text-slate-700" },
  repetido_en_archivo: { label: "Repetido en el archivo", className: "border-slate-300 bg-slate-50 text-slate-700" },
  estado_actualizado: { label: "Cambio de estado", className: "border-amber-300 bg-amber-50 text-amber-900" },
  conflicto: { label: "Conflicto: no se sobrescribe", className: "border-red-300 bg-red-50 text-red-900" },
};

const FORMAT_ROWS: Array<[string, string, string]> = [
  ["id_movimiento", "Sí", "Identificador de la operación en el archivo de origen. Junto con la cuenta evita duplicados."],
  ["cuenta", "Sí", "Nombre de la cuenta de origen del archivo (texto libre)."],
  ["fecha", "Sí", "AAAA-MM-DD o DD/MM/AAAA."],
  ["importe", "Sí", "Positivo, punto decimal, sin separador de miles: 45000.00"],
  ["moneda", "Sí", "Solo ARS. No se convierten monedas."],
  ["estado", "Sí", "acreditado, pendiente o revertido. Solo «acreditado» cuenta."],
  ["referencia", "No", "Texto de la transferencia; se busca la referencia del pedido (ej.: PED-101)."],
  ["descripcion", "No", "Texto adicional; también se busca la referencia."],
];

export default function ImportPage() {
  const { ev, data, db, loadError } = useCobro();
  const { notify } = useNotice();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  if (loadError) return <ErrorBox title="No se pudieron leer los datos locales">{loadError}</ErrorBox>;
  if (!ev || !data) return <Loading />;

  function reset() {
    setFile(null);
    setPlan(null);
    setReadError(null);
    if (fileRef.current) fileRef.current.value = "";
    setInputKey((k) => k + 1);
  }

  async function onFile(f: File | undefined) {
    setResult(null);
    setPlan(null);
    setReadError(null);
    setFile(null);
    if (!f) return;
    if (f.size > CSV_LIMITS.maxBytes) {
      setReadError(`El archivo pesa ${(f.size / 1_000_000).toFixed(1)} MB; el máximo es 1 MB.`);
      return;
    }
    setReading(true);
    try {
      const text = await f.text();
      const p = await previewImport(requireDb(db), text);
      setFile({ name: f.name, text });
      setPlan(p);
    } catch (e) {
      setReadError((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  const openConflicts = data.conflicts.filter((c) => c.status === "abierto");
  const imports = [...data.imports].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
  const movements = [...ev.movements.values()].sort((a, b) =>
    a.movement.date === b.movement.date ? (a.movement.key < b.movement.key ? -1 : 1) : a.movement.date < b.movement.date ? 1 : -1,
  );
  const refOf = (orderId: string) => ev.byOrderId.get(orderId)?.order.reference ?? "?";

  return (
    <>
      <PageHeader
        title="Importar movimientos"
        description={
          <>
            Importás un <strong>archivo CSV</strong> con un formato propio. <strong>No es una conexión bancaria</strong>:
            COBRO CLARO no accede a cuentas, no pide claves y no verifica que el archivo provenga de un banco. Concilia
            los datos que le suministrás.
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="card p-4 sm:p-6" aria-labelledby="formato">
          <h2 id="formato" className="section-title">
            1. Formato del archivo
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Una fila por movimiento de ingreso. Máximo {CSV_LIMITS.maxRows.toLocaleString("es-AR")} filas y 1 MB. Separador
            coma o punto y coma; guardalo como «CSV UTF-8».
          </p>
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Columnas del formato (desplazable)">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Columnas del CSV</caption>
              <thead className="text-slate-600">
                <tr>
                  <th scope="col" className="py-1 pr-2 font-semibold">Columna</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">Obligatoria</th>
                  <th scope="col" className="py-1 font-semibold">Contenido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FORMAT_ROWS.map(([c, req, desc]) => (
                  <tr key={c}>
                    <th scope="row" className="py-1.5 pr-2 font-mono font-medium text-slate-900">{c}</th>
                    <td className="py-1.5 pr-2">{req}</td>
                    <td className="py-1.5 text-slate-700">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => downloadText("plantilla-movimientos.csv", CSV_TEMPLATE + "\n", "text/csv;charset=utf-8")}>
              <Download aria-hidden className="size-4" /> Descargar plantilla
            </button>
            <button type="button" className="btn-secondary" onClick={() => downloadText(DEMO_CSV_2_NAME, DEMO_CSV_2, "text/csv;charset=utf-8")}>
              <FileSpreadsheet aria-hidden className="size-4" /> Ejemplo 2 de la demo
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            El ejemplo 2 (sintético) incluye un movimiento ya importado, un pago que completa un pedido, uno pendiente, un
            conflicto y una fila con error, para probar la validación.
          </p>
        </section>

        <section className="card p-4 sm:p-6" aria-labelledby="cargar">
          <h2 id="cargar" className="section-title">
            2. Elegir archivo y revisar
          </h2>
          <p className="mt-1 text-sm text-slate-700">Nada se guarda hasta que revises la vista previa y confirmes.</p>
          <div className="mt-3">
            <FileInput key={inputKey} label="Elegir archivo CSV" accept=".csv,text/csv" inputRef={fileRef} onFile={(f) => void onFile(f)} />
          </div>
          {reading ? <p role="status" className="mt-3 text-sm text-slate-700">Leyendo y validando el archivo…</p> : null}
          {readError ? (
            <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {readError}
            </p>
          ) : null}

          {plan && file ? <PlanPreview plan={plan} fileName={file.name} /> : null}

          {plan && file && plan.fileErrors.length === 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <AsyncButton
                disabled={plan.items.length === 0}
                pendingLabel="Importando…"
                onClick={async () => {
                  try {
                    const r = await confirmImport(requireDb(db), file.text, file.name);
                    setResult(r);
                    reset();
                    notify("ok", `Importación guardada: ${r.added.length} movimientos nuevos.`);
                  } catch (e) {
                    notify("error", (e as Error).message);
                  }
                }}
              >
                Confirmar importación
              </AsyncButton>
              <button type="button" className="btn-secondary" onClick={reset}>
                Cancelar
              </button>
            </div>
          ) : null}

          {result ? (
            <div role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">Importación guardada en este navegador</p>
              <p className="mt-1">
                {result.added.length} nuevos · {result.batch.unchanged} sin cambios · {result.statusUpdates.length} cambios
                de estado · {result.batch.conflicts} conflictos · {result.batch.errors} filas con error (no importadas).
              </p>
              {result.statusUpdates.length > 0 ? (
                <p className="mt-1">Los cambios de estado recalculan las asignaciones afectadas.</p>
              ) : null}
              <Link href="/revision" className="btn-primary mt-3">
                Ver propuestas y excepciones
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      {openConflicts.length > 0 ? (
        <section id="conflictos" className="mt-8 scroll-mt-6" aria-labelledby="conflictos-t">
          <h2 id="conflictos-t" className="section-title flex items-center gap-2">
            <TriangleAlert aria-hidden className="size-5 text-red-700" /> Conflictos de importación ({openConflicts.length})
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Mismo identificador y cuenta con datos incompatibles. Se conservaron los datos importados antes; nada se
            sobrescribió. El prototipo no reemplaza movimientos: si el dato nuevo es el correcto, aclaralo con el origen
            del archivo.
          </p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {openConflicts.map((c) => (
              <li key={c.id} className="card border-red-200 p-4">
                <p className="font-semibold">
                  {c.incoming.externalId} · {c.incoming.account}
                </p>
                <p className="text-xs text-slate-600">
                  Archivo «{c.fileName}», fila {c.rowNumber} · detectado {formatDateTime(c.detectedAt)}
                </p>
                <table className="mt-2 w-full text-left text-sm">
                  <thead className="text-xs text-slate-600">
                    <tr>
                      <th scope="col" className="py-1 font-semibold">Campo</th>
                      <th scope="col" className="py-1 font-semibold">Guardado</th>
                      <th scope="col" className="py-1 font-semibold">En el archivo nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.fields.map((f) => {
                      const key = f as keyof typeof FIELD_LABELS;
                      return (
                        <tr key={f}>
                          <th scope="row" className="py-1 pr-2 font-medium">{FIELD_LABELS[key]}</th>
                          <td className="num py-1 pr-2">{describeValue(key, c.existing)}</td>
                          <td className="num py-1 font-semibold text-red-800">{describeValue(key, c.incoming)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <AsyncButton
                  className="btn-secondary mt-3"
                  onClick={async () => {
                    try {
                      await markConflictReviewed(requireDb(db), c.id);
                      notify("ok", "Conflicto marcado como revisado. Se mantienen los datos guardados.");
                    } catch (e) {
                      notify("error", (e as Error).message);
                    }
                  }}
                >
                  Mantener datos guardados
                </AsyncButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="procedencia">
        <h2 id="procedencia" className="section-title">
          Archivos importados
        </h2>
        {imports.length === 0 ? (
          <p className="card mt-3 p-4 text-sm text-slate-700">Todavía no se importó ningún archivo.</p>
        ) : (
          <div className="card mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Archivos importados (desplazable)">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Procedencia de los datos importados</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Archivo</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Importado</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Período (fechas en el archivo)</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Cuentas</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Nuevos</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Sin cambios</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Estado</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Conflictos</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Errores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {imports.map((i) => (
                  <tr key={i.id}>
                    <th scope="row" className="px-3 py-2 font-medium break-all">{i.fileName}</th>
                    <td className="num px-3 py-2">{formatDateTime(i.importedAt)}</td>
                    <td className="num px-3 py-2">
                      {i.periodFrom && i.periodTo ? `${formatDate(i.periodFrom)} – ${formatDate(i.periodTo)}` : "—"}
                    </td>
                    <td className="px-3 py-2">{i.accounts.join(", ")}</td>
                    <td className="num px-3 py-2 text-right">{i.added}</td>
                    <td className="num px-3 py-2 text-right">{i.unchanged}</td>
                    <td className="num px-3 py-2 text-right">{i.statusUpdates}</td>
                    <td className="num px-3 py-2 text-right">{i.conflicts}</td>
                    <td className="num px-3 py-2 text-right">{i.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="movs">
        <h2 id="movs" className="section-title">
          Movimientos importados ({movements.length})
        </h2>
        <p className="mt-1 text-sm text-slate-700">
          «Acreditado» significa que así lo informa el archivo. No es una verificación bancaria.
        </p>
        {movements.length === 0 ? (
          <p className="card mt-3 p-4 text-sm text-slate-700">Sin movimientos.</p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {movements.map((me) => {
              const m = me.movement;
              return (
                <li key={m.key} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold break-all">{m.externalId}</p>
                      <p className="text-xs text-slate-600">
                        {m.account} · {formatDate(m.date)}
                      </p>
                    </div>
                    <Money minor={m.amountMinor} className="font-semibold" />
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="text-slate-600">Estado: </span>
                    {MOVEMENT_STATUS_LABEL[m.status]}
                  </p>
                  <p className="text-sm break-words">
                    <span className="text-slate-600">Referencia: </span>
                    {m.reference || "(sin referencia)"}
                  </p>
                  <p className="text-sm">
                    <span className="text-slate-600">Disponible: </span>
                    <Money minor={me.availableMinor} />
                    {me.allocations.length > 0 ? (
                      <span className="text-slate-600"> · asignado a {me.allocations.map((a) => refOf(a.orderId)).join(", ")}</span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    Procedencia: «{m.provenance.fileName}», fila {m.provenance.rowNumber}, importado{" "}
                    {formatDateTime(m.provenance.importedAt)}
                    {m.statusUpdatedBy
                      ? `. Estado actualizado por «${m.statusUpdatedBy.fileName}», fila ${m.statusUpdatedBy.rowNumber}`
                      : ""}
                    .
                  </p>
                  {me.findings.map((f) => (
                    <div key={f.code} className={`mt-2 rounded-lg border p-2 text-xs ${SEVERITY[f.severity].className}`}>
                      <p className="font-semibold">{f.title}</p>
                      <p>{f.explanation}</p>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function PlanPreview({ plan, fileName }: { plan: ImportPlan; fileName: string }) {
  const c = plan.counts;
  return (
    <div className="mt-4" aria-live="polite">
      <h3 className="text-sm font-semibold text-slate-900">Vista previa de «{fileName}»</h3>
      {plan.fileErrors.length > 0 ? (
        <div role="alert" className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">No se puede importar este archivo</p>
          <ul className="mt-1 list-disc pl-5">
            {plan.fileErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-lg border border-slate-200 p-2"><span className="num block text-lg font-bold">{c.total}</span>filas leídas</li>
            <li className="rounded-lg border border-brand-200 bg-brand-50 p-2"><span className="num block text-lg font-bold">{c.nuevo}</span>nuevas</li>
            <li className="rounded-lg border border-slate-200 p-2"><span className="num block text-lg font-bold">{c.sin_cambios + c.repetido_en_archivo}</span>ya importadas o repetidas</li>
            <li className="rounded-lg border border-amber-200 bg-amber-50 p-2"><span className="num block text-lg font-bold">{c.estado_actualizado}</span>cambios de estado</li>
            <li className="rounded-lg border border-red-200 bg-red-50 p-2"><span className="num block text-lg font-bold">{c.conflicto}</span>conflictos</li>
            <li className="rounded-lg border border-red-200 bg-red-50 p-2"><span className="num block text-lg font-bold">{c.errores}</span>filas con error</li>
          </ul>
          <p className="mt-2 text-xs text-slate-700">
            Período cubierto por las filas válidas:{" "}
            {plan.periodFrom && plan.periodTo ? `${formatDate(plan.periodFrom)} al ${formatDate(plan.periodTo)}` : "—"}. Cuentas:{" "}
            {plan.accounts.join(", ") || "—"}.
          </p>
          {plan.warnings.map((w) => (
            <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-amber-900">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {w}
            </p>
          ))}
          {plan.errors.length > 0 ? (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">Filas que no se importarán</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {plan.errors.map((e, i) => (
                  <li key={`${e.row}-${i}`}>
                    Fila {e.row}
                    {e.column ? ` (${e.column})` : ""}: {e.message}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">La fila 1 es el encabezado.</p>
            </div>
          ) : null}
          {plan.items.length > 0 ? (
            <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-200" tabIndex={0} role="region" aria-label="Filas válidas de la vista previa (desplazable)">
              <table className="w-full min-w-[36rem] text-left text-xs">
                <caption className="sr-only">Filas válidas y cómo se importarán</caption>
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Fila</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Resultado</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Id</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Fecha</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-semibold">Importe</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Estado</th>
                    <th scope="col" className="px-2 py-1.5 font-semibold">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plan.items.map((it) => (
                    <tr key={`${it.row}-${it.key}`}>
                      <td className="num px-2 py-1.5">{it.row}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block rounded-full border px-2 py-0.5 font-semibold ${KIND_LABEL[it.kind].className}`}>
                          {KIND_LABEL[it.kind].label}
                        </span>
                        {it.kind === "estado_actualizado" && it.existing ? (
                          <span className="block text-slate-600">
                            {it.existing.status} → {it.draft.status}
                          </span>
                        ) : null}
                        {it.kind === "conflicto" ? (
                          <span className="block text-red-800">
                            Cambia: {it.changedFields.map((f) => FIELD_LABELS[f]).join(", ")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 break-all">{it.draft.externalId}</td>
                      <td className="num px-2 py-1.5">{formatDate(it.draft.date)}</td>
                      <td className="px-2 py-1.5 text-right"><Money minor={it.draft.amountMinor} /></td>
                      <td className="px-2 py-1.5">{it.draft.status}</td>
                      <td className="px-2 py-1.5 break-words">{it.draft.reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" /> Nada se guarda hasta que confirmes.
          </p>
        </>
      )}
    </div>
  );
}
