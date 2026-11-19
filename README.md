# AgroGlobal COMEX

Plataforma de comercialización agroindustrial para el arroz del NEA. Conecta
productores, molinos, compradores nacionales e importadores en un mismo flujo:

- **Marketplace B2B** de lotes con filtros por calidad, presentación y origen.
- **Matching inteligente** que compara cada solicitud de compra contra los lotes
  disponibles (compatible / condicional / incompatible) y permite combinar dos lotes.
- **Calculadora COMEX** de costos de exportación por Incoterm.
- **Cotizaciones, operaciones y embarques** con timeline de hitos, checklist
  documental, conciliación financiera y trazabilidad.
- **Inteligencia de mercados** con exportaciones históricas y requisitos por destino.

Sobre ese flujo, los acuerdos de compraventa pueden registrarse con **depósito en
garantía en un contrato inteligente Soroban sobre Stellar Testnet**, y la app
muestra la evidencia verificada en la red.

> **Prototipo para el Ideathon NEA TECH 2026.** Empresas, productos y montos son
> ficticios. **Stellar Testnet — demostración con activos sin valor monetario
> real.** Nada de esto constituye pagos, operaciones bancarias ni contratos reales.

## Qué es ficticio, qué es local y qué es real

| Capa | Dónde vive | Naturaleza |
|---|---|---|
| Datos comerciales (empresas, lotes, solicitudes, cotizaciones, operaciones, montos) | `src/data/` | **Ficticios**, cargados como datos de demostración |
| Cambios que hace el usuario (cotizaciones generadas, hitos avanzados, modo elegido) | `localStorage` del navegador (clave `agroglobal-comex-demo-v3`) | **Locales**: no salen del navegador ni se comparten; «Restablecer datos demo» los reinicia |
| Preferencias de presentación (intro en video vista, secciones ya animadas) | `sessionStorage` de la pestaña | **Locales y temporales**: no afectan datos |
| Contrato, acuerdos y transacciones Stellar | Stellar **Testnet** | **Reales en Testnet** y verificables en el explorador, con un activo de prueba sin valor |

El registro local de acuerdos (qué acuerdo corresponde a qué operación) también se
guarda en `localStorage`; el estado del acuerdo siempre se consulta en la red.

## Capturas

El repositorio todavía no incluye capturas de pantalla. La única imagen
versionada es el logo de la organización de demostración Molino Azul, que la app
muestra en el sidebar y en el selector de empresa:

<img src="src/assets/molino-azul-logo.jpg" alt="Logo de Molino Azul (organización de demostración)" width="96" />

## Stellar en AgroGlobal

