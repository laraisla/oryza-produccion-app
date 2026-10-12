"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, FileJson, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requireDb, useCobro } from "@/components/cobro-provider";
import { downloadText } from "@/components/download";
import { useNotice } from "@/components/notices";
import { AsyncButton, ConfirmDialog, ErrorBox, FileInput, Loading, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/domain/dates";
import { BACKUP_MAX_BYTES, checkBackupText, exportBackup, restoreBackup, type BackupFile } from "@/storage/backup";
import { deleteAppDatabase } from "@/storage/db";
import { clearAll, isEmpty, loadDemo, loadHistory, resetDemo } from "@/storage/repository";

type Pending = "reset" | "delete" | "restore" | null;

export default function DataPage() {
  const { ev, data, db, loadError, reopen } = useCobro();
  const { notify } = useNotice();
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [restoreFile, setRestoreFile] = useState<BackupFile | null>(null);
  const [restoreProblems, setRestoreProblems] = useState<string[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const history = useLiveQuery(async () => (db ? loadHistory(db, 100) : []), [db]);

  if (loadError) return <ErrorBox title="No se pudieron leer los datos locales">{loadError}</ErrorBox>;
  if (!ev || !data) return <Loading />;

  const counts = `${data.orders.length} pedidos, ${data.claims.length} declaraciones, ${data.movements.length} movimientos, ${data.allocations.filter((a) => a.status === "vigente").length} asignaciones vigentes`;

  return (
    <>
      <PageHeader
        title="Datos y límites"
        description="Datos guardados solo en este navegador (IndexedDB). No se sincronizan entre dispositivos y pueden borrarse si limpiás los datos del sitio."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-6" aria-labelledby="demo-t">
          <h2 id="demo-t" className="section-title">Demostración</h2>
          <p className="mt-1 text-sm text-slate-700">Ahora: {counts}.</p>
          <p className="mt-1 text-sm text-slate-700">
            El ejemplo carga entradas sintéticas (pedidos, declaraciones y un CSV) por los mismos caminos que usa una
            persona. Los resultados los calcula el motor.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <AsyncButton
              className="btn-secondary"
              onClick={async () => {
                try {
                  if (!(await isEmpty(requireDb(db)))) {
                    notify("error", "Ya hay datos. Usá «Reiniciar demostración» para reemplazarlos.");
                    return;
                  }
                  await loadDemo(requireDb(db));
                  notify("ok", "Ejemplo cargado.");
                } catch (e) {
                  notify("error", (e as Error).message);
                }
              }}
            >
              Cargar ejemplo
            </AsyncButton>
            <button type="button" className="btn-secondary" onClick={() => setPending("reset")}>
              <RotateCcw aria-hidden className="size-4" /> Reiniciar demostración
            </button>
          </div>
        </section>

        <section className="card p-4 sm:p-6" aria-labelledby="respaldo-t">
          <h2 id="respaldo-t" className="section-title">Exportar y restaurar</h2>
          <p className="mt-1 text-sm text-slate-700">
            Exportá un JSON con los datos del prototipo. No es un comprobante ni un registro contable.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <AsyncButton
              className="btn-secondary"
              onClick={async () => {
                try {
                  const backup = await exportBackup(requireDb(db));
                  const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
                  downloadText(`cobro-claro-datos-${stamp}.json`, JSON.stringify(backup, null, 2), "application/json");
                  notify("ok", "Exportación generada. Revisá la carpeta de descargas.");
                } catch (e) {
                  notify("error", (e as Error).message);
                }
              }}
            >
              <Download aria-hidden className="size-4" /> Exportar datos
            </AsyncButton>
          </div>
          <h3 className="field-label mt-4">Restaurar desde un JSON exportado</h3>
          <FileInput
            key={inputKey}
            label="Elegir respaldo JSON"
            accept="application/json,.json"
            variant="secondary"
            onFile={async (f) => {
              setRestoreProblems([]);
              setRestoreFile(null);
              if (!f) return;
              if (f.size > BACKUP_MAX_BYTES) {
                setRestoreProblems([`El archivo supera ${BACKUP_MAX_BYTES / 1_000_000} MB.`]);
                return;
              }
              const check = checkBackupText(await f.text());
              if (!check.ok) setRestoreProblems(check.problems);
              else {
                setRestoreFile(check.file);
                setPending("restore");
              }
            }}
          />
          <p className="field-hint">Se valida la estructura y la coherencia (asignaciones, importes, referencias) antes de reemplazar.</p>
          {restoreProblems.length > 0 ? (
            <div role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">El archivo no se puede restaurar. No se cambió nada.</p>
              <ul className="mt-1 list-disc pl-5">
                {restoreProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="card border-red-200 p-4 sm:p-6 lg:col-span-2" aria-labelledby="borrar-t">
          <h2 id="borrar-t" className="section-title">Eliminar datos locales</h2>
          <p className="mt-1 text-sm text-slate-700">
            Borra la base de datos de COBRO CLARO en este navegador. No toca datos de otros sitios ni de otras
            aplicaciones. No se puede deshacer: exportá antes si querés conservarlos.
          </p>
          <button type="button" className="btn-danger mt-4" onClick={() => setPending("delete")}>
            <Trash2 aria-hidden className="size-4" /> Eliminar datos locales
          </button>
        </section>
      </div>

      <section id="limites" className="card mt-8 scroll-mt-6 p-4 sm:p-6" aria-labelledby="limites-t">
        <h2 id="limites-t" className="section-title">Qué hace y qué no</h2>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <h3 className="font-semibold text-emerald-900">Implementado</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
              <li>Pedidos desde formulario o desde un mensaje (asistencia por reglas), con revisión obligatoria.</li>
              <li>Importación de un CSV propio con validación por fila, deduplicación y conflictos.</li>
              <li>Propuestas por referencia explícita; aprobación o rechazo humano; pagos parciales y varios movimientos.</li>
              <li>Explicación de cada resultado y mensajes de consulta editables.</li>
              <li>Historial local, exportación y restauración validada.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-amber-900">Simulado o acotado</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
              <li>Todos los datos de la demostración son sintéticos.</li>
              <li>«Acreditado» es lo que dice el archivo importado, no una consulta al banco.</li>
              <li>Un comercio por navegador; sin usuarios, sin sincronización y sin respaldo automático.</li>
              <li>El historial es local y puede modificarse técnicamente; no es prueba legal.</li>
              <li>La extracción de mensajes por reglas solo entiende formatos simples.</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-red-900">Requeriría una integración autorizada</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
              <li>Obtener movimientos directamente de un banco o billetera (con autorización y credenciales del titular).</li>
              <li>Autenticar el origen de un archivo o certificar saldos y acreditaciones.</li>
              <li>Recibir mensajes de WhatsApp automáticamente o enviarlos.</li>
              <li>Devoluciones, transferencias, facturación o multimoneda: fuera del alcance.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="hist-t">
        <h2 id="hist-t" className="section-title">Historial local</h2>
        <p className="mt-1 text-sm text-slate-700">Últimas 100 acciones. Puede modificarse técnicamente; no es inmutable ni prueba legal.</p>
        {!history || history.length === 0 ? (
          <p className="card mt-3 p-4 text-sm text-slate-700">Sin entradas.</p>
        ) : (
          <ol className="card mt-3 divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.seq} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:gap-4">
                <span className="num shrink-0 text-xs text-slate-600 sm:w-36 sm:pt-0.5">{formatDateTime(h.at)}</span>
                <span>
                  {h.summary}
                  {h.reason ? <span className="block text-xs text-slate-600">Motivo: {h.reason}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={pending === "reset"}
        title="Reiniciar demostración"
        confirmLabel="Reiniciar"
        danger
        onClose={() => setPending(null)}
        onConfirm={async () => {
          try {
            await resetDemo(requireDb(db));
            notify("ok", "Demostración reiniciada con el ejemplo sintético.");
            setPending(null);
          } catch (e) {
            notify("error", (e as Error).message);
          }
        }}
      >
        Se borran los datos actuales de COBRO CLARO en este navegador ({counts}) y se vuelve a cargar el ejemplo.
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === "delete"}
        title="Eliminar datos locales"
        confirmLabel="Eliminar"
        danger
        onClose={() => setPending(null)}
        onConfirm={async () => {
          try {
            const current = requireDb(db);
            await clearAll(current);
            await deleteAppDatabase(current);
            notify("ok", "Datos de COBRO CLARO eliminados de este navegador.");
            setPending(null);
            reopen(); // abre una base nueva y vacía
            router.push("/");
          } catch (e) {
            notify("error", (e as Error).message);
          }
        }}
      >
        Se elimina la base local de COBRO CLARO ({counts}). No se puede deshacer.
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === "restore" && restoreFile !== null}
        title="Restaurar datos"
        confirmLabel="Reemplazar con el respaldo"
        danger
        onClose={() => {
          setPending(null);
          setRestoreFile(null);
          setInputKey((k) => k + 1);
        }}
        onConfirm={async () => {
          try {
            await restoreBackup(requireDb(db), restoreFile!);
            notify("ok", "Datos restaurados.");
            setPending(null);
            setRestoreFile(null);
            setInputKey((k) => k + 1);
          } catch (e) {
            notify("error", (e as Error).message);
          }
        }}
      >
        <p>
          Se reemplazan los datos actuales ({counts}) por los del respaldo exportado el{" "}
          {restoreFile ? formatDateTime(restoreFile.exportedAt) : ""}: {restoreFile?.data.orders.length ?? 0} pedidos y{" "}
          {restoreFile?.data.movements.length ?? 0} movimientos.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <FileJson aria-hidden className="size-4" /> El archivo pasó la validación de estructura e integridad.
        </p>
      </ConfirmDialog>
    </>
  );
}
