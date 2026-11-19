# Traspaso local de AgroGlobal — revisión previa a Testnet

Reconstruido el 19/11/2026 porque este archivo no existía en la copia inspeccionada.
Es un registro del estado comprobado, no un documento previo recuperado.

## Conservar el trabajo

- Repositorio: `laraisla/oryza-produccion-app`.
- Copia: `<RAIZ_DEL_REPO>`.
- Rama: `claude/youthful-lamport-niwhex`.
- HEAD: `cec7738c759df8c88255f15e00a3d2f804eefc02`.
- Etapas 0 y 1 están SIN COMMIT. Gran parte del servicio Stellar y las pruebas
  nuevas todavía son archivos SIN SEGUIMIENTO. `git diff` solo no muestra todo.
- No usar reset/clean/checkout para recuperar una supuesta versión anterior. No
  cambiar remotos/ramas ni hacer commit/push sin autorización. No sincronizar Lovable.
- Leer `git status --short`, `git diff` y `git ls-files --others --exclude-standard`.

## Prioridad y trabajo completado

Primero conseguir una evidencia documental real en Stellar Testnet. No ampliar
el marketplace ni integrar PostgreSQL/Supabase para esa primera prueba.

Etapa 0: correcciones COMEX, conservación del contexto de cotización y reservas
locales indivisibles; ver `ETAPA0-ESTABILIZACION.md`. El store local no garantiza
concurrencia entre usuarios.

Etapa 1: los siete componentes de `src/lib/stellar/anchor/`, CLI local y diario
durable. Usan SHA-256, MEMO_HASH y ManageData con `agroglobal:anchor:v1`, cuenta
técnica nueva y firma servidor. No requieren el contrato Soroban anterior. No hay
botón web nuevo ni endpoint público de firma. Envío deshabilitado por defecto.

Revisión previa: 136 pruebas iniciales aprobadas; corrección del límite de 4 MiB
en las comparaciones de snapshots y nueva prueba de la CLI real con Bun, procesos
separados y fetch simulado. Suite actual: 138 pruebas, 17 archivos. Ninguna de esas
pruebas crea o financia una cuenta real; sus claves son efímeras y no se publican.

## Límites vigentes de autorización

Se permite revisar, corregir localmente y probar con mocks. TODAVÍA NO se permite:
crear identidades/cuentas reales, fondear con Friendbot, usar secretos heredados,
firmar con una identidad real o enviar transacciones. No se hizo nada de eso.
GET públicos de Horizon sí se consultaron para revisar compatibilidad y parámetros.

No abrir ni imprimir secretos. Usar `--no-env-file` en Bun para no cargar archivos
de entorno heredados. No ejecutar los scripts del escrow. No tocar Supabase remoto.

## Actualización 19/11/2026: primera evidencia real confirmada

Cuenta técnica nueva `GA2JCDRU…D6YNX` (identidad `agroglobal-anchor-testnet-20261119`,
Secure Store de Windows), firmada mediante `stellar tx sign` (modo
`STELLAR_ANCHOR_SIGNER=stellar-cli`). Transacción `0f1894b7…72f9147f`, ledger 5807357,
confirmada y verificada. Detalle en `PRIMERA-TRANSACCION-TESTNET.md`. El diario
`anchor-demo.local/` contiene esta evidencia: no borrarlo ni cambiar la época. Sigue
sin commit.

Vista web de solo lectura implementada: `/evidencia-stellar/documental`. Se abre con la
configuración `dev-anclaje` de `.claude/launch.json` (servidor de desarrollo con la cuenta
pública y la época; sin secreto, envío deshabilitado). `/evidencia-stellar` queda como demo
histórica del escrow. Suite: 167 pruebas en 20 archivos.

## Próximo paso concreto (histórico, previo al envío)

Revisar `PRIMERA-TRANSACCION-TESTNET.md`: contiene el documento ficticio exacto,
digest esperado, manifiesto, observación de Horizon, cuenta nueva, secreto seguro,
fondeo, puntos de aprobación y criterios de éxito. No preparar un sobre real
mientras se espera aprobación: vence 120 segundos después y un intento incierto
no se reemplaza automáticamente.

Tras aprobación de cuenta/fondeo y después del envío específico: ejecutar request,
prepare, submit, reconcile y verify con la CLI. La copia alterada debe fallar, y
repetir request/submit no debe crear una segunda transacción.

## Comprobaciones

```powershell
bun run test
bun x --no-install tsc --noEmit
bun run build
bun scripts/check-anchor-client-bundle.ts
git diff --check
```

Typecheck de scripts y lint de anclaje están detallados en la propuesta. El lint
global tiene deuda previa (1.083 errores y 18 advertencias al cierre de Etapa 1);
no hacer autofix masivo. El binario `stellar` no se encontró en PATH durante esta
revisión; Bun y Node sí están disponibles. No se instaló Stellar CLI todavía.
