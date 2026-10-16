# Modelo de datos

Hay dos representaciones del mismo modelo:

1. **App (modo demo)** — `src/data/model.ts`: colecciones tipadas que se guardan en el navegador (localStorage + IndexedDB para archivos). Los servicios (`src/data/services`) son funciones puras `(db, ctx, input) → { db, value }` que validan con Zod, controlan permisos por rol y organización, y registran auditoría y trazabilidad.
2. **PostgreSQL / Supabase** — `supabase/migrations/20261016000000_agromatch_schema.sql`: 40 tablas relacionales con RLS. `scripts/db/seedSql.ts` traduce la base demo de la app al esquema (genera `supabase/seed.sql`), y `tests/integration/schema.test.ts` comprueba que los valores permitidos por los `check` del SQL coincidan con los catálogos del dominio.

Convenciones: identificadores UUID; importes, tasas y cantidades en `NUMERIC` (nunca `float`) con unidad explícita en el nombre (`_t`, `_kg`, `_pct`) o en una columna (`currency`, `unit`); fechas `date` y marcas `timestamptz`.

## Entidades sugeridas → implementación

| Sugerida | Implementación | Decisión |
|---|---|---|
| users | `auth.users` (Supabase Auth) + `profiles` | Las credenciales las gestiona Auth; el perfil guarda nombre y email. |
| organizations, organization_members | iguales | El rol es por membresía (una persona puede tener roles distintos en empresas distintas). |
| facilities | `facilities` | Incluye puerto de salida, distancia (manual o de servicio), condiciones de carga y notas logísticas. |
| products, product_specifications | `products` + `product_presentations` | Las especificaciones de calidad pertenecen al **lote** (cada partida tiene su análisis); el producto define tipo, elaboración, NCM y presentaciones (envase, peso neto, tara, pallet, volumen) y a cuáles puede reenvasar. |
| lots, inventory_movements | iguales + vista `lot_stock` | El stock disponible se **calcula** desde los movimientos (reserva, liberación, compromiso, embarque, ajuste); nunca se edita. |
| buyer_requests, request_requirements | iguales + `request_invitations` | Visibilidad pública o privada con empresas invitadas. |
| commercial_matches | igual | Guarda criterios, fallas, condiciones y versión del motor. |
| quotations, quotation_versions | iguales + `quotation_version_costing` | El **costeo privado** (escenario, entrada y resultado del motor) está en una tabla aparte para que la RLS permita al comprador leer términos y precio sin acceder a costos ni márgenes. |
| quotation_items | igual | Desglose congelado por versión (importe, pagador, origen de la asignación, explicación, fuente). Privado del vendedor. |
| trade_operations, operation_lots | iguales | Una operación incluye varios lotes y un lote se asigna parcialmente a varias operaciones (`quantity_t` por par). |
| shipments, containers | `shipments` + `shipment_containers` + `container_types` | El tipo de contenedor (carga útil, límite operativo, volumen, pallets) es un catálogo verificable. |
| logistics_routes | integrado en `facilities` (puerto y distancia), `ports` y partidas de costo | En el MVP una “ruta” es origen → puerto de salida → destino; sus tarifas son partidas con fuente y vigencia. Una tabla de rutas con tarifas por tramo queda para cuando haya acuerdos con forwarders. |
| cost_catalog | igual | Conceptos con punto de la cadena, unidad, fuente, vigencia y estado; `definition` (jsonb) guarda cantidad, tramos, bases y aplicabilidad. |
| operation_costs | `cost_scenarios` + `scenario_cost_lines` (+ `scenario_lots`) y `quotation_items` | Los gastos pertenecen a un **escenario** concreto y se congelan en cada versión de cotización. Los costos reales post-embarque por operación quedan pendientes. |
| incoterm_conditions | código versionado (`domain/incoterms.ts`) + `payer`/`payer_source`/`explanation` en cada ítem congelado | La asignación es lógica (depende de Incoterm, punto y tipo de lugar), se prueba con tests y viaja con la versión del motor; cada versión de cotización conserva la asignación aplicada, así un cambio de regla no altera acuerdos históricos. |
| destination_requirements | igual | Reglas por país (o todos), prefijo NCM, elaboración, transporte, medio de pago y comprador; fuente, URL y estado de verificación. |
| operation_documents, document_versions | iguales | Versiones con SHA-256, tamaño, tipo y ruta de almacenamiento; de solo inserción. |
| payments, payment_allocations | iguales + `invoices` | Se agrega la factura como entidad para imputar cobros N:M. `record_kind` solo admite `informational`. |
| financial_reconciliations | igual | Último resultado del motor, estado y nota/fecha del operador. |
| verification_records | igual + `verification_history` | Referencian el dato concreto (`subject_kind`, `subject_id`, `subject_field`); el historial es de solo inserción. |
| traceability_events, audit_logs | iguales | Marca temporal y actor; de solo inserción. |
| blockchain_records | igual | Solo transacciones confirmadas: hashes, ledger, firmante (dirección pública) y contrato. |
| — | `ports`, `fx_rates`, `app_settings` | Puertos (UN/LOCODE), tipos de cambio con fuente/fecha/estado y configuración por organización. |

