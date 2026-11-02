import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileWarning,
  Handshake,
  ReceiptText,
  Ship,
  Wheat,
  RotateCcw,
  Calculator,
  Files,
  Package,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { ROLES, SOLICITUDES_INICIALES, fmtTn, fmtUsd } from "@/data/demo";
import { estadoRecorrido } from "@/lib/recorrido";
import { Button } from "@/components/ui/button";
import { EXPORTACIONES_ARGENTINA, fmtTn as fmtTnReal } from "@/data/mercados";
import { useAppStore } from "@/lib/store";
import { useChartColores } from "@/lib/marca";
import { Card, DemoBadge, PageHeader, StatCard, StatusBadge, tonoEstado } from "@/components/ui-kit";
import { ContadorAnimado } from "@/components/contador-animado";
import type { CSSProperties } from "react";

// Presentación: retraso de entrada en cascada y hover sutil de tarjetas.
const retraso = (ms: number) => ({ "--am-delay": `${ms}ms` }) as CSSProperties;
const HOVER_TARJETA =
  "transition-[transform,box-shadow,border-color] duration-300 ease-out hover:border-primary/25 hover:shadow-md motion-safe:hover:-translate-y-0.5";
// Íconos KPI: contenedor amplio, borde suave y trazo fino; se eleva con la tarjeta.
const KPI_TARJETA = "group items-center";
const KPI_ICONO =
  "h-12 w-12 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_2px_rgb(24_42_44/0.06)] transition-transform duration-300 ease-out motion-safe:group-hover:scale-105 [&_svg]:h-[22px] [&_svg]:w-[22px]";
