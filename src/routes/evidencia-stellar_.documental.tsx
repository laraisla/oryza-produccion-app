// ============================================================
// Evidencia documental anclada en Stellar TESTNET — consulta de SOLO LECTURA.
// Los datos vienen del diario local (vía servidor de desarrollo) y se confirman
// en cada consulta contra Horizon Testnet. No hay acciones de firma ni envío.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  FileText,
  FlaskConical,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Card, PageHeader, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { PestanasEvidencia } from "@/components/stellar/pestanas-evidencia";
import { acortar, explorer } from "@/lib/stellar/config";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { retraso, useSeccionAnimada } from "@/lib/animacion";
import type { DetalleEvidencia, EvidenciaPublica } from "@/lib/stellar/anchor/consulta.server";
import type { Verification } from "@/lib/stellar/anchor/types";

export const Route = createFileRoute("/evidencia-stellar_/documental")({
  validateSearch: (s: Record<string, unknown>): { id?: string | undefined } => ({
    id: typeof s["id"] === "string" && /^[0-9a-f-]{36}$/.test(s["id"]) ? s["id"] : undefined,
  }),
  head: () =>
    pageHead(
      "Evidencia documental Stellar",
      "Consulta y verificación de solo lectura del registro documental de AgroGlobal anclado en Stellar Testnet.",
    ),
  component: EvidenciaDocumental,
});

const API = "/api/public/stellar/anclaje";

type Fallo = { ok: false; codigo: string; error: string };
type Lista = { ok: true; cuenta: string; evidencias: EvidenciaPublica[] };
type Detalle = { ok: true } & DetalleEvidencia;
type ResultadoArchivo = {
  ok: true;
  consultadoEn: string;
  digestArchivo: string;
  bytes: number;
  verificacion: Verification;
};

async function pedir<T>(url: string, init?: RequestInit): Promise<T | Fallo> {
  try {
    const r = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
    return (await r.json()) as T | Fallo;
  } catch {
    return { ok: false, codigo: "RED", error: "No se pudo contactar al servidor local" };
  }
}

const CHECKS: { clave: keyof Verification["checks"]; label: string }[] = [
  { clave: "network", label: "Red Stellar Testnet" },
  { clave: "successful", label: "Transacción exitosa e incluida en un ledger" },
  { clave: "hash", label: "Hash de transacción recalculado desde el XDR" },
  { clave: "issuer", label: "Cuenta emisora autorizada" },
  { clave: "signature", label: "Firma Ed25519 válida de la cuenta" },
  { clave: "memo", label: "MEMO_HASH igual al SHA-256" },
  { clave: "operation", label: "ManageData agroglobal:anchor:v1 igual al SHA-256" },
  { clave: "envelope", label: "Sobre conforme a la política (una operación, sin pagos)" },
  { clave: "content", label: "Contenido igual al SHA-256 registrado" },
];

const fecha = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" }) : "—";

function Dato({ k, children, mono }: { k: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{k}</p>
      <div className={cn("break-all text-sm font-medium", mono && "font-mono text-xs")}>
        {children}
      </div>
    </div>
  );
}

function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 break-all font-mono text-xs text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

function Fuente({ tipo }: { tipo: "local" | "cadena" }) {
  return tipo === "cadena" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
      <ShieldCheck className="h-3 w-3" />
      Consultado en Stellar Testnet
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
      Diario local (AgroGlobal)
    </span>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-sm",
        ok ? "text-success" : ok === false ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : ok === false ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="text-foreground">{children}</span>
    </li>
  );
}

function ListaChecks({ v }: { v: Verification | null }) {
  return (
    <ul className="am-escalonar grid gap-2 sm:grid-cols-2" style={retraso(80)}>
      {CHECKS.map((c) => (
        <Check key={c.clave} ok={v ? v.checks[c.clave] : null}>
          {c.label}
        </Check>
      ))}
    </ul>
  );
}

function Aviso() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-muted/60 p-3 text-sm">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
      <div>
        <p className="font-semibold text-foreground">
          Stellar Testnet: red de prueba, sin valor económico.
        </p>
        <p className="text-xs text-muted-foreground">
          En la cadena solo se publica el SHA-256 del documento, nunca su texto. El registro
          acredita integridad y emisión por la cuenta técnica; no autoría empresarial ni validez
          legal. Esta pantalla es de solo lectura: no firma ni envía transacciones.
        </p>
      </div>
    </div>
  );
}

