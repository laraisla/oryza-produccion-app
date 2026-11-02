-- ============================================================
-- AgroGlobal COMEX — Núcleo comercial (PROPUESTA, NO APLICADA)
--
-- Empresas, usuarios, productos, lotes, inventario, solicitudes,
-- órdenes, reservas de stock y acuerdos Stellar Testnet.
--
-- Diseño:
--  * Solo agrega objetos. No borra ni modifica columnas existentes.
--    Única alteración: whatsapp_ofertas gana una columna NULL (lote_id).
--  * RLS habilitado en todas las tablas nuevas.
--  * El stock y los estados de orden solo cambian mediante funciones
--    (SECURITY DEFINER) con bloqueo de fila: sin negativos, sin
--    reservas simultáneas que excedan el disponible, sin descuentos
--    duplicados (clave de idempotencia).
--  * Todo en una transacción: si algo falla, no queda nada aplicado.
-- ============================================================

BEGIN;

-- ---------- Tipos ----------
CREATE TYPE public.rol_miembro AS ENUM ('admin', 'comercial', 'operaciones', 'finanzas');
CREATE TYPE public.tipo_operacion AS ENUM ('local', 'exportacion');
CREATE TYPE public.tipo_movimiento AS ENUM ('ingreso', 'egreso', 'ajuste', 'reserva', 'liberacion_reserva');
CREATE TYPE public.origen_movimiento AS ENUM ('web', 'whatsapp', 'sistema');
CREATE TYPE public.estado_reserva AS ENUM ('activa', 'consumida', 'liberada', 'vencida');
CREATE TYPE public.estado_orden AS ENUM (
  'emitida', 'aceptada', 'en_garantia', 'en_preparacion', 'despachada',
  'entregada', 'cerrada', 'cancelada', 'en_disputa'
);

-- ---------- Empresas y usuarios ----------
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT NOT NULL,
  pais TEXT NOT NULL DEFAULT 'Argentina',
  provincia TEXT,
  actividades TEXT[] NOT NULL DEFAULT '{}',
  sitio_web TEXT,
  tema JSONB,                       -- identidad visual detectada/editada
  demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.miembros (
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol public.rol_miembro NOT NULL DEFAULT 'comercial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, user_id)
);
CREATE INDEX idx_miembros_user ON public.miembros (user_id);

-- Números autorizados para operar por WhatsApp (solo verificados pueden mover stock).
CREATE TABLE public.telefonos_autorizados (
  telefono TEXT PRIMARY KEY CHECK (telefono ~ '^[0-9]{8,15}$'),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puede_mover_stock BOOLEAN NOT NULL DEFAULT false,
  verificado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Productos, lotes e inventario ----------
CREATE TABLE public.productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo_arroz TEXT NOT NULL,
  variedad TEXT NOT NULL,
  grado_elaboracion TEXT,
  certificaciones TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_productos_empresa ON public.productos (empresa_id);

CREATE TABLE public.lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  quebrado_pct NUMERIC(5,2) NOT NULL CHECK (quebrado_pct BETWEEN 0 AND 100),
  humedad_pct NUMERIC(5,2) NOT NULL CHECK (humedad_pct BETWEEN 0 AND 100),
  presentacion TEXT NOT NULL,
  precio_tn_usd NUMERIC(12,2) CHECK (precio_tn_usd > 0),
  provincia TEXT,
  stock_fisico_tn NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (stock_fisico_tn >= 0),
  publicado BOOLEAN NOT NULL DEFAULT true,
  fecha_disponibilidad DATE,
  -- datos de exportación opcionales (no se exigen para venta local)
  ncm TEXT,
  puerto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lotes_empresa ON public.lotes (empresa_id);
CREATE INDEX idx_lotes_publicados ON public.lotes (publicado) WHERE publicado;

-- Registro inmutable de cada cambio de stock (web, WhatsApp o sistema).
CREATE TABLE public.movimientos_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  tipo public.tipo_movimiento NOT NULL,
  cantidad_tn NUMERIC(14,3) NOT NULL CHECK (cantidad_tn > 0),
  stock_fisico_antes NUMERIC(14,3) NOT NULL,
  stock_fisico_despues NUMERIC(14,3) NOT NULL CHECK (stock_fisico_despues >= 0),
  origen public.origen_movimiento NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,  -- evita descuentos duplicados
  actor_user_id UUID REFERENCES auth.users(id),
  actor_telefono TEXT,
  detalle JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movimientos_lote ON public.movimientos_stock (lote_id, created_at);

-- Vínculo de ofertas de WhatsApp existentes con el inventario único (columna nueva, NULL).
ALTER TABLE public.whatsapp_ofertas ADD COLUMN lote_id UUID REFERENCES public.lotes(id);

-- ---------- Solicitudes de compra ----------
CREATE TABLE public.solicitudes_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_compradora_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo_operacion public.tipo_operacion NOT NULL,
  tipo_arroz TEXT NOT NULL,
  variedad TEXT NOT NULL,
  volumen_tn NUMERIC(14,3) NOT NULL CHECK (volumen_tn > 0),
  quebrado_max_pct NUMERIC(5,2) NOT NULL,
  humedad_max_pct NUMERIC(5,2) NOT NULL,
  presentacion TEXT,
  certificaciones TEXT[] NOT NULL DEFAULT '{}',
  incoterm TEXT,
  pais_destino TEXT,
  lugar_entrega TEXT,
  fecha_requerida DATE,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'en_negociacion', 'cerrada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Venta local: sin Incoterm. Exportación: Incoterm y destino obligatorios.
  CONSTRAINT solicitud_por_tipo CHECK (
    (tipo_operacion = 'local' AND incoterm IS NULL)
    OR (tipo_operacion = 'exportacion' AND incoterm IS NOT NULL AND pais_destino IS NOT NULL)
  )
);

