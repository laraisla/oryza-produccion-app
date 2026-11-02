# Propuesta de base de datos — Núcleo comercial (NO APLICADA)

> Estos archivos **no** están en `drizzle/migrations/` a propósito: así Lovable
> no los aplica al sincronizar la rama. Solo se aplican con autorización
> explícita, siguiendo el procedimiento de abajo.

| Archivo | Contenido |
|---|---|
| `0001_nucleo_comercial.sql` | Migración (una transacción: todo o nada) |
| `0001_rollback.sql` | Reversión de solo los objetos nuevos |
| `validar-pglite.mjs` | Validación en Postgres embebido (sin red, sin tocar la base remota) |

## Qué crea y qué modifica

**No borra ni modifica columnas existentes.** Las 5 tablas `whatsapp_*` y sus datos quedan intactos.

| Tabla / objeto | Tipo | Propósito |
|---|---|---|
| `empresas` | nueva | Razón social, actividades, identidad visual (`tema`) |
| `miembros` | nueva | Usuario (`auth.users`) ↔ empresa, con rol `admin/comercial/operaciones/finanzas` |
| `telefonos_autorizados` | nueva | Números de WhatsApp verificados y si pueden mover stock |
| `productos` | nueva | Tipo, variedad, certificaciones |
| `lotes` | nueva | Calidad, presentación, precio, **stock físico (≥ 0)**, datos de exportación opcionales |
| `movimientos_stock` | nueva | Registro inmutable de ingresos/egresos/ajustes, con **clave de idempotencia única** |
| `solicitudes_compra` | nueva | Demanda; restricción: local sin Incoterm, exportación con Incoterm + destino |
| `ordenes` | nueva | Compraventa con condiciones congeladas + `terms_hash`; misma restricción local/exportación |
| `orden_eventos` | nueva | Auditoría de cambios de estado |
| `reservas` | nueva | Una reserva por orden, con vencimiento |
| `lotes_disponibilidad` | vista | Disponible = físico − reservas activas no vencidas |
| `acuerdos_stellar` | nueva | Orden ↔ acuerdo del contrato Soroban (solo `red = 'testnet'`) |
| `transacciones_stellar` | nueva | Hash de cada transacción por etapa |
| `whatsapp_ofertas.lote_id` | **columna nueva, NULL** | Única modificación: vincula ofertas de WhatsApp al inventario único |
| `registrar_movimiento()` | función | Mueve stock con bloqueo de fila; idempotente; nunca negativo |
| `reservar_stock()` | función | Reserva atómica (`FOR UPDATE`): dos reservas simultáneas no superan el disponible |
| `avanzar_orden()` | función | Única vía para cambiar el estado; valida transiciones; al despachar consume la reserva y descuenta el físico una sola vez |
| `vencer_reservas()` | función | Para un cron |

## Cómo se aplica RLS

RLS queda **habilitado en todas las tablas nuevas**. Las políticas usan `es_miembro(empresa)` y `es_parte_de_orden(orden)` (`SECURITY DEFINER`, basadas en `auth.uid()`).

| Tabla | Lectura | Escritura |
|---|---|---|
| `empresas` | autenticados (directorio) | `UPDATE` solo admins de la empresa |
| `miembros`, `telefonos_autorizados` | miembros de la empresa | solo servidor (`service_role`) |
| `productos`, `lotes` | autenticados (lotes publicados) o miembros | miembros de la empresa; **`stock_fisico_tn` no se puede editar directamente** |
| `movimientos_stock` | miembros de la empresa dueña del lote | solo vía `registrar_movimiento()` |
| `solicitudes_compra` | autenticados | miembros de la empresa compradora |
| `ordenes`, `orden_eventos`, `reservas` | solo comprador y vendedor | la crea el comprador (`emitida`); estados solo vía `avanzar_orden()` |
| `acuerdos_stellar`, `transacciones_stellar` | comprador y vendedor | solo servidor, después de verificar en la red |
| `whatsapp_*` (existentes) | sin cambios: solo `service_role` | sin cambios |

## Validación realizada (sin tocar la base remota)

`validar-pglite.mjs` aplica `drizzle/migrations/0000` + esta propuesta en un Postgres
embebido (PGlite) con stubs de `auth.users`/`auth.uid()` y roles de Supabase, y
verifica 26 casos: idempotencia de ingresos y egresos por WhatsApp, rechazo de
negativos, reservas que exceden el disponible, transiciones inválidas, despacho
que descuenta una sola vez, aislamiento RLS entre empresas, rollback que deja
intactas las tablas de WhatsApp y re-aplicación posterior.

```sh
mkdir /tmp/pgcheck && cd /tmp/pgcheck && bun add @electric-sql/pglite
cp <repo>/db/propuesta/validar-pglite.mjs . && node validar-pglite.mjs <repo>
```

Limitación: PGlite no es Supabase (no prueba triggers de auth, Realtime ni
extensiones). La prueba definitiva es en una base de staging.

## Procedimiento de respaldo y recuperación

1. **Autorización explícita** y ventana sin demo en curso.
2. **Respaldo completo** de la base actual (esquema + datos):
   ```sh
   pg_dump "$LOVABLE_DB_MIGRATION_URL" -Fc --no-owner -f agroglobal_pre_0001_$(date +%Y%m%d%H%M).dump
   pg_restore --list agroglobal_pre_0001_*.dump | head    # verificar que el archivo es legible
   ```
   Además, si el plan de Supabase/Lovable Cloud tiene backups automáticos, confirmar en el panel que existe uno reciente.
3. **Ensayo** en staging (proyecto Supabase aparte o `supabase start` local): aplicar `0001`, correr la app, aplicar `0001_rollback.sql`, volver a aplicar.
4. **Aplicar** en producción. Toda la migración corre en una transacción (`BEGIN … COMMIT`): si falla una sentencia, no queda nada aplicado. Después, regenerar `src/integrations/supabase/types.ts`.
5. **Recuperación**:
   - Problema funcional: `psql "$URL" -f db/propuesta/0001_rollback.sql` quita solo lo nuevo. Los datos de las tablas nuevas se pierden; los de `whatsapp_*` no.
   - Problema grave: `pg_restore --clean --if-exists --no-owner -d "$URL" agroglobal_pre_0001_*.dump`.

> Pendiente de confirmar con Lovable: si la base se gestiona solo por
> `drizzle/migrations` + `_journal.json` (variable `LOVABLE_DB_MIGRATION_URL`),
> aplicar la migración puede requerir moverla ahí y dejar que Lovable la ejecute,
> en vez de `psql` directo. Ninguna de las dos opciones se ejecutó.
