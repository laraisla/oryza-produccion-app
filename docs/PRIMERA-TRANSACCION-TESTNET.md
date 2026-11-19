# Primera transacción de AgroGlobal en Stellar Testnet

Propuesta revisada el 19/11/2026. Actualización del mismo día: la Aprobación A
(CLI, identidad nueva y fondeo con Friendbot) ya se ejecutó; ver "Resultado de la
Aprobación A". No se leyeron secretos antiguos, no se ejecutó prepare con la
identidad real y no se envió ninguna transacción de registro documental, que
sigue requiriendo la Aprobación B.

## Resultado de la revisión

La copia mantiene HEAD `cec7738c759df8c88255f15e00a3d2f804eefc02`, rama
`claude/youthful-lamport-niwhex`, con los cambios locales de Etapas 0 y 1. Se
inspeccionaron archivos modificados y sin seguimiento. No se reestructuró el
proyecto ni se cambió el escrow.

`HANDOFF-CLAUDE-CODE.md` no existía; se reconstruyó indicando ese origen. Los
documentos de Etapa 0 y diseño se conservan como antecedentes históricos.

### Compatibilidad comprobada

Horizon Testnet se consultó mediante GET públicos, sin cuenta ni credenciales:

| Dato | Observado |
| --- | --- |
| Proveedor | `https://horizon-testnet.stellar.org` |
| Passphrase | `Test SDF Network ; September 2015` |
| Horizon | `30.0.1-6f7cff3903be1df4fb980a12910a1313c5d7d8dd` |
| Protocolo | 30 |
| Ledger reportado | 5806857 |
| Cierre del ledger | `2026-11-19T03:12:10Z` (00:12:10, Buenos Aires) |
| Comisión base reportada | 100 stroops por operación |
| Reserva base reportada | 5.000.000 stroops = 0,5 XLM de prueba |

Las lecturas fueron `/`, `/fee_stats` y `/ledgers?order=desc&limit=1`. La red coincide
con la configuración y la comisión base coincide con los 100 stroops del
constructor. El SDK instalado construye y verifica el sobre clásico con memo de
32 bytes y una sola operación ManageData. Se probó también el runtime real Bun,
no solo el entorno Node de Vitest.

Esto comprueba la estructura y conectividad de lectura, **no la aceptación de una
transacción propia por la red**. Los parámetros pueden cambiar: releer antes del
envío. Si la comisión vigente deja de ser compatible con 100 stroops, detenerse
y revisar el constructor; no aumentar comisiones sin límite ni reenviar a ciegas.