function EvidenciaDocumental() {
  useSeccionAnimada("evidencia-documental");
  const { id: idSel } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [lista, setLista] = useState<Lista | Fallo | null>(null);

  useEffect(() => {
    void pedir<Lista>(API).then(setLista);
  }, []);

  const evidencias = lista?.ok ? lista.evidencias : [];
  const seleccion = evidencias.find((e) => e.id === idSel) ?? evidencias[0];

  return (
    <div>
      <PageHeader
        titulo="Evidencia blockchain — Registro documental"
        descripcion="Documentos cuyo SHA-256 quedó anclado en Stellar Testnet. Cada consulta vuelve a verificar la transacción en la red."
        acciones={
          <StatusBadge tono="neutral">
            <Lock className="mr-1 h-3 w-3" />
            Solo lectura
          </StatusBadge>
        }
      />
      <PestanasEvidencia activa="documental" />
      <Aviso />

      {!lista && (
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Leyendo el diario local…
          </p>
        </Card>
      )}
      {lista && !lista.ok && <NoDisponible fallo={lista} />}
      {lista?.ok && evidencias.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            El diario local no tiene evidencias para la cuenta {acortar(lista.cuenta)}. Las
            evidencias se registran con la CLI del operador; esta pantalla no crea ninguna.
          </p>
        </Card>
      )}

      {seleccion && (
        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <Card className="h-fit p-0">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
              Evidencias registradas ({evidencias.length})
            </h3>
            <ul className="divide-y divide-border/60">
              {evidencias.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => void navigate({ search: { id: e.id } })}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-accent/60",
                      seleccion.id === e.id && "bg-accent",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">{e.entidad}</span>
                      </span>
                      <StatusBadge tono={e.estadoLocal === "confirmed" ? "success" : "warning"}>
                        v{e.version}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      SHA-256 {acortar(e.digest, 8)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <div className="min-w-0">
            <DetalleVista key={seleccion.id} evidencia={seleccion} />
          </div>
        </div>
      )}
    </div>
  );
}

