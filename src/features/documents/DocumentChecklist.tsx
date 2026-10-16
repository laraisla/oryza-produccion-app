import { Download, FileUp, History, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { DocumentStatusBadge, VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Hash, Progress } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { can } from '@/data/access';
import { byId } from '@/data/derive';
import { fileSha256, loadFile, saveFile } from '@/data/fileStore';
import type { DocumentVersion, OperationDocument, ResponsibleParty } from '@/data/model';
import { userName, visibleDocuments } from '@/data/selectors';
import { addDocument, ALLOWED_MIME, changeDocumentStatus, MAX_FILE_BYTES, uploadDocumentVersion } from '@/data/services/operations';
import { todayISO, useApp, useCurrentUser, useDb } from '@/data/store';
import { DOCUMENT_STATUS, DOCUMENT_TYPES, type DocumentStatus, type DocumentType } from '@/domain/catalogs';
import { allowedTransitions, documentProgress, DOCUMENTS_DISCLAIMER } from '@/domain/documents';
import { fmtDate, fmtDateTime, fmtNum } from '@/domain/format';

const RESPONSIBLE: Record<ResponsibleParty, string> = {
  seller: 'Vendedor',
  buyer: 'Comprador',
  forwarder: 'Agente / naviera',
  customs_broker: 'Despachante',
  bank: 'Banco',
  laboratory: 'Laboratorio',
};

export async function downloadVersion(version: DocumentVersion): Promise<boolean> {
  let blob: Blob | undefined;
  if (version.storageKey) blob = await loadFile(version.storageKey);
  else if (version.demoContent) blob = new Blob([version.demoContent], { type: version.mimeType });
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = version.fileName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function useUploader() {
  const run = useApp((s) => s.run);
  const notify = useApp((s) => s.notify);
  return async (doc: OperationDocument, file: File, note?: string) => {
    if (file.size > MAX_FILE_BYTES) {
      notify({ kind: 'error', title: 'El archivo supera 10 MB' });
      return null;
    }
    const mimeType = file.type || (file.name.endsWith('.csv') ? 'text/csv' : '');
    if (!ALLOWED_MIME.includes(mimeType)) {
      notify({ kind: 'error', title: `Tipo de archivo no admitido (${mimeType || 'desconocido'})`, detail: 'PDF, imágenes, CSV, TXT, JSON, XLSX o DOCX.' });
      return null;
    }
    const sha256 = await fileSha256(file);
    const storageKey = crypto.randomUUID();
    try {
      await saveFile(storageKey, file);
    } catch {
      notify({ kind: 'error', title: 'No se pudo guardar el archivo en este navegador' });
      return null;
    }
    return run((d, ctx) => uploadDocumentVersion(d, ctx, doc.id, { fileName: file.name, mimeType, sizeBytes: file.size, sha256, storageKey }, note), `Versión cargada · SHA-256 ${sha256.slice(0, 12)}…`);
  };
}

function StatusChanger({ doc, onClose }: { doc: OperationDocument; onClose: () => void }) {
  const run = useApp((s) => s.run);
  const user = useCurrentUser();
  const options = allowedTransitions(doc.status).filter((s) => (s === 'verified' || s === 'observed' ? can(user, 'document.verify') : true));
  const [to, setTo] = useState<DocumentStatus>(options[0] ?? doc.status);
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={`Cambiar estado: ${doc.name}`}
        description="Cargar un archivo no implica verificación ni autorización oficial."
        footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!options.length} onClick={() => { if (run((d, ctx) => changeDocumentStatus(d, ctx, doc.id, to, note), 'Estado actualizado')) onClose(); }}>Guardar</Button></>}
      >
        {options.length === 0 ? <Alert tone="info">No hay transiciones disponibles para tu rol.</Alert> : (
          <div className="space-y-3">
            <Field label="Nuevo estado">{(p) => <Select {...p} value={to} onChange={(e) => setTo(e.target.value as DocumentStatus)}>{options.map((s) => <option key={s} value={s}>{DOCUMENT_STATUS[s]}</option>)}</Select>}</Field>
            <Field label={to === 'observed' ? 'Observación' : to === 'not_applicable' ? 'Justificación' : 'Nota'} required={to === 'observed' || to === 'not_applicable'}>
              {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            {(to === 'submitted' || to === 'verified') && doc.currentVersion === 0 ? <Alert tone="warning">Primero cargá el archivo del documento.</Alert> : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VersionsDialog({ doc, onClose }: { doc: OperationDocument; onClose: () => void }) {
  const db = useDb();
  const notify = useApp((s) => s.notify);
  const versions = db.documentVersions.filter((v) => v.documentId === doc.id).sort((a, b) => b.version - a.version);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" title={`Versiones: ${doc.name}`} description="Cada versión conserva su huella SHA-256; las anteriores no se eliminan.">
        {versions.length === 0 ? <p className="text-sm text-slate-500">Sin archivos cargados.</p> : (
          <Table>
            <THead><TR><TH>Versión</TH><TH>Archivo</TH><TH>SHA-256</TH><TH>Cargado</TH><TH /></TR></THead>
            <TBody>
              {versions.map((v) => (
                <TR key={v.id}>
                  <TD>v{v.version}{v.demoContent ? <div><Badge tone="warning">Demo</Badge></div> : null}</TD>
                  <TD className="text-xs">{v.fileName}<br /><span className="text-slate-500">{fmtNum(v.sizeBytes / 1024, 1)} KB · {v.mimeType}</span></TD>
                  <TD><Hash value={v.sha256} /></TD>
                  <TD className="text-xs">{fmtDateTime(v.uploadedAt)}<br />{userName(db, v.uploadedBy)}</TD>
                  <TD className="text-right"><Button size="sm" variant="secondary" onClick={async () => { if (!(await downloadVersion(v))) notify({ kind: 'error', title: 'Archivo no disponible en este navegador', detail: 'Los archivos se guardan localmente en el navegador que los cargó.' }); }}><Download /> Descargar</Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddDocumentDialog({ operationId, onClose }: { operationId: string; onClose: () => void }) {
  const run = useApp((s) => s.run);
  const user = useCurrentUser();
  const [form, setForm] = useState({ documentType: 'other' as DocumentType, name: '', responsibleParty: (user.role === 'buyer' ? 'buyer' : 'seller') as ResponsibleParty, dueDate: '', issuer: '', notes: '', sharedWithCounterparty: true, isFinancial: false });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Agregar documento al expediente" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!form.name.trim()} onClick={() => { if (run((d, ctx) => addDocument(d, ctx, operationId, { ...form, dueDate: form.dueDate || null }), 'Documento agregado')) onClose(); }}>Agregar</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tipo">{(p) => <Select {...p} value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value as DocumentType })}>{Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label="Nombre" required>{(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Responsable">{(p) => <Select {...p} value={form.responsibleParty} onChange={(e) => setForm({ ...form, responsibleParty: e.target.value as ResponsibleParty })}>{Object.entries(RESPONSIBLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          <Field label="Fecha límite">{(p) => <Input {...p} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />}</Field>
          <Field label="Emisor">{(p) => <Input {...p} value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />}</Field>
          <Field label="Observaciones">{(p) => <Input {...p} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
          <Checkbox checked={form.sharedWithCounterparty} disabled={form.isFinancial} onChange={(v) => setForm({ ...form, sharedWithCounterparty: v })} label="Compartir con la contraparte" />
          {can(user, 'finance.manage') ? <Checkbox checked={form.isFinancial} onChange={(v) => setForm({ ...form, isFinancial: v, sharedWithCounterparty: v ? false : form.sharedWithCounterparty })} label="Documento financiero (privado)" /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentChecklist({ operationId }: { operationId: string }) {
  const db = useDb();
  const user = useCurrentUser();
  const upload = useUploader();
  const op = byId(db.operations, operationId)!;
  const docs = visibleDocuments(db, user, operationId);
  const progress = documentProgress(docs);
  const asOf = todayISO();
  const [changing, setChanging] = useState<OperationDocument | null>(null);
  const [history, setHistory] = useState<OperationDocument | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<OperationDocument | null>(null);

  return (
    <Card>
      <CardHeader
        title={`Documentación · ${op.code}`}
        description="Comerciales, logísticos, aduaneros, sanitarios, del comprador y financieros"
        actions={can(user, 'document.manage') ? <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus /> Agregar documento</Button> : undefined}
      />
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-64"><Progress value={progress.pct} tone={progress.pct >= 80 ? 'success' : 'petrol'} label="Avance documental" /></div>
          <p className="text-xs text-slate-600">{progress.pct} % · {progress.verified} verificados · {progress.submitted} presentados · {progress.inPreparation} en preparación · {progress.pending} pendientes · {progress.observed} observados</p>
        </div>
        <Alert tone="warning">{DOCUMENTS_DISCLAIMER}</Alert>
      </CardContent>
      <Table>
        <THead><TR><TH>Documento</TH><TH>Responsable</TH><TH>Fuente del requisito</TH><TH>Fecha límite</TH><TH>Versión</TH><TH>Estado</TH><TH /></TR></THead>
        <TBody>
          {docs.map((d) => {
            const overdue = d.dueDate && d.dueDate < asOf && !['verified', 'submitted', 'not_applicable'].includes(d.status);
            const owner = d.organizationId === user.organizationId;
            return (
              <TR key={d.id}>
                <TD>
                  <p className="font-medium text-slate-800">{d.name}</p>
                  <p className="text-[11px] text-slate-500">{DOCUMENT_TYPES[d.documentType]}{d.issuer ? ` · emite ${d.issuer}` : ''}</p>
                  {d.observation ? <p className="text-[11px] font-medium text-amber-700">Observación: {d.observation}</p> : null}
                  {d.notes ? <p className="text-[11px] text-slate-500">{d.notes}</p> : null}
                </TD>
                <TD className="text-xs">{RESPONSIBLE[d.responsibleParty]}{d.isFinancial ? <div><Badge tone="outline">Financiero</Badge></div> : null}</TD>
                <TD className="max-w-[240px] text-xs">{d.requirementSource ?? '—'}{d.requirementStatus ? <div className="mt-1"><VerificationBadge status={d.requirementStatus} /></div> : null}</TD>
                <TD className={`text-xs ${overdue ? 'font-semibold text-red-600' : ''}`}>{fmtDate(d.dueDate)}{overdue ? ' · vencido' : ''}</TD>
                <TD className="text-xs">{d.currentVersion ? `v${d.currentVersion}` : '—'}</TD>
                <TD><DocumentStatusBadge status={d.status} /></TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    {owner && can(user, d.isFinancial ? 'finance.manage' : 'document.manage') ? (
                      <Button size="sm" variant="ghost" onClick={() => { setTarget(d); fileInput.current?.click(); }}><FileUp /> Cargar</Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => setHistory(d)}><History /> Versiones</Button>
                    {owner || can(user, 'document.verify') ? <Button size="sm" variant="secondary" onClick={() => setChanging(d)}>Estado</Button> : null}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.json,.xlsx,.docx"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file && target) await upload(target, file);
          setTarget(null);
        }}
      />
      {changing ? <StatusChanger doc={changing} onClose={() => setChanging(null)} /> : null}
      {history ? <VersionsDialog doc={history} onClose={() => setHistory(null)} /> : null}
      {adding ? <AddDocumentDialog operationId={operationId} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}
