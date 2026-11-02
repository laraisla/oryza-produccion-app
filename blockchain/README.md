# AgroGlobal COMEX — Módulo blockchain (Stellar Testnet / Soroban)

> **Solo Testnet.** El activo `AGROUSD` es de prueba, lo emite una cuenta de
> demostración y no tiene valor. Nunca usar Mainnet ni fondos reales.

Contrato `agroglobal-escrow`: acuerdo comercial entre comprador y vendedor con
depósito en garantía de un activo de prueba.

## Reglas del contrato

| Función | Firma requerida | Estado previo → nuevo | Efecto |
|---|---|---|---|
| `create(buyer, seller, arbiter, token, amount, terms_hash, order_ref, deadline)` | comprador | — → `Created` | Registra partes, monto y **hash SHA-256 de las condiciones** |
| `accept(id)` | vendedor | `Created` → `Accepted` | El vendedor acepta esas condiciones |
| `deposit(id)` | comprador | `Accepted` → `Funded` | Transfiere `amount` del comprador al contrato |
| `release(id, by)` | comprador o árbitro | `Funded` → `Released` | Transfiere los fondos al vendedor |
| `refund(id, by)` | árbitro (siempre) o comprador (solo tras `deadline`) | `Funded` → `Refunded` | Devuelve los fondos al comprador |
| `cancel(id, by)` | comprador o vendedor | `Created`/`Accepted` → `Cancelled` | Solo sin fondos depositados |
| `get(id)`, `verify_terms(id, hash)`, `count()` | — | lectura | Consulta pública |

Errores: `NotFound`, `InvalidAmount`, `InvalidStatus`, `Unauthorized`,
`DeadlineInPast`, `DeadlineNotReached`, `SameParty`. Cada cambio de estado emite
un evento (`AgreementCreated`, `StatusChanged`).

Las condiciones comerciales **no** se publican en la cadena: solo su hash
(JSON canónico con claves ordenadas → SHA-256, ver `scripts/terms-hash.mjs`).

## Requisitos

- Rust ≥ 1.84 con target `wasm32v1-none` (`rustup target add wasm32v1-none`)
- Stellar CLI ≥ 28 (`stellar --version`)
- Node (para los scripts auxiliares)

En Windows se usó la toolchain `x86_64-pc-windows-gnu` (no requiere Visual
Studio Build Tools). Su linker falla de forma intermitente con "Acceso
denegado" / "cannot execute ld" al compilar en paralelo: reintentar, o usar
`cargo test -j 2`.

## Uso

```sh
cd blockchain
export CARGO_TARGET_DIR="$LOCALAPPDATA/agroglobal-soroban-target"   # fuera de OneDrive

cargo test                                   # 14 pruebas del contrato
stellar contract build                       # WASM

bash scripts/deploy-testnet.sh               # identidades + deploy + activo de prueba
bash scripts/demo-flow.sh                    # acuerdo completo con liberación
bash scripts/demo-flow.sh demo/orden-demo-local.json --refund   # con reembolso del árbitro
```

Los scripts registran Contract ID, hash del WASM y hashes de transacción en
`deployments/testnet.json` (solo direcciones públicas). Las claves privadas de
las identidades `agroglobal-*` quedan en la configuración local del Stellar CLI
(`~/.config/stellar/identity/`), fuera del repositorio.

> **Cambio de nombre (AgroMatch → AgroGlobal).** Las identidades creadas antes
> del cambio se llaman `agromatch-admin`, `agromatch-buyer`, `agromatch-seller`
> y `agromatch-arbiter`, y son las cuentas del contrato ya desplegado. Para
> seguir usándolas, copiá cada archivo `agromatch-<rol>.toml` como
> `agroglobal-<rol>.toml` en `~/.config/stellar/identity/` (mismas claves,
> nombre nuevo). Si no, `deploy-testnet.sh` generará identidades nuevas y
> desplegará un contrato nuevo.

## Despliegue actual

Ver `deployments/testnet.json`. Explorador:
https://stellar.expert/explorer/testnet/contract/CAERX6PVDUP5ZQNOL7RS2JC3GKHMAYBFGGJBZ24XN5ZQYS4GTOTCHDH2

La Testnet de Stellar se reinicia periódicamente: si el contrato deja de
existir, volver a correr `deploy-testnet.sh`.
