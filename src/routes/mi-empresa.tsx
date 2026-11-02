import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCcw, Upload, Wand2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ACTIVIDADES, MODOS, modosDisponibles, type Actividad, type TemaMarca } from "@/data/organizaciones";
import { PROVINCIAS } from "@/data/demo";
import { useAppStore, useOrganizacionActiva } from "@/lib/store";
import { contrasteSuficiente } from "@/lib/tema";
import { temaDesdeDeteccion } from "@/lib/marca";
import { pageHead } from "@/lib/seo";
import { Card, DemoBadge, PageHeader, StatusBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mi-empresa")({
  head: () =>
    pageHead(
      "Mi empresa",
      "Datos de la organización, actividades habilitadas e identidad visual corporativa en AgroGlobal COMEX (demo).",
    ),
  component: MiEmpresa,
});

const inp = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";

interface Deteccion {
  nombre?: string;
  faviconUrl?: string;
  logoUrl?: string;
  colores: string[];
  tipografia?: string;
  faltantes?: string[];
}

function MiEmpresa() {
  const { dispatch } = useAppStore();
  const org = useOrganizacionActiva();
  const [form, setForm] = useState({
    razonSocial: org.razonSocial,
    nombreComercial: org.nombreComercial,
    pais: org.pais,
    provincia: org.provincia,
    sitioWeb: org.sitioWeb ?? "",
    contacto: org.contacto ?? "",
    actividades: [...org.actividades],
  });
  const [detectando, setDetectando] = useState(false);
  const [borrador, setBorrador] = useState<TemaMarca | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleActividad = (a: Actividad) =>
    setForm((f) => ({
      ...f,
      actividades: f.actividades.includes(a) ? f.actividades.filter((x) => x !== a) : [...f.actividades, a],
    }));

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.actividades.length) {
      toast.error("Seleccioná al menos una actividad");
      return;
    }
    dispatch({
      type: "updateOrganizacion",
      id: org.id,
      patch: {
        razonSocial: form.razonSocial,
        nombreComercial: form.nombreComercial,
        pais: form.pais,
        provincia: form.provincia,
        actividades: form.actividades,
        ...(form.sitioWeb ? { sitioWeb: form.sitioWeb } : { sitioWeb: undefined }),
        ...(form.contacto ? { contacto: form.contacto } : { contacto: undefined }),
      },
    });
    toast.success("Datos de la empresa guardados", {
      description: "Los espacios de trabajo disponibles se actualizan según las actividades.",
    });
  };

  const detectar = async () => {
    if (!form.sitioWeb.trim()) {
      toast.error("Ingresá el sitio web de la empresa primero");
      return;
    }
    setDetectando(true);
    try {
      const res = await fetch("/api/public/marca/detectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.sitioWeb }),
      });
      const data = (await res.json()) as ({ ok: true } & Deteccion) | { ok: false; error: string };
      if (!data.ok) {
        toast.warning("No se pudo detectar la identidad", { description: data.error });
        return;
      }
      setBorrador(temaDesdeDeteccion({
        nombre: data.nombre,
        faviconUrl: data.faviconUrl,
        logoUrl: data.logoUrl,
        colores: data.colores,
        tipografia: data.tipografia,
        faltantes: data.faltantes ?? [],
      }, form.sitioWeb));
      if (data.faltantes?.length) {
        toast.warning("Identidad detectada parcialmente", {
          description: `No se pudo detectar: ${data.faltantes.join(", ")}. Podés cargarlo manualmente.`,
        });
      } else {
        toast.success("Identidad detectada", { description: "Revisá la vista previa antes de aplicarla." });
      }
    } catch {
      toast.error("Error de red al analizar el sitio", { description: "Podés cargar los colores manualmente." });
    } finally {
      setDetectando(false);
    }
  };

  const subirLogo = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
      toast.error("Formato no admitido", { description: "Usá PNG, JPG, WebP o SVG." });
      return;
    }
    if (file.size > 500_000) {
      toast.error("Imagen demasiado grande", { description: "Máximo 500 KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const logoUrl = String(reader.result);
      setBorrador((b) => ({
        primario: b?.primario ?? org.tema?.primario ?? "#1d4ed8",
        secundario: b?.secundario ?? org.tema?.secundario ?? "#1e40af",
        acento: b?.acento ?? org.tema?.acento ?? "#3b82f6",
        logoUrl,
      }));
    };
    reader.readAsDataURL(file);
  };

  const aplicar = () => {
    if (!borrador) return;
    dispatch({ type: "updateOrganizacion", id: org.id, patch: { tema: borrador } });
    setBorrador(null);
    toast.success("Identidad aplicada", { description: "Los colores y el logo ya se ven en toda la plataforma." });
  };

  const restablecer = () => {
    dispatch({ type: "updateOrganizacion", id: org.id, patch: { tema: undefined } });
    setBorrador(null);
    toast.success("Diseño AgroGlobal restablecido");
  };

  const temaVista = borrador ?? org.tema ?? null;
  const modos = modosDisponibles({ actividades: form.actividades });

  return (
    <div>
      <PageHeader
        titulo="Mi empresa"
        descripcion="Datos de la organización, actividades habilitadas e identidad visual. Todo es demostrativo."
        acciones={<DemoBadge />}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold">Datos empresariales</h2>
          <form className="grid grid-cols-2 gap-3" onSubmit={guardar}>
            <L t="Razón social"><input className={inp} value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} /></L>
            <L t="Nombre comercial"><input className={inp} value={form.nombreComercial} onChange={(e) => set("nombreComercial", e.target.value)} /></L>
            <L t="País"><input className={inp} value={form.pais} onChange={(e) => set("pais", e.target.value)} /></L>
            <L t="Provincia">
              <select className={inp} value={form.provincia} onChange={(e) => set("provincia", e.target.value)}>
                {PROVINCIAS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </L>
            <L t="Sitio web (opcional)">
              <input className={inp} placeholder="https://www.miempresa.com.ar" value={form.sitioWeb} onChange={(e) => set("sitioWeb", e.target.value)} />
            </L>
            <L t="Contacto empresarial"><input className={inp} value={form.contacto} onChange={(e) => set("contacto", e.target.value)} /></L>
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
            <Button type="submit" className="col-span-2">Guardar datos</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-2 text-base font-semibold">Identidad visual</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Detectá los colores y el logo desde el sitio web de la empresa, o cargalos manualmente. Nada se aplica sin tu confirmación.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={detectar} disabled={detectando}>
              {detectando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Detectar identidad visual
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Subir logo
            </Button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => subirLogo(e.target.files?.[0])} />
            {org.tema && (
              <Button type="button" variant="ghost" onClick={restablecer}>
                <RefreshCcw className="h-4 w-4" /> Restablecer diseño AgroGlobal
              </Button>
            )}
          </div>

          {temaVista ? (
            <VistaPreviaMarca
              tema={temaVista}
              editable={!!borrador}
              onChange={setBorrador}
              onAplicar={aplicar}
              onCancelar={() => setBorrador(null)}
              esBorrador={!!borrador}
            />
          ) : (
            <p className="mt-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Esta empresa usa el diseño predeterminado de AgroGlobal.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function VistaPreviaMarca({
  tema,
  editable,
  esBorrador,
  onChange,
  onAplicar,
  onCancelar,
}: {
  tema: TemaMarca;
  editable: boolean;
  esBorrador: boolean;
  onChange: (t: TemaMarca) => void;
  onAplicar: () => void;
  onCancelar: () => void;
}) {
  const setColor = (k: keyof TemaMarca, v: string) => onChange({ ...tema, [k]: v });
  return (
    <div className="mt-6 space-y-5">
      {esBorrador && <StatusBadge tono="info">Vista previa — todavía no se aplicó</StatusBadge>}

      {/* Logotipo */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Logotipo</p>
        <div className="flex gap-3">
          <div className="flex h-20 flex-1 items-center justify-center rounded-lg border border-border bg-card">
            {tema.logoUrl ? <img src={tema.logoUrl} alt="Logo" className="max-h-14 max-w-[80%] object-contain" /> : <span className="text-xs text-muted-foreground">Sin logo</span>}
          </div>
          <div className="flex h-20 flex-1 items-center justify-center rounded-lg bg-[#173C32]">
            {tema.logoUrl ? <img src={tema.logoUrl} alt="Logo en fondo oscuro" className="max-h-14 max-w-[80%] object-contain" /> : <span className="text-xs text-white/60">Sin logo</span>}
          </div>
        </div>
      </div>

      {/* Paleta */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Paleta de colores</p>
        <div className="grid grid-cols-3 gap-3">
          {([["primario", "Principal"], ["secundario", "Secundario"], ["acento", "Acento"]] as const).map(([k, label]) => (
            <label key={k} className="space-y-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tema[k] ?? "#1d4ed8"}
                  disabled={!editable}
                  onChange={(e) => setColor(k, e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border"
                />
                <span className="font-mono text-xs">{tema[k]}</span>
              </div>
              {!contrasteSuficiente(tema[k] ?? "#000000") && (
                <span className="block text-[10px] text-warning-foreground">Contraste bajo: puede afectar la legibilidad</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Vista previa de interfaz */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa de interfaz</p>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex">
            <div className="w-28 space-y-1.5 p-3" style={{ backgroundColor: "#173C32" }}>
              <div className="h-2 w-14 rounded" style={{ backgroundColor: tema.acento }} />
              <div className="h-2 w-20 rounded bg-white/20" />
              <div className="h-2 w-16 rounded bg-white/20" />
              <div className="h-2 w-20 rounded" style={{ backgroundColor: `${tema.acento}66` }} />
            </div>
            <div className="flex-1 space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="h-2.5 w-24 rounded bg-foreground/20" />
                <button className="rounded-md px-3 py-1 text-xs font-semibold" style={{ backgroundColor: tema.primario, color: "#fff" }}>
                  Botón principal
                </button>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 h-2 w-28 rounded" style={{ backgroundColor: tema.primario }} />
                <div className="h-2 w-full rounded bg-foreground/10" />
                <div className="mt-1 h-2 w-2/3 rounded bg-foreground/10" />
              </div>
              <div className="flex items-end gap-1.5">
                {[40, 70, 55, 90].map((h, i) => (
                  <div key={i} className="w-8 rounded-t" style={{ height: h / 2, backgroundColor: i % 2 ? tema.secundario : tema.primario }} />
                ))}
              </div>
              <div className="rounded-md border px-2 py-1 text-[10px]" style={{ borderColor: `${tema.acento}88`, color: tema.secundario }}>
                Estado de alerta con acento corporativo
              </div>
            </div>
          </div>
        </div>
      </div>

      {esBorrador && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onAplicar}>Aplicar identidad</Button>
          <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">{t}</span>{children}</label>;
}
