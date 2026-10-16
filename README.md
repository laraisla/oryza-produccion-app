# AgroMatch COMEX

Plataforma B2B de comercialización y exportación agroindustrial (MVP: arroz del NEA — Chaco y Corrientes). Une en un único flujo comercial:

**Solicitud del comprador → Matching explicable → Calculadora de costos e Incoterms → Cotización versionada → Operación → Documentación y embarque → Cobro y conciliación → Trazabilidad**, con evidencia de la versión aceptada del acuerdo en Stellar (contrato Soroban).

> **Todos los datos de la demo son ficticios** (empresas, lotes, precios, tarifas, documentos y cobros) y se muestran marcados como tales. Ninguna tarifa, alícuota ni requisito oficial está inventado: lo que no está verificado figura como *Estimado* o *Pendiente de verificación* con su fuente.

## Estado al 16/10/2026

| Componente | Estado |
|---|---|
| App web (modo demo, sin credenciales) | Recorrido completo funcionando y persistente en el navegador. 123 pruebas automáticas + E2E en navegador. |
| Motores de dominio (cantidades, matching, costos/Incoterms, conciliación) | Implementados con aritmética decimal y probados. |
| Contrato Soroban `agromatch_deals` | Implementado, 15 pruebas Rust. **Desplegado y ejercitado con transacciones reales en una red Stellar local** (`stellar/quickstart --local`). |
| Stellar **Testnet** | **No desplegado todavía**: la política de red del entorno de desarrollo bloquea `soroban-testnet.stellar.org` y `friendbot.stellar.org` (HTTP 403 del proxy). Los scripts están listos; ver [Stellar](#stellar--soroban). La app no muestra ninguna transacción de Testnet porque no existe. |
| Supabase (PostgreSQL + RLS) | Migración, seed y 93 aserciones de RLS/integridad probadas sobre la imagen oficial `supabase/postgres`. La app todavía persiste en el navegador: el adaptador de datos a Supabase está pendiente (ver [docs/estado.md](docs/estado.md)). |

Detalle de lo implementado y lo pendiente, criterio por criterio: **[docs/estado.md](docs/estado.md)**.

## Requisitos

- Node.js 22 y npm.
- Opcional, para el contrato: Rust (probado con 1.97) y el target `wasm32v1-none` (`rustup target add wasm32v1-none`).
- Opcional, para las pruebas de base de datos y la red Stellar local: Docker (o binarios de PostgreSQL 15/16 para el modo sin Docker).
- Opcional, para firmar desde la UI: extensión [Freighter](https://www.freighter.app/) configurada en la misma red que el contrato.

## Instalación y ejecución

```bash
npm ci
npm run dev          # http://localhost:5173
# o una build de producción
npm run build && npm run preview   # http://localhost:4173
```

No hace falta ninguna credencial: la app arranca en **modo demo** con datos ficticios precargados, que se guardan en el navegador (localStorage para los datos, IndexedDB para los archivos). *Configuración → Restablecer datos demo* vuelve al escenario inicial.

## Usuarios demo

El selector **Cambiar usuario demo** (barra superior) simula el inicio de sesión. Cada rol ve solo lo que le corresponde (mismas reglas en la app y en las políticas RLS de la base).

| Usuario | Empresa | Rol | Puede |
|---|---|---|---|
| Martín Acosta | Molino Demo Litoral S.A. | COMEX / exportador | Cotizar, gestionar operaciones, documentos, finanzas, verificaciones y catálogo de costos |
| Lucía Benítez | Molino Demo Litoral S.A. | Productor / molino | Productos, lotes, stock y escenarios de costos (no ve finanzas) |
| Admin Molino Litoral | Molino Demo Litoral S.A. | Administrador | Todo, incluida la configuración |
| Rocío Fernández | Arrocera Demo Chaco S.R.L. | Productor | Sus lotes (otra empresa: no ve costos ni operaciones del Litoral) |
| Diego Paredes | Importadora Demo Andes S.A.C. (Perú) | Comprador | Solicitudes, responder cotizaciones, ver sus operaciones (nunca costos ni márgenes del vendedor) |
| Noa Levi | Demo Levant Trading Ltd. (Israel) | Comprador | Sus solicitudes (no ve operaciones de terceros) |

## Recorrido de la demo (escenarios A–G)

| Escenario | Dónde | Qué verificar |
|---|---|---|
| **A — incompatibilidad por tipo** | *Matching* → RFQ-2026-002 (Noa: jazmín, Kosher) | Ningún lote largo fino aparece como compatible: el tipo comercial es excluyente y no se compensa con volumen o envase. Cada criterio muestra valor pedido, valor ofrecido y motivo. |
| **B — lote compatible** | *Matching* → RFQ-2026-003 (Diego: 40 t largo fino, quebrado ≤ 5 %, bolsa 25 kg) | LOT-2026-014 (60 t, 3 %) es **Compatible**; LOT-2026-015 (7 %) es incompatible por calidad; los lotes declarados sin análisis quedan *con condiciones*. |
| **Consolidación** | *Matching* → RFQ-2026-004 (80 t, admite consolidar) | Sugerencia “con condiciones” combinando lotes de dos proveedores, sin reservar stock. |
| **C — cotización que recalcula** | En B, *Cotizar con este lote* → Calculadora | Cambiar Incoterm (FOB/CFR/CIF/DAP), margen, flete o tipo de cambio recalcula precio, costos por etapa, pagador de cada partida y gráfico. Volver a los valores iniciales reproduce exactamente el mismo precio. |
| **D — aceptación → operación** | *Generar cotización* → *Enviar al comprador* → cambiar a Diego → *Aceptar versión* | Se crea la operación con producto, lote, cantidad, precio, Incoterm y checklist documental. El comprador nunca ve el desglose de costos. La versión aceptada queda inmutable. |
| **E — documentación y embarque** | *Operaciones* → expediente → pestañas *Documentos* y *Embarque* | Cargar un archivo crea una versión con SHA-256; registrar booking, contenedores, B/L y fecha de embarque mueve el stock (comprometido → embarcado). |
| **F — conciliación** | *Conciliación financiera* → OP-2026-0001 | Factura USD 30.000; cobro bruto 30.000; comisión exterior 150; neto 29.850. La diferencia se explica como comisión del banco del exterior y queda *pendiente de respaldo* hasta adjuntar evidencia. El cobro es un **registro informativo**: no hay operaciones bancarias. |
| **G — Stellar** | Expediente → pestaña *Stellar* | Muestra transacciones solo si fueron confirmadas por la red (ver abajo). Hoy no hay despliegue en Testnet, por lo que la pestaña indica que no hay evidencia; con la red local se puede ejercitar el flujo real. |

El **asistente de nueva operación** (botón *Nueva operación* de la barra superior para roles vendedores, 6 pasos: producto y cantidad; comprador, origen y destino; condiciones comerciales; logística y costos; documentación; revisión y cotización) guarda borradores y usa el mismo motor de cálculo que la calculadora.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `preview` | Desarrollo, build de producción (incluye `tsc -b`) y vista previa |
| `npm run typecheck` | Verificación de tipos de app, pruebas y scripts |
| `npm test` | Pruebas unitarias y de integración (Vitest) |
| `npm run test:contract` | Pruebas del contrato Soroban (Rust) |
| `npm run build:contract` | Compila el contrato a WASM (`wasm32v1-none`) |
| `npm run test:db` | Levanta un PostgreSQL efímero, aplica migraciones + seed y corre las pruebas de RLS e integridad |
| `npm run db:seed` | Regenera `supabase/seed.sql` desde los datos demo de la app |
| `npm run e2e` | Recorrido B→C→D→E + persistencia en Chromium contra `npm run preview` |
| `npm run screenshots` | Capturas de las pantallas principales (`docs/screenshots/`), falla ante errores de consola |
| `npm run stellar:deploy` / `stellar:demo` / `stellar:verify` | Despliegue del contrato, registro del acuerdo demo y verificación contra la red (`-- --network testnet` o `local`) |

## Pruebas

Última ejecución (16/10/2026): `npm test` 123/123 · `npm run test:contract` 15/15 · `npm run test:db` 93 aserciones · `npm run e2e` OK · `npm run screenshots` sin errores de consola · `npm run build` OK.

- **Dominio**: cantidades y envases (redondeo con decisión explícita), conversión de unidades, contenedores por peso/volumen/pallets, matching y condiciones excluyentes (MATCH-01…06 del PRD), costos (QUOTE-01…05), comisiones, financiación, tipo de cambio, márgenes vs. recargo, reparto por Incoterm, conciliación, vencimientos de verificaciones.
- **Integración**: alta y consulta de productos y lotes con stock y reservas; flujo Solicitud → Matching → Cotización → Operación → Documentación → Conciliación con los servicios reales; versiones aceptadas inmutables; control de acceso; persistencia; seed determinístico; alineación entre los enumerados del SQL y los catálogos del dominio.
- **UI**: validación progresiva del formulario de solicitudes (Testing Library).
- **Base de datos**: RLS por empresa y rol (el comprador no ve costeos, cobros ni documentos financieros; otra empresa no ve operaciones ajenas; el rol anónimo no lee nada), triggers de inmutabilidad, stock y tablas de solo inserción.
- **Contrato**: autorización por firmante, claves duplicadas, aceptación por cuenta equivocada, versiones, pruebas documentales, eventos.

## Stellar / Soroban

Detalle completo en [docs/stellar.md](docs/stellar.md).

- Contrato `contracts/agromatch_deals` (Rust, `soroban-sdk` 23.5.3): `create_deal`, `amend_terms`, `accept_deal`, `cancel_deal`, `record_proof`, `get_deal`, `get_proof`. Guarda **solo** hashes SHA-256 y direcciones públicas: nunca precios, nombres, CUIT ni documentos.
- La app calcula `terms_hash` = SHA-256 del JSON canónico de los términos aceptados y `deal_key` = SHA-256 de `agromatch:deal:v1:<id de operación>`; el vendedor firma `create_deal` y el comprador `accept_deal`, cada uno con **su propia billetera Freighter** (la app nunca recibe claves privadas).
- Una transacción solo se registra si el RPC devuelve `SUCCESS`; la UI enlaza al explorador y permite re-verificar el estado on-chain contra el hash recalculado.

**Probado en red local** (`docker run -d --network host --name stellar-local stellar/quickstart --local --enable core,horizon,rpc`, RPC en `http://localhost:8000/rpc`): despliegue, `create_deal` firmado por el vendedor, `accept_deal` firmado por el comprador y `stellar:verify` → estado `ACCEPTED` y hash coincidente. Esa evidencia no se versiona porque no es verificable públicamente (`deployments/local*.json` está en `.gitignore`).

**Testnet — bloqueo y pasos.** Desde este entorno de desarrollo el proxy rechaza (403) `soroban-testnet.stellar.org`, `friendbot.stellar.org`, `horizon-testnet.stellar.org` y `stellar.expert`. Para habilitarlo, agregar esos dominios en *Allowed domains* del entorno (ver [acceso de red de entornos cloud](https://code.claude.com/docs/en/cloud-environments#network-access)), o ejecutar desde una máquina con acceso:

```bash
npm run build:contract
npm run stellar:deploy -- --network testnet   # crea y fondea cuentas de prueba con Friendbot; guarda deployments/testnet.json
npm run stellar:demo   -- --network testnet   # create_deal (vendedor) + accept_deal (comprador); guarda deployments/testnet-evidence.json
npm run stellar:verify -- --network testnet   # vuelve a consultar cada transacción y el estado on-chain
```

Las claves de las cuentas de prueba se generan localmente en `.stellar/<red>/*.secret` (permisos 0600, ignorado por git) o se leen de `AGROMATCH_<NOMBRE>_SECRET`. Los archivos `deployments/testnet*.json` contienen solo datos públicos (ID de contrato, hashes y direcciones) y deben versionarse: la app los lee al compilar y muestra los enlaces a [stellar.expert](https://stellar.expert/explorer/testnet).

## Supabase

Detalle en [docs/modelo-de-datos.md](docs/modelo-de-datos.md).

- `supabase/migrations/20261016000000_agromatch_schema.sql`: 40 tablas (UUID, importes `NUMERIC`), claves foráneas compuestas para impedir mezclar datos entre empresas, RLS en todas las tablas, funciones `SECURITY DEFINER` para la visibilidad, triggers de inmutabilidad (versiones aceptadas, términos de la operación, costeo congelado), stock calculado desde movimientos con control diferido y tablas de solo inserción (auditoría, trazabilidad, versiones de documentos, historial de verificación, registros blockchain).
- `supabase/seed.sql`: los mismos datos demo de la app (generado por `npm run db:seed`). Crea usuarios mínimos en `auth.users` sin contraseña: para iniciar sesión hay que crearlos en Supabase Auth con los mismos UUID.
- `npm run test:db` usa la imagen `supabase/postgres` (roles `anon`/`authenticated` y esquema `auth` reales) o, sin Docker, PostgreSQL local con `supabase/tests/auth_stub.sql`.
- Para un proyecto propio: `supabase db push` (o pegar la migración en el editor SQL) y luego `supabase/seed.sql`. Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` solo se muestran en *Configuración*; la app aún no lee ni escribe en Supabase.

## Variables de entorno

Copiar `.env.example` a `.env.local` si se necesitan. Ninguna es obligatoria para la demo. Nunca versionar claves secretas: `.env*` está ignorado salvo `.env.example`.

## Estructura

```
src/
  domain/        motores puros: decimal, unidades, cantidades, matching, costos, Incoterms, conciliación, verificación, documentos
  data/          modelo, servicios (casos de uso con control de acceso y auditoría), seed demo, persistencia, selectores
  features/      pantallas por módulo (marketplace, productos, solicitudes, matching, calculadora, cotizaciones,
                 operaciones, documentación, conciliación, trazabilidad, verificación, configuración, asistente, stellar)
  integrations/  stellar (hash de términos, cliente del contrato, Freighter, redes) y supabase (estado de configuración)
  components/    UI compartida (accesible, estilo shadcn/ui sobre Radix)
contracts/       contrato Soroban + pruebas
supabase/        migraciones, seed y pruebas SQL
scripts/         stellar (deploy/demo/verify), db (seed SQL), e2e y capturas
tests/           integración, UI y helpers
docs/            cálculos, reglas comerciales, modelo de datos, Stellar, estado y capturas
```

## Seguridad y límites

- Sin secretos en el código ni en el repositorio; la app nunca solicita ni almacena claves privadas Stellar.
- Un usuario no accede a costos, márgenes, cobros ni documentos financieros de otra empresa (control en servicios de la app y en RLS).
- Los cobros son **registros informativos**: la plataforma no ejecuta liquidaciones bancarias ni cambiarias, ni declara cumplimiento ante el BCRA. Los estados permitidos son “informado por el usuario / consultado en fuente / verificado por el banco”.
- No hay conexión con WebCOMEX, SECOEXPO, ARCA ni SENASA: las reglas documentales enlazan a la fuente oficial y quedan *pendientes de verificación* hasta que alguien las confirme con evidencia.
- No se inventan alícuotas: derechos de exportación y aranceles sin verificar valen 0 y figuran como pendientes, con advertencia.
- En blockchain solo se registran hashes y direcciones públicas.

## Uso de inteligencia artificial

Este proyecto fue desarrollado con asistencia de **Claude Code** (agente de programación de Anthropic), que implementó el código, las pruebas y la documentación a partir del PRD y del documento de contexto del equipo, ejecutando las pruebas en cada etapa. Las decisiones de negocio provienen de esos documentos; los valores comerciales de la demo son ficticios y deben validarse con fuentes reales antes de cualquier uso productivo.
