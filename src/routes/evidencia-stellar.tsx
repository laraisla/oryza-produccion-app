import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Blocks, ExternalLink } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";
import { Card, PageHeader, StatusBadge } from "@/components/ui-kit";
import { AvisoTestnet, EvidenciaAcuerdo } from "@/components/stellar/evidencia";
import { PestanasEvidencia } from "@/components/stellar/pestanas-evidencia";
import { useFirmaTestnet } from "@/components/stellar/compra-garantia";
import { STELLAR, acortar, explorer, fmtActivo } from "@/lib/stellar/config";
import { cn } from "@/lib/utils";
import { retraso, useSeccionAnimada } from "@/lib/animacion";

export const Route = createFileRoute("/evidencia-stellar")({
  validateSearch: (s: Record<string, unknown>): { acuerdo?: number | undefined } => {
    const n = Number(s["acuerdo"]);
    return { acuerdo: Number.isInteger(n) && n >= 0 && s["acuerdo"] !== undefined ? n : undefined };
  },
  head: () =>
    pageHead(
      "Evidencia Stellar",
      "Acuerdos comerciales de demostración registrados en un contrato Soroban en Stellar Testnet, con estado consultado en la red y transacciones verificables.",
    ),
  component: EvidenciaStellar,
});

const CUENTAS: [string, string][] = [
  ["Comprador (prueba)", STELLAR.cuentas.buyer],
  ["Vendedor (prueba)", STELLAR.cuentas.seller],
  ["Árbitro (prueba)", STELLAR.cuentas.arbiter],
  ["Emisor del activo (prueba)", STELLAR.cuentas.admin],
];

function EvidenciaStellar() {
  const { state } = useAppStore();
  const navigate = useNavigate();
  const { acuerdo: idSel } = Route.useSearch();
  const acuerdos = state.acuerdosStellar;
  const seleccionado = acuerdos.find((a) => a.id === idSel) ?? acuerdos[0];
  const firma = useFirmaTestnet();
  useSeccionAnimada("evidencia-stellar");

  return (
    <div>
      <PageHeader
        titulo="Evidencia blockchain — Stellar"
        descripcion="Acuerdos de compraventa con depósito en garantía ejecutados por un contrato inteligente Soroban. El estado se consulta en la red en cada visita."
        acciones={
          firma === false ? (
            <StatusBadge tono="neutral">Modo público: solo lectura</StatusBadge>
          ) : firma ? (
            <StatusBadge tono="info">Demo local: firma con cuentas de prueba</StatusBadge>
          ) : null
        }
      />
      <PestanasEvidencia activa="escrow" />
      <AvisoTestnet className="mb-6" />

      <Card className="am-entrada mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Blocks className="h-5 w-5 text-primary" />
            Contrato agroglobal-escrow
          </h2>
          <a
            href={explorer.contrato(STELLAR.contractId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Ver en Stellar Expert <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="am-escalonar grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4" style={retraso(120)}>
          <div>
            <p className="text-xs text-muted-foreground">Red</p>
            <p className="font-medium">Stellar Testnet</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Contract ID</p>
            <p className="break-all font-mono text-xs">{STELLAR.contractId}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">SHA-256 del WASM desplegado</p>
            <p className="break-all font-mono text-xs">{STELLAR.wasmSha256}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Activo de prueba</p>
            <p className="font-medium">
              {STELLAR.activo.code}{" "}
              <span className="text-xs text-muted-foreground">(sin valor)</span>
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-xs">
          {CUENTAS.map(([rol, dir]) => (
            <a
              key={dir}
              href={explorer.cuenta(dir)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {rol}: <span className="font-mono">{acortar(dir)}</span>
            </a>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <Card className="h-fit p-0">
          <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
            Acuerdos registrados ({acuerdos.length})
          </h3>
          <ul className="am-escalonar divide-y divide-border/60" style={retraso(250)}>
            {acuerdos.map((a) => (
              <li key={`${a.contractId}-${a.id}`}>
                <button
                  onClick={() =>
                    void navigate({ to: "/evidencia-stellar", search: { acuerdo: a.id } })
                  }
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-accent/60",
                    seleccionado?.id === a.id && "bg-accent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">
                      #{a.id} · {a.orderRef}
                    </span>
                    <StatusBadge tono={a.tipo === "local" ? "info" : "success"}>
                      {a.tipo === "local" ? "Local" : "Exportación"}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {a.condiciones.cantidadTn} tn {a.condiciones.producto.variedad.toLowerCase()} ·{" "}
                    {fmtActivo(a.montoUnidades)}
                  </p>
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {a.origen === "script"
                      ? "Ejecutado por script de despliegue"
                      : "Generado desde AgroGlobal"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="min-w-0">
          {seleccionado ? (
            <EvidenciaAcuerdo acuerdo={seleccionado} />
          ) : (
            <Card>No hay acuerdos registrados.</Card>
          )}
        </div>
      </div>
    </div>
  );
}