-- ---------- Órdenes (compraventa) ----------
CREATE TABLE public.ordenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  tipo_operacion public.tipo_operacion NOT NULL,
  solicitud_id UUID REFERENCES public.solicitudes_compra(id),
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  comprador_empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  vendedor_empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  cantidad_tn NUMERIC(14,3) NOT NULL CHECK (cantidad_tn > 0),
  precio_tn_usd NUMERIC(12,2) NOT NULL CHECK (precio_tn_usd > 0),
  total_usd NUMERIC(16,2) GENERATED ALWAYS AS (round(cantidad_tn * precio_tn_usd, 2)) STORED,
  condiciones JSONB NOT NULL,                 -- versión aceptada, congelada
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^[0-9a-f]{64}$'),
  incoterm TEXT,
  lugar_designado TEXT,
  lugar_entrega TEXT,
  estado public.estado_orden NOT NULL DEFAULT 'emitida',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (comprador_empresa_id <> vendedor_empresa_id),
  CONSTRAINT orden_por_tipo CHECK (
    (tipo_operacion = 'local' AND incoterm IS NULL AND lugar_entrega IS NOT NULL)
    OR (tipo_operacion = 'exportacion' AND incoterm IS NOT NULL AND lugar_designado IS NOT NULL)
  )
);
CREATE INDEX idx_ordenes_comprador ON public.ordenes (comprador_empresa_id);
CREATE INDEX idx_ordenes_vendedor ON public.ordenes (vendedor_empresa_id);

CREATE TABLE public.orden_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  estado_anterior public.estado_orden,
  estado_nuevo public.estado_orden NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id),
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Reservas de stock ----------
CREATE TABLE public.reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id UUID NOT NULL REFERENCES public.lotes(id),
  orden_id UUID NOT NULL UNIQUE REFERENCES public.ordenes(id),  -- una reserva por orden
  cantidad_tn NUMERIC(14,3) NOT NULL CHECK (cantidad_tn > 0),
  estado public.estado_reserva NOT NULL DEFAULT 'activa',
  expira_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservas_activas ON public.reservas (lote_id) WHERE estado = 'activa';

-- Disponible = físico − reservas activas no vencidas.
CREATE VIEW public.lotes_disponibilidad WITH (security_invoker = true) AS
SELECT l.id AS lote_id,
       l.stock_fisico_tn,
       COALESCE(SUM(r.cantidad_tn) FILTER (WHERE r.estado = 'activa' AND r.expira_at > now()), 0) AS reservado_tn,
       l.stock_fisico_tn
         - COALESCE(SUM(r.cantidad_tn) FILTER (WHERE r.estado = 'activa' AND r.expira_at > now()), 0) AS disponible_tn
FROM public.lotes l
LEFT JOIN public.reservas r ON r.lote_id = l.id
GROUP BY l.id;

