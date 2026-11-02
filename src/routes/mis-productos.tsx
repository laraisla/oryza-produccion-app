import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { INCOTERMS, PROVINCIAS, PUERTOS_ARGENTINA, fmtTn, fmtUsd, type Producto } from "@/data/demo";
import { useAppStore, useOrganizacionActiva } from "@/lib/store";
import { pageHead } from "@/lib/seo";
import { Card, DemoBadge, PageHeader, StatusBadge, tonoEstado } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/mis-productos")({
  head: () => pageHead("Mis productos", "Publicá y gestioná tus lotes de arroz en el marketplace de AgroGlobal COMEX (prototipo demo)."),
  component: MisProductos,
});

const inp = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";

function MisProductos() {
  const { state, dispatch } = useAppStore();
  const org = useOrganizacionActiva();
  const esExportador = state.modo === "exportador";
  const [form, setForm] = useState({
    tipoArroz: "Blanco", variedad: "Largo fino", provincia: "Chaco", cantidadTn: 50, quebradoPct: 5,
    humedadPct: 13, presentacion: "Bolsas de 25 kg", precioTnUsd: "", fechaDisponibilidad: "",
    ncm: "", paisDestino: "", puerto: "", incoterm: "FOB",
  });
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const propios = state.productos.filter((p) => p.propio);

  const publicar = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `LOTE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const p: Producto = {
      id, nombre: `Arroz ${form.tipoArroz.toLowerCase()} ${form.variedad.toLowerCase()} — ${id} (Demo)`,
      tipoArroz: form.tipoArroz, variedad: form.variedad, empresa: org.razonSocial,
      provincia: form.provincia, pais: "Argentina", cantidadTn: +form.cantidadTn, quebradoPct: +form.quebradoPct,
      humedadPct: +form.humedadPct, presentacion: form.presentacion,
      ...(form.precioTnUsd ? { precioTnUsd: +form.precioTnUsd } : {}),
      ...(form.fechaDisponibilidad ? { fechaDisponibilidad: form.fechaDisponibilidad } : {}),
      ...(esExportador && form.ncm ? { ncm: form.ncm } : {}),
      ...(esExportador && form.paisDestino ? { paisDestino: form.paisDestino } : {}),
      ...(esExportador && form.puerto ? { puerto: form.puerto } : {}),
      ...(esExportador && form.paisDestino ? { incoterm: form.incoterm } : {}),
      estado: "Disponible", certificaciones: [], documentos: ["Declaración del oferente (demo)"],
      gradoElaboracion: "Blanqueado", propio: true,
    };
    dispatch({ type: "addProducto", producto: p });
    toast.success(`Lote ${id} publicado en el marketplace`);
  };

  return (
    <div>
      <PageHeader
        titulo="Mis productos"
        descripcion={
          esExportador
            ? "Publicá lotes propios con datos comerciales y, opcionalmente, de exportación."
            : "Publicá lotes para vender dentro de Argentina. No se piden datos de exportación."
        }
        acciones={<DemoBadge />}
      />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <h2 className="mb-4 text-base font-semibold">Publicar nuevo lote</h2>
          <form onSubmit={publicar} className="grid grid-cols-2 gap-3">
            <L t="Tipo de arroz"><select className={inp} value={form.tipoArroz} onChange={(e) => set("tipoArroz", e.target.value)}><option>Blanco</option><option>Integral</option><option>Aromático</option><option>Parboil</option></select></L>
            <L t="Variedad"><select className={inp} value={form.variedad} onChange={(e) => set("variedad", e.target.value)}><option>Largo fino</option><option>Largo ancho</option><option>Jazmín</option><option>Doble carolina</option></select></L>
            <L t={esExportador ? "Provincia" : "Ubicación"}><select className={inp} value={form.provincia} onChange={(e) => set("provincia", e.target.value)}>{PROVINCIAS.map((p) => <option key={p}>{p}</option>)}</select></L>
            <L t="Cantidad (tn)"><input type="number" min={1} className={inp} value={form.cantidadTn} onChange={(e) => set("cantidadTn", e.target.value)} /></L>
            <L t="Quebrado (%)"><input type="number" step={0.5} className={inp} value={form.quebradoPct} onChange={(e) => set("quebradoPct", e.target.value)} /></L>
            <L t="Humedad (%)"><input type="number" step={0.5} className={inp} value={form.humedadPct} onChange={(e) => set("humedadPct", e.target.value)} /></L>
            <L t="Presentación"><select className={inp} value={form.presentacion} onChange={(e) => set("presentacion", e.target.value)}><option>Bolsas de 25 kg</option><option>Bolsas de 50 kg</option><option>Envases de 1 kg</option><option>Big bags de 1.000 kg</option><option>A granel</option></select></L>
            <L t="Precio indicativo USD/tn (opcional)"><input type="number" className={inp} value={form.precioTnUsd} onChange={(e) => set("precioTnUsd", e.target.value)} /></L>
            {!esExportador && (
              <L t="Fecha de disponibilidad"><input type="date" className={inp} value={form.fechaDisponibilidad} onChange={(e) => set("fechaDisponibilidad", e.target.value)} /></L>
            )}
            {esExportador && (
              <>
                <div className="col-span-2 mt-1 border-t border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground">Datos de exportación (opcionales)</p>
                </div>
                <L t="NCM"><input className={inp} placeholder="1006.30" value={form.ncm} onChange={(e) => set("ncm", e.target.value)} /></L>
                <L t="País de destino"><input className={inp} value={form.paisDestino} onChange={(e) => set("paisDestino", e.target.value)} /></L>
                <L t="Puerto de salida"><select className={inp} value={form.puerto} onChange={(e) => set("puerto", e.target.value)}><option value="">Sin definir</option>{PUERTOS_ARGENTINA.map((p) => <option key={p}>{p}</option>)}</select></L>
                <L t="Incoterm"><select className={inp} value={form.incoterm} onChange={(e) => set("incoterm", e.target.value)}>{INCOTERMS.map((i) => <option key={i}>{i}</option>)}</select></L>
              </>
            )}
            <Button type="submit" className="col-span-2 mt-2"><Plus className="h-4 w-4" />Publicar lote</Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold">Lotes publicados por tu empresa</h2>
          {propios.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Todavía no publicaste lotes. Completá el formulario para crear el primero.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-2">ID</th><th className="pb-2">Producto</th><th className="pb-2">Volumen</th><th className="pb-2">Calidad</th><th className="pb-2">Precio</th><th className="pb-2">Estado</th><th /></tr></thead>
              <tbody>{propios.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="py-2.5 font-mono text-xs">{p.id}</td>
                  <td>{p.tipoArroz} {p.variedad}</td>
                  <td>{fmtTn(p.cantidadTn)}</td>
                  <td className="text-xs">Q {p.quebradoPct}% · H {p.humedadPct}%</td>
                  <td>{p.precioTnUsd ? fmtUsd(p.precioTnUsd) : "—"}</td>
                  <td><StatusBadge tono={tonoEstado(p.estado)}>{p.estado}</StatusBadge></td>
                  <td><button aria-label="Eliminar" onClick={() => { dispatch({ type: "removeProducto", id: p.id }); toast("Lote eliminado"); }} className="rounded p-1.5 text-muted-foreground hover:bg-danger-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </div>
  );
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">{t}</span>{children}</label>;
}
