import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Database,
  Layers3,
  Leaf,
  MapPin,
  Package,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sprout,
  Warehouse,
  X,
} from "lucide-react";
import {
  COMPANY,
  TYPES,
  balance,
  inventory,
  totalStock,
  type Depot,
  type GestionService,
  type Movement,
  type MovementInput,
  type MovementType,
  type State,
} from "./domain";
import { createBaseDemo } from "./seed";
// Estilos: el host los carga como hoja de la ruta (`gestion.css?url`), sin import con efectos.

const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
const kg = (n: number) => `${number.format(n)} kg`;
const tonnes = (n: number) => `${number.format(n / 1000)} t`;
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const screens = [
  {
    slug: "",
    name: "Dashboard",
    icon: BarChart3,
    caption: "Tu operación, en un vistazo",
    description: "Stock, ubicaciones y actividad de tu acopio.",
  },
  {
    slug: "depositos",
    name: "Depósitos",
    icon: Warehouse,
    caption: "Cada lugar, identificado",
    description: "Administrá las ubicaciones de tu mercadería.",
  },
  {
    slug: "lotes",
    name: "Lotes",
    icon: Layers3,
    caption: "El origen de cada grano",
    description: "Identificá tus lotes y conservá su trazabilidad.",
  },
  {
    slug: "movimientos",
    name: "Movimientos",
    icon: ArrowRightLeft,
    caption: "Registrá lo que sucede",
    description: "Ingresos, egresos, transferencias y ajustes, en un solo lugar.",
  },
  {
    slug: "inventario",
    name: "Inventario",
    icon: ClipboardList,
    caption: "Tu stock, al detalle",
    description: "Consultá saldos por lote y depósito e historial de movimientos.",
  },
];
const DASHBOARD = screens[0]!;
/** Enlace inyectable: el host puede usar su router (navegación sin recargar la página). */
export type GestionLinkProps = {
  href: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
};
export type GestionLink = ComponentType<GestionLinkProps>;
const PlainLink: GestionLink = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="ag-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="ag-empty">
      <Package size={30} />
      <p>{children}</p>
    </div>
  );
}
function Panel({
  title,
  detail,
  children,
  action,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="ag-panel">
      <div className="ag-panel-heading">
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function MovementHistory({ state, rows }: { state: State; rows: Movement[] }) {
  if (!rows.length)
    return <Empty>Todavía no hay movimientos. Registrá el primer ingreso para comenzar.</Empty>;
  const depot = (id?: string) => state.depots.find((d) => d.id === id)?.name ?? "—";
  return (
    <div className="ag-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Movimiento</th>
            <th>Lote</th>
            <th>Recorrido / ubicación</th>
            <th className="ag-right">Cantidad</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((m) => (
            <tr key={m.id}>
              <td className="ag-nowrap">{m.date.split("-").reverse().join("/")}</td>
              <td>
                <span className={`ag-tag ag-${m.type}`}>
                  {TYPES[m.type]}
                  {m.direction ? ` · ${m.direction === "aumento" ? "+" : "−"}` : ""}
                </span>
              </td>
              <td>
                <strong>{state.lots.find((l) => l.id === m.lotId)?.code}</strong>
              </td>
              <td>
                {m.fromId && depot(m.fromId)}
                {m.fromId && m.toId && <span className="ag-route-arrow"> → </span>}
                {m.toId && depot(m.toId)}
              </td>
              <td className="ag-right ag-nowrap">
                <strong>{kg(m.quantity)}</strong>
                <small className="ag-block">{tonnes(m.quantity)}</small>
              </td>
              <td>{m.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GestionApp({
  service,
  basePath = "/gestion",
  pathname,
  Link: L = PlainLink,
  embedded = false,
}: {
  service: GestionService;
  basePath?: string;
  /** Ruta actual provista por el router del host; si falta, se usa la del navegador. */
  pathname?: string;
  Link?: GestionLink;
  /** Dentro del layout de AgroGlobal: sin lateral propio, con pestañas internas. */
  embedded?: boolean;
}) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const path = (
    pathname ?? (typeof window === "undefined" ? basePath : window.location.pathname)
  ).replace(/\/$/, "");
  const screen =
    screens.find((s) => path === `${basePath}${s.slug ? `/${s.slug}` : ""}`) ?? DASHBOARD;
  const href = (slug: string) => `${basePath}${slug ? `/${slug}` : ""}`;
  // Integración: el módulo sigue montado al navegar entre pantallas, así que el aviso de una
  // operación no debe quedar visible en otra. Un error de carga (sin estado) se conserva.
  const [shownSlug, setShownSlug] = useState(screen.slug);
  if (shownSlug !== screen.slug) {
    setShownSlug(screen.slug);
    setNotice("");
    if (state) setError("");
  }
  useEffect(() => {
    try {
      setState(service.initialize(createBaseDemo()));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [service]);
  const run = (operation: () => State, message: string) => {
    try {
      setState(operation());
      setError("");
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      setNotice("");
      return false;
    }
  };
  const current = (s: (typeof screens)[number]) => s.slug === screen.slug;
  // Integrado, el diálogo se monta sobre document.body para cubrir también el layout del host
  // (que crea su propio contexto de apilamiento). Solo se abre en el navegador.
  const overlay = (node: ReactNode) =>
    embedded && typeof document !== "undefined"
      ? createPortal(<div className="ag-app ag-modal-root">{node}</div>, document.body)
      : node;
  return (
    <div className={embedded ? "ag-app ag-embedded" : "ag-app"}>
      {!embedded && (
        <aside className="ag-sidebar">
          <L className="ag-brand" href={basePath}>
            <span className="ag-brand-icon">
              <Sprout size={27} />
            </span>
            <span>
              Agro<span className="ag-brand-local">Local</span>
              <small>GESTIÓN DE ACOPIO</small>
            </span>
          </L>
          <div className="ag-workspace">
            <span className="ag-workspace-icon">
              <Warehouse size={20} />
            </span>
            <div>
              <strong>Acopiadora del Litoral</strong>
              <small>Corrientes, Argentina</small>
            </div>
          </div>
          <span className="ag-nav-label">ESPACIO DE TRABAJO</span>
          <nav aria-label="Gestión">
            {screens.map((s) => (
              <L
                key={s.slug}
                href={href(s.slug)}
                className={current(s) ? "ag-active" : ""}
                {...(current(s) ? { "aria-current": "page" as const } : {})}
              >
                <s.icon size={19} />
                {s.name}
                {current(s) && <ChevronRight size={16} className="ag-nav-arrow" />}
              </L>
            ))}
          </nav>
          <div className="ag-sidebar-bottom">
            <div className="ag-demo-note">
              <span className="ag-demo-dot" />
              Entorno de demostración
              <p>
                Una empresa ficticia.
                <br />
                Un circuito completo para explorar.
              </p>
            </div>
            <button className="ag-reset-link" onClick={() => setResetOpen(true)}>
              <RotateCcw size={16} />
              Iniciar demo desde cero
            </button>
            <small className="ag-version">AgroLocal Gestión · v0.1</small>
          </div>
        </aside>
      )}
      <div className="ag-main-wrap">
        <header className="ag-topbar">
          <div className="ag-breadcrumb">
            AgroLocal <ChevronRight size={14} /> Gestión <ChevronRight size={14} />
            <strong>{screen.name}</strong>
          </div>
          <div className="ag-topbar-right">
            <span className="ag-demo-badge">PROTOTIPO DEMO</span>
            <span className="ag-avatar" title={COMPANY}>
              AL
            </span>
          </div>
        </header>
        <div className="ag-demo-banner" role="note">
          <Sprout size={18} />
          <div>
            <strong>AgroLocal Gestión — PROTOTIPO DEMO</strong>
            <span>
              {COMPANY} es una empresa ficticia. Depósitos, lotes y saldos son datos de demostración
              guardados solo en este navegador: no representan inventario empresarial real.
            </span>
          </div>
        </div>
        {embedded && (
          <nav className="ag-subnav" aria-label="Gestión">
            {screens.map((s) => (
              <L
                key={s.slug}
                href={href(s.slug)}
                className={current(s) ? "ag-active" : ""}
                {...(current(s) ? { "aria-current": "page" as const } : {})}
              >
                <s.icon size={17} />
                {s.name}
              </L>
            ))}
            <button className="ag-reset-link" onClick={() => setResetOpen(true)}>
              <RotateCcw size={15} />
              Iniciar demo desde cero
            </button>
          </nav>
        )}
        <main className="ag-main">
          <div className="ag-page-title">
            <div>
              <span className="ag-eyebrow">ACOPIADORA DEL LITORAL</span>
              <h1>{screen.name}</h1>
              <p>{screen.description}</p>
            </div>
            {screen.slug !== "movimientos" && (
              <L className="ag-button" href={href("movimientos")}>
                <Plus size={17} />
                Registrar movimiento
              </L>
            )}
          </div>
          <div aria-live="polite">
            {notice && (
              <div className="ag-notice">
                <Check size={18} />
                {notice}
                <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
          {error && (
            <div className="ag-error" role="alert">
              <CircleHelp size={19} />
              <span>{error}</span>
              <button aria-label="Cerrar error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {state ? (
            <>
              {screen.slug === "" && <Dashboard state={state} href={href} L={L} />}
              {screen.slug === "depositos" && (
                <Depots key={resetVersion} state={state} service={service} run={run} />
              )}
              {screen.slug === "lotes" && (
                <Lots key={resetVersion} state={state} service={service} run={run} />
              )}
              {screen.slug === "movimientos" && (
                <Movements key={resetVersion} state={state} service={service} run={run} />
              )}
              {screen.slug === "inventario" && <Inventory key={resetVersion} state={state} />}
            </>
          ) : (
            <Panel title="Preparar escenario">
              <p>Se necesitan datos locales válidos para comenzar.</p>
              <button className="ag-button" onClick={() => setResetOpen(true)}>
                Iniciar demo desde cero
              </button>
            </Panel>
          )}
          <details className="ag-guide">
            <summary>
              <CircleHelp size={17} />
              Guion de demostración <span>Escenario verificable</span>
            </summary>
            <ol>
              <li>Iniciá la demo desde cero: Silo A, Silo B y ARR-001 con stock cero.</li>
              <li>
                Ingreso de 100.000 kg a Silo A → transferencia de 30.000 kg a Silo B → egreso de
                10.000 kg de Silo B.
              </li>
              <li>
                Verificá en Inventario: A = 70.000 kg, B = 20.000 kg. Total: 90.000 kg (90 t), tres
                movimientos.
              </li>
              <li>
                Intentá egresar 50.000 kg de B: se rechaza. Recargá y comprobá que nada cambió.
              </li>
            </ol>
            <button className="ag-button ag-secondary ag-small" onClick={() => setResetOpen(true)}>
              Preparar escenario con stock cero
            </button>
          </details>
          <footer className="ag-footer">
            <Database size={15} />
            <span>
              Datos guardados en este navegador. Una sola sesión operativa; sin garantías de
              concurrencia entre pestañas ni uso multiusuario. No usar para operaciones reales.
            </span>
          </footer>
        </main>
      </div>
      {resetOpen &&
        overlay(
          <div className="ag-modal-backdrop">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="ag-reset-title"
              className="ag-modal"
            >
              <span className="ag-modal-icon">
                <RotateCcw size={24} />
              </span>
              <h2 id="ag-reset-title">¿Iniciar la demo desde cero?</h2>
              <p>
                Se reemplazarán únicamente los datos ficticios de Gestión en este navegador por Silo
                A, Silo B y ARR-001, sin stock ni movimientos.
              </p>
              <div className="ag-form-actions">
                <button
                  autoFocus
                  className="ag-button ag-secondary"
                  onClick={() => setResetOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  className="ag-button"
                  onClick={() => {
                    if (
                      run(
                        () => service.resetDemo(createBaseDemo()),
                        "Demo reiniciada. Stock cero y escenario listo.",
                      )
                    ) {
                      setResetVersion((v) => v + 1);
                      setResetOpen(false);
                    }
                  }}
                >
                  Reiniciar datos demo
                </button>
              </div>
            </section>
          </div>,
        )}
    </div>
  );
}
type OperationRunner = (operation: () => State, message: string) => boolean;
function Dashboard({
  state,
  href,
  L,
}: {
  state: State;
  href: (s: string) => string;
  L: GestionLink;
}) {
  const total = totalStock(state);
  const cards = [
    {
      title: "Stock total",
      value: number.format(total),
      unit: "kg",
      detail: `${tonnes(total)} almacenadas`,
      icon: Package,
      featured: true,
    },
    {
      title: "Lotes registrados",
      value: state.lots.length,
      unit: "",
      detail: "Identidad y trazabilidad",
      icon: Layers3,
    },
    {
      title: "Depósitos",
      value: state.depots.length,
      unit: "",
      detail: "Ubicaciones de la empresa",
      icon: Warehouse,
    },
    {
      title: "Movimientos",
      value: state.movements.length,
      unit: "",
      detail: "Operaciones registradas",
      icon: ArrowRightLeft,
    },
  ];
  return (
    <>
      <div className="ag-stats">
        {cards.map((c) => (
          <div key={c.title} className={`ag-stat ${c.featured ? "ag-stat-featured" : ""}`}>
            <div className="ag-stat-top">
              <span>{c.title}</span>
              <c.icon size={20} />
            </div>
            <div className="ag-stat-value">
              {c.value}
              <span>{c.unit}</span>
            </div>
            <p>{c.detail}</p>
          </div>
        ))}
      </div>
      <div className="ag-dashboard-grid">
        <Panel
          title="Stock por depósito"
          detail="Distribución actual de tu mercadería"
          action={<span className="ag-tag">Kilogramos</span>}
        >
          <div className="ag-depot-bars">
            {state.depots.map((d) => {
              const amount = state.lots.reduce((sum, l) => sum + balance(state, l.id, d.id), 0);
              return (
                <div key={d.id}>
                  <div className="ag-bar-label">
                    <span>
                      <Warehouse size={17} />
                      {d.name}
                    </span>
                    <strong>
                      {kg(amount)}
                      <small>{tonnes(amount)}</small>
                    </strong>
                  </div>
                  <div className="ag-bar-track">
                    <div style={{ width: `${total ? (amount / total) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <L className="ag-text-link" href={href("inventario")}>
            Ver inventario completo <ArrowRight size={16} />
          </L>
        </Panel>
        <section className="ag-start-card">
          <span className="ag-start-icon">
            <Leaf size={25} />
          </span>
          <span className="ag-eyebrow">DEL CAMPO AL DEPÓSITO</span>
          <h2>{total === 0 ? "Todo listo para tu primer ingreso" : "Cada movimiento cuenta"}</h2>
          <p>
            Seguí el recorrido de cada lote, desde su ingreso hasta su salida. Tu stock se actualiza
            con cada operación.
          </p>
          <L href={href("movimientos")} className="ag-button ag-white">
            {total === 0 ? "Registrar primer ingreso" : "Nuevo movimiento"}
            <ArrowRight size={17} />
          </L>
        </section>
      </div>
      <Panel
        title="Movimientos recientes"
        detail="Últimas operaciones registradas"
        action={
          <L className="ag-text-link" href={href("inventario")}>
            Ver todos <ArrowRight size={16} />
          </L>
        }
      >
        <MovementHistory state={state} rows={state.movements.slice(-5)} />
      </Panel>
    </>
  );
}
function Depots({
  state,
  service,
  run,
}: {
  state: State;
  service: GestionService;
  run: OperationRunner;
}) {
  const [editing, setEditing] = useState<Depot | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const clear = () => {
    setEditing(null);
    setName("");
    setLocation("");
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    if (
      run(
        () =>
          editing
            ? service.editDepot(editing.id, { name, location })
            : service.addDepot({ name, location }),
        editing
          ? "Depósito actualizado. Se conserva su identificador y su historial."
          : "Depósito creado.",
      )
    )
      clear();
  }
  return (
    <div className="ag-two-columns">
      <Panel
        title="Depósitos de la empresa"
        detail={`${state.depots.length} ubicaciones registradas`}
      >
        <div className="ag-depot-list">
          {state.depots.map((d) => (
            <article key={d.id}>
              <span className="ag-depot-icon">
                <Warehouse size={25} />
              </span>
              <div>
                <h3>{d.name}</h3>
                <p>
                  <MapPin size={13} />
                  {d.location}
                </p>
                <strong>
                  {kg(state.lots.reduce((sum, l) => sum + balance(state, l.id, d.id), 0))}
                </strong>
              </div>
              <button
                className="ag-button ag-secondary ag-small"
                onClick={() => {
                  setEditing(d);
                  setName(d.name);
                  setLocation(d.location);
                }}
              >
                Editar {d.name}
              </button>
            </article>
          ))}
        </div>
      </Panel>
      <Panel
        title={editing ? "Editar depósito" : "Nuevo depósito"}
        detail="Una ubicación identificable para tus lotes"
      >
        <form onSubmit={submit}>
          <Field label="Nombre del depósito">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Silo C"
              required
              maxLength={200}
            />
          </Field>
          <Field label="Ubicación">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ej. Planta Corrientes · Sector oeste"
              required
              maxLength={200}
            />
          </Field>
          <p className="ag-info">
            Al editar se conserva el identificador para mantener las referencias del historial.
          </p>
          <div className="ag-form-actions">
            {editing && (
              <button type="button" className="ag-button ag-secondary" onClick={clear}>
                Cancelar
              </button>
            )}
            <button className="ag-button" type="submit">
              {editing ? "Guardar cambios" : "Crear depósito"}
              <Plus size={16} />
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
function Lots({
  state,
  service,
  run,
}: {
  state: State;
  service: GestionService;
  run: OperationRunner;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (
      run(
        () =>
          service.addLot({
            code: String(f.get("code")),
            variety: String(f.get("variety")),
            season: String(f.get("season")),
            ...(f.get("humidity") ? { humidity: Number(f.get("humidity")) } : {}),
            quality: String(f.get("quality")),
          }),
        "Lote creado con saldo cero. Registrá un ingreso para sumar stock.",
      )
    )
      form.reset();
  }
  return (
    <div className="ag-two-columns">
      <Panel
        title="Lotes registrados"
        detail="Cada lote mantiene su identidad en todos los depósitos"
      >
        <div className="ag-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código / variedad</th>
                <th>Campaña</th>
                <th>Humedad / calidad</th>
                <th className="ag-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {state.lots.map((l) => {
                const amount = state.depots.reduce((sum, d) => sum + balance(state, l.id, d.id), 0);
                return (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.code}</strong>
                      <small className="ag-block">{l.variety}</small>
                    </td>
                    <td>{l.season}</td>
                    <td>
                      {l.humidity === undefined ? "—" : `${l.humidity} %`}
                      <small className="ag-block">{l.quality || "Sin informar"}</small>
                    </td>
                    <td className="ag-right ag-nowrap">
                      <strong>{kg(amount)}</strong>
                      <small className="ag-block">{tonnes(amount)}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Nuevo lote" detail="Un lote nuevo siempre comienza con saldo cero">
        <form onSubmit={submit}>
          <Field label="Código único">
            <input name="code" placeholder="Ej. ARR-002" required maxLength={200} />
          </Field>
          <Field label="Variedad">
            <input name="variety" placeholder="Ej. Arroz largo fino" required maxLength={200} />
          </Field>
          <Field label="Campaña">
            <input name="season" placeholder="Ej. 2026/2027" required maxLength={200} />
          </Field>
          <div className="ag-form-grid">
            <Field label="Humedad (%) · opcional">
              <input
                name="humidity"
                type="number"
                min="0"
                max="100"
                step="any"
                placeholder="Ej. 13,5"
              />
            </Field>
            <Field label="Calidad · opcional">
              <input name="quality" placeholder="Ej. Grado 1" maxLength={200} />
            </Field>
          </div>
          <p className="ag-info">
            Humedad y calidad son informativas. No modifican los kilogramos ni mezclan lotes.
          </p>
          <button className="ag-button" type="submit">
            Crear lote
            <Plus size={16} />
          </button>
        </form>
      </Panel>
    </div>
  );
}
function Movements({
  state,
  service,
  run,
}: {
  state: State;
  service: GestionService;
  run: OperationRunner;
}) {
  const [type, setType] = useState<MovementType>("ingreso");
  const [direction, setDirection] = useState<"aumento" | "disminucion">("aumento");
  const [lotId, setLotId] = useState(state.lots[0]?.id ?? "");
  const [fromId, setFromId] = useState(state.depots[0]?.id ?? "");
  const [toId, setToId] = useState(state.depots[0]?.id ?? "");
  const hasFrom =
    type === "egreso" ||
    type === "transferencia" ||
    (type === "ajuste" && direction === "disminucion");
  const hasTo =
    type === "ingreso" ||
    type === "transferencia" ||
    (type === "ajuste" && direction === "aumento");
  const icons = {
    ingreso: ArrowDownLeft,
    egreso: ArrowUpRight,
    transferencia: ArrowRightLeft,
    ajuste: SlidersHorizontal,
  };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const input: MovementInput = {
      type,
      date: String(f.get("date")),
      lotId,
      quantity: Number(f.get("quantity")),
      ...(hasFrom ? { fromId } : {}),
      ...(hasTo ? { toId } : {}),
      ...(type === "ajuste" ? { direction } : {}),
      reason: String(f.get("reason") ?? ""),
    };
    if (
      run(
        () => service.record(input),
        `${TYPES[type]} ${type === "transferencia" ? "registrada" : "registrado"}. Inventario actualizado.`,
      )
    ) {
      (form.elements.namedItem("quantity") as HTMLInputElement).value = "";
      (form.elements.namedItem("reason") as HTMLInputElement).value = "";
    }
  }
  const selectDepot = (value: string, change: (s: string) => void, label: string) => (
    <Field label={label}>
      <select value={value} onChange={(e) => change(e.target.value)} required>
        <option value="" disabled>
          Seleccionar depósito
        </option>
        {state.depots.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <>
      <div className="ag-movement-tabs" role="group" aria-label="Tipo de movimiento">
        {(Object.keys(TYPES) as MovementType[]).map((t) => {
          const Icon = icons[t];
          return (
            <button
              className={t === type ? "ag-selected" : ""}
              key={t}
              aria-pressed={t === type}
              onClick={() => setType(t)}
            >
              <Icon size={21} />
              <span>{TYPES[t]}</span>
            </button>
          );
        })}
      </div>
      <div className="ag-movement-grid">
        <Panel
          title={`Registrar ${TYPES[type].toLowerCase()}`}
          detail="Todas las cantidades se registran en kilogramos"
        >
          <form onSubmit={submit}>
            <div className="ag-form-grid">
              <Field label="Fecha del movimiento">
                <input name="date" type="date" defaultValue={localDate()} required />
              </Field>
              <Field label="Lote">
                <select value={lotId} onChange={(e) => setLotId(e.target.value)} required>
                  <option value="" disabled>
                    Seleccionar lote
                  </option>
                  {state.lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.variety}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {type === "ajuste" && (
              <Field label="Dirección del ajuste">
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as typeof direction)}
                >
                  <option value="aumento">Aumento de stock (+)</option>
                  <option value="disminucion">Disminución de stock (−)</option>
                </select>
              </Field>
            )}
            <div className="ag-form-grid">
              {hasFrom && selectDepot(fromId, setFromId, "Depósito de origen")}
              {hasTo && selectDepot(toId, setToId, "Depósito de destino")}
            </div>
            {hasFrom && (
              <div className="ag-available">
                <Package size={17} />
                Disponible en origen para este lote:{" "}
                <strong>{kg(balance(state, lotId, fromId))}</strong>
              </div>
            )}
            <Field
              label="Cantidad (kg)"
              hint="Ingresá un número positivo. Hasta 3 decimales; 1.000 kg equivalen a 1 t."
            >
              <input
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
                placeholder="Ej. 100000"
              />
            </Field>
            <Field
              label={
                type === "ajuste"
                  ? "Motivo del ajuste · obligatorio"
                  : "Motivo / referencia · opcional"
              }
            >
              <input
                name="reason"
                required={type === "ajuste"}
                placeholder={
                  type === "ajuste"
                    ? "Ej. Diferencia detectada en el conteo físico"
                    : "Ej. Recepción de cosecha"
                }
                maxLength={200}
              />
            </Field>
            <div className="ag-form-actions">
              <span className="ag-save-note">
                <Database size={14} />
                Guardado local
              </span>
              <button className="ag-button" type="submit">
                Registrar {TYPES[type].toLowerCase()}
                <Check size={17} />
              </button>
            </div>
          </form>
        </Panel>
        <aside className="ag-help-card">
          <span className="ag-help-icon">
            <ClipboardList size={23} />
          </span>
          <h2>Un registro, stock al día</h2>
          <p>Cada movimiento conserva la identidad de un único lote.</p>
          <ul>
            <li>Los ingresos suman stock en destino.</li>
            <li>Los egresos descuentan del origen.</li>
            <li>Una transferencia mueve stock y mantiene el total.</li>
            <li>Los ajustes requieren un motivo y una dirección.</li>
          </ul>
          <div className="ag-help-bottom">
            <Check size={17} />
            <span>
              Si no hay saldo suficiente, la operación se rechaza sin alterar el historial.
            </span>
          </div>
          <small>
            Los movimientos registrados no se editan ni se borran. Para corregir una diferencia,
            registrá un ajuste con su motivo.
          </small>
        </aside>
      </div>
      <Panel
        title="Historial de movimientos"
        detail={`${state.movements.length} operaciones · orden de registro, más recientes primero`}
      >
        <MovementHistory state={state} rows={state.movements} />
      </Panel>
    </>
  );
}
function Inventory({ state }: { state: State }) {
  const [lotId, setLotId] = useState("");
  const [depotId, setDepotId] = useState("");
  const rows = inventory(state).filter(
    (r) => (!lotId || lotId === r.lot.id) && (!depotId || depotId === r.depot.id),
  );
  const movements = state.movements.filter(
    (m) =>
      (!lotId || lotId === m.lotId) && (!depotId || m.fromId === depotId || m.toId === depotId),
  );
  const total = rows.reduce((sum, r) => sum + r.quantity, 0);
  return (
    <>
      <div className="ag-filter-bar">
        <SlidersHorizontal size={18} />
        <Field label="Filtrar por lote">
          <select value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">Todos los lotes</option>
            {state.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Filtrar por depósito">
          <select value={depotId} onChange={(e) => setDepotId(e.target.value)}>
            <option value="">Todos los depósitos</option>
            {state.depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="ag-filter-total">
          <small>Stock de la selección</small>
          <strong>
            {kg(total)}
            <span>{tonnes(total)}</span>
          </strong>
        </div>
      </div>
      <Panel
        title="Saldos por lote y depósito"
        detail="Calculados a partir del historial de movimientos"
      >
        <div className="ag-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Variedad / campaña</th>
                <th>Depósito</th>
                <th className="ag-right">Kilogramos</th>
                <th className="ag-right">Toneladas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.lot.id}-${r.depot.id}`}>
                  <td>
                    <strong>{r.lot.code}</strong>
                  </td>
                  <td>
                    {r.lot.variety}
                    <small className="ag-block">{r.lot.season}</small>
                  </td>
                  <td>
                    <span className="ag-table-depot">
                      <Warehouse size={16} />
                      {r.depot.name}
                    </span>
                  </td>
                  <td className="ag-right">
                    <strong>{kg(r.quantity)}</strong>
                  </td>
                  <td className="ag-right">{tonnes(r.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total de la selección</td>
                <td className="ag-right">{kg(total)}</td>
                <td className="ag-right">{tonnes(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!rows.length && <Empty>No hay saldos para esta selección.</Empty>}
      </Panel>
      <Panel
        title="Historial consultable"
        detail={`${movements.length} movimientos para la selección · más recientes primero`}
      >
        <MovementHistory state={state} rows={movements} />
      </Panel>
    </>
  );
}
