# Integración Stellar / Soroban

**Propósito**: que vendedor y comprador —que no comparten una misma base de datos— puedan probar qué versión de los términos aceptaron y cuándo, sin confiar solo en el operador de la plataforma. El hash prueba **integridad y fecha de registro**, no la veracidad del contenido, y no reemplaza un contrato legal ni mueve fondos.

## Qué se registra (y qué no)

| On-chain | Nunca on-chain |
|---|---|
| `deal_key` = SHA-256(`agromatch:deal:v1:` + UUID de la operación) | precios, cantidades, nombres de empresas |
| `terms_hash` = SHA-256 del JSON canónico de los términos aceptados | CUIT, datos personales |
| versión de términos, estado, marcas de tiempo del ledger | documentos o su contenido |
| direcciones públicas de vendedor y comprador | claves privadas o *seed phrases* |
| huellas SHA-256 de documentos de respaldo (`record_proof`) | datos de clientes o del banco |

El JSON canónico (claves ordenadas, sin espacios, importes como strings decimales) se calcula en `src/integrations/stellar/terms.ts`; cualquier persona con los términos puede recalcular el hash y compararlo con el del contrato.

## Contrato `contracts/agromatch_deals`

Rust, `soroban-sdk` 23.5.3, compilado a `wasm32v1-none`.

| Función | Firma requerida | Efecto | Errores |
|---|---|---|---|
| `create_deal(deal_key, seller, buyer, terms_hash, terms_version)` | vendedor | crea el acuerdo en `Created`, evento `deal_created` | `DealAlreadyExists`, `SameParty`, `InvalidVersion` |
| `amend_terms(deal_key, terms_hash, terms_version)` | vendedor | reemplaza términos por una versión **posterior** mientras no haya aceptación | `InvalidVersion`, `AlreadyAccepted`, `DealCancelled` |
| `accept_deal(deal_key, terms_hash)` | comprador designado | pasa a `Accepted`; el comprador envía el hash que revisó | `TermsMismatch`, `AlreadyAccepted`, `DealCancelled` |
| `cancel_deal(deal_key)` | vendedor | retira un acuerdo no aceptado | `AlreadyAccepted`, `DealCancelled` |
| `record_proof(deal_key, actor, doc_hash, kind)` | vendedor o comprador | agrega la huella de un documento (sin duplicados) | `NotParticipant`, `ProofAlreadyRecorded`, `DealCancelled` |
| `get_deal(deal_key)` / `get_proof(deal_key, index)` | pública (lectura) | devuelve hashes, participantes, estado y pruebas | `DealNotFound`, `ProofNotFound` |

Garantías: no hay claves duplicadas, nadie más que el vendedor modifica o cancela, solo el comprador designado acepta y únicamente el hash vigente, y un acuerdo aceptado es inmutable. Almacenamiento persistente con extensión de TTL a 30 días en cada escritura (los datos que vencen quedan archivados y pueden restaurarse).

Pruebas: `npm run test:contract` — 15 pruebas (autorización por firmante, cuentas equivocadas, duplicados, versiones, cancelación, pruebas documentales, eventos).

## Integración en la app

- `src/integrations/stellar/dealsClient.ts`: arma, simula (`prepareTransaction`), firma y envía las invocaciones; espera la confirmación (`pollTransaction`) y solo devuelve éxito si el estado es `SUCCESS`. Traduce los errores del contrato a mensajes legibles.
- `src/integrations/stellar/freighter.ts`: conexión con Freighter (verifica la red) y firma; **la app nunca recibe claves privadas**.
- Expediente de la operación → pestaña **Stellar**: muestra red y contrato, la `deal_key` y el `terms_hash` de la versión aceptada, las transacciones **confirmadas** con enlace al explorador, y un botón para re-consultar el estado on-chain y comparar el hash. El vendedor firma *Registrar acuerdo* y el comprador *Confirmar acuerdo*, cada uno con su billetera (la dirección pública se configura en *Configuración → Organización*).
- La red local se identifica con un aviso: sus transacciones son reales pero no verificables públicamente.
- Si no hay contrato desplegado, la pestaña lo dice y no muestra ninguna evidencia.

## Scripts

```bash
npm run build:contract                          # WASM en contracts/target/wasm32v1-none/release/
npm run stellar:deploy -- --network testnet    # sube el WASM, crea el contrato → deployments/testnet.json
npm run stellar:demo   -- --network testnet    # acuerdo demo OP-2026-0001: create_deal + accept_deal → deployments/testnet-evidence.json
npm run stellar:verify -- --network testnet    # re-consulta cada transacción y compara estado y hash on-chain
```

- Cuentas de prueba: se leen de `AGROMATCH_DEPLOYER_SECRET`, `AGROMATCH_SELLER_SECRET` y `AGROMATCH_BUYER_SECRET`, o se generan en `.stellar/<red>/<nombre>.secret` (0600, ignorado por git) y se fondean con Friendbot. Son cuentas de prueba sin valor; nunca usar claves reales.
- `stellar:demo` usa los términos de la versión aceptada del seed (`src/data/demoAgreement.ts`), los mismos que muestra la app, y es idempotente (si el acuerdo ya existe o ya fue aceptado, no repite transacciones).
- Los archivos `deployments/<red>.json` y `deployments/<red>-evidence.json` contienen solo datos públicos. La app los incorpora al compilar.

## Evidencia obtenida

**Red local** (`stellar/quickstart --local`, protocolo 28), 16/10/2026:

| Paso | Resultado |
|---|---|
| Subida del WASM y creación del contrato | `SUCCESS` (contrato `CAKZXZ7G…LMCC`) |
| `create_deal` firmado por la cuenta vendedora | `SUCCESS` |
| `accept_deal` firmado por la cuenta compradora | `SUCCESS` |
| `stellar:verify` | estado on-chain `ACCEPTED`, versión 2, hash idéntico al recalculado por la app |

Esa evidencia no se versiona (`deployments/local*.json` está en `.gitignore`): la red local es efímera y no es verificable por terceros.

**Testnet**: **sin despliegue**. La política de red del entorno donde se desarrolló bloquea `soroban-testnet.stellar.org`, `friendbot.stellar.org`, `horizon-testnet.stellar.org` y `stellar.expert` (HTTP 403 del proxy). No se publica ningún contrato ni hash de Testnet porque no existen. Para completarlo: habilitar esos dominios (o usar una máquina con acceso) y ejecutar los tres comandos de arriba; luego versionar `deployments/testnet.json` y `deployments/testnet-evidence.json` y reconstruir la app.

## Probar el flujo con Freighter

1. Desplegar (Testnet o red local) y reconstruir la app para que incorpore `deployments/<red>.json`, o cargar el ID del contrato en *Configuración → Stellar*.
2. En Freighter, elegir la misma red y una cuenta fondeada de prueba para cada parte.
3. Como Martín (vendedor) y como Diego (comprador), cargar la dirección pública de cada empresa en *Configuración → Organización*.
4. Abrir una operación con versión aceptada → pestaña *Stellar* → como vendedor *Registrar acuerdo*; cambiar a Diego → *Confirmar acuerdo*. Cada transacción aparece solo después de confirmada, con su enlace al explorador.
