-- Bandeja durable de entregas del webhook de WhatsApp
CREATE TABLE public.whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Mensajes entrantes y salientes (una fila por mensaje)
CREATE TABLE public.whatsapp_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id TEXT UNIQUE,          -- id de Meta (entrantes) o id devuelto al enviar (salientes)
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante','saliente')),
  telefono TEXT NOT NULL,             -- número del cliente (from / to)
  tipo TEXT NOT NULL DEFAULT 'texto',
  contenido TEXT,
  estado TEXT NOT NULL DEFAULT 'recibido',  -- entrantes: recibido/procesado; salientes: accepted/sent/delivered/read/failed
  delivery_id TEXT,                   -- entrega del webhook que lo trajo
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_mensajes_telefono ON public.whatsapp_mensajes (telefono, created_at);
GRANT ALL ON public.whatsapp_mensajes TO service_role;
ALTER TABLE public.whatsapp_mensajes ENABLE ROW LEVEL SECURITY;

-- Acciones propuestas por el asistente, pendientes de confirmación por WhatsApp
CREATE TABLE public.whatsapp_acciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono TEXT NOT NULL,
  tipo TEXT NOT NULL,                 -- publicar_oferta | actualizar_stock
  datos JSONB NOT NULL,
  resumen TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmada','cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelta_at TIMESTAMPTZ
);
CREATE INDEX idx_whatsapp_acciones_pendientes ON public.whatsapp_acciones (telefono) WHERE estado = 'pendiente';
GRANT ALL ON public.whatsapp_acciones TO service_role;
ALTER TABLE public.whatsapp_acciones ENABLE ROW LEVEL SECURITY;

-- Ofertas publicadas desde WhatsApp (confirmadas)
CREATE TABLE public.whatsapp_ofertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,        -- OF-0001…
  telefono TEXT NOT NULL,
  tipo_arroz TEXT NOT NULL,
  variedad TEXT NOT NULL,
  cantidad_tn NUMERIC NOT NULL CHECK (cantidad_tn >= 0),
  quebrado_pct NUMERIC,
  humedad_pct NUMERIC,
  presentacion TEXT,
  estado TEXT NOT NULL DEFAULT 'Disponible',
  accion_id UUID REFERENCES public.whatsapp_acciones(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_ofertas TO service_role;
ALTER TABLE public.whatsapp_ofertas ENABLE ROW LEVEL SECURITY;

-- Movimientos de inventario (idempotentes por accion_id)
CREATE TABLE public.whatsapp_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id UUID NOT NULL REFERENCES public.whatsapp_ofertas(id),
  accion_id UUID NOT NULL UNIQUE REFERENCES public.whatsapp_acciones(id),
  cantidad_tn NUMERIC NOT NULL CHECK (cantidad_tn > 0),
  stock_anterior_tn NUMERIC NOT NULL,
  stock_nuevo_tn NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_movimientos TO service_role;
ALTER TABLE public.whatsapp_movimientos ENABLE ROW LEVEL SECURITY;