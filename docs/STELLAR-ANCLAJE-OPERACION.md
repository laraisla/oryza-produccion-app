# AgroGlobal — Etapa 1: servicio de anclaje Stellar

## Estado actual (19/11/2026)

- **Confirmado en Stellar Testnet:** primera evidencia documental real, transacción
  `0f1894b76f63fe2f0b7b0f42bb8eb8a323ace463cb85068eeb3e53eb72f9147f`, ledger 5807357,
  cuenta `GA2JCDRU…D6YNX`, firmada con Stellar CLI y la identidad del Secure Store de
  Windows. Detalle en `PRIMERA-TRANSACCION-TESTNET.md`.
- **Consulta web de solo lectura:** `/evidencia-stellar/documental` (pestaña "Registro
  documental"). Lee el diario sin bloqueo de escritor y vuelve a verificar contra Horizon
  en cada consulta. Permite comparar un documento cargado en el navegador. No tiene
  acciones de firma, preparación ni envío. Ver "Consulta web local" más abajo.
- **Histórico, separado:** `/evidencia-stellar` (pestaña "Escrow Soroban") conserva la demo
  anterior del contrato de garantía con cuentas de prueba. No comparte cuenta, servicio
  ni diario con el anclaje documental.

Las secciones siguientes describen la Etapa 1 tal como se entregó. Las frases "no se
generaron identidades" o "no se enviaron transacciones" corresponden a ese momento.

### Consulta web local

| Archivo | Función |
| --- | --- |
| `src/lib/stellar/anchor/consulta.server.ts` | Configuración opt-in, control de acceso local, metadatos públicos, detalle confirmado en red y verificación de documento con `AnchorService` (sin firmante, envío deshabilitado, autorización solo `read`/`verify`). |
| `src/lib/stellar/anchor/repository.server.ts` | `ReadOnlyAnchorRepository`: misma validación del diario (esquema, checksum, enlaces y tamaño) sin crear directorios, sin bloqueo y sin escrituras; rechaza `createOrGet`/`save`. |
| `src/routes/api/public/stellar/anclaje.ts` | GET lista/detalle; POST `application/octet-stream` de hasta 4 MiB para comparar un documento. Responde `no-store`. |
| `src/routes/evidencia-stellar_.documental.tsx` | Pantalla: estado, red, SHA-256, hash, ledger, fecha, cuenta, 9 verificaciones, enlace a Stellar Expert y comparación de documento. |
| `src/components/stellar/pestanas-evidencia.tsx` | Pestañas entre la evidencia documental actual y la demo histórica de escrow. |
| `src/test/anchor-consulta*.test.ts` | Acceso, configuración, solo lectura, privacidad de la salida, original/alterado y frontera HTTP. |

Acceso: solo con `vite dev` (`import.meta.env.DEV`), IP del socket loopback (nunca
`X-Forwarded-For`), `Host` igual a localhost/127.0.0.1/[::1] (bloquea DNS rebinding) y, para
POST, `Origin` y `Sec-Fetch-Site` del mismo origen. Requiere `STELLAR_ANCHOR_DEMO=1`,
`STELLAR_ANCHOR_PUBLIC_KEY`, `STELLAR_ANCHOR_EPOCH` y, opcionalmente,
`STELLAR_ANCHOR_DIRECTORY`. En un build desplegado (Vercel/Cloudflare) responde 403 y
nunca incluye el diario: el build no copia `anchor-demo.local/` y la salida se revisó sin
digest, hash ni datos del diario. Sin configuración, la pantalla informa que la consulta no
está disponible; no muestra datos de ejemplo.

Salida: id, estado, tipo, entidad, versión, época, cuenta, SHA-256, hash, ledger, fecha y
número de envíos. Nunca devuelve el snapshot, el XDR, las claves idempotentes ni el diario.
La CLI sigue siendo el único escritor; la consulta puede convivir con ella. Si Windows
bloquea la lectura durante un reemplazo atómico, responde `LOCKED` y basta reintentar.

## Estado y alcance (histórico, entrega de la Etapa 1)

Implementado en `laraisla/oryza-produccion-app`, sobre la rama existente
`claude/youthful-lamport-niwhex`, sin commits ni push. El trabajo de Etapa 0
continúa en el mismo árbol sin sobrescribirlo.

El servicio prepara, firma, registra, envía y verifica transacciones clásicas
mediante un adaptador real de Horizon Testnet. Se verificó localmente con mocks
y claves efímeras, **no mediante una transacción en la red**. Durante esta entrega
no se generaron identidades reales, financiaron cuentas ni enviaron transacciones.
No se usaron secretos heredados. No se modificaron Supabase remoto, migraciones,
Lovable, autenticación comercial, endpoints existentes ni el contrato Soroban.

La entrada disponible es una CLI de operador local dentro del repositorio.
Todavía no hay botón de anclaje en la web ni endpoint nuevo de firma. No se
presenta el selector local de empresas como autorización de usuarios reales.

## Archivos de la etapa

| Archivo | Implementación |
| --- | --- |
| `src/lib/stellar/anchor/types.ts` | Contratos de contenido, evidencia, repositorio, transporte, estados, errores y constantes Testnet. Sin secretos. |
| `src/lib/stellar/anchor/digest.ts` | SHA-256 de bytes y serialización JSON estricta/determinista, independiente de red y SDK. |
| `src/lib/stellar/anchor/repository.server.ts` | Diario local privado con checksum, validación de snapshots/sobres, exclusión de escritor, fsync/rename, CAS y contenido inmutable. |
| `src/lib/stellar/anchor/signer.server.ts` | Cuenta permitida, denegación de cuentas demo previas, constructor limitado y firma con secreto de entorno (pruebas/compatibilidad). |
| `src/lib/stellar/anchor/cli-signer.server.ts` | Firma externa con Stellar CLI e identidad del almacén seguro del SO: stdin/stdout, sin shell, entorno sin variables `STELLAR_*`, stderr descartado, límite de tiempo/tamaño y verificación completa del sobre devuelto. |
| `src/test/anchor-cli-signer.test.ts` | Firma externa simulada, sobres alterados, errores de CLI, identidad/ruta inválidas, entorno saneado, integración con el servicio y procesos reales. |
| `src/lib/stellar/anchor/transport.server.ts` | HTTPS fijo a Horizon Testnet, comprobación de red, cuenta, envío, consulta y ledger; límites de tiempo/tamaño y errores sanitizados. |
| `src/lib/stellar/anchor/verify.server.ts` | Inspección independiente de XDR/hash/firma/memo/operación/emisor y comparación con el contenido original. |
| `src/lib/stellar/anchor/service.server.ts` | Orquestación autorizada, snapshot, idempotencia, preparación durable, envío, reconciliación y verificación. |
| `scripts/stellar-anchor-demo.ts` | Operador local: request, prepare, submit, reconcile, verify, status y list. Sin generación/fondeo de cuentas. |
| `scripts/check-anchor-client-bundle.ts` | Inspección de la salida real de producción para detectar semillas privadas y código servidor de anclaje en cliente. |
| `src/test/anchor-digest.test.ts` | Hash independiente, JSON estricto, Unicode, ciclos, tipos inválidos, profundidad y tamaño. |
| `src/test/anchor-transaction.test.ts` | Construcción/firma, Mainnet, pagos/operaciones extra, memo, datos, fuente, firmas y fee-bump rechazados. |
| `src/test/anchor-service.test.ts` | Persistencia, snapshots, idempotencia, CAS, reinicios, escritor muerto, autorización, reintentos, confirmaciones, corrupción y fallos parciales. |
| `src/test/anchor-transport.test.ts` | Fetch simulado, red, cuenta, timeout, límites, error sanitizado y envío deshabilitado. |
| `src/test/anchor-fixtures.ts` | Transporte simulado y claves exclusivamente efímeras de prueba; temporales bajo work/. |
| `src/test/setup.ts` | Conserva mocks de navegador, protegiéndolos con `typeof window` para admitir suites servidor en entorno Node. |
| `docs/STELLAR-ANCLAJE-DISENO.md` | Actualización del estado del diseño aprobado; las secciones originales se conservan como antecedente. |
| `docs/STELLAR-ANCLAJE-OPERACION.md` | Este informe, configuración, demostración y pendientes. |
| `README.md` | Entrada al servicio, límites de demo y listado actualizado de pruebas. |

No se agregaron dependencias ni se alteraron package.json/bun.lock. Los módulos
servidor llevan el marcador `@tanstack/react-start/server-only`; no se importan
desde las rutas comerciales. La lógica anterior de escrow permanece separada.

## Contrato funcional

- `request`: autoriza al actor y congela contenido/identidad/versionado. No firma
  ni necesita acceder a la red.
- `prepare`: consulta red/cuenta, construye y firma, y guarda el sobre y su hash.
  No transmite la transacción.
- `submit`: exige opt-in; reconcilia primero, registra el intento de envío antes
  de transmitir y vuelve a consultar confirmación.
- `reconcile`: consulta un intento conocido; nunca firma ni envía. Sirve después
  de reiniciar, incluso sin el secreto cargado.
- `verify`: vuelve a consultar la transacción y recalcula el digest de la versión
  guardada o de un archivo/condiciones aportados para comparación. No confía en
  que el diario diga `confirmed`.
- `get`: lectura autorizada. La CLI muestra un resumen, sin contenido privado ni
  secreto. El diario sí contiene los snapshots privados y requiere acceso local
  restringido.

### Contenido versionado

Identidad: Testnet + época explícita + cuenta técnica + tipo + entidad + versión.
La misma identidad no admite otro digest. La misma clave idempotente con otra
identidad/contenido produce conflicto; una clave nueva para el mismo contenido
se registra como alias y conserva la evidencia.

Documentos: bytes exactos; no extraer texto ni normalizar PDF. Acuerdos:
condiciones JSON planas, claves ordenadas recursivamente, UTF-8 y orden de arrays
conservado. Los decimales comerciales se expresan como cadenas. Se rechazan
NaN/Infinity, decimales JS, enteros inseguros, -0, undefined, Date, funciones,
getters, propiedades ocultas, arrays dispersos, Unicode inválido y ciclos.
Máximo 4 MiB, 64 niveles y 100.000 nodos.

El servicio genérico valida el contenido serializable y la identidad/versionado;
**no valida que esas condiciones sean un acuerdo bilateral comercial real**.
Ese contrato y su extracción autorizada desde acuerdos persistentes pertenecen
al adaptador comercial futuro. No se cambia el algoritmo histórico del escrow.

### Política de transacción

La única operación aceptada es ManageData, clave `agroglobal:anchor:v1`, valor
binario de 32 bytes, igual al memo hash. Sin precios, empresas, documentos ni
referencias de negocio en cadena. La cuenta fuente y la fuente de operación
deben ser la cuenta técnica configurada. Se verifica su firma Ed25519.

Se rechazan Mainnet, fee-bump, pagos, transferencias, operaciones extra,
eliminación de datos, fuentes/memos/digests distintos y precondiciones ajenas al
constructor. Comisión inicial: 100 stroops; límite de política: 10.000. Ventana
del constructor: desde 5 segundos antes de preparar hasta 120 segundos después;
la política rechaza ventanas mayores a 180 segundos o sin vencimiento.

La passphrase no está embebida en XDR: se configura Testnet, se comprueba la
passphrase informada por el proveedor y se verifica la firma/hash usando esa
red. No se afirma que un XDR arbitrario revele por sí solo su red de origen.

Proveedor fijo: `https://horizon-testnet.stellar.org`. No se admiten URLs de
usuario ni redirecciones. Timeout por solicitud de 8 segundos, configurable en
el adaptador entre 1 ms y 30 s; máximo 2 MiB por respuesta. No hay fondeo ni
consulta a servicios del contrato Soroban.

## Persistencia, estados y recuperación

Adaptador para un único proceso local, reemplazable por la interfaz
`AnchorRepository`. `AnchorService` también serializa sus acciones de escritura.
No crear varias instancias del servicio sobre un mismo repositorio abierto.

Directorio predeterminado: `anchor-demo.local/`, ya ignorado por la regla
existente `*.local`. Guarda `evidence.json`, un bloqueo `writer.lock` y temporales
de escritura. POSIX solicita modos 0700/0600; en Windows proteger además el
directorio mediante ACL del usuario. No es almacenamiento cifrado. Usar material
ficticio en esta demostración.

Cada actualización escribe y sincroniza un temporal, reemplaza el diario de
forma atómica y sincroniza el directorio donde el sistema lo permite. Windows
puede no admitir fsync de directorio: la recuperación comprobada es frente a
reinicios/caídas de proceso, no una certificación contra pérdida física de disco.
Un checksum detecta corrupción accidental; no sustituye un mecanismo contra un
administrador local malicioso. Límite del diario: 32 MiB.

Un segundo escritor queda bloqueado. Tras un cierre abrupto, `--recover-lock`
solo recupera el bloqueo si el PID ya no existe. Si el PID está activo, fue
reutilizado o su estado es incierto, falla cerrado. La recuperación es una acción
explícita de un operador; no arrancar varias recuperaciones simultáneas ni borrar
bloqueos manualmente sin investigar el dueño.

Estados: `pending`, `prepared`, `submitted`, `unknown`, `confirmed`, `rejected`,
`expired`. Se guarda sobre firmado, hash, secuencia, límites, número de envíos,
próximo reintento, código de error y confirmación. No se guarda el secreto.

Un timeout tras enviar queda `unknown` salvo que la consulta posterior confirme
el resultado. Los reintentos se realizan invocando `submit` nuevamente: el mismo
sobre/hash, consultas previas y espera mínima creciente de 1/2/4/8/16 segundos,
máximo cinco envíos. No hay un bucle de envío oculto ni una tarea de fondo.
Una transacción todavía no indexada queda pendiente; no se anuncia confirmación.

La preparación de otra evidencia para esa cuenta se bloquea mientras exista un
intento sin resolver. Si vence el sobre, se consulta el ledger y se marca
`expired`, sin reemplazarlo automáticamente. **Expired no demuestra que jamás fue
incluido**: sigue bloqueando nuevos sobres hasta reconciliación o investigación
operativa. Esto privilegia evitar duplicaciones ante retención/indexación o
reinicios de Testnet. No se implementó una herramienta administrativa para
abandonar/reemplazar intentos inciertos. No borrar el diario ni cambiar la época
para eludir ese control.

## Preparación de una cuenta nueva — instrucciones futuras

Esta sección describe trabajo que requiere autorización posterior; **no se
ejecutó durante esta entrega**.

1. Elegir una identidad nueva exclusivamente de Testnet. No reutilizar nombres,
   claves o cuentas buyer/seller/arbiter/admin anteriores. Las cuatro cuentas
   públicas heredadas están denegadas por el nuevo firmante.
2. Con Stellar CLI instalado y su configuración fuera del repositorio, generar
   una identidad en el almacén seguro del sistema, sin fondear automáticamente:

   ```powershell
   stellar keys generate agroglobal-anchor-testnet --network testnet --secure-store
   stellar keys public-key agroglobal-anchor-testnet
   ```

3. Verificar red/dirección y guardar la recuperación de la identidad de forma
   segura. No pegar secretos en chat ni escribirlos como argumentos de comandos.
4. Con autorización específica para activar la cuenta de prueba, fondearla:

   ```powershell
   stellar keys fund agroglobal-anchor-testnet --network testnet
   ```

5. Verificar saldo técnico para comisión y reserva inicial de la entrada
   ManageData. No crear activos, trustlines ni ejecutar scripts del escrow.

Estos comandos se basan en el [manual oficial de Stellar CLI](https://developers.stellar.org/docs/tools/cli/stellar-cli).
La generación no fondea por defecto. El almacén seguro depende del sistema
operativo. La CLI de AgroGlobal no extrae secretos del Stellar CLI: el operador
debe suministrar el secreto correspondiente de forma segura al proceso servidor.

## Configuración del operador local

La aplicación no crea un `.env` con secretos para este servicio. La CLI lee el
entorno del proceso, pero **Bun sí carga `.env` automáticamente** si se lo permite.
Para esta demo usar `bun --no-env-file scripts/stellar-anchor-demo.ts ...` en todos
los comandos, evitando archivos de entorno heredados. No se cambiaron variables
reales durante esta etapa. El procedimiento revisado y los archivos del primer
documento están en `PRIMERA-TRANSACCION-TESTNET.md`.

| Variable | Función |
| --- | --- |
| `STELLAR_ANCHOR_DEMO=1` | Permite ejecutar la CLI local; rechaza producción y entornos Vercel/Cloudflare Pages. |
| `STELLAR_ANCHOR_PUBLIC_KEY` | Dirección pública válida de la cuenta técnica nueva. |
| `STELLAR_ANCHOR_EPOCH` | Identificador explícito de la época de Testnet; conservarlo para las evidencias existentes. |
| `STELLAR_ANCHOR_DIRECTORY` | Directorio absoluto privado recomendado. Por defecto: `anchor-demo.local` relativo a la raíz desde la que se ejecuta. |
| `STELLAR_ANCHOR_SECRET` | Solo modo `env`: requerido por `prepare`, dentro del proceso servidor. No VITE, no Git, no logs. Prohibido en modo `stellar-cli`. |
| `STELLAR_ANCHOR_SIGNER` | `env` (predeterminado) o `stellar-cli`. |
| `STELLAR_ANCHOR_CLI_IDENTITY` | Modo `stellar-cli`: nombre de la identidad (nunca un secreto ni una frase semilla). |
| `STELLAR_ANCHOR_CLI_PATH` | Opcional: ruta absoluta a `stellar.exe`; si se omite, se busca `stellar` en el PATH. |
| `STELLAR_ANCHOR_ENABLED=1` | Opt-in para enviar. Ausente o distinto de 1: deshabilitado. |

Además, `submit` exige `--send`. El transporte también deshabilita envíos por
defecto cuando se usa directamente. No se puede elegir Mainnet mediante una
variable de entorno. No ejecutar la CLI desde un despliegue serverless; una marca
de runtime o un disco efímero no convierten este adaptador en durable.

Ejemplo de preparación futura de entorno, reemplazando solo la dirección pública:

```powershell
$env:STELLAR_ANCHOR_DEMO = '1'
$env:STELLAR_ANCHOR_PUBLIC_KEY = '<DIRECCION_PUBLICA_NUEVA>'
$env:STELLAR_ANCHOR_EPOCH = 'testnet-demo-epoca-1'
$env:STELLAR_ANCHOR_DIRECTORY = Join-Path (Get-Location) 'anchor-demo.local'
$env:STELLAR_ANCHOR_ENABLED = '0'
```

Inyectar el secreto desde un gestor seguro. Como alternativa local, pedirlo sin
eco ni valor literal en el historial:

```powershell
$anchorSecretInput = Read-Host 'Secreto de la cuenta NUEVA de Testnet' -AsSecureString
$env:STELLAR_ANCHOR_SECRET = [Net.NetworkCredential]::new('', $anchorSecretInput).Password
```

No mostrar el entorno. Al terminar la preparación, retirar el secreto del proceso
con `Remove-Item Env:\STELLAR_ANCHOR_SECRET`; reconciliar/verificar no lo necesitan.
No se incluyen claves de ejemplo que puedan confundirse con credenciales reales.

## Demostración desde el repositorio de AgroGlobal

### Ahora: prueba completamente local, sin cuenta ni red

```powershell
bun run test src/test/anchor-digest.test.ts src/test/anchor-transaction.test.ts src/test/anchor-service.test.ts src/test/anchor-transport.test.ts
```

Las claves de esas pruebas son efímeras, no se fondean y no se usan para la demo
real. Los temporales quedan bajo work/ y se limpian después de cada prueba.

### Después de autorizar la prueba real

1. Preparar cuenta y configuración según las secciones anteriores.
2. Seleccionar un documento ficticio o una versión ficticia de acuerdo. El store
   actual de AgroGlobal no es un acuerdo persistente autorizado: la selección y
   creación del manifiesto son pasos del operador, no evidencia de aceptación
   bilateral empresarial.
3. Guardar los archivos locales en `anchor-demo.local/`. Ejemplo de manifiesto
   de documento `documento.json`, apuntando a un archivo relativo:

   ```json
   {
     "entityId": "documento-demo-1",
     "version": "1",
     "idempotencyKey": "documento-demo-1-v1",
     "kind": "document",
     "file": "documento-ficticio.pdf"
   }
   ```

   Ejemplo de acuerdo `acuerdo.json`:

   ```json
   {
     "entityId": "acuerdo-demo-1",
     "version": "1",
     "idempotencyKey": "acuerdo-demo-1-v1",
     "kind": "agreement",
     "conditions": {
       "schemaVersion": "agroglobal-commercial-demo-v1",
       "quantityTn": "10.000",
       "pricePerTn": "520.00",
       "currency": "USD",
       "incoterm": "FOB",
       "originPort": "Rosario",
       "destinationPort": "San Antonio",
       "destinationCountry": "Chile",
       "shipmentDate": "2027-01-15",
       "notice": "Condiciones ficticias, sin aceptación empresarial real"
     }
   }
   ```

4. Crear snapshot y obtener el `id` de evidencia de la salida JSON:

   ```powershell
   bun scripts/stellar-anchor-demo.ts request anchor-demo.local/documento.json
   bun scripts/stellar-anchor-demo.ts status <ID_EVIDENCIA>
   ```

   Repetir request devuelve el mismo id; cambiar contenido sin nueva versión
   produce conflicto. La CLI no muestra el contenido ni el secreto.

5. Con el secreto en runtime, preparar. Consulta Testnet y firma localmente, pero
   todavía no envía:

   ```powershell
   bun scripts/stellar-anchor-demo.ts prepare <ID_EVIDENCIA>
   ```

6. **Punto de autorización de envío.** Revisar el digest y hash esperado; dentro
   de los 120 segundos de vigencia, solo con autorización, habilitar y enviar:

   ```powershell
   $env:STELLAR_ANCHOR_ENABLED = '1'
   bun scripts/stellar-anchor-demo.ts submit <ID_EVIDENCIA> --send
   $env:STELLAR_ANCHOR_ENABLED = '0'
   ```

7. Si la salida no confirma, consultar sin firmar ni reenviar:

   ```powershell
   bun scripts/stellar-anchor-demo.ts reconcile <ID_EVIDENCIA>
   bun scripts/stellar-anchor-demo.ts verify <ID_EVIDENCIA>
   bun scripts/stellar-anchor-demo.ts verify <ID_EVIDENCIA> anchor-demo.local/documento-ficticio.pdf
   ```

   Para comparar un acuerdo usar un archivo JSON que contenga solo `conditions`,
   no el manifiesto completo. Una copia alterada debe dar `mismatch`. `verify`
   usa salida 0 para `matches`, 2 para `mismatch`/`unverifiable`. `submit` y
   `reconcile` devuelven 2 mientras no haya confirmación; los errores usan 1.

8. Revisar el hash también en Stellar Expert Testnet. El enlace es auxiliar: el
   servicio comprueba XDR, emisor, firma, memo, operación, hash, resultado y
   contenido. Después repetir el circuito para el otro tipo de evidencia.

Tras reiniciar normalmente basta abrir la misma carpeta con la misma cuenta y
época, hacer status/reconcile y, solo si procede y está autorizado, submit.
Si quedó un bloqueo de un proceso muerto, repetir status con `--recover-lock`
después de verificar que no hay otro operador. No usar ese flag preventivamente
en todos los comandos.

## Verificación ejecutada

- Suite al completar la Etapa 1: **136 pruebas, 16 archivos, 0 fallos**; 91 pruebas anteriores y
  45 nuevas de anclaje. Todas las interacciones Stellar nuevas usan mocks.
- TypeScript de la app y typecheck separado de ambas CLI: pasan.
- ESLint de los módulos, scripts y pruebas de esta etapa: pasa sin advertencias.
- Build de producción: pasa; sin despliegue. Conserva avisos existentes de tamaño
  de chunks, paths de Vite y opciones de code splitting.
- `bun scripts/check-anchor-client-bundle.ts`: 68 archivos de la salida cliente
  inspeccionados, sin semillas privadas ni código del firmante/repositorio nuevo.
- CLI invocada con configuración predeterminada: falla cerrado con `DISABLED`,
  sin crear almacenamiento, leer secretos ni acceder a Stellar.
- `git diff --check`: pasa. No se modificaron dependencias ni código del escrow.

El lint global también se ejecutó: conserva **1.083 errores y 18 advertencias**
previamente identificados, fuera del código de esta etapa. No se corrige mediante
un autofix ajeno al alcance. La ausencia de semillas se verifica en la salida actual;
una futura ruta/UI debe repetir este chequeo de frontera servidor/cliente.

Revisión previa al primer envío: se corrigió la comparación de inmutabilidad para
documentos de 4 MiB (su Base64 supera el límite del serializador JSON) y se agregó
una prueba CLI con Bun en procesos separados. La suite actual tiene 138 pruebas
en 17 archivos. No se envió ninguna transacción real durante esa revisión.

### Firma externa con Stellar CLI (19/11/2026)

Una identidad del almacén seguro no puede exportarse (`stellar keys secret` lo rechaza).
En modo `stellar-cli`, `prepare` ejecuta primero `stellar keys public-key <identidad>
--quiet` y exige que coincida con la cuenta configurada. Después, con el XDR sin
firmar por stdin, ejecuta `stellar tx sign --sign-with-key <identidad>
--network-passphrase "Test SDF Network ; September 2015" --quiet`. El sobre devuelto
pasa por `inspectEnvelope` con firma obligatoria (cuenta, Testnet, memo hash,
ManageData única, clave y valor, comisión, ventana, una firma Ed25519 válida). Además,
su hash y su `signatureBase` deben ser idénticos a los de la transacción construida.
El servicio repite la comparación de hash para cualquier firmante y descarta una
firma terminada fuera de la ventana. Nada se persiste si falla. Los errores de la CLI
se reducen a `SIGNER`/`TIMEOUT` sin su salida.

Verificación: 152 pruebas en 18 archivos, TypeScript de app y scripts, ESLint del
módulo, build y chequeo del bundle cliente (68 archivos), todos correctos. La firma
real se comprobó con `stellar.exe` 30.0.1 solo sobre sobres descartables vencidos.

## Pendientes para usuarios reales y despliegue

1. Autorizar la preparación de una cuenta técnica nueva y la prueba real. Hasta
   entonces no hay hash de una transacción nueva en Testnet que pueda entregarse.
2. Adaptador PostgreSQL/Supabase con unicidad, CAS, snapshots, intentos y permisos;
   coordinación durable de secuencias/cola entre procesos. No migrar el JSON local
   automáticamente ni usarlo en serverless.
3. Autenticación y membresías reales, autorización por empresa/rol/versión y
   adaptador que cargue acuerdos aceptados y documentos privados desde el backend.
   El callback obligatorio del servicio es la frontera para incorporar esas reglas.
4. Congelar el acuerdo aceptado y comprobar aceptaciones de la misma versión.
   Las cantidades/precios deben salir de datos persistentes, no del cliente.
5. Storage privado y políticas documentales; revisión de tamaño, permisos,
   retención, cifrado local/servidor y privacidad de compromisos predecibles.
6. UI para seleccionar versión, registrar y consultar evidencia, separada del
   flujo de compra con garantía; endpoint privado autenticado, límites de uso y
   protección CSRF. No se implementó un endpoint público capaz de firmar.
7. Gestión administrativa de intentos expirados/inciertos, rotación del firmante,
   reinicios de Testnet y conservación histórica. No automatizar sustituciones
   mientras no se pueda demostrar el resultado anterior.

El registro acredita integridad y emisión por la cuenta técnica sobre la red
consultada, no autoría empresarial, validez legal o calidad física del producto.
