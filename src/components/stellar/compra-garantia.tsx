// ============================================================
// Compra con depósito en garantía en Stellar TESTNET (demo).
// Producto del marketplace → condiciones (local o exportación) →
// acuerdo REAL en el contrato Soroban (firma comprador de prueba) →
// reserva de stock + operación local → evidencia verificable.
// ============================================================

import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AvisoTestnet, ejecutarPasoTestnet } from "@/components/stellar/evidencia";
import { INCOTERMS, PUERTOS_ARGENTINA, fmtTn, fmtUsd, type Producto } from "@/data/demo";
import { useAppStore, useOrganizacionActiva } from "@/lib/store";
import { STELLAR, fmtActivo, montoAUnidades } from "@/lib/stellar/config";
import { validarCondiciones, type CondicionesOrden, type TipoOperacion } from "@/lib/stellar/terms";

const inp = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const MONTO_MAXIMO_PRUEBA = 50_000;

function nuevaReferencia(): string {
  const d = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `OC-${fecha}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function useFirmaTestnet(): boolean | null {
  const [habilitada, setHabilitada] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/public/stellar/acuerdos?info=1")
      .then((r) => r.json() as Promise<{ firmaHabilitada?: boolean }>)
      .then((j) => setHabilitada(!!j.firmaHabilitada))
      .catch(() => setHabilitada(false));
  }, []);
  return habilitada;
}

export function CompraGarantiaDialog({
  producto,
  onClose,
}: {
  producto: Producto | null;
  onClose: () => void;
}) {
  const { state, dispatch } = useAppStore();
  const org = useOrganizacionActiva();
  const navigate = useNavigate();
  const firma = useFirmaTestnet();
  const [tipo, setTipo] = useState<TipoOperacion>("local");
  const [cantidad, setCantidad] = useState(10);
  const [precio, setPrecio] = useState(500);
  const [incoterm, setIncoterm] = useState("FOB");
  const [puerto, setPuerto] = useState(PUERTOS_ARGENTINA[0] ?? "Buenos Aires");
  const [lugarEntrega, setLugarEntrega] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!producto) return;
    setCantidad(Math.min(10, producto.cantidadTn));
    setPrecio(producto.precioTnUsd ?? 500);
    setLugarEntrega(`Planta del vendedor, ${producto.provincia}`);
  }, [producto]);

  const condiciones: CondicionesOrden | null = useMemo(() => {
    if (!producto) return null;
    const total = +(cantidad * precio).toFixed(2);
    return {
      orden: "",
      tipo,
      vendedor: producto.empresa,
      comprador: `${org.nombreComercial} (demo)`,
      producto: {
        tipoArroz: producto.tipoArroz,
        variedad: producto.variedad,
        quebradoMaxPct: producto.quebradoPct,
        humedadMaxPct: producto.humedadPct,
        presentacion: producto.presentacion,
      },
      cantidadTn: cantidad,
      precioTnUsd: precio,
      totalUsd: total,
      ...(tipo === "exportacion"
        ? { incoterm, lugarDesignado: `Puerto de ${puerto}` }
        : { lugarEntrega }),
      condicionPago: `Depósito en garantía (Stellar Testnet, activo de prueba ${STELLAR.activo.code})`,
      nota: "Datos ficticios de demostración. Sin valor comercial.",
    };
  }, [producto, tipo, cantidad, precio, incoterm, puerto, lugarEntrega, org.nombreComercial]);

  const errores = condiciones ? validarCondiciones({ ...condiciones, orden: "OC" }) : [];
  if (producto && cantidad > producto.cantidadTn)
    errores.push(`Stock disponible: ${fmtTn(producto.cantidadTn)}`);
  if (
    producto &&
    (producto.empresa === org.razonSocial || producto.empresa === org.nombreComercial)
  )
    errores.push(
      "No podés comprar un lote de tu propia empresa: cambiá a la empresa compradora en la barra superior",
    );
  if (condiciones && condiciones.totalUsd > MONTO_MAXIMO_PRUEBA)
    errores.push(
      `El monto de prueba no puede superar ${MONTO_MAXIMO_PRUEBA.toLocaleString("es-AR")}`,
    );

  const confirmar = async () => {
    if (!producto || !condiciones || errores.length || enviando) return;
    setEnviando(true);
    const orden = { ...condiciones, orden: nuevaReferencia() };
    try {
      // 1. Acuerdo real en el contrato (si falla, no se reserva stock).
      const r = await ejecutarPasoTestnet({ etapa: "create", condiciones: orden });
      // 2. Reserva de stock (el reducer nunca deja cantidades negativas).
      dispatch({ type: "reservarStock", productoId: producto.id, cantidadTn: orden.cantidadTn });
      // 3. Registro local: acuerdo, cotización aceptada y operación.
      dispatch({
        type: "addAcuerdoStellar",
        acuerdo: {
          id: r.id,
          contractId: STELLAR.contractId,
          orderRef: orden.orden,
          tipo: orden.tipo,
          condiciones: orden,
          termsHash: r.termsHash ?? "",
          montoUnidades: r.montoUnidades ?? montoAUnidades(orden.totalUsd),
          transacciones: [{ etapa: "create", hash: r.hash }],
          productoId: producto.id,
          origen: "app",
          registradoEn: new Date().toISOString(),
        },
      });
      const opId = `OP-2026-${String(state.operaciones.length + 20).padStart(3, "0")}`;
      dispatch({
        type: "addCotizacion",
        cotizacion: {
          id: orden.orden.replace("OC-", "COT-"),
          vendedor: orden.vendedor,
          comprador: orden.comprador,
          producto: `Arroz ${producto.tipoArroz.toLowerCase()} ${producto.variedad.toLowerCase()}`,
          calidad: `Quebrado ≤ ${producto.quebradoPct}% · Humedad ≤ ${producto.humedadPct}%`,
          cantidadTn: orden.cantidadTn,
          precioTnUsd: orden.precioTnUsd,
          incoterm: orden.incoterm ?? "No aplica (venta local)",
          lugarDesignado: orden.lugarDesignado ?? orden.lugarEntrega ?? "",
          paisDestino: orden.tipo === "local" ? "Argentina" : "A definir",
          presentacion: producto.presentacion,
          fecha: new Date().toISOString().slice(0, 10),
          moneda: "USD",
          condiciones: orden.condicionPago,
          validezDias: 30,
          estado: "Aceptada",
          margenPct: 0,
        },
      });
      dispatch({
        type: "addOperacion",
        operacion: {
          id: opId,
          comprador: orden.comprador,
          vendedor: orden.vendedor,
          producto: `Arroz ${producto.tipoArroz.toLowerCase()} ${producto.variedad.toLowerCase()}`,
          cantidadContratadaTn: orden.cantidadTn,
          cantidadEmbarcadaTn: 0,
          precioPactadoTnUsd: orden.precioTnUsd,
          valorFacturadoUsd: 0,
          incoterm: orden.incoterm ?? "—",
          fechaProgramada: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
          puertoSalida: orden.tipo === "exportacion" ? puerto : (orden.lugarEntrega ?? ""),
          puertoDestino: orden.tipo === "exportacion" ? "A definir" : "Argentina",
          estadoDocumental:
            orden.tipo === "exportacion"
              ? "En preparación"
              : "No requiere documentación de exportación",
          estadoLogistico: "Cotización aceptada",
          estadoFinanciero: "Acuerdo creado en Testnet (sin depósito)",
          hitoActual: 1,
          tipoOperacion: orden.tipo,
          ...(orden.lugarEntrega ? { lugarEntrega: orden.lugarEntrega } : {}),
          acuerdoStellarId: r.id,
        },
      });
      toast.success(`Acuerdo #${r.id} creado en Stellar Testnet`, {
        description: `Stock reservado: ${fmtTn(orden.cantidadTn)}. Operación ${opId}.`,
      });
      onClose();
      void navigate({ to: "/evidencia-stellar", search: { acuerdo: r.id } });
    } catch (e) {
      toast.error("No se creó el acuerdo", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!producto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {producto && condiciones && (
          <>
            <DialogHeader>
              <DialogTitle>Comprar con garantía en Stellar</DialogTitle>
              <DialogDescription>
                {producto.nombre} · {producto.empresa}
              </DialogDescription>
            </DialogHeader>
            <AvisoTestnet />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Tipo de operación</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["local", "exportacion"] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={tipo === t ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTipo(t)}
                    >
                      {t === "local" ? "Venta local" : "Exportación"}
                    </Button>
                  ))}
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Cantidad (tn) · disp. {fmtTn(producto.cantidadTn)}
                </span>
                <input
                  type="number"
                  min={1}
                  max={producto.cantidadTn}
                  className={inp}
                  value={cantidad}
                  onChange={(e) => setCantidad(+e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Precio USD/tn</span>
                <input
                  type="number"
                  min={1}
                  className={inp}
                  value={precio}
                  onChange={(e) => setPrecio(+e.target.value)}
                />
              </label>
              {tipo === "exportacion" ? (
                <>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Incoterm</span>
                    <select
                      className={inp}
                      value={incoterm}
                      onChange={(e) => setIncoterm(e.target.value)}
                    >
                      {INCOTERMS.map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Puerto de salida
                    </span>
                    <select
                      className={inp}
                      value={puerto}
                      onChange={(e) => setPuerto(e.target.value)}
                    >
                      {PUERTOS_ARGENTINA.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="col-span-2 space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Lugar de entrega (sin Incoterm ni documentación de exportación)
                  </span>
                  <input
                    className={inp}
                    value={lugarEntrega}
                    onChange={(e) => setLugarEntrega(e.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span>Total</span>
                <span className="font-semibold">{fmtUsd(condiciones.totalUsd)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Monto en garantía (prueba)</span>
                <span>{fmtActivo(montoAUnidades(condiciones.totalUsd))}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Solo el hash SHA-256 de estas condiciones se registra en el contrato. El vendedor
                debe aceptarlas y el comprador depositar antes de cualquier liberación.
              </p>
            </div>
            {errores.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-destructive">
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {firma === false && (
              <p className="rounded-md border border-border bg-muted p-2 text-xs text-muted-foreground">
                Este servidor está en modo solo lectura: no tiene habilitada la firma con cuentas de
                prueba, así que no puede crear acuerdos. Los acuerdos existentes se pueden verificar
                en “Evidencia Stellar”.
              </p>
            )}
            <Button
              disabled={!firma || errores.length > 0 || enviando}
              onClick={() => void confirmar()}
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {enviando
                ? "Esperando confirmación de Testnet…"
                : "Generar acuerdo en Stellar Testnet"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