-- ---------- Acuerdos Stellar (solo Testnet) ----------
CREATE TABLE public.acuerdos_stellar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL UNIQUE REFERENCES public.ordenes(id),
  red TEXT NOT NULL DEFAULT 'testnet' CHECK (red = 'testnet'),
  contract_id TEXT NOT NULL CHECK (contract_id ~ '^C[A-Z2-7]{55}$'),
  agreement_id BIGINT NOT NULL CHECK (agreement_id >= 0),
  terms_hash TEXT NOT NULL CHECK (terms_hash ~ '^[0-9a-f]{64}$'),
  monto_unidades NUMERIC(30,0) NOT NULL CHECK (monto_unidades > 0),
  activo TEXT NOT NULL,
  estado_cadena TEXT,                 -- último estado leído de la red (caché, no prueba)
  estado_leido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, agreement_id)
);

CREATE TABLE public.transacciones_stellar (
  tx_hash TEXT PRIMARY KEY CHECK (tx_hash ~ '^[0-9a-f]{64}$'),
  acuerdo_id UUID NOT NULL REFERENCES public.acuerdos_stellar(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL CHECK (etapa IN ('create', 'accept', 'deposit', 'release', 'refund', 'cancel')),
  ledger BIGINT,
  confirmada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Funciones
-- ============================================================

CREATE FUNCTION public.es_miembro(p_empresa UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.miembros WHERE empresa_id = p_empresa AND user_id = auth.uid());
$$;

CREATE FUNCTION public.es_parte_de_orden(p_orden UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ordenes o
    WHERE o.id = p_orden AND (public.es_miembro(o.comprador_empresa_id) OR public.es_miembro(o.vendedor_empresa_id))
  );
$$;

-- Movimiento de stock idempotente con bloqueo de fila.
-- Repetir la misma idempotency_key devuelve el movimiento original sin volver a descontar.
CREATE FUNCTION public.registrar_movimiento(
  p_lote UUID, p_tipo public.tipo_movimiento, p_cantidad NUMERIC,
  p_origen public.origen_movimiento, p_idempotency_key TEXT,
  p_actor_user UUID DEFAULT NULL, p_actor_telefono TEXT DEFAULT NULL, p_detalle JSONB DEFAULT NULL
) RETURNS public.movimientos_stock
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lote public.lotes;
  v_prev public.movimientos_stock;
  v_disponible NUMERIC;
  v_nuevo NUMERIC;
  v_mov public.movimientos_stock;
BEGIN
  SELECT * INTO v_prev FROM public.movimientos_stock WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_prev; END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
  IF p_tipo NOT IN ('ingreso', 'egreso', 'ajuste') THEN
    RAISE EXCEPTION 'Las reservas se gestionan con reservar_stock/liberar_reserva';
  END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote inexistente'; END IF;

  IF p_tipo = 'ingreso' THEN
    v_nuevo := v_lote.stock_fisico_tn + p_cantidad;
  ELSE
    SELECT disponible_tn INTO v_disponible FROM public.lotes_disponibilidad WHERE lote_id = p_lote;
    IF p_cantidad > v_disponible THEN
      RAISE EXCEPTION 'Stock insuficiente: disponible % tn, solicitado % tn', v_disponible, p_cantidad;
    END IF;
    v_nuevo := v_lote.stock_fisico_tn - p_cantidad;
  END IF;

  UPDATE public.lotes SET stock_fisico_tn = v_nuevo, updated_at = now() WHERE id = p_lote;
  INSERT INTO public.movimientos_stock
    (lote_id, tipo, cantidad_tn, stock_fisico_antes, stock_fisico_despues, origen, idempotency_key, actor_user_id, actor_telefono, detalle)
  VALUES
    (p_lote, p_tipo, p_cantidad, v_lote.stock_fisico_tn, v_nuevo, p_origen, p_idempotency_key, p_actor_user, p_actor_telefono, p_detalle)
  RETURNING * INTO v_mov;
  RETURN v_mov;
END;
$$;

-- Reserva atómica: bloquea el lote, verifica disponible y crea la reserva.
-- Dos reservas simultáneas se serializan por el FOR UPDATE.
CREATE FUNCTION public.reservar_stock(p_orden UUID, p_expira TIMESTAMPTZ)
RETURNS public.reservas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orden public.ordenes;
  v_disponible NUMERIC;
  v_res public.reservas;
BEGIN
  SELECT * INTO v_orden FROM public.ordenes WHERE id = p_orden;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden inexistente'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.es_miembro(v_orden.vendedor_empresa_id) THEN
    RAISE EXCEPTION 'Solo el vendedor puede reservar stock para la orden';
  END IF;

  SELECT * INTO v_res FROM public.reservas WHERE orden_id = p_orden;
  IF FOUND THEN RETURN v_res; END IF;          -- idempotente

  PERFORM 1 FROM public.lotes WHERE id = v_orden.lote_id FOR UPDATE;
  SELECT disponible_tn INTO v_disponible FROM public.lotes_disponibilidad WHERE lote_id = v_orden.lote_id;
  IF v_orden.cantidad_tn > v_disponible THEN
    RAISE EXCEPTION 'Stock insuficiente para reservar: disponible % tn, requerido % tn', v_disponible, v_orden.cantidad_tn;
  END IF;

  INSERT INTO public.reservas (lote_id, orden_id, cantidad_tn, expira_at)
  VALUES (v_orden.lote_id, p_orden, v_orden.cantidad_tn, p_expira)
  RETURNING * INTO v_res;
  RETURN v_res;
END;
$$;

-- Transiciones de estado permitidas (única vía para cambiar ordenes.estado).
CREATE FUNCTION public.avanzar_orden(p_orden UUID, p_nuevo public.estado_orden, p_nota TEXT DEFAULT NULL)
RETURNS public.ordenes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orden public.ordenes;
  v_ok BOOLEAN;
BEGIN
  SELECT * INTO v_orden FROM public.ordenes WHERE id = p_orden FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden inexistente'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.es_parte_de_orden(p_orden) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_ok := (v_orden.estado, p_nuevo) IN (
    ('emitida', 'aceptada'), ('emitida', 'cancelada'),
    ('aceptada', 'en_garantia'), ('aceptada', 'en_preparacion'), ('aceptada', 'cancelada'),
    ('en_garantia', 'en_preparacion'), ('en_garantia', 'en_disputa'),
    ('en_preparacion', 'despachada'), ('despachada', 'entregada'),
    ('entregada', 'cerrada'), ('entregada', 'en_disputa'),
    ('en_disputa', 'cerrada'), ('en_disputa', 'cancelada')
  );
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transición no permitida: % → %', v_orden.estado, p_nuevo;
  END IF;

  -- Al cancelar se libera la reserva; al despachar se consume y descuenta el físico.
  IF p_nuevo = 'cancelada' THEN
    UPDATE public.reservas SET estado = 'liberada' WHERE orden_id = p_orden AND estado = 'activa';
  ELSIF p_nuevo = 'despachada' THEN
    UPDATE public.reservas SET estado = 'consumida' WHERE orden_id = p_orden AND estado = 'activa';
    PERFORM public.registrar_movimiento(
      v_orden.lote_id, 'egreso', v_orden.cantidad_tn, 'sistema', 'despacho:' || p_orden::text, auth.uid()
    );
  END IF;

  INSERT INTO public.orden_eventos (orden_id, estado_anterior, estado_nuevo, actor_user_id, nota)
  VALUES (p_orden, v_orden.estado, p_nuevo, auth.uid(), p_nota);
  UPDATE public.ordenes SET estado = p_nuevo, updated_at = now() WHERE id = p_orden RETURNING * INTO v_orden;
  RETURN v_orden;
END;
$$;

-- Vencimiento de reservas (para un cron).
CREATE FUNCTION public.vencer_reservas() RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (
    UPDATE public.reservas SET estado = 'vencida'
    WHERE estado = 'activa' AND expira_at <= now() RETURNING 1
  ) SELECT count(*)::int FROM v;
$$;

-- Las funciones solo se exponen a usuarios autenticados y al servidor.
REVOKE ALL ON FUNCTION public.registrar_movimiento FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_stock FROM PUBLIC;
REVOKE ALL ON FUNCTION public.avanzar_orden FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vencer_reservas FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_stock, public.avanzar_orden TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento, public.reservar_stock, public.avanzar_orden, public.vencer_reservas TO service_role;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telefonos_autorizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acuerdos_stellar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacciones_stellar ENABLE ROW LEVEL SECURITY;

-- Empresas: el directorio (nombre, provincia) es visible para usuarios autenticados;
-- solo los administradores de la empresa la editan.
CREATE POLICY empresas_select ON public.empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY empresas_update ON public.empresas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.miembros m WHERE m.empresa_id = empresas.id AND m.user_id = auth.uid() AND m.rol = 'admin'));

