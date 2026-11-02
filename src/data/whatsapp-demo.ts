// ============================================================
// AgroGlobal COMEX — Módulo WhatsApp-first (datos de demostración)
// Todos los datos son ficticios y demostrativos.
// ============================================================

export interface IdentidadProductor {
  id: string;
  nombre: string;
  telefono: string; // ficticio
  empresa: string;
  establecimiento: string;
  provincia: string;
  rol: "productor";
  autorizado: boolean;
}

export const PRODUCTOR_DEMO: IdentidadProductor = {
  id: "PROD-001",
  nombre: "Juan Pereyra (ficticio)",
  telefono: "+54 9 379 400-0000",
  empresa: "Arrocera del Litoral S.A. (ficticia)",
  establecimiento: "Establecimiento El Paraná — Chaco",
  provincia: "Chaco",
  rol: "productor",
  autorizado: true,
};

export type RemitenteMensaje = "productor" | "agente" | "sistema";

export interface BotonMensaje {
  id: string;
  label: string;
  accionId?: string; // acción pendiente asociada
  tipo: "confirmar" | "cancelar" | "corregir" | "navegar" | "interes" | "detalle";
  destino?: string; // ruta para botones de navegación
}

export interface MensajeChat {
  id: string;
  conversacionId: string;
  remitente: RemitenteMensaje;
  texto: string;
  fecha: string; // ISO
  botones?: BotonMensaje[];
  audio?: { duracionSeg: number; estado: EstadoAudio };
  adjunto?: { nombre: string; tipo: string; estado: string };
}

export type EstadoAudio =
  | "Audio recibido"
  | "Transcribiendo"
  | "Analizando"
  | "Necesita confirmación"
  | "Procesado"
  | "Error";

export interface Conversacion {
  id: string;
  productorId: string;
  canal: "simulador" | "whatsapp";
  estado: "nueva" | "pendiente" | "resuelta";
  ultimoMensaje: string;
  ultimaActividad: string; // ISO
}

export type TipoAccionPendiente =
  | "publicar_oferta"
  | "actualizar_stock"
  | "manifestar_interes"
  | "asociar_documento";

export interface AccionPendiente {
  id: string;
  tipo: TipoAccionPendiente;
  conversacionId: string;
  productorId: string;
  /** Datos estructurados extraídos por el intérprete (nunca texto libre de IA). */
  datos: Record<string, string | number | undefined>;
  estado: "pendiente" | "confirmada" | "cancelada" | "expirada";
  creadaEn: string;
  resumen: string;
  /** Resultado de la ejecución (ej. código de oferta generado). */
  resultado?: string;
}

export interface InteresComercial {
  id: string;
  solicitudId: string;
  productorId: string;
  ofertaId?: string;
  fecha: string;
  estado: "Manifestado" | "En gestión" | "Descartado";
  nota: string;
}

export interface NotificacionDemo {
  id: string;
  titulo: string;
  detalle: string;
  fecha: string;
  leida: boolean;
  canal: "plataforma" | "whatsapp";
  estadoEnvio?: "Registrada" | "Pendiente de configuración de WhatsApp";
}

export interface MovimientoInventario {
  id: string;
  productoId: string;
  tipo: "egreso" | "ingreso" | "ajuste";
  cantidadTn: number;
  stockAnteriorTn: number;
  stockNuevoTn: number;
  origen: "chat" | "web";
  accionId?: string; // idempotencia: un movimiento por acción confirmada
  fecha: string;
}

export const CONVERSACION_INICIAL: Conversacion = {
  id: "CONV-001",
  productorId: PRODUCTOR_DEMO.id,
  canal: "simulador",
  estado: "nueva",
  ultimoMensaje: "Conversación de demostración",
  ultimaActividad: new Date().toISOString(),
};

export const MENSAJE_BIENVENIDA =
  "Hola, soy el asistente de AgroGlobal COMEX (demostración). Podés escribirme como lo harías por WhatsApp: publicar una oferta, actualizar stock, consultar compradores o ver tus operaciones. Probá con: “Tengo 80 toneladas de arroz blanco largo fino, 5% de quebrado, en bolsas de 25 kilos”.";

// Estados de la integración con Meta WhatsApp Business Cloud API
export type EstadoIntegracionWhatsApp =
  | "No configurado"
  | "Configuración incompleta"
  | "Conectado"
  | "Error de autenticación"
  | "Error de webhook"
  | "Operativo";
