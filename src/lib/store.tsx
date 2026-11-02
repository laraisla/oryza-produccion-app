import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import {
  CONCILIACIONES_INICIALES,
  COTIZACIONES_INICIALES,
  OPERACIONES_INICIALES,
  PRODUCTOS_INICIALES,
  SOLICITUDES_INICIALES,
  type Conciliacion,
  type Cotizacion,
  type Operacion,
  type Producto,
  type Rol,
  type SolicitudCompra,
} from "@/data/demo";
import {
  CONVERSACION_INICIAL,
  MENSAJE_BIENVENIDA,
  type AccionPendiente,
  type Conversacion,
  type InteresComercial,
  type MensajeChat,
  type MovimientoInventario,
  type NotificacionDemo,
} from "@/data/whatsapp-demo";
import { REQUISITOS_INICIALES, type RequisitoMercado } from "@/data/mercados";
import { ORGANIZACIONES_DEMO, type Modo, type Organizacion } from "@/data/organizaciones";
import { construirOperacion } from "@/lib/recorrido";
import { aplicarTema } from "@/lib/tema";
import { ACUERDOS_REFERENCIA, type AcuerdoStellar, type EtapaAcuerdo } from "@/lib/stellar/config";

export interface AppState {
  rol: Rol;
  modoElegido: boolean;
  modo: Modo;
  organizaciones: Organizacion[];
  organizacionActivaId: string;
  productos: Producto[];
  solicitudes: SolicitudCompra[];
  cotizaciones: Cotizacion[];
  operaciones: Operacion[];
  conciliaciones: Conciliacion[];
  conversaciones: Conversacion[];
  mensajes: MensajeChat[];
  acciones: AccionPendiente[];
  intereses: InteresComercial[];
  notificaciones: NotificacionDemo[];
  movimientos: MovimientoInventario[];
  requisitos: RequisitoMercado[];
  /** Registro LOCAL de acuerdos enviados a Stellar Testnet (la prueba es la cadena). */
  acuerdosStellar: AcuerdoStellar[];
}

type Action =
  | { type: "setRol"; rol: Rol }
  | { type: "elegirModo"; rol: Rol; modo?: Modo }
  | { type: "cambiarModo" }
  | { type: "setModo"; modo: Modo }
  | { type: "setOrganizacion"; id: string }
  | { type: "addOrganizacion"; organizacion: Organizacion }
  | { type: "updateOrganizacion"; id: string; patch: Partial<Organizacion> }
  | { type: "addProducto"; producto: Producto }
  | { type: "removeProducto"; id: string }
  | { type: "addSolicitud"; solicitud: SolicitudCompra }
  | { type: "updateSolicitud"; id: string; patch: Partial<SolicitudCompra> }
  | { type: "aceptarCotizacion"; id: string }
  /** Reinicia SOLO los datos comerciales (productos, solicitudes, cotizaciones, operaciones, conciliaciones). */
  | { type: "reiniciarDemoComercial" }
  | { type: "addCotizacion"; cotizacion: Cotizacion }
  | { type: "updateCotizacion"; id: string; patch: Partial<Cotizacion> }
  | { type: "addOperacion"; operacion: Operacion }
  | { type: "updateOperacion"; id: string; patch: Partial<Operacion> }
  | { type: "addConciliacion"; conciliacion: Conciliacion }
  | { type: "addMensaje"; mensaje: MensajeChat }
  | { type: "updateConversacion"; id: string; patch: Partial<Conversacion> }
  | { type: "addAccion"; accion: AccionPendiente }
  | { type: "updateAccion"; id: string; patch: Partial<AccionPendiente> }
  | { type: "addInteres"; interes: InteresComercial }
  | { type: "addNotificacion"; notificacion: NotificacionDemo }
  | { type: "updateProducto"; id: string; patch: Partial<Producto> }
  | { type: "addMovimiento"; movimiento: MovimientoInventario }
  | { type: "addRequisito"; requisito: RequisitoMercado }
  | { type: "updateRequisito"; id: string; patch: Partial<RequisitoMercado> }
  | { type: "removeRequisito"; id: string }
  | { type: "addAcuerdoStellar"; acuerdo: AcuerdoStellar }
  | { type: "addTxAcuerdoStellar"; id: number; etapa: EtapaAcuerdo; hash: string }
  | { type: "reservarStock"; productoId: string; cantidadTn: number }
  | { type: "hydrate"; state: AppState }
  | { type: "reset" };

