-- ============================================================
-- Reversión de 0001_nucleo_comercial.sql (PROPUESTA, NO APLICADA)
-- Elimina SOLO los objetos creados por esa migración, en orden
-- inverso. Las tablas whatsapp_* existentes y sus datos se
-- conservan (solo se quita la columna agregada lote_id).
-- ATENCIÓN: borra los datos cargados en las tablas nuevas.
-- Hacer respaldo antes (ver README).
-- ============================================================
BEGIN;

-- Políticas primero (algunas referencian otras tablas o funciones). Sin CASCADE a propósito.
DROP POLICY IF EXISTS tx_stellar_select ON public.transacciones_stellar;
DROP POLICY IF EXISTS acuerdos_select ON public.acuerdos_stellar;
DROP POLICY IF EXISTS orden_eventos_select ON public.orden_eventos;
DROP POLICY IF EXISTS ordenes_insert ON public.ordenes;
DROP POLICY IF EXISTS ordenes_select ON public.ordenes;
DROP POLICY IF EXISTS solicitudes_write ON public.solicitudes_compra;
DROP POLICY IF EXISTS solicitudes_select ON public.solicitudes_compra;
DROP POLICY IF EXISTS reservas_select ON public.reservas;
DROP POLICY IF EXISTS movimientos_select ON public.movimientos_stock;
DROP POLICY IF EXISTS lotes_update ON public.lotes;
DROP POLICY IF EXISTS lotes_insert ON public.lotes;
DROP POLICY IF EXISTS lotes_select ON public.lotes;
DROP POLICY IF EXISTS productos_write ON public.productos;
DROP POLICY IF EXISTS productos_select ON public.productos;
DROP POLICY IF EXISTS telefonos_select ON public.telefonos_autorizados;
DROP POLICY IF EXISTS miembros_select ON public.miembros;
DROP POLICY IF EXISTS empresas_update ON public.empresas;
DROP POLICY IF EXISTS empresas_select ON public.empresas;

DROP FUNCTION IF EXISTS public.vencer_reservas();
DROP FUNCTION IF EXISTS public.avanzar_orden(UUID, public.estado_orden, TEXT);
DROP FUNCTION IF EXISTS public.reservar_stock(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.registrar_movimiento(UUID, public.tipo_movimiento, NUMERIC, public.origen_movimiento, TEXT, UUID, TEXT, JSONB);

DROP TABLE IF EXISTS public.transacciones_stellar;
DROP TABLE IF EXISTS public.acuerdos_stellar;
DROP VIEW IF EXISTS public.lotes_disponibilidad;
DROP TABLE IF EXISTS public.reservas;
DROP TABLE IF EXISTS public.orden_eventos;
DROP TABLE IF EXISTS public.ordenes;
DROP TABLE IF EXISTS public.solicitudes_compra;
ALTER TABLE public.whatsapp_ofertas DROP COLUMN IF EXISTS lote_id;
DROP TABLE IF EXISTS public.movimientos_stock;
DROP TABLE IF EXISTS public.lotes;
DROP TABLE IF EXISTS public.productos;
DROP TABLE IF EXISTS public.telefonos_autorizados;

DROP TABLE IF EXISTS public.miembros;
DROP TABLE IF EXISTS public.empresas;

-- Después de las tablas: sus políticas RLS dependen de estas funciones.
DROP FUNCTION IF EXISTS public.es_parte_de_orden(UUID);
DROP FUNCTION IF EXISTS public.es_miembro(UUID);

DROP TYPE IF EXISTS public.estado_orden;
DROP TYPE IF EXISTS public.estado_reserva;
DROP TYPE IF EXISTS public.origen_movimiento;
DROP TYPE IF EXISTS public.tipo_movimiento;
DROP TYPE IF EXISTS public.tipo_operacion;
DROP TYPE IF EXISTS public.rol_miembro;

COMMIT;