const HOVER_FILA =
  "transition-[transform,background-color,border-color] duration-200 ease-out hover:border-primary/25 hover:bg-accent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AgroGlobal COMEX" },
      {
        name: "description",
        content:
          "Panel principal de AgroGlobal COMEX: indicadores comerciales, oportunidades por país, solicitudes recientes, operaciones en seguimiento y alertas documentales. Prototipo demo.",
      },
      { property: "og:title", content: "Dashboard — AgroGlobal COMEX" },
      {
        property: "og:description",
        content: "Indicadores comerciales y seguimiento de operaciones de exportación agroindustrial (demo).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { state, dispatch } = useAppStore();
  const pasos = estadoRecorrido(state, SOLICITUDES_INICIALES.map((s) => s.id));
  const completados = pasos.filter((p) => p.hecho).length;
  const rol = ROLES.find((r) => r.id === state.rol)!;
  const chartColores = useChartColores(4);

  const productosDisponibles = state.productos.filter((p) => p.estado === "Disponible").length;
  const solicitudesActivas = state.solicitudes.filter((s) => s.estado === "Activa").length;
  const cotizacionesPendientes = state.cotizaciones.filter((c) =>
    ["Borrador", "Enviada", "En negociación"].includes(c.estado),
  ).length;
  const operacionesEnCurso = state.operaciones.filter((o) => o.hitoActual < 7).length;
  const conDiferencias = state.conciliaciones.filter((c) => c.estado === "Con diferencias").length;
  const oportunidades = state.solicitudes.length + state.productos.filter((p) => p.estado === "Disponible").length;

  return (
    <div>
      <div className="am-entrada">
        <PageHeader
          titulo="Dashboard comercial"
          descripcion={`Vista para: ${rol.label}. Indicadores calculados sobre los datos de demostración del prototipo — no representan cifras reales del comercio argentino.`}
          acciones={<DemoBadge />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard iconoClassName={KPI_ICONO} className={`${KPI_TARJETA} am-entrada [--am-delay:100ms] ${HOVER_TARJETA}`} titulo="Productos disponibles" valor={<ContadorAnimado valor={productosDisponibles} retrasoMs={250} />} icono={<Wheat strokeWidth={1.75} />} tono="info" />
        <StatCard iconoClassName={KPI_ICONO} className={`${KPI_TARJETA} am-entrada [--am-delay:170ms] ${HOVER_TARJETA}`} titulo="Solicitudes activas" valor={<ContadorAnimado valor={solicitudesActivas} retrasoMs={320} />} icono={<ClipboardList strokeWidth={1.75} />} tono="info" />
        <StatCard iconoClassName={KPI_ICONO} className={`${KPI_TARJETA} am-entrada [--am-delay:240ms] ${HOVER_TARJETA}`} titulo="Oportunidades compatibles" valor={<ContadorAnimado valor={oportunidades} retrasoMs={390} />} icono={<Handshake strokeWidth={1.75} />} tono="success" />
        <StatCard iconoClassName={KPI_ICONO} className={`${KPI_TARJETA} am-entrada [--am-delay:310ms] ${HOVER_TARJETA}`} titulo="Cotizaciones pendientes" valor={<ContadorAnimado valor={cotizacionesPendientes} retrasoMs={460} />} icono={<ReceiptText strokeWidth={1.75} />} tono="warning" />
        <StatCard iconoClassName={KPI_ICONO} className={`${KPI_TARJETA} am-entrada [--am-delay:380ms] ${HOVER_TARJETA}`} titulo="Operaciones en curso" valor={<ContadorAnimado valor={operacionesEnCurso} retrasoMs={530} />} icono={<Ship strokeWidth={1.75} />} tono="info" />
        <StatCard iconoClassName={KPI_ICONO} className={`${KPI_TARJETA} am-entrada [--am-delay:450ms] ${HOVER_TARJETA}`} titulo="Alertas documentales" valor={<ContadorAnimado valor={3 + conDiferencias} retrasoMs={600} />} icono={<FileWarning strokeWidth={1.75} />} tono="danger" />
      </div>

      <Card className="am-entrada mt-6 [--am-delay:450ms]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">Recorrido de demostración <DemoBadge /></h2>
            <p className="text-xs text-muted-foreground">{completados} de 7 pasos completados · cada paso alimenta al siguiente con los datos del store.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { dispatch({ type: "reiniciarDemoComercial" }); toast.success("Demo reiniciada: datos comerciales restaurados (blockchain y WhatsApp intactos)"); }}>
            <RotateCcw className="h-3.5 w-3.5" />Reiniciar demo
          </Button>
        </div>
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {pasos.map((p, i) => (
            <li key={p.n} className="am-entrada" style={retraso(520 + i * 40)}>
              <Link to={p.to as never} search={(p.search ?? {}) as never} className={`flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium ${HOVER_FILA}`}>
                {p.hecho ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span><span className="text-muted-foreground">{p.n}.</span> {p.titulo}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="am-entrada min-w-0 xl:col-span-3 [--am-delay:600ms]">
          <h2 className="mb-1 text-base font-semibold">Exportaciones argentinas de arroz por destino</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            HS 100630 (semiblanqueado/blanqueado) · {EXPORTACIONES_ARGENTINA[0]!.anio} · toneladas · Fuente:{" "}
            {EXPORTACIONES_ARGENTINA[0]!.fuente}. No son compradores activos; el detalle completo está en{" "}
            <Link to="/inteligencia-mercados" className="text-primary underline">Inteligencia de mercados</Link>.
          </p>
          <div className="am-grafico h-64" style={retraso(750)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={EXPORTACIONES_ARGENTINA[0]!.datos} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="pais" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  formatter={(v) => [`${fmtTnReal(Number(v))} tn`, "Exportaciones"]}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="toneladas" name="Toneladas" fill={chartColores[0]} radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="am-entrada min-w-0 xl:col-span-2 [--am-delay:660ms]">
          <h2 className="mb-1 text-base font-semibold">Accesos rápidos</h2>
          <p className="mb-4 text-xs text-muted-foreground">Flujos principales del prototipo</p>
          <div className="space-y-2">
            {[
              { to: "/mis-productos", label: "Publicar producto", icon: Package },
              { to: "/marketplace", label: "Buscar compradores y lotes", icon: Search },
              { to: "/matching", label: "Ejecutar matching inteligente", icon: Sparkles },
              { to: "/calculadora", label: "Calcular exportación", icon: Calculator },
              { to: "/cotizaciones", label: "Generar cotización", icon: Files },
              { to: "/conciliacion", label: "Revisar conciliación", icon: Scale },
            ].map(({ to, label, icon: Icon }, i) => (
              <Link
                key={to}
                to={to}
                style={retraso(740 + i * 50)}
                className={`am-entrada group flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm font-medium ${HOVER_FILA}`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-primary" />
                  {label}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="am-entrada min-w-0 [--am-delay:780ms]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Solicitudes de compra recientes</h2>
            <Link to="/solicitudes" className="text-xs font-medium text-primary hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">ID</th>
                  <th className="pb-2 pr-3 font-medium">Comprador</th>
                  <th className="pb-2 pr-3 font-medium">Producto</th>
                  <th className="pb-2 pr-3 font-medium">Volumen</th>
                  <th className="pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.solicitudes.slice(0, 4).map((s, i) => (
                  <tr key={s.id} style={retraso(880 + i * 60)} className="am-entrada border-b border-border/60 transition-colors duration-200 last:border-0 hover:bg-accent/60">
                    <td className="py-2.5 pr-3 font-mono text-xs">{s.id}</td>
                    <td className="py-2.5 pr-3">{s.comprador}</td>
                    <td className="py-2.5 pr-3">
                      {s.tipoArroz} {s.variedad}
                    </td>
                    <td className="py-2.5 pr-3">{fmtTn(s.volumenTn)}</td>
                    <td className="py-2.5">
                      <StatusBadge tono={tonoEstado(s.estado)}>{s.estado}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="am-entrada min-w-0 [--am-delay:840ms]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Operaciones en seguimiento</h2>
            <Link to="/operaciones" className="text-xs font-medium text-primary hover:underline">
              Ver operaciones
            </Link>
          </div>
          <div className="space-y-3">
            {state.operaciones.map((op, i) => (
              <div key={op.id} style={retraso(920 + i * 70)} className={`am-entrada rounded-lg border border-border p-3.5 ${HOVER_TARJETA}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs font-semibold">{op.id}</p>
                  <StatusBadge tono={tonoEstado(op.estadoLogistico)}>{op.estadoLogistico}</StatusBadge>
                </div>
                <p className="mt-1 text-sm">
                  {op.producto} · {fmtTn(op.cantidadContratadaTn)} · {fmtUsd(op.valorFacturadoUsd || op.cantidadContratadaTn * op.precioPactadoTnUsd)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {op.puertoSalida} → {op.puertoDestino} · {op.incoterm}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="am-barra h-full rounded-full bg-success" style={{ width: `${(op.hitoActual / 7) * 100}%`, ...retraso(1000 + i * 70) }} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Hito {op.hitoActual} de 7</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="am-entrada mt-6 border-warning/40 bg-warning-muted/50 [--am-delay:1000ms]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Alertas de documentación pendiente</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>OP-2026-017: permiso de embarque pendiente de presentación (demo).</li>
              <li>OP-2026-017: certificado fitosanitario en preparación, vence el 30/10/2026.</li>
              <li>OP-2026-014: diferencia de USD 150 en conciliación — identificar comprobante de comisión exterior.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