function NoDisponible({ fallo }: { fallo: Fallo }) {
  return (
    <Card>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-warning-foreground" />
        Consulta local no disponible
      </h3>
      <p className="text-sm text-muted-foreground">{fallo.error}</p>
      {fallo.codigo === "SOLO_LOCAL" && (
        <p className="mt-2 text-xs text-muted-foreground">
          El diario de evidencias vive en la computadora del operador y no se publica en el
          despliegue web. Abrir esta pantalla desde el servidor de desarrollo en http://localhost.
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        No se muestran estados de ejemplo: sin acceso al diario no hay evidencia que consultar.
      </p>
    </Card>
  );
}

function DetalleVista({ evidencia }: { evidencia: EvidenciaPublica }) {
  const [detalle, setDetalle] = useState<Detalle | Fallo | null>(null);
  const [cargando, setCargando] = useState(false);

  const consultar = useCallback(async () => {
    setCargando(true);
    const r = await pedir<Detalle>(`${API}?id=${encodeURIComponent(evidencia.id)}`);
    setDetalle(r);
    setCargando(false);
    return r;
  }, [evidencia.id]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  const d = detalle?.ok ? detalle : null;
  const tx = d?.red.transaccion ?? null;
  const v = d?.verificacion ?? null;
  const confirmada = !!(tx?.encontrada && tx.exitosa && v?.result === "matches");
  const hash = evidencia.transaccion?.hash;

  return (
    <div className="space-y-4">
      <Card className="am-entrada">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Documento anclado</p>
            <h3 className="font-display text-xl font-bold break-all">{evidencia.entidad}</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge tono="info">Versión {evidencia.version}</StatusBadge>
              {!detalle || cargando ? (
                <StatusBadge tono="neutral">Consultando la red…</StatusBadge>
              ) : confirmada ? (
                <StatusBadge tono="success">Confirmada en Stellar Testnet</StatusBadge>
              ) : d && !hash ? (
                <StatusBadge tono="warning">Sin transacción registrada</StatusBadge>
              ) : d && tx && !tx.encontrada ? (
                <StatusBadge tono="warning">No encontrada en la red</StatusBadge>
              ) : (
                <StatusBadge tono="danger">No verificada</StatusBadge>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void consultar()}
              disabled={cargando}
            >
              {cargando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Consultar la red
            </Button>
            {d && (
              <span className="text-[11px] text-muted-foreground">
                Consultado: {fecha(d.consultadoEn)}
              </span>
            )}
          </div>
        </div>
        {detalle && !detalle.ok && (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-danger-muted p-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {detalle.error} El diario local por sí solo no constituye prueba.
          </p>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Transacción</h4>
            <Fuente tipo="cadena" />
          </div>
          <div className="am-escalonar grid gap-3 sm:grid-cols-2" style={retraso(60)}>
            <Dato k="Red">
              {d ? (d.red.esTestnet ? "Stellar Testnet" : "Red distinta de Testnet") : "—"}
            </Dato>
            <Dato k="Estado en la red">
              {!d
                ? "—"
                : !tx
                  ? "Sin transacción"
                  : !tx.encontrada
                    ? "No encontrada"
                    : tx.exitosa
                      ? "Exitosa"
                      : "Fallida"}
            </Dato>
            <Dato k="Ledger">{tx?.ledger ?? "—"}</Dato>
            <Dato k="Fecha de cierre">{fecha(tx?.fecha)}</Dato>
            <div className="sm:col-span-2">
              <Dato k="Hash de la transacción">
                {hash ? <Enlace href={explorer.tx(hash)}>{hash}</Enlace> : "—"}
              </Dato>
            </div>
            <div className="sm:col-span-2">
              <Dato k="Cuenta emisora">
                <Enlace href={explorer.cuenta(evidencia.cuenta)}>{evidencia.cuenta}</Enlace>
              </Dato>
            </div>
          </div>
          {hash && (
            <a
              href={explorer.tx(hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ver en Stellar Expert (Testnet) <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Documento</h4>
            <Fuente tipo="local" />
          </div>
          <div className="grid gap-3">
            <Dato k="SHA-256 del documento" mono>
              {evidencia.digest}
            </Dato>
            <div className="grid gap-3 sm:grid-cols-2">
              <Dato k="Tipo">
                {evidencia.tipo === "document" ? "Documento (bytes exactos)" : "Acuerdo"}
              </Dato>
              <Dato k="Época del registro">{evidencia.epoca}</Dato>
              <Dato k="Estado en el diario">{evidencia.estadoLocal}</Dato>
              <Dato k="Envíos">{evidencia.transaccion?.envios ?? 0}</Dato>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            El diario guarda una copia privada del documento que no sale del servidor local.
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Verificación independiente del registro</h4>
          {v && (
            <StatusBadge tono={v.result === "matches" ? "success" : "danger"}>
              {v.result === "matches"
                ? "Coincide"
                : v.result === "mismatch"
                  ? "No coincide"
                  : "No verificable"}
            </StatusBadge>
          )}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Se descarga la transacción de Horizon, se recalcula su hash y se comprueban firma, emisor,
          memo y operación contra el SHA-256 del documento registrado.
        </p>
        <ListaChecks v={v} />
      </Card>

      {evidencia.tipo === "document" && hash && <VerificarArchivo evidencia={evidencia} />}
    </div>
  );
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

function VerificarArchivo({ evidencia }: { evidencia: EvidenciaPublica }) {
  const [archivo, setArchivo] = useState<{ nombre: string; hash: string } | null>(null);
  const [resultado, setResultado] = useState<ResultadoArchivo | Fallo | null>(null);
  const [verificando, setVerificando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const elegir = async (f: File | undefined) => {
    setResultado(null);
    setArchivo(null);
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      setResultado({ ok: false, codigo: "TAMANO", error: "El documento supera 4 MiB" });
      return;
    }
    setVerificando(true);
    const bytes = await f.arrayBuffer();
    setArchivo({ nombre: f.name, hash: await sha256Hex(bytes) });
    const r = await pedir<ResultadoArchivo>(`${API}?id=${encodeURIComponent(evidencia.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    setResultado(r);
    setVerificando(false);
    if (input.current) input.current.value = "";
  };

  const r = resultado?.ok ? resultado : null;
  const coincide = r?.verificacion.result === "matches";

  return (
    <Card>
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <FileSearch className="h-4 w-4 text-primary" />
        Verificar un documento
      </h4>
      <p className="mb-3 text-xs text-muted-foreground">
        Elegí un archivo para compararlo byte a byte con el registro. El SHA-256 se calcula en el
        navegador y el servidor local repite la verificación completa contra Stellar Testnet. El
        archivo no se guarda ni se publica.
      </p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent/60">
        {verificando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        {verificando ? "Verificando…" : "Elegir documento"}
        <input
          ref={input}
          type="file"
          className="sr-only"
          disabled={verificando}
          onChange={(e) => void elegir(e.target.files?.[0])}
        />
      </label>

      {archivo && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Dato k="Archivo">{archivo.nombre}</Dato>
          <Dato k="SHA-256 calculado en el navegador" mono>
            {archivo.hash}
          </Dato>
        </div>
      )}
      {resultado && !resultado.ok && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-danger-muted p-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {resultado.error}
        </p>
      )}
      {r && (
        <div
          className={cn(
            "am-entrada mt-4 rounded-lg border p-3",
            coincide
              ? "border-success/40 bg-success-muted"
              : "border-destructive/40 bg-danger-muted",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              coincide ? "text-success" : "text-destructive",
            )}
          >
            {coincide ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {coincide
              ? "Coincide: el documento es idéntico al registrado en Stellar Testnet."
              : r.verificacion.checks.content === false
                ? "Diferencia detectada: este documento no es el registrado."
                : "No se pudo verificar la transacción en la red."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.bytes} bytes · SHA-256 del archivo{" "}
            <span className="font-mono">{acortar(r.digestArchivo, 10)}</span>
            {r.digestArchivo === evidencia.digest ? " = " : " ≠ "}
            registrado <span className="font-mono">{acortar(evidencia.digest, 10)}</span>
          </p>
          <div className="mt-3">
            <ListaChecks v={r.verificacion} />
          </div>
        </div>
      )}
    </Card>
  );
}