export const initialState: AppState = {
  rol: "exportador",
  modoElegido: false,
  modo: "exportador",
  organizaciones: ORGANIZACIONES_DEMO,
  organizacionActivaId: "ORG-B",
  productos: PRODUCTOS_INICIALES,
  solicitudes: SOLICITUDES_INICIALES,
  cotizaciones: COTIZACIONES_INICIALES,
  operaciones: OPERACIONES_INICIALES,
  conciliaciones: CONCILIACIONES_INICIALES,
  conversaciones: [CONVERSACION_INICIAL],
  mensajes: [
    {
      id: "MSG-000",
      conversacionId: CONVERSACION_INICIAL.id,
      remitente: "agente",
      texto: MENSAJE_BIENVENIDA,
      fecha: new Date().toISOString(),
    },
  ],
  acciones: [],
  intereses: [],
  notificaciones: [],
  movimientos: [],
  requisitos: REQUISITOS_INICIALES,
  acuerdosStellar: ACUERDOS_REFERENCIA,
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setRol":
      return { ...state, rol: action.rol };
    case "elegirModo":
      return { ...state, rol: action.rol, ...(action.modo ? { modo: action.modo } : {}), modoElegido: true };
    case "cambiarModo":
      return { ...state, modoElegido: false };
    case "setModo":
      return { ...state, modo: action.modo };
    case "setOrganizacion":
      return { ...state, organizacionActivaId: action.id, modoElegido: false };
    case "addOrganizacion":
      return { ...state, organizaciones: [...state.organizaciones, action.organizacion] };
    case "updateOrganizacion":
      return {
        ...state,
        organizaciones: state.organizaciones.map((o) => (o.id === action.id ? { ...o, ...action.patch } : o)),
      };
    case "addProducto":
      return { ...state, productos: [action.producto, ...state.productos] };
    case "removeProducto":
      return { ...state, productos: state.productos.filter((p) => p.id !== action.id) };
    case "addSolicitud":
      return { ...state, solicitudes: [action.solicitud, ...state.solicitudes] };
    case "updateSolicitud":
      return { ...state, solicitudes: state.solicitudes.map((x) => (x.id === action.id ? { ...x, ...action.patch } : x)) };
    case "aceptarCotizacion": {
      const c = state.cotizaciones.find((x) => x.id === action.id);
      if (!c) return state;
      const existente = state.operaciones.find((o) => o.cotizacionId === c.id);
      if (existente) {
        // Idempotente: aceptar dos veces no duplica la operación.
        return {
          ...state,
          cotizaciones: state.cotizaciones.map((x) => (x.id === c.id ? { ...x, estado: "Aceptada", operacionId: existente.id } : x)),
        };
      }
      const operacion = construirOperacion(c, state.operaciones.map((o) => o.id));
      let next: AppState = {
        ...state,
        operaciones: [operacion, ...state.operaciones],
        cotizaciones: state.cotizaciones.map((x) => (x.id === c.id ? { ...x, estado: "Aceptada", operacionId: operacion.id } : x)),
        solicitudes: state.solicitudes.map((x) => (x.id === c.solicitudId ? { ...x, estado: "Cerrada" } : x)),
      };
      for (const l of c.lotes ?? []) next = reducer(next, { type: "reservarStock", productoId: l.loteId, cantidadTn: l.tn });
      return next;
    }
    case "reiniciarDemoComercial":
      return {
        ...state,
        productos: initialState.productos,
        solicitudes: initialState.solicitudes,
        cotizaciones: initialState.cotizaciones,
        operaciones: initialState.operaciones,
        conciliaciones: initialState.conciliaciones,
      };
    case "addCotizacion":
      return { ...state, cotizaciones: [action.cotizacion, ...state.cotizaciones] };
    case "updateCotizacion":
      return {
        ...state,
        cotizaciones: state.cotizaciones.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };
    case "addOperacion":
      return { ...state, operaciones: [action.operacion, ...state.operaciones] };
    case "updateOperacion":
      return {
        ...state,
        operaciones: state.operaciones.map((o) => (o.id === action.id ? { ...o, ...action.patch } : o)),
      };
    case "addConciliacion":
      return { ...state, conciliaciones: [action.conciliacion, ...state.conciliaciones] };
    case "addMensaje":
      return { ...state, mensajes: [...state.mensajes, action.mensaje] };
    case "updateConversacion":
      return {
        ...state,
        conversaciones: state.conversaciones.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };
    case "addAccion":
      return { ...state, acciones: [action.accion, ...state.acciones] };
    case "updateAccion":
      return {
        ...state,
        acciones: state.acciones.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)),
      };
    case "addInteres":
      return { ...state, intereses: [action.interes, ...state.intereses] };
    case "addNotificacion":
      return { ...state, notificaciones: [action.notificacion, ...state.notificaciones] };
    case "updateProducto":
      return {
        ...state,
        productos: state.productos.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      };
    case "addMovimiento":
      return { ...state, movimientos: [action.movimiento, ...state.movimientos] };
    case "addRequisito":
      return { ...state, requisitos: [action.requisito, ...state.requisitos] };
    case "updateRequisito":
      return {
        ...state,
        requisitos: state.requisitos.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      };
    case "removeRequisito":
      return { ...state, requisitos: state.requisitos.filter((r) => r.id !== action.id) };
    case "addAcuerdoStellar":
      if (state.acuerdosStellar.some((a) => a.contractId === action.acuerdo.contractId && a.id === action.acuerdo.id)) return state;
      return { ...state, acuerdosStellar: [action.acuerdo, ...state.acuerdosStellar] };
    case "addTxAcuerdoStellar":
      return {
        ...state,
        acuerdosStellar: state.acuerdosStellar.map((a) =>
          a.id === action.id && !a.transacciones.some((t) => t.hash === action.hash)
            ? { ...a, transacciones: [...a.transacciones, { etapa: action.etapa, hash: action.hash }] }
            : a,
        ),
      };
    case "reservarStock": {
      // Nunca deja stock negativo: si no alcanza, el estado no cambia.
      const p = state.productos.find((x) => x.id === action.productoId);
      if (!p || p.estado !== "Disponible" || action.cantidadTn <= 0 || action.cantidadTn > p.cantidadTn) return state;
      const resto = +(p.cantidadTn - action.cantidadTn).toFixed(3);
      return {
        ...state,
        productos: state.productos.map((x) =>
          x.id === p.id ? { ...x, cantidadTn: resto, estado: resto === 0 ? "Reservado" : x.estado } : x,
        ),
      };
    }
    case "hydrate":
      return action.state;
    case "reset":
      return initialState;
    default:
      return state;
  }
}