-- Miembros: cada usuario ve las membresías de sus empresas.
CREATE POLICY miembros_select ON public.miembros FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));

-- Teléfonos autorizados: solo miembros de la empresa los ven; altas por el servidor.
CREATE POLICY telefonos_select ON public.telefonos_autorizados FOR SELECT TO authenticated USING (public.es_miembro(empresa_id));

-- Productos y lotes: catálogo visible a autenticados (lotes publicados);
-- alta/edición solo por miembros. El stock NO se edita directo (columna protegida abajo).
CREATE POLICY productos_select ON public.productos FOR SELECT TO authenticated USING (true);
CREATE POLICY productos_write ON public.productos FOR ALL TO authenticated
  USING (public.es_miembro(empresa_id)) WITH CHECK (public.es_miembro(empresa_id));
CREATE POLICY lotes_select ON public.lotes FOR SELECT TO authenticated USING (publicado OR public.es_miembro(empresa_id));
CREATE POLICY lotes_insert ON public.lotes FOR INSERT TO authenticated WITH CHECK (public.es_miembro(empresa_id) AND stock_fisico_tn = 0);
CREATE POLICY lotes_update ON public.lotes FOR UPDATE TO authenticated
  USING (public.es_miembro(empresa_id)) WITH CHECK (public.es_miembro(empresa_id));