## Reglas de integridad

| Regla | Cómo se garantiza |
|---|---|
| Todo lote pertenece a una organización y usa productos y plantas propios | FK compuestas `(product_id, organization_id)` y `(facility_id, organization_id)`; `(presentation_id, product_id)` |
| No reservar ni comprometer stock inexistente o comprometido | `assertAvailable` en servicios + trigger diferido `check_lot_stock` (usa todos los movimientos, sin RLS) |
| Una cotización tiene varias versiones; la aceptada no cambia en silencio | `unique (quotation_id, version)`; triggers `protect_quotation_version` (términos, precio, cantidad, hash, Incoterm, lugar, vigencia; estados definitivos) y `protect_version_costing` |
| La operación apunta a la versión exacta aceptada | `accepted_version_id` + `terms_hash` obligatorios fuera de negociación; trigger `protect_operation_terms` |
| Documentos versionados | `unique (document_id, version)`, versiones de solo inserción; presentado/verificado exige versión; un documento financiero no se comparte |
| Los gastos pertenecen a escenarios u operaciones concretas | `scenario_cost_lines.scenario_id`, `quotation_items.version_id` |
| Pagos N:M con facturas | `payment_allocations` + trigger diferido: misma operación y total imputado ≤ bruto |
| Verificado exige respaldo | `check` en `verification_records`, `fx_rates` (URL) y `lots` (referencia del análisis) |
| Eventos con trazabilidad temporal | `timestamptz` + triggers `forbid_mutation` en auditoría, trazabilidad, historial y blockchain |
| Nada inventado en blockchain | `status = 'confirmed'`, formatos de hash, contrato y dirección validados |

## Seguridad por fila (RLS)

RLS está habilitada en **todas** las tablas. Las funciones `SECURITY DEFINER` (`is_member`, `has_role`, `is_participant`, `is_operation_seller`, `can_view_request`, `can_view_document`, `can_view_quotation`, `can_view_quotation_version`, `is_quotation_seller`, `is_counterparty_user`, `lot_stock_visible`) evitan la recursión entre políticas.

- **Lotes, productos, plantas**: la empresa dueña; terceros solo lo publicado y activo. La vista `lot_stock` muestra a terceros solo el disponible.
- **Solicitudes**: el comprador; terceros si está publicada y es pública o están invitados.
- **Costos** (catálogo, escenarios, partidas, costeo e ítems de cotización): solo roles comerciales del vendedor.
- **Cotizaciones**: vendedor; comprador solo versiones no borrador y sin costeo. El comprador responde con `respond_quotation_version(version_id, accept, reason)`, que aplica las mismas reglas que la app.
- **Operaciones, embarques, lotes de la operación**: ambas partes leen; gestiona el COMEX del vendedor.
- **Documentos**: los propios, o los compartidos no financieros de la contraparte; los financieros solo COMEX/administración del dueño.
- **Finanzas**: facturas, cobros, imputaciones y conciliaciones solo COMEX/administración del vendedor.
- **Trazabilidad**: eventos propios y los compartidos de operaciones en las que se participa. **Auditoría**: COMEX/administración de la propia empresa.
- **anon**: sin permisos sobre tablas.

Cobertura verificada por `supabase/tests/rls.test.sql` (93 aserciones; ver README).

## Pendiente

- Adaptador de datos de la app a Supabase (Auth, consultas, Storage privado para archivos) en reemplazo del almacenamiento del navegador.
- Costos reales por operación (post-embarque) y rutas logísticas con tarifas por tramo.
- Creación de la operación desde la versión aceptada como función de base (hoy la realiza la app).