const STORAGE_KEY = "agroglobal-comex-demo-v3";
// Clave usada antes del cambio de nombre AgroMatch → AgroGlobal. Se lee solo si
// todavía no existe la nueva, para no perder los datos locales del navegador.
const STORAGE_KEY_ANTERIOR = "agromatch-comex-demo-v3";

function loadState(): AppState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_ANTERIOR);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.productos || !parsed.cotizaciones || !parsed.mensajes || !parsed.acciones) return initialState;
    if (!parsed.requisitos) parsed.requisitos = REQUISITOS_INICIALES;
    if (!parsed.organizaciones?.length) parsed.organizaciones = ORGANIZACIONES_DEMO;
    if (!parsed.organizacionActivaId) parsed.organizacionActivaId = "ORG-B";
    if (!parsed.modo) parsed.modo = "exportador";
    if (typeof parsed.modoElegido !== "boolean") parsed.modoElegido = false;
    // Acuerdos de referencia siempre presentes; los creados desde la app se conservan.
    const propios = (parsed.acuerdosStellar ?? []).filter((a) => a.origen === "app");
    parsed.acuerdosStellar = [...propios, ...ACUERDOS_REFERENCIA];
    return parsed;
  } catch {
    return initialState;
  }
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  hidratado: boolean;
} | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  // SSR y primer render del cliente usan initialState (evita hydration mismatch);
  // el estado persistido se hidrata después del montaje.
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    dispatch({ type: "hydrate", state: loadState() });
    setHidratado(true);
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.localStorage.removeItem(STORAGE_KEY_ANTERIOR);
    } catch {
      // almacenamiento no disponible: el prototipo sigue funcionando en memoria
    }
  }, [state]);

  // Aplica el tema de marca de la organización activa (o el diseño
  // AgroGlobal si no tiene personalización).
  const orgActiva = state.organizaciones.find((o) => o.id === state.organizacionActivaId);
  useEffect(() => {
    if (!hidratado) return;
    aplicarTema(orgActiva?.tema ?? null);
  }, [hidratado, orgActiva?.tema]);

  const value = useMemo(() => ({ state, dispatch, hidratado }), [state, hidratado]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useAppStore debe usarse dentro de AppStoreProvider");
  return ctx;
}

export function useOrganizacionActiva(): Organizacion {
  const { state } = useAppStore();
  return (
    state.organizaciones.find((o) => o.id === state.organizacionActivaId) ??
    state.organizaciones[0] ??
    ORGANIZACIONES_DEMO[0]!
  );
}
