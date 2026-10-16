import { ExternalLink, Landmark } from 'lucide-react';
import { VerificationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { byId } from '@/data/derive';
import { countryName } from '@/data/selectors';
import { useDb } from '@/data/store';
import { DOCUMENT_TYPES, REQUIREMENT_CATEGORIES } from '@/domain/catalogs';
import { applicableRequirements, DOCUMENTS_DISCLAIMER } from '@/domain/documents';
import { fmtMoney } from '@/domain/format';
import type { ScenarioDraft } from '../useScenarioDraft';
import { describeAmount } from './CostLinesSection';

export function RequirementsPreview({ draft }: { draft: ScenarioDraft }) {
  const db = useDb();
  const { scenario: s } = draft;
  const product = byId(db.products, s.productId);
  const request = byId(db.requests, s.requestId);
  if (!s.destinationCountry || !s.buyerOrganizationId) {
    return <Alert tone="info">Elegir comprador y país de destino para ver la documentación sugerida.</Alert>;
  }
  const rules = applicableRequirements(db.requirements, {
    country: s.destinationCountry,
    ncm: s.customs.ncm || product?.ncm,
    processing: product?.processing ?? 'white',
    transportMode: s.commercial.transportMode,
    paymentMethod: s.finance.paymentMethod,
    buyerOrganizationId: s.buyerOrganizationId,
  });
  return (
    <div className="space-y-3">
      <Alert tone="warning">{DOCUMENTS_DISCLAIMER} Un requisito sin verificación vigente se muestra como "Pendiente de verificación".</Alert>
      <Table>
        <THead><TR><TH>Documento</TH><TH>Tipo de exigencia</TH><TH>Emisor / responsable</TH><TH>Condición</TH><TH>Fuente</TH><TH>Estado</TH></TR></THead>
        <TBody>
          {rules.map((r) => (
            <TR key={r.id}>
              <TD className="font-medium">{r.name}<p className="text-[11px] font-normal text-slate-500">{DOCUMENT_TYPES[r.documentType]}</p></TD>
              <TD><Badge tone={r.category.startsWith('official') ? 'petrol' : r.category === 'buyer' ? 'warning' : 'neutral'}>{REQUIREMENT_CATEGORIES[r.category]}</Badge></TD>
              <TD className="text-xs">{r.issuer}</TD>
              <TD className="max-w-[260px] text-xs text-slate-600">{r.requiredIf ?? r.description}</TD>
              <TD className="text-xs">{r.sourceUrl ? <a className="inline-flex items-center gap-1 text-petrol-700 hover:underline" href={r.sourceUrl} target="_blank" rel="noreferrer">{r.sourceName} <ExternalLink className="size-3" /></a> : r.sourceName}{r.verifiedAt ? <p className="text-slate-500">Verificado {r.verifiedAt}</p> : null}</TD>
              <TD><VerificationBadge status={r.verificationStatus} /></TD>
            </TR>
          ))}
          {(request?.requiredCertifications ?? []).filter((c) => !rules.some((r) => r.name.toLowerCase().includes(c.toLowerCase()))).map((c) => (
            <TR key={c}>
              <TD className="font-medium">Certificación: {c}</TD>
              <TD><Badge tone="warning">Exigencia del comprador</Badge></TD>
              <TD className="text-xs">A definir</TD>
              <TD className="text-xs text-slate-600">Informada en {request?.code}; no es un requisito normativo.</TD>
              <TD className="text-xs">Solicitud del comprador</TD>
              <TD><VerificationBadge status="verified" label="Informada por el comprador" /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <p className="text-[11px] text-slate-500">Reglas evaluadas para {countryName(s.destinationCountry)} · NCM {s.customs.ncm || product?.ncm || 's/d'} · transporte {s.commercial.transportMode} · pago {s.finance.paymentMethod}. La regla no depende solo del país.</p>
    </div>
  );
}

export function CustomsSection({ draft }: { draft: ScenarioDraft }) {
  const { scenario: s, update, evaluation } = draft;
  const customsLines = evaluation.result.lines.filter((l) => l.stage === 'customs');
  const setCustoms = (patch: Partial<typeof s.customs>) => update({ customs: { ...s.customs, ...patch } });
  return (
    <Card>
      <CardHeader title="Aduana" description="Información arancelaria, gastos aduaneros y requisitos documentales" icon={<Landmark />} />
      <CardContent>
        <Tabs defaultValue="costos">
          <TabsList>
            <TabsTrigger value="costos">A. Costos aduaneros</TabsTrigger>
            <TabsTrigger value="docs">B. Documentación</TabsTrigger>
          </TabsList>
          <TabsContent value="costos" className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="NCM">{(p) => <Input {...p} value={s.customs.ncm} onChange={(e) => setCustoms({ ncm: e.target.value })} />}</Field>
              <Field label="Descripción arancelaria" className="sm:col-span-2">{(p) => <Input {...p} value={s.customs.ncmDescription} onChange={(e) => setCustoms({ ncmDescription: e.target.value })} />}</Field>
              <Field label="Fuente normativa" className="sm:col-span-2">{(p) => <Input {...p} value={s.customs.normativeSource} onChange={(e) => setCustoms({ normativeSource: e.target.value })} />}</Field>
              <Field label="Fecha de verificación">{(p) => <Input {...p} type="date" value={s.customs.verifiedAt ?? ''} onChange={(e) => setCustoms({ verifiedAt: e.target.value || null })} />}</Field>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between"><p className="text-sm font-medium">Derechos de exportación</p><VerificationBadge status={s.customs.exportDutyStatus} /></div>
                <Textarea aria-label="Nota sobre derechos de exportación" className="mt-2" value={s.customs.exportDutyNote} onChange={(e) => setCustoms({ exportDutyNote: e.target.value })} />
                <p className="mt-1 text-[11px] text-slate-500">No se aplica ninguna alícuota sin posición arancelaria, base y norma verificadas. Para incluirla, activar el concepto "Derechos de exportación" con su fuente.</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between"><p className="text-sm font-medium">Reintegros potenciales</p><VerificationBadge status={s.customs.refundStatus} /></div>
                <Textarea aria-label="Nota sobre reintegros" className="mt-2" value={s.customs.refundNote} onChange={(e) => setCustoms({ refundNote: e.target.value })} />
                <p className="mt-1 text-[11px] text-slate-500">Un reintegro es un ingreso potencial: no se descuenta del precio hasta verificarlo.</p>
              </div>
            </div>
            <Alert tone="info" title="Distinción de conceptos">
              Tributos (p. ej., derechos de exportación) · gastos por servicios (despachante, certificados, inspecciones) · reintegros potenciales · créditos fiscales · impuestos generales de la empresa. IVA, Ganancias o Ingresos Brutos no se aplican como porcentaje del valor exportado sin una regla legal específica confirmada.
            </Alert>
            <Table>
              <THead><TR><TH>Concepto aduanero</TH><TH>Unidad</TH><TH className="text-right">Importe</TH><TH>Estado</TH><TH>Fuente</TH></TR></THead>
              <TBody>
                {customsLines.map((l) => {
                  const input = s.lines.find((x) => x.id === l.id)!;
                  return (
                    <TR key={l.id} className={l.included ? '' : 'opacity-60'}>
                      <TD className="font-medium">{l.name}{!l.included ? <p className="text-[11px] text-amber-700">{l.exclusionReason}</p> : null}</TD>
                      <TD className="text-xs">{describeAmount(input)}</TD>
                      <TD className="num text-right">{l.included ? fmtMoney(l.amount, s.commercial.currency) : '—'}</TD>
                      <TD><VerificationBadge status={l.effectiveStatus} /></TD>
                      <TD className="text-[11px] text-slate-500">{l.source}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TabsContent>
          <TabsContent value="docs">
            <RequirementsPreview draft={draft} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
