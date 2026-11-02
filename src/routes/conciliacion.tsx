import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, FileQuestion, ShieldOff, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fmtUsd, type Conciliacion } from "@/data/demo";
import { useAppStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";
import { Card, DemoBadge, PageHeader, StatCard, StatusBadge, tonoEstado } from "@/components/ui-kit";
import { retraso, useSeccionAnimada } from "@/lib/animacion";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/conciliacion")({
  validateSearch: (s: Record<string, unknown>): { op?: string | undefined } => ({ op: typeof s["op"] === "string" ? (s["op"] as string) : undefined }),
  head: () => pageHead("Conciliación financiera", "Comparación de montos facturados, embarcados y cobrados, identificación de diferencias por comisiones y seguimiento SECOEXPO demostrativo."),
  component: ConciliacionPage,
});

function ConciliacionPage() {
  const { state } = useAppStore();
  const [respaldos, setRespaldos] = useState<Record<string, boolean>>({});
  useSeccionAnimada("conciliacion");
  const { op: opParam } = Route.useSearch();
  const c = opParam ? state.conciliaciones.filter((x) => x.operacionId === opParam) : state.conciliaciones;
  const cuenta = (e: Conciliacion["estado"]) => c.filter((x) => x.estado === e).length;

  return (
    <div>
      <PageHeader titulo="Conciliación financiera y SECOEXPO" descripcion="Seguimiento de facturas, valores embarcados y cobros. Las diferencias se señalan para revisión, sin calificarlas automáticamente como incumplimientos." acciones={<DemoBadge />} />

      {opParam && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">Filtrando por la operación <span className="font-mono font-semibold">{opParam}</span>{c.length === 0 && " — todavía sin cobro registrado: avanzá la operación hasta el hito 6 (Pago recibido)."}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild><Link to="/operaciones" search={{ op: opParam }}>Volver a la operación</Link></Button>
            <Button size="sm" variant="outline" asChild><Link to="/conciliacion" search={{}}>Ver todas</Link></Button>
          </div>
        </Card>
      )}
      <div className="am-escalonar grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard titulo="Operaciones conciliadas" valor={cuenta("Conciliada")} icono={<CheckCircle2 className="h-5 w-5" />} tono="success" />
        <StatCard titulo="Con diferencias" valor={cuenta("Con diferencias")} icono={<AlertTriangle className="h-5 w-5" />} tono="danger" />
        <StatCard titulo="Documentos faltantes" valor={cuenta("Documentos faltantes") + Object.values(respaldos).filter((v) => !v).length} icono={<FileQuestion className="h-5 w-5" />} tono="warning" />
        <StatCard titulo="Próximas a revisar" valor={cuenta("Próxima a revisar")} icono={<Clock className="h-5 w-5" />} tono="info" />
      </div>

      <div className="am-escalonar mt-6 space-y-4" style={retraso(250)}>
        {c.map((x) => {
          const diferencia = x.facturaUsd - x.cobroNetoUsd;
          const respaldo = respaldos[x.id];
          return (
            <Card key={x.id}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{x.id} · Operación {x.operacionId}{(() => { const o = state.operaciones.find((y) => y.id === x.operacionId); return o?.cotizacionId ? ` · ${o.solicitudId} · ${o.cotizacionId}` : ""; })()}</p>
                  <h3 className="text-base font-semibold">Conciliación de cobro</h3>
                </div>
                <StatusBadge tono={respaldo ? "warning" : tonoEstado(x.estado)}>{respaldo ? "Respaldo solicitado" : x.estado}</StatusBadge>
              </div>
              <div className="am-escalonar grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" style={retraso(350)}>
                {[
                  ["Factura comercial", x.facturaUsd], ["Valor embarcado", x.valorEmbarcadoUsd], ["Orden de pago", x.ordenPagoUsd], ["Cobro bruto", x.cobroBrutoUsd],
                  ["Comisiones declaradas", x.comisionesDeclaradasUsd], ["Cobro neto", x.cobroNetoUsd], ["Anticipos", x.anticiposUsd], ["Diferencia", diferencia],
                ].map(([k, v]) => (
                  <div key={k as string} className={`rounded-lg border p-3 ${k === "Diferencia" && diferencia !== 0 ? "border-destructive/30 bg-danger-muted" : "border-border"}`}>
                    <p className="text-[11px] text-muted-foreground">{k}</p>
                    <p className="text-sm font-bold">{fmtUsd(v as number)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-lg bg-muted p-3 text-sm">{x.observacion}</p>
              {diferencia !== 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={respaldo} onClick={() => { setRespaldos((r) => ({ ...r, [x.id]: true })); toast.success("Solicitud de respaldo documental registrada (demo)", { description: "Se pidió el comprobante de la comisión bancaria del exterior." }); }}>
                    <Upload className="h-3.5 w-3.5" />{respaldo ? "Respaldo solicitado" : "Solicitar respaldo documental"}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Seguimiento SECOEXPO</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-danger-muted px-2.5 py-1 text-xs font-semibold text-destructive"><ShieldOff className="h-3.5 w-3.5" />Sin conexión real</span>
        </div>
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning-muted/50 p-3 text-sm">
          Esta sección es exclusivamente demostrativa. <strong>No existe conexión con el Banco Central ni con entidades bancarias</strong>, y la plataforma no liquida divisas, regulariza permisos ni presenta documentación ante autoridades.
        </p>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-2">Operación</th><th className="pb-2">Permiso de embarque</th><th className="pb-2">Estado informado (demo)</th><th className="pb-2">Próxima revisión</th></tr></thead>
          <tbody>
            {state.operaciones.map((o) => (
              <tr key={o.id} className="border-b border-border/60">
                <td className="py-2.5 font-mono text-xs">{o.id}</td>
                <td>{o.permisoEmbarque ?? "—"}</td>
                <td><StatusBadge tono={o.hitoActual >= 6 ? "warning" : "neutral"}>{o.hitoActual >= 7 ? "Seguimiento cerrado (demo)" : o.hitoActual >= 6 ? "Cobro informado — revisar diferencias" : "Sin cobro registrado"}</StatusBadge></td>
                <td className="text-xs">{o.fechaProgramada}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