REVOKE UPDATE (stock_fisico_tn) ON public.lotes FROM authenticated;

-- Movimientos y reservas: lectura para la empresa dueña del lote o partes de la orden; escritura solo vía funciones.
CREATE POLICY movimientos_select ON public.movimientos_stock FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lotes l WHERE l.id = lote_id AND public.es_miembro(l.empresa_id)));
CREATE POLICY reservas_select ON public.reservas FOR SELECT TO authenticated USING (public.es_parte_de_orden(orden_id));

-- Solicitudes: visibles para autenticados (demanda del marketplace); las gestiona la empresa compradora.
CREATE POLICY solicitudes_select ON public.solicitudes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY solicitudes_write ON public.solicitudes_compra FOR ALL TO authenticated
  USING (public.es_miembro(empresa_compradora_id)) WITH CHECK (public.es_miembro(empresa_compradora_id));

-- Órdenes: solo comprador y vendedor. Las crea el comprador en estado 'emitida';
-- los cambios de estado van por avanzar_orden (no hay política UPDATE).
CREATE POLICY ordenes_select ON public.ordenes FOR SELECT TO authenticated USING (public.es_parte_de_orden(id));
CREATE POLICY ordenes_insert ON public.ordenes FOR INSERT TO authenticated
  WITH CHECK (public.es_miembro(comprador_empresa_id) AND estado = 'emitida');
CREATE POLICY orden_eventos_select ON public.orden_eventos FOR SELECT TO authenticated USING (public.es_parte_de_orden(orden_id));

-- Acuerdos Stellar: lectura para las partes; escritura solo del servidor tras verificar en la red.
CREATE POLICY acuerdos_select ON public.acuerdos_stellar FOR SELECT TO authenticated USING (public.es_parte_de_orden(orden_id));
CREATE POLICY tx_stellar_select ON public.transacciones_stellar FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.acuerdos_stellar a WHERE a.id = acuerdo_id AND public.es_parte_de_orden(a.orden_id)));

-- Permisos de tabla (RLS filtra filas; esto define qué operaciones existen).
GRANT SELECT ON public.empresas, public.miembros, public.telefonos_autorizados, public.productos, public.lotes,
  public.movimientos_stock, public.solicitudes_compra, public.ordenes, public.orden_eventos, public.reservas,
  public.acuerdos_stellar, public.transacciones_stellar, public.lotes_disponibilidad TO authenticated;
GRANT UPDATE (razon_social, nombre_comercial, provincia, actividades, sitio_web, tema) ON public.empresas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.productos, public.solicitudes_compra TO authenticated;
GRANT INSERT ON public.lotes, public.ordenes TO authenticated;
GRANT UPDATE (quebrado_pct, humedad_pct, presentacion, precio_tn_usd, provincia, publicado, fecha_disponibilidad, ncm, puerto)
  ON public.lotes TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

COMMIT;
