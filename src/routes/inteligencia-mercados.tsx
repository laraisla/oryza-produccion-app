import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, ExternalLink, Globe2, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  EXPORTACIONES_ARGENTINA,
  MERCADOS,
  REFERENCIA_SECTORIAL,
  fmtTn,
  type RequisitoMercado,
} from "@/data/mercados";
import { pageHead } from "@/lib/seo";
import { useAppStore } from "@/lib/store";
import { Card, PageHeader, StatusBadge, tonoEstado } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { escalonado, retraso, useSeccionAnimada } from "@/lib/animacion";

export const Route = createFileRoute("/inteligencia-mercados")({
  head: () =>
    pageHead(
      "Inteligencia de Mercados",
      "Exportaciones históricas de arroz argentino, fichas de mercados y requisitos documentales por destino, con fuentes verificables.",
    ),
  component: InteligenciaMercados,
});

type Pestaña = "exportaciones" | "mercados" | "requisitos";

function InteligenciaMercados() {
  const [pestaña, setPestaña] = useState<Pestaña>("exportaciones");
  useSeccionAnimada("inteligencia-mercados");
  return (
    <div>
      <PageHeader
        titulo="Inteligencia de Mercados"
        descripcion="Datos comerciales verificables y reglas documentales por destino para arroz argentino. Las exportaciones históricas no son compradores activos: se muestran separadas de las solicitudes y del matching."
      />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {(
          [
            ["exportaciones", "Exportaciones históricas"],
            ["mercados", "Mercados (10)"],
            ["requisitos", "Requisitos documentales"],
          ] as [Pestaña, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPestaña(id)}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              pestaña === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {pestaña === "exportaciones" && <SeccionExportaciones />}
      {pestaña === "mercados" && <SeccionMercados />}
      {pestaña === "requisitos" && <SeccionRequisitos />}
    </div>
  );
}

/* ---------------- Exportaciones históricas ---------------- */

function SeccionExportaciones() {
  const [hs, setHs] = useState(0);
  const producto = EXPORTACIONES_ARGENTINA[hs]!;
  const max = Math.max(...producto.datos.map((d) => d.toneladas));
  const total = producto.datos.reduce((a, d) => a + d.toneladas, 0);

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              Exportaciones argentinas · HS {producto.hs} — {producto.descripcion}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Año {producto.anio} · Unidad: {producto.unidad} · Total mostrado: {fmtTn(total)} tn
            </p>
          </div>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            {EXPORTACIONES_ARGENTINA.map((p, i) => (
              <button
                key={p.hs}
                onClick={() => setHs(i)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium",
                  i === hs ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                HS {p.hs}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {producto.datos.map((d, i) => {
            const pct = Math.max((d.toneladas / max) * 100, 1.5);
            const etiquetaDentro = pct > 14;
            return (
              <div key={d.pais} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm text-foreground">{d.pais}</span>
                <div className="flex h-6 flex-1 items-center rounded-md bg-muted">
                  <div
                    className="am-barra flex h-full items-center justify-end rounded-md bg-primary pr-2"
                    style={{ width: `${pct}%`, ...escalonado(i, 150, 60) }}
                  >
                    {etiquetaDentro && (
                      <span className="text-[11px] font-semibold text-primary-foreground">{fmtTn(d.toneladas)}</span>
                    )}
                  </div>
                  {!etiquetaDentro && (
                    <span className="pl-2 text-[11px] font-semibold text-foreground">{fmtTn(d.toneladas)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            Fuente:{" "}
            <a href={producto.fuenteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">
              {producto.fuente} <ExternalLink className="h-3 w-3" />
            </a>
          </span>
          <span>Año: {producto.anio}</span>
          <span>Producto: HS {producto.hs}</span>
          <span>Unidad: {producto.unidad}</span>
          <span>Actualizado: {producto.fechaActualizacion}</span>
        </div>
      </Card>

      <Card>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Landmark className="h-4 w-4 text-primary" /> Referencia sectorial
        </h3>
        <p className="mt-2 text-sm text-foreground">
          {REFERENCIA_SECTORIAL.titulo}: <strong>{fmtTn(REFERENCIA_SECTORIAL.toneladas)} toneladas</strong> y{" "}
          <strong>USD {REFERENCIA_SECTORIAL.usdMillones} millones</strong>.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fuente:{" "}
          <a href={REFERENCIA_SECTORIAL.fuenteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">
            {REFERENCIA_SECTORIAL.fuente} <ExternalLink className="h-3 w-3" />
          </a>{" "}
          · Actualizado: {REFERENCIA_SECTORIAL.fechaActualizacion}
        </p>
      </Card>

      <Card className="border-warning/40 bg-warning-muted/40">
        <p className="text-sm text-foreground">
          <strong>Importante:</strong> estas cifras son exportaciones históricas del país, no compradores activos.
          Las solicitudes de compra registradas están en <em>Solicitudes de compra</em> y las oportunidades detectadas
          por el motor en <em>Matching inteligente</em>.
        </p>
      </Card>
    </div>
  );
}

/* ---------------- Mercados ---------------- */

function SeccionMercados() {
  return (
    <div className="am-escalonar grid gap-4 md:grid-cols-2 xl:grid-cols-3" style={retraso(80)}>
      {MERCADOS.map((m) => (
        <Card key={m.pais} className="am-tarjeta">
          <div className="flex items-start justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Globe2 className="h-4 w-4 text-primary" /> {m.pais}
            </h3>
            {m.clasificacion === "documentado" ? (
              <StatusBadge tono="success">Comercio documentado</StatusBadge>
            ) : (
              <StatusBadge tono="info">Prospección</StatusBadge>
            )}
          </div>
          {m.volumenTn ? (
            <ul className="mt-3 space-y-1">
              {m.volumenTn.map((v) => (
                <li key={v.hs} className="text-sm text-foreground">
                  HS {v.hs}: <strong>{fmtTn(v.toneladas)} tn</strong> ({v.anio})
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Sin volumen estadístico cargado — no se informan cifras.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{m.notas}</p>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Requisitos documentales ---------------- */

const CAMPOS_REQUISITO: { key: keyof RequisitoMercado; label: string }[] = [
  { key: "pais", label: "País de destino" },
  { key: "hs", label: "HS/NCM" },
  { key: "tipoArroz", label: "Tipo de arroz" },
  { key: "gradoElaboracion", label: "Grado de elaboración" },
  { key: "presentacion", label: "Presentación" },
  { key: "uso", label: "Uso" },
  { key: "condicionesContractuales", label: "Condiciones contractuales" },
  { key: "comprador", label: "Comprador" },
  { key: "nombre", label: "Nombre" },
  { key: "descripcion", label: "Descripción" },
  { key: "autoridad", label: "Autoridad o responsable" },
  { key: "documentoNecesario", label: "Documento necesario" },
  { key: "fuenteOficial", label: "Fuente oficial (URL)" },
  { key: "ultimaComprobacion", label: "Última comprobación" },
  { key: "vigencia", label: "Vigencia" },
  { key: "costo", label: "Costo (si está verificado)" },
  { key: "responsable", label: "Responsable de obtenerlo" },
];

function formVacio(): RequisitoMercado {
  return {
    id: "",
    pais: "",
    hs: "100630",
    tipoArroz: "Todos",
    gradoElaboracion: "Todos",
    presentacion: "Todas",
    uso: "Consumo humano",
    condicionesContractuales: "Todas",
    comprador: "Todos",
    nombre: "",
    descripcion: "",
    autoridad: "",
    caracter: "legal",
    documentoNecesario: "",
    fuenteOficial: "",
    ultimaComprobacion: new Date().toISOString().slice(0, 10),
    vigencia: "Pendiente de verificación",
    estado: "Pendiente de verificación",
    costo: "No verificado",
    responsable: "Exportador",
  };
}

function SeccionRequisitos() {
  const { state, dispatch } = useAppStore();
  const [filtroPais, setFiltroPais] = useState("Todos");
  const [editando, setEditando] = useState<RequisitoMercado | null>(null);

  const paises = useMemo(
    () => ["Todos", ...Array.from(new Set(state.requisitos.map((r) => r.pais))).sort()],
    [state.requisitos],
  );
  const visibles = state.requisitos.filter((r) => filtroPais === "Todos" || r.pais === filtroPais);

  function guardar() {
    if (!editando) return;
    if (!editando.pais.trim() || !editando.nombre.trim()) {
      toast.error("Completá al menos país y nombre del requisito");
      return;
    }
    if (editando.id) {
      dispatch({ type: "updateRequisito", id: editando.id, patch: editando });
      toast.success("Requisito actualizado");
    } else {
      const id = `REQ-${String(Date.now()).slice(-6)}`;
      dispatch({ type: "addRequisito", requisito: { ...editando, id } });
      toast.success("Requisito agregado");
    }
    setEditando(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {paises.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          onClick={() => setEditando(formVacio())}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nuevo requisito
        </button>
        <p className="text-xs text-muted-foreground">
          Base editable. Los costos y vigencias no verificados se muestran como tales; nunca se inventan tarifas.
        </p>
      </div>

      {editando && (
        <Card className="border-primary/40">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {editando.id ? `Editar ${editando.id}` : "Nuevo requisito"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAMPOS_REQUISITO.map(({ key, label }) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
                <input
                  value={String(editando[key])}
                  onChange={(e) => setEditando({ ...editando, [key]: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Carácter</span>
              <select
                value={editando.caracter}
                onChange={(e) => setEditando({ ...editando, caracter: e.target.value as RequisitoMercado["caracter"] })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="legal">Legal</option>
                <option value="operativo">Operativo</option>
                <option value="contractual">Contractual</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Estado</span>
              <select
                value={editando.estado}
                onChange={(e) => setEditando({ ...editando, estado: e.target.value as RequisitoMercado["estado"] })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="Verificado">Verificado</option>
                <option value="Pendiente de verificación">Pendiente de verificación</option>
                <option value="Vencido">Vencido</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={guardar}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Guardar
            </button>
            <button
              onClick={() => setEditando(null)}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {visibles.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {r.nombre} <span className="ml-1 text-xs font-normal text-muted-foreground">({r.id})</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.pais} · HS {r.hs} · {r.tipoArroz} · {r.gradoElaboracion} · {r.presentacion} · Uso: {r.uso}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tono={tonoEstado(r.estado)}>{r.estado}</StatusBadge>
                <StatusBadge tono="info">{r.caracter}</StatusBadge>
                <button
                  onClick={() => setEditando(r)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label={`Editar ${r.nombre}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: "removeRequisito", id: r.id });
                    toast.success("Requisito eliminado");
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label={`Eliminar ${r.nombre}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-sm text-foreground">{r.descripcion}</p>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="font-medium text-foreground">Autoridad</dt><dd>{r.autoridad}</dd></div>
              <div><dt className="font-medium text-foreground">Documento</dt><dd>{r.documentoNecesario}</dd></div>
              <div>
                <dt className="font-medium text-foreground">Fuente oficial</dt>
                <dd>
                  <a href={r.fuenteOficial} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">
                    {r.fuenteOficial} <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </div>
              <div><dt className="font-medium text-foreground">Última comprobación</dt><dd>{r.ultimaComprobacion}</dd></div>
              <div><dt className="font-medium text-foreground">Vigencia</dt><dd>{r.vigencia}</dd></div>
              <div><dt className="font-medium text-foreground">Costo</dt><dd>{r.costo}</dd></div>
              <div><dt className="font-medium text-foreground">Responsable</dt><dd>{r.responsable}</dd></div>
              <div><dt className="font-medium text-foreground">Condiciones</dt><dd>{r.condicionesContractuales}</dd></div>
              <div><dt className="font-medium text-foreground">Comprador</dt><dd>{r.comprador}</dd></div>
            </dl>
          </Card>
        ))}
        {visibles.length === 0 && (
          <Card>
            <p className="text-sm text-muted-foreground">No hay requisitos cargados para este filtro.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
