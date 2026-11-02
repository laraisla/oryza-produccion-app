import { ExternalLink, Radio, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  CUENTAS_DVP,
  LIQUIDACIONES_DVP,
  consultarSaldos,
  consultarTransaccion,
  urlCuenta,
  urlTx,
  type SaldoHorizon,
  type TransaccionHorizon,
} from "@/lib/horizon";
import { Card } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

const corto = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);
const NOMBRE_CUENTA: Record<string, string> = {
  [CUENTAS_DVP.molino]: "Molino",
  [CUENTAS_DVP.comprador]: "Comprador",
  [CUENTAS_DVP.escrow]: "Escrow",
};
const cuentaLegible = (c?: string) => (c ? `${NOMBRE_CUENTA[c] ? `${NOMBRE_CUENTA[c]} · ` : ""}${corto(c)}` : "—");

type Estado<T> = { estado: "cargando" } | { estado: "ok"; datos: T } | { estado: "error"; mensaje: string };

export function EnVivoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
      <Radio className="h-3 w-3" />En vivo · testnet
    </span>
  );
}

/** Liquidaciones DvP experimentales (AgroFlow A), verificadas del lado cliente contra Horizon testnet. */
export function EvidenciaDvP() {
  const [sel, setSel] = useState(0);
  const [tx, setTx] = useState<Estado<TransaccionHorizon>>({ estado: "cargando" });
  const [saldos, setSaldos] = useState<Estado<Record<string, SaldoHorizon[]>>>({ estado: "cargando" });
  const liquidacion = LIQUIDACIONES_DVP[sel]!;

  const cargar = useCallback(() => {
    let vigente = true;
    setTx({ estado: "cargando" });
    setSaldos({ estado: "cargando" });
    consultarTransaccion(liquidacion.hash)
      .then((datos) => vigente && setTx({ estado: "ok", datos }))
      .catch((e: unknown) => vigente && setTx({ estado: "error", mensaje: e instanceof Error ? e.message : "Horizon no disponible" }));
    Promise.all([consultarSaldos(CUENTAS_DVP.molino), consultarSaldos(CUENTAS_DVP.comprador)])
      .then(([molino, comprador]) => vigente && setSaldos({ estado: "ok", datos: { [CUENTAS_DVP.molino]: molino, [CUENTAS_DVP.comprador]: comprador } }))
      .catch((e: unknown) => vigente && setSaldos({ estado: "error", mensaje: e instanceof Error ? e.message : "Horizon no disponible" }));
    return () => {
      vigente = false;
    };
  }, [liquidacion.hash]);

  useEffect(() => cargar(), [cargar]);

  const conectado = tx.estado === "ok" || saldos.estado === "ok";
  const caido = tx.estado === "error" && saldos.estado === "error";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Liquidaciones DvP verificadas (motor AgroFlow)</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Liquidaciones experimentales realizadas previamente por AgroFlow A. Las operaciones comerciales simuladas de AgroGlobal B
              <strong> no generaron</strong> estas transacciones.
            </p>
          </div>
          {conectado && <EnVivoBadge />}
        </div>
        <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Activos de prueba emitidos por la plataforma en Stellar testnet (no es USDC de Circle). Verificado en tiempo real desde Horizon.
          El token ARROZ es un registro de prueba: no certifica mercadería física.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium" htmlFor="dvp-sel">Liquidación:</label>
          <select id="dvp-sel" value={sel} onChange={(e) => setSel(+e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {LIQUIDACIONES_DVP.map((l, i) => <option key={l.hash} value={i}>{l.id} · {corto(l.hash)}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => cargar()}><RefreshCw className="h-3.5 w-3.5" />Reconsultar</Button>
          <a className="inline-flex items-center gap-1 text-sm text-primary underline" href={urlTx(liquidacion.hash)} target="_blank" rel="noreferrer">
            Ver en StellarExpert <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{liquidacion.hash}</p>
      </Card>

      {caido && (
        <Card className="border-warning/40 bg-warning-muted/50">
          <p className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="h-4 w-4 text-warning-foreground" />Horizon no disponible</p>
          <p className="mt-1 text-xs text-muted-foreground">No se pudo consultar horizon-testnet.stellar.org. El resto de la demo no se ve afectado. Podés verificar el hash directamente en StellarExpert.</p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h4 className="mb-3 text-sm font-semibold">Transacción</h4>
          {tx.estado === "cargando" && <p className="text-sm text-muted-foreground">Consultando Horizon…</p>}
          {tx.estado === "error" && !caido && <p className="text-sm text-destructive">{tx.mensaje}</p>}
          {tx.estado === "error" && caido && <p className="text-sm text-muted-foreground">Sin datos en vivo.</p>}
          {tx.estado === "ok" && (
            <div className="space-y-3 text-sm">
              <dl className="am-escalonar grid grid-cols-2 gap-3">
                <Dato k="Fecha">{new Date(tx.datos.fecha).toLocaleString("es-AR")}</Dato>
                <Dato k="Ledger"><span className="font-mono tabular-nums">{String(tx.datos.ledger)}</span></Dato>
                <Dato k="Resultado">{tx.datos.exitosa ? "Exitosa" : "Fallida"}</Dato>
                <Dato k="Memo">{tx.datos.memo ? `${tx.datos.memo} (${tx.datos.memoTipo ?? "?"})` : "Sin memo"}</Dato>
              </dl>
              {liquidacion.memoEsperado && tx.datos.memo && tx.datos.memo !== liquidacion.memoEsperado && (
                <p className="text-xs text-warning-foreground">El memo informado por Horizon difiere del memo esperado ({liquidacion.memoEsperado}).</p>
              )}
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Operaciones ({tx.datos.operaciones.length})</p>
                <ul className="am-escalonar space-y-1.5">
                  {tx.datos.operaciones.map((o, i) => (
                    <li key={i} className="rounded-md border border-border p-2 text-xs">
                      <p className="font-semibold">{o.tipo}{o.activo && o.activo !== "otro" ? ` · ${o.activo}` : ""}</p>
                      {o.monto && <p>{Number(o.monto).toLocaleString("es-AR", { maximumFractionDigits: 7 })} {o.codigoActivo}{o.activo === "otro" && " (activo no identificado como de la plataforma)"}</p>}
                      {(o.de || o.a) && <p className="text-muted-foreground">{cuentaLegible(o.de)} → {cuentaLegible(o.a)}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h4 className="mb-3 text-sm font-semibold">Saldos actuales (testnet)</h4>
          {saldos.estado === "cargando" && <p className="text-sm text-muted-foreground">Consultando Horizon…</p>}
          {saldos.estado === "error" && <p className="text-sm text-muted-foreground">{caido ? "Sin datos en vivo." : saldos.mensaje}</p>}
          {saldos.estado === "ok" && (
            <div className="am-escalonar space-y-4">
              {[CUENTAS_DVP.molino, CUENTAS_DVP.comprador].map((c) => (
                <div key={c}>
                  <p className="text-sm font-medium">{NOMBRE_CUENTA[c]} <a className="font-mono text-xs text-primary underline" href={urlCuenta(c)} target="_blank" rel="noreferrer">{corto(c)}</a></p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {(saldos.datos[c] ?? []).map((b) => (
                      <li key={`${b.codigo}-${b.emisor ?? "n"}`} className="flex justify-between"><span>{b.activo === "USDC de prueba" ? "USDC de prueba" : b.codigo}</span><span className="font-mono">{Number(b.saldo).toLocaleString("es-AR", { maximumFractionDigits: 7 })}</span></li>
                    ))}
                    {(saldos.datos[c] ?? []).length === 0 && <li className="text-muted-foreground">Sin saldos</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{children}</dd></div>;
}