Referencias oficiales: [memos y transacciones](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions),
[ManageData](https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/operations/object/manage-data),
[Stellar CLI](https://developers.stellar.org/docs/tools/cli/stellar-cli).

### Corrección y límites identificados

Se corrigió un defecto en `repository.server.ts`: un documento válido de 4 MiB
produce Base64 de más de 4 MiB. Las comparaciones del snapshot usaban el
serializador JSON de negocio, que rechazaba ese tamaño al reintentar o preparar.
Ahora comparan explícitamente todos los campos inmutables. Una regresión recorre
alta, alias idempotente, preparación, rechazo de modificación, confirmación
simulada, verificación y reapertura de un documento máximo.

La prueba nueva de CLI ejecuta Bun en procesos separados, con claves efímeras,
snapshot durable y fetch interceptado: request idempotente, prepare, status,
submit deshabilitado, verify correcto y verify alterado. No transmite nada y
comprueba que `.env` no se cargue con `--no-env-file`.

Otros puntos previos al primer envío:

- `stellar` no está instalado/en PATH; instalar la CLI oficial cuando se autorice
  preparar la identidad, o acordar otra herramienta oficial. No se instaló ahora.
- Bun carga `.env` automáticamente: ejecutar la CLI con `--no-env-file` y usar
  variables únicamente del proceso. La guía anterior se corrigió en este punto.
- El sobre vence 120 segundos después de preparar. Obtener aprobación del envío
  ANTES de prepare y ejecutar prepare/submit juntos después de esa aprobación.
- Un resultado unknown/expired bloquea preparar otras evidencias de esa cuenta.
  No borrar el diario, inventar una versión nueva o cambiar de carpeta para eludir
  ese control; primero investigar/reconciliar. No hay reemplazo automático.
- Los errores del proveedor se sanitizan; un HTTP rechazado puede terminar como
  unknown hasta reconciliación. La primera prueba requiere conectividad estable,
  reloj local correcto y saldo de prueba suficiente para comisión y reserva.
- El diario es para un proceso local, sin cifrado propio. No se despliega en
  serverless. Usar exclusivamente el documento ficticio preparado.

## Comprobaciones finales de esta revisión

| Comprobación | Resultado |
| --- | --- |
| Vitest completo | 138 aprobadas, 0 fallidas, 17 archivos. |
| TypeScript de la aplicación | Sin errores. |
| TypeScript estricto de los dos scripts | Sin errores. |
| ESLint del anclaje, scripts y pruebas relacionadas | Sin errores. |
| Build de producción | Correcto; avisos por chunks mayores a 500 kB y opción inlineDynamicImports ignorada. |
| Bundle cliente | 68 archivos inspeccionados, sin semillas privadas ni código de firmante/repositorio de anclaje. |
| git diff --check | Sin errores. |

Comandos adicionales ejecutados desde la raíz del repo:

```powershell
bun x --no-install tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --types node scripts/stellar-anchor-demo.ts scripts/check-anchor-client-bundle.ts
bun x --no-install eslint src/lib/stellar/anchor src/test/anchor-*.ts src/test/setup.ts scripts/stellar-anchor-demo.ts scripts/check-anchor-client-bundle.ts
```

No se afirma que el lint global pase: conserva deuda previa, informada como 1.083
errores y 18 advertencias al cierre de Etapa 1. No se aplicó autofix masivo.

Archivos cambiados en esta revisión: `README.md`,
`src/lib/stellar/anchor/repository.server.ts`, `src/test/anchor-service.test.ts`,
`src/test/anchor-cli.test.ts`, `docs/STELLAR-ANCLAJE-OPERACION.md`,
`docs/HANDOFF-CLAUDE-CODE.md` y este documento. Se conservaron los demás cambios
locales anteriores. El material ficticio se guarda en outputs, fuera del repo.

## Material exacto para aprobar

Directorio entregado:
`..\outputs\Primer-Anclaje (carpeta hermana del repositorio)`.

| Archivo | Propósito |
| --- | --- |
| `documento-demo.txt` | Original ficticio de 138 bytes, UTF-8 sin BOM y saltos LF. |
| `documento-alterado.txt` | Copia con exactamente un byte cambiado: 10 → 11 toneladas. |
| `documento.json` | Manifiesto CLI; referencia al original por ruta relativa. |

Digest SHA-256 esperado del original:

```text
e5b25418ee853f8b274d18a89644a621502ee1b741410e872d8733d17ab208b6
```

Digest de la copia alterada:

```text
c73fd5519a33cda9d78243643cc429b8e051711b90d9b44991e4e49d3d98bb60
```

Entidad `agroglobal-primer-documento-2026-11-19`, versión `1`, clave idempotente
`agroglobal-primer-documento-2026-11-19-v1`. El manifiesto no contiene credenciales.
No modificar el original después de aprobar su hash. Solo el digest de 32 bytes y
la clave técnica fija `agroglobal:anchor:v1` serán publicados, no el texto del documento.

## Aprobación A: cuenta técnica y fondeo de prueba

Todavía NO ejecutar estos comandos. Una vez autorizados:

1. Instalar/verificar Stellar CLI oficial, por ejemplo el paquete Windows
   `Stellar.StellarCLI`; comprobar `stellar --version`. No instalar otra herramienta
   por parecido de nombre.
2. Crear una identidad NUEVA, almacenada fuera del repo en el secure store del SO,
   sin `--fund` ni `--overwrite`:

   ```powershell
   stellar keys generate agroglobal-anchor-testnet-20261119 --network testnet --secure-store
   stellar keys public-key agroglobal-anchor-testnet-20261119
   ```

3. Guardar solo la dirección pública en el registro de la prueba. La clave no
   codifica una red: la exclusividad Testnet depende de no reutilizarla y de la
   passphrase/proveedor fijos del servicio. No usar identidades del escrow.
4. Verificar que la dirección nueva es la prevista y, con autorización de fondeo,
   activar exclusivamente mediante la red de prueba:

   ```powershell
   stellar keys fund agroglobal-anchor-testnet-20261119 --network testnet
   ```

5. Consultar la cuenta pública en Horizon Testnet y confirmar existencia, secuencia
   y saldo. Una cuenta nueva sin patrocinio requiere reserva para sus entradas;
   el primer ManageData agrega una. No depender del importe exacto que entregue
   Friendbot: comprobar saldo suficiente usando los parámetros actuales.

No crear activos, trustlines, contratos ni transferencias comerciales. El fondeo
de la cuenta y el registro de evidencia son dos acciones de red diferentes.

### Resultado de la Aprobación A (19/11/2026, ejecutada)

| Dato | Valor |
| --- | --- |
| Stellar CLI | 30.0.1 (`f2a7b74`), winget `Stellar.StellarCLI`, instalador oficial de GitHub con hash verificado; `C:\Program Files (x86)\Stellar CLI\stellar.exe` |
| Identidad | `agroglobal-anchor-testnet-20261119`, nueva; no había identidades previas en la CLI |
| Almacenamiento | Semilla en el Administrador de credenciales de Windows (`org.stellar.cli-agroglobal-anchor-testnet-20261119`). `%USERPROFILE%\.config\stellar\identity\…toml` contiene solo la referencia y la clave pública. Nada dentro del repo |
| Dirección pública | `GA2JCDRU5Q3TPN4VZOQ5WBFNVGXSHTL5ZXKFVNLDANOUCLK34DTD6YNX` |
| Antes del fondeo | Horizon devolvió 404 (cuenta inexistente); no figura en las 4 cuentas heredadas denegadas |
| Fondeo | Friendbot Testnet, `create_account` de 10.000 XLM de prueba, tx `4565cc04ca9c4e3cff89bb070319e3f5500049cf13c353d2702f482cfb2e6362` |
| Horizon | passphrase `Test SDF Network ; September 2015`, Horizon 30.0.1, protocolo 30, ledger 5807119 (03:33:55Z) |
| Cuenta | secuencia `24941377599045632`, 0 subentradas, 0 datos, sin patrocinio, un firmante (la propia clave, peso 1), umbrales 0 |
| Saldo y reserva | 10.000 XLM. Tras el ManageData, el mínimo es (2 + 1) × 0,5 = 1,5 XLM; comisión de 100 stroops = 0,00001 XLM. Margen amplio |
| Comisión | base 100 stroops; uso de capacidad del ledger 9 %, sin precios de congestión. El p50 cobrado alto de `fee_stats` (18.455) refleja transacciones Soroban; no impide aceptar un sobre clásico con oferta de 100 |
| Compatibilidad | Con los módulos reales y sin secreto: `validateTechnicalAccount` ok; `HorizonAnchorTransport.network()` = Testnet; `account()` devuelve la secuencia; el sobre SIN firmar se descartó (fee 100, 1 ManageData `agroglobal:anchor:v1`, valor y memo hash = digest aprobado, secuencia +1, ventana de 125 s). Sin diario, envío deshabilitado |
| Material | Los SHA-256 de `documento-demo.txt` y `documento-alterado.txt` coinciden con los aprobados |

## Resultado real de la primera transacción (19/11/2026) — CONFIRMADA

Ejecutada con la Aprobación B, firma externa Stellar CLI e identidad del Secure Store.
No se leyó ni exportó la clave.

| Dato | Valor |
| --- | --- |
| Hash | `0f1894b76f63fe2f0b7b0f42bb8eb8a323ace463cb85068eeb3e53eb72f9147f` |
| Ledger | 5807357 |
| Fecha | 2026-11-19 03:53:45 UTC (00:53:45 Buenos Aires) |
| Cuenta | `GA2JCDRU5Q3TPN4VZOQ5WBFNVGXSHTL5ZXKFVNLDANOUCLK34DTD6YNX`, una firma |
| Red | Stellar Testnet (`Test SDF Network ; September 2015`) |
| Contenido | MEMO_HASH y ManageData `agroglobal:anchor:v1` = `e5b25418…ab208b6`; una operación |
| Comisión | 100 stroops ofrecidos y cobrados (0,00001 XLM) |
| Secuencia / vigencia | `24941377599045633`; 03:53:37–03:55:42 UTC (125 s) |
| Envíos | 1; estado `confirmed` (revisión 3) |
| Explorador | https://stellar.expert/explorer/testnet/tx/0f1894b76f63fe2f0b7b0f42bb8eb8a323ace463cb85068eeb3e53eb72f9147f |

Verificaciones: `reconcile` devolvió confirmed (salida 0). `verify` sin archivo y con
`documento-demo.txt` devolvieron `matches` con las 9 comprobaciones en true (salida 0).
`documento-alterado.txt` devolvió `mismatch`, con solo `content=false` (salida 2).
Repetir request, prepare y submit `--send` devolvió el mismo id y hash, con 1 envío y la
revisión sin cambios. Horizon muestra solo dos transacciones de la cuenta: la
creación por Friendbot y esta. Saldo 9.999,99999 XLM, 1 subentrada, valor de datos
igual al digest. Stellar Expert muestra los mismos datos.

## Intento de la Aprobación B y corrección: firma externa (19/11/2026)

`request` se ejecutó y creó la evidencia `4babc1ab-69d7-4238-81c6-c6e074386d53`
(pending, digest aprobado, 0 envíos). El paso siguiente se detuvo antes de preparar:
Stellar CLI 30.0.1 responde "Secure Store does not reveal secret key" a
`stellar keys secret`, por diseño. No se firmó ni envió nada.

Corrección: el firmante pasa a ser **Stellar CLI**, que firma con la identidad del
almacén seguro. Comando oficial: `stellar tx sign --sign-with-key <identidad>
--network-passphrase "Test SDF Network ; September 2015" --quiet`, con el XDR sin
firmar por stdin y el XDR firmado por stdout. AgroGlobal nunca lee, exporta ni deriva
la clave. Ver `src/lib/stellar/anchor/cli-signer.server.ts` y el informe de operación.
Se comprobó con el ejecutable real usando sobres descartables (vencidos, secuencia
inválida, digest ficticio; nunca transmitidos): firma válida de GA2J…D6YNX, hash sin
cambios, una sola firma.

## Procedimiento exacto de la Aprobación B con firma externa (NO ejecutado)

Solo con la aprobación vigente: red Testnet, cuenta `GA2JCDRU…D6YNX`, digest
`e5b25418…ab208b6`, una operación ManageData, comisión de 100 stroops, sin escrow.
Usar la evidencia ya creada; no repetir `request` con otro manifiesto.

```powershell
Set-Location '<RAIZ_DEL_REPO>'
Remove-Item Env:\STELLAR_ANCHOR_SECRET -ErrorAction SilentlyContinue
$env:STELLAR_ANCHOR_DEMO = '1'
$env:STELLAR_ANCHOR_PUBLIC_KEY = 'GA2JCDRU5Q3TPN4VZOQ5WBFNVGXSHTL5ZXKFVNLDANOUCLK34DTD6YNX'
$env:STELLAR_ANCHOR_EPOCH = 'testnet-primera-prueba-20261119'
$env:STELLAR_ANCHOR_DIRECTORY = Join-Path (Get-Location) 'anchor-demo.local'
$env:STELLAR_ANCHOR_ENABLED = '0'
$env:STELLAR_ANCHOR_SIGNER = 'stellar-cli'
$env:STELLAR_ANCHOR_CLI_IDENTITY = 'agroglobal-anchor-testnet-20261119'
$env:STELLAR_ANCHOR_CLI_PATH = 'C:\Program Files (x86)\Stellar CLI\stellar.exe'
$primerMaterial = (Resolve-Path '..\outputs\Primer-Anclaje').Path
$evidenciaPrimerEnvio = '4babc1ab-69d7-4238-81c6-c6e074386d53'
bun --no-env-file scripts/stellar-anchor-demo.ts status $evidenciaPrimerEnvio
```

Comprobar `pending`, `submissions: 0` y el digest aprobado. Releer la comisión (debe
seguir en 100) y, sin pausa, preparar y enviar dentro de los 120 s:

```powershell
(Invoke-RestMethod 'https://horizon-testnet.stellar.org/fee_stats').last_ledger_base_fee
try {
  bun --no-env-file scripts/stellar-anchor-demo.ts prepare $evidenciaPrimerEnvio
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar; no enviar' }
  $env:STELLAR_ANCHOR_ENABLED = '1'
  bun --no-env-file scripts/stellar-anchor-demo.ts submit $evidenciaPrimerEnvio --send
  "submit exit=$LASTEXITCODE"
} finally {
  $env:STELLAR_ANCHOR_ENABLED = '0'
}
```

`prepare` primero confirma que la identidad corresponde a la cuenta (`stellar keys
public-key`). Después consulta red y secuencia, construye, firma con Stellar CLI y
rechaza sin guardar nada si el sobre devuelto difiere en hash, red, cuenta, memo,
operación, comisión, secuencia, vencimiento o firma. Después seguir con reconcile/verify
(paso 3 de abajo). Un exit 2 de submit significa pendiente: reconciliar, no volver a
ejecutar prepare.

## Secreto seguro y configuración

Solo el proceso local de preparación necesita el secreto. No ponerlo en Git,
`.env`, archivos de manifiesto, argumentos, chat, screenshots ni logs. El envío
del sobre ya firmado, la reconciliación y la verificación no necesitan el secreto.

En PowerShell local, inyectarlo desde el gestor seguro al entorno del proceso.
Una alternativa es el prompt sin eco:

```powershell
$anchorSecretInput = Read-Host 'Secreto de la cuenta NUEVA de Testnet' -AsSecureString
$env:STELLAR_ANCHOR_SECRET = [Net.NetworkCredential]::new('', $anchorSecretInput).Password
```

La CLI no extrae por sí sola el secreto de Stellar CLI. Si se usa `stellar keys
secret` para obtenerlo, capturar su stdout dentro del proceso local y nunca
mostrarlo en consola ni devolverlo mediante herramientas de chat. Comprobar el
exit code antes de usarlo. No imprimir ni volcar el entorno.

Configuración sin secreto:

```powershell
Set-Location '<RAIZ_DEL_REPO>'
$env:STELLAR_ANCHOR_DEMO = '1'
$env:STELLAR_ANCHOR_PUBLIC_KEY = '<DIRECCION_PUBLICA_NUEVA_VERIFICADA>'
$env:STELLAR_ANCHOR_EPOCH = 'testnet-primera-prueba-20261119'
$env:STELLAR_ANCHOR_DIRECTORY = Join-Path (Get-Location) 'anchor-demo.local'
$env:STELLAR_ANCHOR_ENABLED = '0'
$primerMaterial = (Resolve-Path '..\outputs\Primer-Anclaje').Path
```

Ninguna de esas variables se configuró con credenciales reales durante esta
revisión. El diario ignorado por Git no se creó para esta prueba todavía.

## Aprobación B: una evidencia concreta, seguida de ejecución

Después de A, solicitar autorización para **una transacción Testnet de anclaje**
desde la cuenta pública nueva, del digest original indicado arriba, con una sola
operación ManageData, sin escrow. Identificar red, cuenta, documento y comisión
antes de preparar. No esperar una segunda aprobación con el sobre ya corriendo
contra su vencimiento de 120 segundos.

### Pasos posteriores a esa autorización

1. Comprobar hash independiente y crear snapshot, sin enviar:

   ```powershell
   Get-FileHash (Join-Path $primerMaterial 'documento-demo.txt') -Algorithm SHA256
   bun --no-env-file scripts/stellar-anchor-demo.ts request (Join-Path $primerMaterial 'documento.json')
   ```

   Guardar el `id` de evidencia devuelto y verificar su digest contra el aprobado:

   ```powershell
   $evidenciaPrimerEnvio = '<ID_DEVUELTO_POR_REQUEST>'
   bun --no-env-file scripts/stellar-anchor-demo.ts status $evidenciaPrimerEnvio
   ```

2. Inyectar el secreto nuevo, preparar y enviar dentro de la ventana de vigencia.
   Si prepare falla, detenerse sin enviar. Verificar digest/hash devueltos y estado
   prepared antes de continuar. No mostrar el sobre completo ni el secreto.

   ```powershell
   try {
     bun --no-env-file scripts/stellar-anchor-demo.ts prepare $evidenciaPrimerEnvio
     if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar; no enviar' }
     Remove-Item Env:\STELLAR_ANCHOR_SECRET
     $anchorSecretInput = $null
     $env:STELLAR_ANCHOR_ENABLED = '1'
     bun --no-env-file scripts/stellar-anchor-demo.ts submit $evidenciaPrimerEnvio --send
   } finally {
     $env:STELLAR_ANCHOR_ENABLED = '0'
     Remove-Item Env:\STELLAR_ANCHOR_SECRET -ErrorAction SilentlyContinue
     $anchorSecretInput = $null
   }
   ```

   El exit code 2 significa pendiente/no confirmada, no permiso para generar otra
   transacción. No ejecutar otra vez prepare esperando renovar el sobre.

3. Reconciliar y verificar, únicamente lecturas de la red:

   ```powershell
   bun --no-env-file scripts/stellar-anchor-demo.ts reconcile $evidenciaPrimerEnvio
   bun --no-env-file scripts/stellar-anchor-demo.ts verify $evidenciaPrimerEnvio (Join-Path $primerMaterial 'documento-demo.txt')
   bun --no-env-file scripts/stellar-anchor-demo.ts verify $evidenciaPrimerEnvio (Join-Path $primerMaterial 'documento-alterado.txt')
   ```

4. Conservar hash de transacción, ledger, fecha y cuenta pública. Abrir ese hash
   en Stellar Expert Testnet como corroboración adicional. Repetir request y
   comprobar el mismo id; si se autoriza probar la idempotencia del envío,
   submit de la evidencia confirmada debe devolverla sin otra transmisión.

## Criterios de éxito

- Una transacción propia confirmada y exitosa en Stellar Testnet.
- Emisor y firma coinciden con la cuenta nueva autorizada.
- Memo hash y valor ManageData tienen exactamente el digest aprobado, en 32 bytes;
  una sola operación y clave `agroglobal:anchor:v1`.
- Hash de XDR recalculado coincide con el hash consultado; ledger/fecha disponibles.
- El original devuelve `matches`, con todas las comprobaciones true y salida 0.
- La copia con un byte alterado devuelve `mismatch`, content=false y salida 2.
- Reabrir el proceso conserva la evidencia; verificar no necesita el secreto.
- Repetir la misma solicitud no crea otro id, sobre ni descuento de comisión.
- No aparecen texto del documento, precios, datos privados o secretos en cadena
  o en los archivos cliente. No se toca el contrato de garantía.

## Paso posterior: evidencia en la interfaz web — IMPLEMENTADO (19/11/2026)

Implementado en `/evidencia-stellar/documental`, de solo lectura. Se verificó en el
navegador local con la transacción real: estado "Confirmada en Stellar Testnet", las 9
comprobaciones en verde, `documento-demo.txt` coincide y `documento-alterado.txt` muestra
"Diferencia detectada" (solo `content` falla). El texto que sigue es la propuesta original.

Después de lograr y registrar esta primera prueba, agregar una vista de consulta
local al módulo documental: digest, red, cuenta, hash, ledger, fecha, verificaciones
individuales y enlace al explorador. Reutilizar el patrón visual de evidencia,
sin estados ni montos del escrow.

Para la primera demostración puede ser una consulta servidor de solo lectura en
localhost sobre el mismo diario y con un único propietario del repositorio local;
no abrir otra instancia que compita con la CLI. El secreto no debe ser necesario
para mostrar o verificar la evidencia. No agregar firma pública como atajo.

Si luego se agrega selección de documentos y firma desde la web, requiere una
entrada local controlada o autenticación/autorización real. PostgreSQL y usuarios
empresariales quedan para después; no son requisitos de esta primera prueba.
