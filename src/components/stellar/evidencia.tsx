// ============================================================
// Evidencia de acuerdos en Stellar TESTNET.
// Separa siempre dos fuentes:
//  - "Registro local (AgroGlobal)": lo que la app guardó.
//  - "Confirmado por Stellar Testnet": lo que devuelve la red
//    (contrato, eventos y Horizon) en el momento de la consulta.
// ============================================================

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Card, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import {
  AVISO_TESTNET,
  ETAPAS,
  STELLAR,
  acortar,
  explorer,
  fmtActivo,
  type AcuerdoStellar,
  type EtapaAcuerdo,
} from "@/lib/stellar/config";
import { hashCondiciones } from "@/lib/stellar/terms";
import { cn } from "@/lib/utils";
import { retraso } from "@/lib/animacion";

// ---------- Tipos de la API ----------

type EstadoContrato = "Created" | "Accepted" | "Funded" | "Released" | "Refunded" | "Cancelled";

interface RespuestaEvidencia {
  ok: true;
  consultadoEn: string;
  acuerdo: {
    id: number;
    buyer: string;
    seller: string;
    arbiter: string;
    token: string;
    amount: string;
    termsHash: string;
    orderRef: string;
    deadline: number;
    status: EstadoContrato;
    createdAt: number;
    updatedAt: number;
  } | null;
  condicionesVerificadas: boolean | null;
  eventos: {
    nombre: string;
    ledger: number;
    fecha: string;
    txHash: string;
    datos: Record<string, string>;
  }[];
  eventosFueraDeRetencion: boolean;
  transacciones: {
    hash: string;
    encontrada: boolean;
    exitosa: boolean;
    ledger?: number;
    fecha?: string;
    cuentaOrigen?: string;
  }[];
  saldoCustodiaContrato: string;
  firmaHabilitada: boolean;
}

export const ESTADO_CONTRATO: Record<
  EstadoContrato,
  { label: string; tono: "success" | "warning" | "info" | "danger" | "neutral" }
> = {
  Created: { label: "Creado — espera aceptación del vendedor", tono: "warning" },
  Accepted: { label: "Aceptado — espera depósito en garantía", tono: "warning" },
  Funded: { label: "Fondos de prueba en garantía", tono: "info" },
  Released: { label: "Liberado al vendedor", tono: "success" },
  Refunded: { label: "Reembolsado al comprador", tono: "neutral" },
  Cancelled: { label: "Cancelado", tono: "danger" },
};

function estadoGarantia(s: EstadoContrato): string {
  if (s === "Funded") return "En custodia del contrato";
  if (s === "Released") return "Liberada al vendedor";
  if (s === "Refunded") return "Reembolsada al comprador";
  return "Sin depósito";
}

function rolDe(direccion: string): string {
  if (direccion === STELLAR.cuentas.buyer) return "Comprador (prueba)";
  if (direccion === STELLAR.cuentas.seller) return "Vendedor (prueba)";
  if (direccion === STELLAR.cuentas.arbiter) return "Árbitro (prueba)";
  if (direccion === STELLAR.cuentas.admin) return "Administrador (prueba)";
  return acortar(direccion);
}

const fechaUnix = (s: number) => new Date(s * 1000).toLocaleString("es-AR");
const fechaIso = (s: string) => new Date(s).toLocaleString("es-AR");

// ---------- Aviso obligatorio ----------

export function AvisoTestnet({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-muted/60 p-3 text-sm",
        className,
      )}
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
      <div>
        <p className="font-semibold text-foreground">{AVISO_TESTNET}</p>
        <p className="text-xs text-muted-foreground">
          Las cuentas, el activo {STELLAR.activo.code} y los montos son de prueba. Estos registros
          no constituyen pagos, operaciones bancarias ni contratos comerciales reales.
        </p>
      </div>
    </div>
  );
}

// ---------- Consulta a la red ----------

export function useEvidencia(acuerdo: AcuerdoStellar | null | undefined) {
  const [data, setData] = useState<RespuestaEvidencia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const intentos = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recargar = useCallback(async () => {
    if (!acuerdo) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        id: String(acuerdo.id),
        tx: acuerdo.transacciones.map((t) => t.hash).join(","),
        hash: acuerdo.termsHash,
      });
      const r = await fetch(`/api/public/stellar/acuerdos?${qs.toString()}`);
      const j = (await r.json()) as RespuestaEvidencia | { ok: false; error: string };
      if (!j.ok) throw new Error(j.error);
      setData(j);
      // Horizon indexa unos segundos después de que el RPC confirma: se reconsulta
      // sin marcar como confirmada ninguna transacción que la red no devolvió.
      const faltan = j.transacciones.some((t) => !t.encontrada);
      if (faltan && intentos.current < 8) {
        intentos.current += 1;
        setReintentando(true);
        temporizador.current = setTimeout(() => void recargar(), 3000);
      } else {
        setReintentando(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar Stellar Testnet");
    } finally {
      setCargando(false);
    }
  }, [acuerdo]);

  useEffect(() => {
    setData(null);
    intentos.current = 0;
    void recargar();
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [recargar]);

  const recargarManual = useCallback(async () => {
    intentos.current = 0;
    await recargar();
  }, [recargar]);

  return { data, cargando, error, reintentando, recargar: recargarManual };
}

