import { Link, createFileRoute } from "@tanstack/react-router";
import { Blocks, FileCheck2, History } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtTn } from "@/data/demo";
import { useAppStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";
import { Card, DemoBadge, PageHeader, StatusBadge } from "@/components/ui-kit";
import { retraso, useSeccionAnimada } from "@/lib/animacion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvisoTestnet, EvidenciaAcuerdo } from "@/components/stellar/evidencia";
import { EvidenciaDvP } from "@/components/evidencia-stellar";
import { esHashValido, urlTx } from "@/lib/horizon";

export const Route = createFileRoute("/trazabilidad")({
  validateSearch: (s: Record<string, unknown>): { op?: string | undefined } => ({ op: typeof s["op"] === "string" ? (s["op"] as string) : undefined }),
  head: () => pageHead("Trazabilidad", "Expediente digital de lotes y operaciones con historial y evidencias, y verificación del acuerdo en Stellar Testnet (contrato Soroban, activo de prueba)."),
  component: Trazabilidad,
});

function Trazabilidad() {
  const { state } = useAppStore();
  const { op: opInicial } = Route.useSearch();
  const [opId, setOpId] = useState(opInicial ?? state.operaciones[0]?.id ?? "");
  useEffect(() => { if (opInicial) setOpId(opInicial); }, [opInicial]);
  useSeccionAnimada("trazabilidad");
  const op = state.operaciones.find((o) => o.id === opId);
  const acuerdo = op?.acuerdoStellarId !== undefined ? state.acuerdosStellar.find((a) => a.id === op.acuerdoStellarId) : undefined;

  const historial = op ? [
    { fecha: "2026-09-01", evento: `Cotización ${op.cotizacionId ?? ""} aceptada por el comprador${op.solicitudId ? ` (solicitud ${op.solicitudId})` : ""}`.replace("  ", " "), actor: op.comprador },
    { fecha: "2026-09-05", evento: "Análisis de calidad cargado (quebrado, humedad)", actor: "Laboratorio (demo)" },
    { fecha: "2026-09-12", evento: "Lote asignado y precintado", actor: op.vendedor },
    ...(op.hitoActual >= 4 ? [{ fecha: op.fechaProgramada, evento: `Embarque realizado en ${op.puertoSalida}`, actor: "Naviera (demo)" }] : []),
    ...(op.hitoActual >= 6 ? [{ fecha: "2026-10-10", evento: "Cobro registrado — diferencia por comisión en revisión", actor: "Exportador" }] : []),
  ] : [];

  return (
    <div>
      <PageHeader titulo="Trazabilidad digital" descripcion="Expediente de cada operación con documentos, confirmaciones e historial. Las operaciones con acuerdo en Stellar Testnet muestran su estado verificado en la red." acciones={<DemoBadge />} />
      <Card className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Operación:</span>
        <select value={opId} onChange={(e) => setOpId(e.target.value)} className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm sm:w-auto">
          {state.operaciones.map((o) => <option key={o.id} value={o.id}>{o.id} — {o.comprador}</option>)}
        </select>
      </Card>

      {op && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild><Link to="/operaciones" search={{ op: op.id }}>Operación {op.id}</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/documentacion" search={{ op: op.id }}>Checklist documental</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/conciliacion" search={{ op: op.id }}>Conciliación</Link></Button>
        </div>
      )}
      {op && (
        <Tabs defaultValue="expediente">
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="expediente">Expediente</TabsTrigger>
            <TabsTrigger value="blockchain">Verificación blockchain</TabsTrigger>
            <TabsTrigger value="dvp">Liquidaciones DvP (AgroFlow)</TabsTrigger>
          </TabsList>

          <TabsContent value="expediente" className="mt-4">
            <div className="am-escalonar grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-1">
                <h3 className="mb-3 text-sm font-semibold">Datos del lote</h3>
                <dl className="space-y-2 text-sm">
                  {[["Solicitud → cotización → operación", op.cotizacionId ? `${op.solicitudId} → ${op.cotizacionId} → ${op.id}` : op.id], ["Identificador de lote", op.lotes ? op.lotes.map((l) => `${l.loteId} (${fmtTn(l.tn)})`).join(" + ") : `LT-${op.id.slice(-3)}-DEMO`], ["Proveedor", op.vendedor], ["Comprador", op.comprador], ["Producto", op.producto], ["Cantidad", fmtTn(op.cantidadContratadaTn)], ["Características", "Quebrado ≤ 5% · Humedad ≤ 13% (según análisis demo)"]].map(([k, v]) => (
                    <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
                  ))}
                </dl>
              </Card>
              <Card>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-success" />Documentos y confirmaciones</h3>
                <ul className="am-escalonar space-y-2 text-sm" style={retraso(250)}>
                  {["Factura comercial", "Análisis de calidad", "Certificado fitosanitario", "Packing list", "Bill of Lading"].map((d, i) => (
                    <li key={d} className="flex items-center justify-between"><span>{d}</span><StatusBadge tono={i < op.hitoActual - 1 ? "success" : "warning"}>{i < op.hitoActual - 1 ? "Confirmado" : "Pendiente"}</StatusBadge></li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-info" />Historial de cambios</h3>
                <ol className="am-escalonar space-y-3 border-l-2 border-border pl-4" style={retraso(300)}>
                  {historial.map((h, i) => (
                    <li key={i}><p className="text-xs text-muted-foreground">{h.fecha} · {h.actor}</p><p className="text-sm">{h.evento}</p></li>
                  ))}
                </ol>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="dvp" className="mt-4 space-y-4">
            <EvidenciaDvP />
            {state.acuerdosStellar.some((a) => a.origen === "app" && a.transacciones.length > 0) && (
              <Card>
                <h3 className="mb-2 text-sm font-semibold">Hashes de acuerdos creados desde esta app (Soroban, testnet)</h3>
                <ul className="space-y-1 text-xs">
                  {state.acuerdosStellar.filter((a) => a.origen === "app").flatMap((a) => a.transacciones.map((t) => ({ a, t }))).map(({ a, t }) => (
                    <li key={t.hash} className="flex flex-wrap gap-2">
                      <span className="text-muted-foreground">Acuerdo #{a.id} · {t.etapa}</span>
                      {esHashValido(t.hash) ? <a className="break-all font-mono text-primary underline" href={urlTx(t.hash)} target="_blank" rel="noreferrer">{t.hash}</a> : <span className="text-destructive">hash inválido</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="blockchain" className="mt-4">
            {acuerdo ? (
              <EvidenciaAcuerdo acuerdo={acuerdo} />
            ) : (
              <Card>
                <h3 className="mb-3 flex items-center gap-2 text-base font-semibold"><Blocks className="h-5 w-5 text-primary" />Verificación blockchain</h3>
                <AvisoTestnet className="mb-4" />
                <p className="text-sm text-muted-foreground">
                  Esta operación no tiene un acuerdo registrado en Stellar Testnet. Los acuerdos se generan desde el Marketplace con
                  “Comprar con garantía Stellar”; los de referencia pueden verse en Evidencia Stellar.
                </p>
                <Button asChild variant="outline" className="mt-4"><Link to="/evidencia-stellar" search={{}}>Ver acuerdos en Evidencia Stellar</Link></Button>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