| | |
|---|---|
| Red | Stellar **Testnet** (nunca Mainnet) |
| Contrato | `agroglobal-escrow` — [`CAERX6PVDUP5ZQNOL7RS2JC3GKHMAYBFGGJBZ24XN5ZQYS4GTOTCHDH2`](https://stellar.expert/explorer/testnet/contract/CAERX6PVDUP5ZQNOL7RS2JC3GKHMAYBFGGJBZ24XN5ZQYS4GTOTCHDH2) |
| WASM (SHA-256) | `51573fd8e93acbd6cf66e010113b6bd2592fc19e8240ea41207fbaf1b3b9c04e` |
| Activo de prueba | `AGROUSD` (sin valor) — SAC `CDO7QI6PFDEKTUUR6QPH5WMHCUKONVFCJLKHJFHOOBZ3ZK3ENTXCD3IL` |
| Flujo | comprador crea → vendedor acepta → comprador deposita → liberación al vendedor o reembolso del árbitro |
| En la cadena | partes, monto, referencia de orden y **hash SHA-256 de las condiciones** (nunca las condiciones en claro) |

Registro de despliegue y transacciones: [`blockchain/deployments/testnet.json`](blockchain/deployments/testnet.json).
Acuerdos verificados y hashes: [`docs/DEMO-IDEATHON.md`](docs/DEMO-IDEATHON.md#3-contrato-y-transacciones-verificadas-en-testnet).

### Dos modos de ejecución

| Modo | Cómo | Qué permite |
|---|---|---|
| **Demo local** | `bun run dev` + `.env.local` con cuentas de prueba, abierto en `localhost` | Crear acuerdos, aceptar, depositar, liberar o reembolsar (transacciones reales en Testnet, firmadas por el servidor local con cuentas de prueba) |
| **Público (solo lectura)** | Cualquier build de producción | Consultar en vivo el contrato, los eventos y las transacciones, con enlaces al explorador. **No puede firmar** |

### Protección del endpoint de firma

`POST /api/public/stellar/acuerdos` es el único punto que firma transacciones.
Responde `503` («Solo lectura») salvo que se cumplan **todas** estas condiciones
(`firmaHabilitada()` en [`src/lib/stellar/stellar.server.ts`](src/lib/stellar/stellar.server.ts)):

1. El servidor corre en modo desarrollo (`vite dev`). En un build de producción
   `import.meta.env.DEV` es `false` al compilar, así que la firma queda deshabilitada
   en cualquier despliegue, aunque se carguen variables.
2. La IP real del cliente, tomada del socket, es de loopback (`127.0.0.0/8` o `::1`).
   No se usan el encabezado `Host` ni `X-Forwarded-For`; si la IP no se puede
   determinar, la firma se rechaza.
3. `STELLAR_DEMO_SIGNING=1` y las tres claves de prueba (comprador, vendedor, árbitro)
   están configuradas **y** corresponden a las cuentas registradas en el despliegue.

Además, con `STELLAR_DEMO_SIGNING=1` el servidor de desarrollo escucha solo en
`127.0.0.1` ([`vite.config.ts`](vite.config.ts)), así que desde la red local ni
siquiera se puede conectar. Sin firma habilitada sigue escuchando en todas las
interfaces, para probar la app desde otros dispositivos en solo lectura.

Las claves se leen solo en el servidor desde `.env.local`, que está en `.gitignore`;
nunca se envían al navegador. Los tests `src/test/stellar-firma.test.ts` y
`src/test/stellar-firma-endpoint.test.ts` cubren IPs no locales, encabezados `Host` y
`X-Forwarded-For` falsificados, IP desconocida, entorno de producción y la demo local
legítima, con la red simulada.

## Anclaje documental independiente — Etapa 1

El servicio en `src/lib/stellar/anchor/` registra el SHA-256 de documentos y
versiones de acuerdos mediante transacciones clásicas Testnet (MEMO_HASH y una
ManageData `agroglobal:anchor:v1`), separado del escrow anterior. Incluye diario
durable para un único proceso local, idempotencia y verificación independiente.
La firma puede hacerla Stellar CLI con una identidad del almacén seguro del sistema
operativo (`STELLAR_ANCHOR_SIGNER=stellar-cli`), sin que la clave entre al proceso.
Su entrada de escritura es la CLI del operador `scripts/stellar-anchor-demo.ts`. El
envío permanece deshabilitado por defecto y no hay endpoint web capaz de firmar.

**Estado actual (19/11/2026):** primera evidencia real **confirmada** en Stellar
Testnet: transacción
[`0f1894b7…72f9147f`](https://stellar.expert/explorer/testnet/tx/0f1894b76f63fe2f0b7b0f42bb8eb8a323ace463cb85068eeb3e53eb72f9147f),
ledger 5807357, cuenta técnica `GA2JCDRU5Q3TPN4VZOQ5WBFNVGXSHTL5ZXKFVNLDANOUCLK34DTD6YNX`,
documento ficticio. Consulta y verificación de solo lectura en
`/evidencia-stellar/documental`, disponible únicamente con el servidor de desarrollo
local (configuración `dev-anclaje`). `/evidencia-stellar` conserva la demo histórica
del escrow. Ver [operación](docs/STELLAR-ANCLAJE-OPERACION.md) y
[primera transacción](docs/PRIMERA-TRANSACCION-TESTNET.md).
No usar el almacenamiento en disco de la demo en despliegues serverless.

## Ejecutar localmente

Requisitos: [Bun](https://bun.sh) ≥ 1.4 (gestor del proyecto; no usar npm ni versionar
`package-lock.json`). En Windows, ver [`docs/BUN-WINDOWS.md`](docs/BUN-WINDOWS.md).

Instalar dependencias:

```sh
bun install --frozen-lockfile
```

Configurar las variables de entorno: copiar `.env.example` a `.env` (ignorado por
Git) y completar los valores de Supabase. La plantilla documenta las variables
necesarias; el archivo `.env` **no se versiona** porque puede contener secretos.

Iniciar el servidor de desarrollo en `http://localhost:8080` (modo solo lectura si no
hay `.env.local`):

```sh
bun run dev
```

Para la demo con firma: copiar `.env.local.example` a `.env.local` y completarlo
(ver [`docs/DEMO-IDEATHON.md`](docs/DEMO-IDEATHON.md)). Abrir siempre con `localhost`.

## Pruebas

Pruebas de la app y el servicio (167 pruebas en 20 archivos; red simulada, claves efímeras):

```sh
bun run test
```

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `src/test/store-stellar.test.ts` | 8 | Reserva de stock y registro local de acuerdos |
| `src/test/stellar-terms.test.ts` | 7 | Hash de condiciones, reglas local/exportación, montos del activo |
| `src/test/horizon.test.ts` | 5 | Consulta a Horizon, errores controlados y respuestas incompletas |
| `src/test/recorrido.test.ts` | 4 | Recorrido solicitud → matching → cotización → operación |
| `src/test/stellar-firma.test.ts` | 5 | Restricciones de la firma con cuentas de prueba |
| `src/test/stellar-firma-endpoint.test.ts` | 7 | Endpoint de firma: Host y X-Forwarded-For falsificados, IP desconocida, producción y demo legítima |
| `src/test/app-routing.test.tsx` | 1 | Ruteo de la página principal |
| `src/test/comex.test.ts` | 23 | Costos, responsables, escenarios y entradas incompletas |
| `src/test/reservas.test.ts` | 18 | Aceptación y reservas locales indivisibles |
| `src/test/cotizacion-contexto.test.ts` | 8 | Contexto comercial, moneda y snapshots |
| `src/test/calculadora-ui.test.tsx` | 2 | Generación desde la pantalla y precio faltante |
| `src/test/cotizaciones-ui.test.tsx` | 3 | Aceptación desde la interfaz y errores de stock |
| `src/test/anchor-digest.test.ts` | 16 | SHA-256 y serialización estricta |
| `src/test/anchor-transaction.test.ts` | 8 | Firma, Testnet, operaciones permitidas y verificación |
| `src/test/anchor-service.test.ts` | 17 | Diario durable, idempotencia, reinicios, errores y documentos de 4 MiB |
| `src/test/anchor-transport.test.ts` | 5 | Horizon simulado, timeouts y envío deshabilitado |
| `src/test/anchor-cli.test.ts` | 2 | CLI real con Bun y procesos separados, red simulada y cero envíos; modo `stellar-cli` falla cerrado |
| `src/test/anchor-cli-signer.test.ts` | 13 | Firma externa con Stellar CLI: sobres alterados, errores, entorno saneado, sin secretos |
| `src/test/anchor-consulta.test.ts` | 8 | Consulta web: acceso local, solo lectura, privacidad, original y copia alterada |
| `src/test/anchor-consulta-endpoint.test.ts` | 7 | API de consulta: loopback, Host, mismo origen, tamaño y errores saneados |

Verificación de tipos:

```sh
bunx tsc --noEmit
```

Contrato Soroban (14 pruebas; requiere Rust con el target `wasm32v1-none`, ver
[`blockchain/README.md`](blockchain/README.md)):

```sh
rustup target add wasm32v1-none
```

```sh
cd blockchain
cargo test
```

## Despliegue

| Destino | Estado |
|---|---|
| **Lovable** | Proyecto conectado ([editor](https://lovable.dev/projects/e06aa44b-b8f4-4867-a34e-e7ca9a4fcc85), URL publicada: https://instant-capture-grid.lovable.app). La sincronización es con `main`. La integración de las ramas de trabajo con `main` y la actualización de la publicación están pendientes de autorización (ver [`docs/PUBLICACION.md`](docs/PUBLICACION.md)) |
| **Cloudflare** | Es el destino por defecto del build (`bun run build`, preset `cloudflare-module`). Validado localmente con `wrangler dev` (ver [`docs/PUBLICACION.md`](docs/PUBLICACION.md)). Este repositorio no documenta un despliegue directo en Cloudflare |
| **Vercel** | Build compatible sin cambios de configuración: con la variable `VERCEL` presente, Nitro genera `.vercel/output` (Build Output API v3). El proyecto **no está conectado** a Vercel todavía |

Para Vercel: importar el repositorio con Framework «Other», comando de build
`bun run build` y directorio de salida vacío. **No cargar las variables
`STELLAR_DEMO_*`** en ningún despliegue: no se usan en un build y deben quedar solo
en `.env.local`. El `.env` local (ignorado por Git) contiene únicamente la URL y
la clave publicable de Supabase, pensadas para el navegador; la plantilla
versionada es [`.env.example`](.env.example).

## Estructura

| Ruta | Contenido |
|---|---|
| `src/routes/` | Pantallas (TanStack Start). `evidencia-stellar.tsx`: evidencia en cadena |
| `src/routes/api/public/stellar/acuerdos.ts` | API: lectura de la red (GET) y firma solo en demo local (POST) |
| `src/lib/stellar/` | Configuración pública, hash de condiciones, acceso a Testnet (`*.server.ts`) |
| `src/components/stellar/` | Vista de evidencia y compra con garantía |
| `src/data/` | Datos comerciales ficticios de demostración |
| `blockchain/` | Contrato Soroban, pruebas, scripts de despliegue y registro de Testnet ([README](blockchain/README.md)) |
| `db/propuesta/` | Esquema Supabase propuesto con RLS (**no aplicado**) ([README](db/propuesta/README.md)) |
| `docs/` | [Guía de demo](docs/DEMO-IDEATHON.md), [publicación](docs/PUBLICACION.md), [instalar Bun en Windows](docs/BUN-WINDOWS.md) y [registro de cambios](docs/CAMBIOS.md) |

## Estado y limitaciones

- Catálogo, órdenes e inventario se guardan en el navegador (`localStorage`); el esquema persistente en Supabase está preparado pero no aplicado.
- La firma de la demo la hace el servidor local con cuentas de prueba; falta firma con billetera del usuario (Freighter).
- Sin login de empresas; el asistente de WhatsApp no está conectado al inventario único.
- El RPC de Testnet conserva eventos ~7 días; las transacciones siguen verificables en Horizon y en el explorador. Testnet se reinicia periódicamente: ver `blockchain/README.md` para redesplegar.

## Lovable

Los cambios que llegan a `main` en GitHub se sincronizan con el editor de Lovable.
No reescribir historial publicado (force push, rebase o amend de commits ya subidos).
Ver [`docs/PUBLICACION.md`](docs/PUBLICACION.md).