/** Ejecuta un paso firmado por el servidor con cuentas de prueba. */
export async function ejecutarPasoTestnet(
  cuerpo: Record<string, unknown>,
): Promise<{ id: number; hash: string; termsHash?: string; montoUnidades?: string }> {
  const r = await fetch("/api/public/stellar/acuerdos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const j = (await r.json()) as {
    ok: boolean;
    error?: string;
    id: number;
    hash: string;
    termsHash?: string;
    montoUnidades?: string;
  };
  if (!j.ok) throw new Error(j.error ?? `Error ${r.status}`);
  return j;
}

// ---------- Componentes ----------

function Fuente({ tipo }: { tipo: "local" | "cadena" }) {
  return tipo === "cadena" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
      <ShieldCheck className="h-3 w-3" />
      Confirmado por Stellar Testnet
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
      Registro local (AgroGlobal)
    </span>
  );
}

function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        ok ? "text-success" : ok === false ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : ok === false ? (
        <XCircle className="h-3.5 w-3.5" />
      ) : (
        <Clock className="h-3.5 w-3.5" />
      )}
      {children}
    </span>
  );
}

function Dato({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{k}</p>
      <div className="break-words text-sm font-medium">{children}</div>
    </div>
  );
}

export function EvidenciaAcuerdo({ acuerdo }: { acuerdo: AcuerdoStellar }) {
  const { dispatch } = useAppStore();
  const { data, cargando, error, reintentando, recargar } = useEvidencia(acuerdo);
  const [hashLocalRecalculado, setHashLocalRecalculado] = useState<string | null>(null);
  const [ejecutando, setEjecutando] = useState<EtapaAcuerdo | null>(null);

  useEffect(() => {
    void hashCondiciones(acuerdo.condiciones).then(setHashLocalRecalculado);
  }, [acuerdo]);

  const enCadena = data?.acuerdo ?? null;
  const c = acuerdo.condiciones;
  const txVerificada = new Map((data?.transacciones ?? []).map((t) => [t.hash, t]));

  const ejecutar = async (etapa: Exclude<EtapaAcuerdo, "create" | "cancel">) => {
    setEjecutando(etapa);
    try {
      const r = await ejecutarPasoTestnet({ etapa, id: acuerdo.id });
      dispatch({ type: "addTxAcuerdoStellar", id: acuerdo.id, etapa, hash: r.hash });
      toast.success(`${ETAPAS[etapa]} — confirmado en Testnet`, {
        description: `tx ${acortar(r.hash, 8)}`,
      });
    } catch (e) {
      toast.error("La red no confirmó la transacción", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEjecutando(null);
      void recargar();
    }
  };

  const siguientes: {
    etapa: Exclude<EtapaAcuerdo, "create" | "cancel">;
    label: string;
    variante?: "outline";
  }[] =
    enCadena?.status === "Created"
      ? [{ etapa: "accept", label: "Aceptar condiciones (firma vendedor de prueba)" }]
      : enCadena?.status === "Accepted"
        ? [{ etapa: "deposit", label: "Depositar en garantía (firma comprador de prueba)" }]
        : enCadena?.status === "Funded"
          ? [
              { etapa: "release", label: "Confirmar entrega y liberar (comprador)" },
              { etapa: "refund", label: "Reembolsar (árbitro)", variante: "outline" },
            ]
          : [];

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Acuerdo en contrato Soroban</p>
            <h3 className="font-display text-xl font-bold">
              #{acuerdo.id} · {acuerdo.orderRef}
            </h3>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge tono={acuerdo.tipo === "local" ? "info" : "success"}>
                {acuerdo.tipo === "local" ? "Venta local" : "Exportación"}
              </StatusBadge>
              {enCadena && (
                <span key={enCadena.status} className="am-entrada inline-flex">
                  <StatusBadge tono={ESTADO_CONTRATO[enCadena.status].tono}>
                    {ESTADO_CONTRATO[enCadena.status].label}
                  </StatusBadge>
                </span>
              )}
              {data && !enCadena && (
                <StatusBadge tono="danger">No encontrado en el contrato</StatusBadge>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" variant="outline" onClick={() => void recargar()} disabled={cargando}>
              {cargando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Consultar la red
            </Button>
            {data && (
              <span className="text-[11px] text-muted-foreground">
                Consultado: {fechaIso(data.consultadoEn)}
              </span>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-danger-muted p-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}. Se muestra solo el registro local, que no constituye prueba.
          </p>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Registro local */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Condiciones comerciales</h4>
            <Fuente tipo="local" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Dato k="Producto">{`Arroz ${c.producto.tipoArroz.toLowerCase()} ${c.producto.variedad.toLowerCase()}`}</Dato>
            <Dato k="Calidad">{`Quebrado ≤ ${c.producto.quebradoMaxPct}% · Humedad ≤ ${c.producto.humedadMaxPct}%`}</Dato>
            <Dato k="Vendedor (demo)">{c.vendedor}</Dato>
            <Dato k="Comprador (demo)">{c.comprador}</Dato>
            <Dato k="Cantidad">{`${c.cantidadTn} tn · ${c.producto.presentacion}`}</Dato>
            <Dato k="Precio">{`USD ${c.precioTnUsd}/tn → total ${c.totalUsd.toLocaleString("es-AR")}`}</Dato>
            {c.tipo === "exportacion" ? (
              <Dato k="Incoterm">{`${c.incoterm ?? "—"} · ${c.lugarDesignado ?? "—"}`}</Dato>
            ) : (
              <Dato k="Lugar de entrega">{c.lugarEntrega ?? "—"}</Dato>
            )}
            <Dato k="Pago">{c.condicionPago}</Dato>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{c.nota}</p>
        </Card>

        {/* Estado confirmado */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Estado del contrato inteligente</h4>
            <Fuente tipo="cadena" />
          </div>
          {!data && cargando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Consultando Stellar Testnet…
            </p>
          )}
          {enCadena && (
            <div className="am-escalonar grid grid-cols-2 gap-3">
              <Dato k="Monto">{fmtActivo(enCadena.amount)}</Dato>
              <Dato k="Activo de prueba">
                <Enlace
                  href={explorer.contrato(enCadena.token)}
                >{`${STELLAR.activo.code} · ${acortar(enCadena.token)}`}</Enlace>
              </Dato>
              <Dato k="Depósito en garantía">{estadoGarantia(enCadena.status)}</Dato>
              <Dato k="Liberación / reembolso">
                {enCadena.status === "Released"
                  ? "Liberado al vendedor"
                  : enCadena.status === "Refunded"
                    ? "Reembolsado al comprador"
                    : "Pendiente"}
              </Dato>
              <Dato k="Comprador">
                <Enlace href={explorer.cuenta(enCadena.buyer)}>{rolDe(enCadena.buyer)}</Enlace>
              </Dato>
              <Dato k="Vendedor">
                <Enlace href={explorer.cuenta(enCadena.seller)}>{rolDe(enCadena.seller)}</Enlace>
              </Dato>
              <Dato k="Creado">{fechaUnix(enCadena.createdAt)}</Dato>
              <Dato k="Vence (reembolso del comprador)">{fechaUnix(enCadena.deadline)}</Dato>
              <Dato k="Contract ID">
                <Enlace href={explorer.contrato(STELLAR.contractId)}>
                  {acortar(STELLAR.contractId, 8)}
                </Enlace>
              </Dato>
              <Dato k="Saldo en custodia (todo el contrato)">
                {fmtActivo(data!.saldoCustodiaContrato)}
              </Dato>
            </div>
          )}
        </Card>
      </div>

      {/* Verificación cruzada */}
      <Card>
        <h4 className="mb-3 text-sm font-semibold">
          Verificación cruzada: registro local vs. cadena
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Dato</th>
                <th className="pb-2 pr-3 font-medium">Registro local</th>
                <th className="pb-2 pr-3 font-medium">Stellar Testnet</th>
                <th className="pb-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3">Hash SHA-256 de condiciones</td>
                <td className="pr-3 font-mono text-xs">
                  {acortar(acuerdo.termsHash, 10)}
                  <br />
                  <span className="text-muted-foreground">
                    recalculado: {hashLocalRecalculado ? acortar(hashLocalRecalculado, 10) : "…"}
                  </span>
                </td>
                <td className="pr-3 font-mono text-xs">
                  {enCadena ? acortar(enCadena.termsHash, 10) : "—"}
                </td>
                <td>
                  <Check
                    ok={
                      enCadena && hashLocalRecalculado
                        ? hashLocalRecalculado === enCadena.termsHash &&
                          data?.condicionesVerificadas === true
                        : null
                    }
                  >
                    {enCadena
                      ? hashLocalRecalculado === enCadena.termsHash
                        ? "Condiciones íntegras (verify_terms)"
                        : "Las condiciones no coinciden"
                      : "Sin datos"}
                  </Check>
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3">Referencia de orden</td>
                <td className="pr-3">{acuerdo.orderRef}</td>
                <td className="pr-3">{enCadena?.orderRef ?? "—"}</td>
                <td>
                  <Check ok={enCadena ? enCadena.orderRef === acuerdo.orderRef : null}>
                    {enCadena
                      ? enCadena.orderRef === acuerdo.orderRef
                        ? "Coincide"
                        : "Difiere"
                      : "Sin datos"}
                  </Check>
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-3">Monto</td>
                <td className="pr-3">{fmtActivo(acuerdo.montoUnidades)}</td>
                <td className="pr-3">{enCadena ? fmtActivo(enCadena.amount) : "—"}</td>
                <td>
                  <Check ok={enCadena ? enCadena.amount === acuerdo.montoUnidades : null}>
                    {enCadena
                      ? enCadena.amount === acuerdo.montoUnidades
                        ? "Coincide"
                        : "Difiere"
                      : "Sin datos"}
                  </Check>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Transacciones */}
        <Card>
          <h4 className="mb-3 text-sm font-semibold">Transacciones del acuerdo</h4>
          <ul className="am-escalonar space-y-3" style={retraso(150)}>
            {acuerdo.transacciones.map((t) => {
              const v = txVerificada.get(t.hash);
              return (
                <li key={t.hash} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{ETAPAS[t.etapa]}</span>
                    <span key={v ? (v.encontrada ? "encontrada" : "pendiente") : "verificando"} className="am-entrada inline-flex">
                    <Check ok={v ? (v.encontrada ? v.exitosa : reintentando ? null : false) : null}>
                      {v
                        ? v.encontrada
                          ? v.exitosa
                            ? `Confirmada · ledger ${v.ledger}`
                            : "Fallida"
                          : reintentando
                            ? "Pendiente de indexación en Horizon…"
                            : "No encontrada en la red"
                        : "Verificando…"}
                    </Check>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <Enlace href={explorer.tx(t.hash)}>{acortar(t.hash, 12)}</Enlace>
                    {v?.fecha && (
                      <span className="am-entrada inline-block text-[11px] text-muted-foreground">
                        {fechaIso(v.fecha)} · {rolDe(v.cuentaOrigen ?? "")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Eventos */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Historial de eventos del contrato</h4>
            <Fuente tipo="cadena" />
          </div>
          {data?.eventos.length ? (
            <ol className="am-escalonar space-y-3 border-l-2 border-border pl-4">
              {data.eventos.map((e) => (
                <li key={`${e.txHash}-${e.nombre}`}>
                  <p className="text-xs text-muted-foreground">
                    {fechaIso(e.fecha)} · ledger {e.ledger}
                  </p>
                  <p className="text-sm font-medium">
                    {e.nombre === "agreement_created"
                      ? `Acuerdo creado · ${fmtActivo(e.datos["amount"] ?? "0")}`
                      : `Estado → ${ESTADO_CONTRATO[(e.datos["status"] ?? "Created") as EstadoContrato]?.label ?? e.datos["status"]}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.datos["by"]
                      ? `Firmado por ${rolDe(e.datos["by"])} · `
                      : e.datos["buyer"]
                        ? `Firmado por ${rolDe(e.datos["buyer"])} · `
                        : ""}
                    <Enlace href={explorer.tx(e.txHash)}>{acortar(e.txHash, 8)}</Enlace>
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              {cargando
                ? "Consultando eventos…"
                : data?.eventosFueraDeRetencion
                  ? "El RPC de Testnet solo conserva eventos de los últimos ~7 días. Las transacciones siguen verificables en Horizon y en el explorador."
                  : "Sin eventos para este acuerdo."}
            </p>
          )}
        </Card>
      </div>

      {data?.firmaHabilitada && siguientes.length > 0 && (
        <Card>
          <h4 className="mb-1 text-sm font-semibold">Siguiente paso del acuerdo</h4>
          <p className="mb-3 text-xs text-muted-foreground">
            Lo firma el servidor local con cuentas de prueba de Testnet. Cada paso es una
            transacción real en Testnet, con activo sin valor.
          </p>
          <div className="flex flex-wrap gap-2">
            {siguientes.map((s) => (
              <Button
                key={s.etapa}
                variant={s.variante ?? "default"}
                disabled={!!ejecutando}
                onClick={() => void ejecutar(s.etapa)}
              >
                {ejecutando === s.etapa && <Loader2 className="h-4 w-4 animate-spin" />}
                {s.label}
              </Button>
            ))}
          </div>
        </Card>
      )}
      {data && !data.firmaHabilitada && siguientes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Modo solo lectura: este servidor no tiene habilitada la firma con cuentas de prueba, por
          eso no se ofrecen acciones.
        </p>
      )}
    </div>
  );
}
