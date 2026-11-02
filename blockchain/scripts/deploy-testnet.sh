#!/usr/bin/env bash
# ============================================================
# Despliegue de AgroGlobal Escrow en Stellar TESTNET.
#
# - Crea (si no existen) 4 identidades de prueba y las fondea con
#   Friendbot: admin (deployer + emisor del activo), comprador,
#   vendedor y árbitro. Las claves privadas quedan en la config
#   local del Stellar CLI, NUNCA en este repositorio.
# - Compila y despliega el contrato.
# - Emite el activo de prueba AGROUSD y despliega su Stellar Asset
#   Contract; crea trustlines y acredita saldo de prueba al comprador.
# - Registra Contract ID, hash del WASM y hashes de transacción en
#   blockchain/deployments/testnet.json.
#
# Uso (Git Bash / Linux / macOS):  bash blockchain/scripts/deploy-testnet.sh
# Requiere: stellar CLI >= 28, Rust + target wasm32v1-none, node.
# ============================================================
set -euo pipefail

NETWORK="testnet"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
ASSET_CODE="AGROUSD"
BUYER_TEST_BALANCE="1000000000000" # 100.000 AGROUSD (7 decimales)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/deployments/testnet.json"
LOG_DIR="$(mktemp -d)"
# El target de Rust queda fuera del repo (evita sincronizar GB con OneDrive).
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${LOCALAPPDATA:-$HOME/.cache}/agroglobal-soroban-target}"
WASM="$CARGO_TARGET_DIR/wasm32v1-none/release/agroglobal_escrow.wasm"

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ensure_identity() {
  local name="$1"
  if stellar keys address "$name" >/dev/null 2>&1; then
    stellar keys fund "$name" --network "$NETWORK" >/dev/null 2>&1 || true
  else
    stellar keys generate "$name" --network "$NETWORK" --fund >/dev/null
  fi
  stellar keys address "$name"
}

echo "▶ Identidades de prueba (Friendbot)"
ADMIN="$(ensure_identity agroglobal-admin)"
BUYER="$(ensure_identity agroglobal-buyer)"
SELLER="$(ensure_identity agroglobal-seller)"
ARBITER="$(ensure_identity agroglobal-arbiter)"
echo "  admin=$ADMIN"; echo "  comprador=$BUYER"; echo "  vendedor=$SELLER"; echo "  árbitro=$ARBITER"

echo "▶ Compilando contrato"
(cd "$ROOT" && stellar contract build --package agroglobal-escrow >/dev/null)
WASM_HASH="$(sha256sum < "$WASM" | cut -d' ' -f1)"
echo "  wasm $WASM_HASH"

echo "▶ Desplegando contrato"
CONTRACT_ID="$(run_tx deploy_contract stellar contract deploy \
  --wasm "$WASM" --source-account agroglobal-admin --network "$NETWORK" --alias agroglobal-escrow | tail -1)"
echo "  contract $CONTRACT_ID"

echo "▶ Activo de prueba $ASSET_CODE"
ASSET="$ASSET_CODE:$ADMIN"
TOKEN_ID="$(stellar contract id asset --asset "$ASSET" --network "$NETWORK")"
if ! stellar contract invoke --id "$TOKEN_ID" --network "$NETWORK" --source-account agroglobal-admin \
  --send=no -- name >/dev/null 2>&1; then
  run_tx deploy_asset_contract stellar contract asset deploy \
    --asset "$ASSET" --source-account agroglobal-admin --network "$NETWORK" --alias agroglobal-agrousd >/dev/null
fi
echo "  token $TOKEN_ID"

for who in buyer seller; do
  run_tx "trustline_$who" stellar tx new change-trust \
    --source-account "agroglobal-$who" --line "$ASSET" --network "$NETWORK" >/dev/null
done

run_tx mint_buyer stellar contract invoke --id "$TOKEN_ID" --network "$NETWORK" \
  --source-account agroglobal-admin -- mint --to "$BUYER" --amount "$BUYER_TEST_BALANCE" >/dev/null

echo "▶ Registrando en $OUT"
# Ledger del despliegue: punto de partida para consultar eventos del contrato.
FIRST_TX="$(head -1 "$TXS_FILE" | cut -d= -f2)"
DEPLOY_LEDGER="$(curl -s "https://horizon-testnet.stellar.org/transactions/$FIRST_TX" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).ledger ?? 0))')"
TXS_JSON="$(txs_json)"
node -e '
  const [out, deployLedger, contractId, wasmHash, tokenId, asset, admin, buyer, seller, arbiter, passphrase, txs] = process.argv.slice(1);
  const fs = require("fs");
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  const explorer = "https://stellar.expert/explorer/testnet";
  const record = {
    network: "testnet",
    networkPassphrase: passphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
    aviso: "Stellar TESTNET. Activo de prueba sin valor. Cuentas de demostración.",
    contractId,
    contractExplorer: `${explorer}/contract/${contractId}`,
    deployLedger: Number(deployLedger),
    wasmSha256: wasmHash,
    testAsset: { code: asset.split(":")[0], issuer: asset.split(":")[1], contractId: tokenId },
    accounts: { admin, buyer, seller, arbiter },
    deployTransactions: Object.fromEntries(
      Object.entries(JSON.parse(txs)).map(([k, h]) => [k, { hash: h, url: `${explorer}/tx/${h}` }]),
    ),
    deployedAt: new Date().toISOString(),
    agreements: prev.contractId === contractId ? (prev.agreements ?? []) : [],
  };
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
' "$OUT" "$DEPLOY_LEDGER" "$CONTRACT_ID" "$WASM_HASH" "$TOKEN_ID" "$ASSET" "$ADMIN" "$BUYER" "$SELLER" "$ARBITER" "$NETWORK_PASSPHRASE" "$TXS_JSON"

echo "✅ Listo. Contract ID: $CONTRACT_ID"
echo "   https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
rm -rf "$LOG_DIR"
