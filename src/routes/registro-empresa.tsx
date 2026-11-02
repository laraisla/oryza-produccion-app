// ============================================================
// Alta de empresa con branding automático desde la URL
// corporativa. Flujo: datos + sitio web → análisis seguro en
// el servidor → vista previa de la identidad → confirmar,
// ajustar o usar el diseño original de AgroGlobal.
// El análisis de la URL NO verifica titularidad: la empresa
// queda como "verificación pendiente" (demo).
// ============================================================

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, CheckCircle2, CircleDashed, Loader2, ShieldAlert, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ACTIVIDADES, MODOS, modosDisponibles, type Actividad, type Organizacion, type TemaMarca } from "@/data/organizaciones";
import { PROVINCIAS } from "@/data/demo";
import { temaDesdeDeteccion, tonalidades, advertenciaLegibilidad, type DeteccionMarca } from "@/lib/marca";
import { useAppStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";
import { Card, DemoBadge, PageHeader, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/registro-empresa")({
  head: () =>
    pageHead(
      "Registrar empresa",
      "Alta de una organización en AgroGlobal COMEX con detección automática de identidad visual desde su sitio web (demo).",
    ),
  component: RegistroEmpresa,
});

const inp = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";

const ETAPAS = [
  "Analizando sitio web",
  "Identificando logotipo",
  "Detectando colores",
  "Generando identidad visual",
  "Vista previa disponible",
] as const;

type Fase = "formulario" | "analizando" | "preview";

