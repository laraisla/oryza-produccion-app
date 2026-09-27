import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle, AlertTriangle } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useFeedback } from '@/hooks/useFeedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { buildPreview, commitImport, downloadTemplateCSV, downloadTemplateExcel, TEMPLATE_COLUMNS, type ImportPreview } from '@/services/importService';
import { friendlyMessage } from '@/services/errors';

export function ImportPage() {
  const { db, user } = useData();
  const { confirm, run, toast } = useFeedback();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [lineId, setLineId] = useState(db.lines[0]?.id ?? '');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);

  const load = async (file: File) => {
    lastFile.current = file;
    setLoading(true);
    try {
      setPreview(await buildPreview(file, db, lineId));
    } catch (e) {
      setPreview(null);
      toast({ kind: 'error', message: friendlyMessage(e) });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const valid = preview?.rows.filter((r) => !r.errors.length) ?? [];
  const invalid = preview?.rows.filter((r) => r.errors.length) ?? [];
  const dups = preview?.rows.filter((r) => r.duplicate) ?? [];
  const withWarn = valid.filter((r) => r.warnings.length);

  const doImport = async () => {
    if (!preview) return;
    const { ok } = await confirm({
      title: 'Confirmar importación',
      message: `Se importarán ${valid.length} registro(s) como “Aprobado (histórico)”.${invalid.length ? `\n${invalid.length} fila(s) con errores serán omitidas.` : ''}\nLa operación queda registrada en auditoría.`,
      confirmLabel: `Importar ${valid.length} registros`,
    });
    if (!ok) return;
    const n = await run(() => commitImport(preview, user));
    if (n !== undefined) {
      toast({ kind: 'success', message: `Se importaron ${n} registro(s).` });
      setPreview(null);
    }
  };

  const rows = preview ? (onlyIssues ? preview.rows.filter((r) => r.errors.length || r.warnings.length) : preview.rows) : [];

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Importar datos históricos" subtitle="Incorpora planillas CSV o Excel del sistema anterior. Nada se guarda hasta confirmar." />

      <div className="grid gap-5 lg:grid-cols-3 mb-5">
        <Card title="1. Descarga la plantilla" className="lg:col-span-1">
          <p className="text-sm text-slate-600 mb-3">Columnas esperadas (se aceptan sinónimos y mayúsculas/acentos indistintos):</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {TEMPLATE_COLUMNS.map((c) => (
              <code key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{c}</code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary btn-sm" onClick={downloadTemplateCSV}><Download size={14} /> Plantilla CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => run(downloadTemplateExcel)}><FileSpreadsheet size={14} /> Plantilla Excel</button>
          </div>
          <ul className="mt-4 text-xs text-slate-500 space-y-1">
            <li>• Fecha: DD/MM/AAAA o AAAA-MM-DD. Horas: HH:MM.</li>
            <li>• “Kg” es opcional si hay “Unidades” (y viceversa).</li>
            <li>• “MinutosParada” se importa como una parada sin clasificar.</li>
          </ul>
        </Card>
        <Card title="2. Selecciona el archivo" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end mb-4">
            <div>
              <label className="label" htmlFor="imp-line">Línea por defecto (filas sin columna “Linea”)</label>
              <select id="imp-line" className="input" value={lineId} onChange={(e) => setLineId(e.target.value)}>
                {db.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            {preview && lastFile.current && (
              <button className="btn btn-secondary" onClick={() => load(lastFile.current!)}>Revalidar</button>
            )}
          </div>
          <label
            htmlFor="imp-file"
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) load(f);
            }}
          >
            <Upload className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700">{loading ? 'Analizando archivo…' : 'Arrastra el archivo aquí o haz clic para seleccionarlo'}</span>
            <span className="text-xs text-slate-500">.csv o .xlsx · máximo 5 MB</span>
            <input ref={inputRef} id="imp-file" type="file" accept=".csv,.xlsx,.xls,.txt" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
        </Card>
      </div>

      {preview && (
        <Card
          title={`3. Vista previa · ${preview.fileName}`}
          subtitle="Revisa los resultados de la validación antes de confirmar."
          bodyClassName="p-0"
          actions={preview.missingColumns.length === 0 && (
            <button className="btn btn-primary" disabled={!valid.length} onClick={doImport}>
              <CheckCircle2 size={16} /> Importar {valid.length} registro(s)
            </button>
          )}
        >
          {preview.missingColumns.length > 0 ? (
            <div className="m-5 rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad-text">
              <p className="font-semibold">El archivo no tiene las columnas obligatorias:</p>
              <p className="mt-1">{preview.missingColumns.join(', ')}</p>
              <p className="mt-2 text-xs">Descarga la plantilla para ver el formato esperado.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-4 border-b border-slate-100">
                <div><div className="text-xs text-slate-500">Filas leídas</div><div className="text-xl font-semibold">{preview.rows.length}</div></div>
                <div><div className="text-xs text-slate-500">Válidas</div><div className="text-xl font-semibold text-ok-text">{valid.length}</div></div>
                <div><div className="text-xs text-slate-500">Con errores</div><div className="text-xl font-semibold text-bad-text">{invalid.length}</div></div>
                <div><div className="text-xs text-slate-500">Duplicadas</div><div className="text-xl font-semibold text-warn-text">{dups.length}</div></div>
              </div>
              {(preview.unknownColumns.length > 0 || withWarn.length > 0) && (
                <div className="px-5 py-3 text-xs text-slate-600 border-b border-slate-100 space-y-1">
                  {preview.unknownColumns.length > 0 && <p>Columnas ignoradas: {preview.unknownColumns.join(', ')}</p>}
                  {withWarn.length > 0 && <p>{withWarn.length} fila(s) válidas con advertencias.</p>}
                </div>
              )}
              <div className="px-5 py-2 flex justify-end">
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Mostrar solo filas con errores o advertencias
                </label>
              </div>
              <div className="overflow-x-auto max-h-[480px]">
                <table className="table-base">
                  <thead className="sticky top-0">
                    <tr><th>Fila</th><th>Estado</th><th>Fecha</th><th>Turno</th><th>Responsable</th><th>Producto</th><th>Lote</th><th>Presentación</th><th className="text-right">Unidades</th><th>Horario</th><th>Detalle</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNumber} className={r.errors.length ? 'bg-bad-bg/30' : ''}>
                        <td className="tabular-nums">{r.rowNumber}</td>
                        <td>
                          {r.errors.length ? <XCircle size={16} className="text-bad" aria-label="Con errores" /> : r.warnings.length ? <AlertTriangle size={16} className="text-warn-text" aria-label="Con advertencias" /> : <CheckCircle2 size={16} className="text-ok" aria-label="Válida" />}
                        </td>
                        <td>{r.values.Fecha}</td>
                        <td>{r.values.Turno}</td>
                        <td>{r.values.Responsable}</td>
                        <td>{r.values.Producto}</td>
                        <td className="font-mono text-xs">{r.values.Lote}</td>
                        <td>{r.values.Presentacion}</td>
                        <td className="num">{r.record?.units ?? r.values.Unidades}</td>
                        <td className="tabular-nums">{r.values.HoraInicio}–{r.values.HoraFin}</td>
                        <td className="whitespace-normal min-w-[260px] text-xs">
                          {r.errors.map((e, i) => <div key={i} className="text-bad-text">{e}</div>)}
                          {r.warnings.map((w, i) => <div key={i} className="text-warn-text">{w}</div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