function RegistroEmpresa() {
  const { state, dispatch } = useAppStore();
  const navigate = useNavigate();
  const [fase, setFase] = useState<Fase>("formulario");
  const [etapa, setEtapa] = useState(0);
  const [form, setForm] = useState({
    razonSocial: "",
    nombreComercial: "",
    pais: "Argentina",
    provincia: "Corrientes",
    sitioWeb: "",
    contacto: "",
    actividades: ["productor"] as Actividad[],
  });
  const [deteccion, setDeteccion] = useState<DeteccionMarca | null>(null);
  const [temaPropuesto, setTemaPropuesto] = useState<TemaMarca | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleActividad = (a: Actividad) =>
    setForm((f) => ({
      ...f,
      actividades: f.actividades.includes(a) ? f.actividades.filter((x) => x !== a) : [...f.actividades, a],
    }));

  const analizar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razonSocial.trim() || !form.nombreComercial.trim()) {
      toast.error("Completá la razón social y el nombre comercial");
      return;
    }
    if (!form.actividades.length) {
      toast.error("Seleccioná al menos una actividad");
      return;
    }
    if (!form.sitioWeb.trim()) {
      // Sin sitio web: alta directa con el diseño original de AgroGlobal.
      crearOrganizacion(null);
      return;
    }
    setFase("analizando");
    setEtapa(0);
    // Las etapas avanzan como progreso visual mientras el servidor analiza.
    const timers = [1, 2, 3].map((i) => window.setTimeout(() => setEtapa(i), i * 900));
    try {
      const res = await fetch("/api/public/marca/detectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.sitioWeb }),
      });
      const data = (await res.json()) as ({ ok: true } & DeteccionMarca) | { ok: false; error: string };
      if (!data.ok) {
        toast.warning("No se pudo analizar el sitio", {
          description: `${data.error} Podés continuar el registro y cargar la identidad manualmente desde Mi empresa.`,
        });
        crearOrganizacion(null);
        return;
      }
      setEtapa(4);
      const det: DeteccionMarca = {
        nombre: data.nombre,
        faviconUrl: data.faviconUrl,
        logoUrl: data.logoUrl,
        colores: data.colores ?? [],
        tipografia: data.tipografia,
        faltantes: data.faltantes ?? [],
      };
      setDeteccion(det);
      setTemaPropuesto(temaDesdeDeteccion(det, form.sitioWeb));
      setFase("preview");
    } catch {
      toast.error("Error de red al analizar el sitio", {
        description: "Podés continuar el registro y cargar la identidad manualmente.",
      });
      crearOrganizacion(null);
    } finally {
      timers.forEach((t) => window.clearTimeout(t));
    }
  };

  const crearOrganizacion = (tema: TemaMarca | null) => {
    const id = `ORG-${Date.now().toString(36).toUpperCase()}`;
    const org: Organizacion = {
      id,
      razonSocial: form.razonSocial,
      nombreComercial: form.nombreComercial,
      pais: form.pais,
      provincia: form.provincia,
      actividades: form.actividades,
      ...(form.sitioWeb ? { sitioWeb: form.sitioWeb } : {}),
      ...(form.contacto ? { contacto: form.contacto } : {}),
      ...(tema ? { tema } : {}),
      demo: true,
    };
    dispatch({ type: "addOrganizacion", organizacion: org });
    dispatch({ type: "setOrganizacion", id });
    toast.success(tema ? "Empresa registrada con su identidad visual" : "Empresa registrada", {
      description: tema
        ? "El espacio de trabajo ya usa los colores y el logo detectados."
        : "Usa el diseño original de AgroGlobal; podés personalizarlo desde Mi empresa.",
    });
    void navigate({ to: "/" });
  };

  const modos = modosDisponibles({ actividades: form.actividades });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo="Registrar empresa"
        descripcion="Ingresá el sitio web de tu empresa y AgroGlobal prepara automáticamente un espacio de trabajo con su identidad visual. Todo es demostrativo."
        acciones={<DemoBadge />}
      />

      {fase === "formulario" && (
        <Card>
          <form className="grid grid-cols-2 gap-3" onSubmit={analizar}>
            <L t="Razón social"><input className={inp} value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} placeholder="ORYZA S.A." /></L>
            <L t="Nombre comercial"><input className={inp} value={form.nombreComercial} onChange={(e) => set("nombreComercial", e.target.value)} placeholder="Oryza" /></L>
            <L t="País"><input className={inp} value={form.pais} onChange={(e) => set("pais", e.target.value)} /></L>
            <L t="Provincia">
              <select className={inp} value={form.provincia} onChange={(e) => set("provincia", e.target.value)}>
                {PROVINCIAS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </L>
            <div className="col-span-2">
              <L t="Sitio web de tu empresa">
                <input className={inp} value={form.sitioWeb} onChange={(e) => set("sitioWeb", e.target.value)} placeholder="https://oryzasa.com/" />
              </L>
              <p className="mt-1 text-xs text-muted-foreground">
                Al registrar, analizamos el sitio de forma segura (solo lectura, sin ejecutar código) para detectar logo y colores. Si lo dejás vacío, se usa el diseño original de AgroGlobal.
              </p>
            </div>
            <L t="Contacto empresarial"><input className={inp} value={form.contacto} onChange={(e) => set("contacto", e.target.value)} placeholder="comercial@miempresa.com.ar" /></L>
            <div className="col-span-2">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Actividades de la empresa</p>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVIDADES.map((a) => (
                  <label key={a.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm", form.actividades.includes(a.id) ? "border-primary bg-accent" : "border-border")}>
                    <input type="checkbox" checked={form.actividades.includes(a.id)} onChange={() => toggleActividad(a.id)} className="accent-primary" />
                    {a.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Espacios de trabajo habilitados: {modos.map((m) => MODOS[m].label).join(" · ")}
              </p>
            </div>
            <Button type="submit" className="col-span-2">
              <Wand2 className="h-4 w-4" /> Registrar y detectar identidad
            </Button>
          </form>
        </Card>
      )}

      {fase === "analizando" && (
        <Card>
          <h2 className="mb-4 text-base font-semibold">Analizando {form.sitioWeb}</h2>
          <ul className="space-y-3">
            {ETAPAS.map((e, i) => (
              <li key={e} className="flex items-center gap-3 text-sm">
                {i < etapa ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : i === etapa ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-muted-foreground/50" />
                )}
                <span className={i <= etapa ? "" : "text-muted-foreground/60"}>{e}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {fase === "preview" && temaPropuesto && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold">Preparamos AgroGlobal con la identidad visual de tu empresa</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Detectado desde {form.sitioWeb}. Nada es definitivo: podés ajustarla o usar el diseño original.
            </p>
            {deteccion && deteccion.faltantes.length > 0 && (
              <p className="mt-2 rounded-md border border-warning/40 bg-warning-muted/50 px-3 py-2 text-xs text-warning-foreground">
                No se pudieron detectar: {deteccion.faltantes.join(", ")}. Podés cargarlos manualmente después desde Mi empresa.
              </p>
            )}
            <VistaPreviaRegistro tema={temaPropuesto} nombre={form.nombreComercial} />
            {advertenciaLegibilidad(temaPropuesto) && (
              <p className="mt-3 text-xs text-warning-foreground">{advertenciaLegibilidad(temaPropuesto)}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => crearOrganizacion(temaPropuesto)}>Usar esta apariencia</Button>
              <Button variant="outline" onClick={() => { crearOrganizacion(temaPropuesto); }}>
                Ajustar identidad después
              </Button>
              <Button variant="ghost" onClick={() => crearOrganizacion(null)}>Utilizar diseño original de AgroGlobal</Button>
            </div>
          </Card>

          <Card className="border-info/40 bg-info-muted/40">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-info" />
              <div>
                <h3 className="text-sm font-semibold">Verificación de titularidad pendiente</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  El análisis de la URL no demuestra que representés a esta empresa. Antes de publicar la identidad de forma visible para otras organizaciones, AgroGlobal pedirá una verificación de autorización (procedimiento pendiente de implementación en el prototipo).
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {state.organizaciones.length > 0 && fase === "formulario" && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Building2 className="mr-1 inline h-3.5 w-3.5" />
          Ya hay {state.organizaciones.length} empresas en esta demo; cada una conserva su propia identidad visual.
        </p>
      )}
    </div>
  );
}

/** Vista previa funcional: sidebar, logo, nombre, botón, tarjetas, gráfico y tabla. */
function VistaPreviaRegistro({ tema, nombre }: { tema: TemaMarca; nombre: string }) {
  const series = tonalidades(tema.primario, 4);
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <div className="flex">
        {/* Barra lateral personalizada */}
        <div className="w-32 shrink-0 space-y-1.5 p-3" style={{ backgroundColor: "#173C32" }}>
          <div className="mb-3 flex items-center gap-2">
            {tema.logoUrl ? (
              <img src={tema.logoUrl} alt="Logo" className="h-6 w-6 rounded object-contain bg-white/90 p-0.5" />
            ) : (
              <div className="h-6 w-6 rounded" style={{ backgroundColor: tema.acento }} />
            )}
            <span className="truncate text-[10px] font-semibold text-white">{nombre}</span>
          </div>
          {["Mi negocio", "Productos", "Ventas", "Mensajes"].map((i, idx) => (
            <div
              key={i}
              className="rounded px-1.5 py-1 text-[9px]"
              style={idx === 0 ? { backgroundColor: `${tema.acento}33`, color: "#fff" } : { color: "rgba(255,255,255,0.55)" }}
            >
              {i}
            </div>
          ))}
        </div>
        {/* Contenido */}
        <div className="flex-1 space-y-3 bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold">Dashboard comercial</p>
              <p className="text-[9px] text-muted-foreground">Vista previa con la identidad de {nombre}</p>
            </div>
            <button className="rounded-md px-3 py-1 text-[10px] font-semibold text-white" style={{ backgroundColor: tema.primario }}>
              Botón principal
            </button>
          </div>
          {/* Tarjetas de indicadores */}
          <div className="grid grid-cols-3 gap-2">
            {["Productos", "Ventas", "Alertas"].map((t, i) => (
              <div key={t} className="rounded-md border border-border p-2">
                <div className="mb-1 h-1.5 w-8 rounded" style={{ backgroundColor: series[i] }} />
                <p className="text-[9px] text-muted-foreground">{t}</p>
                <p className="text-xs font-bold">{[12, 7, 3][i]}</p>
              </div>
            ))}
          </div>
          {/* Gráfico de barras con tonalidades de marca */}
          <div className="flex items-end gap-1.5 rounded-md border border-border p-2">
            {[40, 70, 55, 90, 65].map((h, i) => (
              <div key={i} className="w-8 rounded-t" style={{ height: h / 2, backgroundColor: series[i % series.length] }} />
            ))}
          </div>
          {/* Tabla comercial */}
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-1 font-medium">Lote</th>
                <th className="pb-1 font-medium">Volumen</th>
                <th className="pb-1 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60">
                <td className="py-1">L-001</td>
                <td className="py-1">80 tn</td>
                <td className="py-1"><span className="rounded-full px-1.5 py-0.5 text-white" style={{ backgroundColor: tema.secundario }}>Disponible</span></td>
              </tr>
              <tr>
                <td className="py-1">L-002</td>
                <td className="py-1">25 tn</td>
                <td className="py-1"><span className="rounded-full px-1.5 py-0.5 text-white" style={{ backgroundColor: tema.primario }}>Reservado</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">{t}</span>{children}</label>;
}
