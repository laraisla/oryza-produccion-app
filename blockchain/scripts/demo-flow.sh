#!/usr/bin/env bash
# ============================================================
# Acuerdo comercial de prueba de punta a punta en Stellar TESTNET:
#   create (comprador) → accept (vendedor) → deposit (comprador)
#   → release (comprador)   [o --refund: reembolso por el árbitro]
#
# Usa el contrato y las cuentas registradas por deploy-testnet.sh.
# Las condiciones comerciales se hashean (SHA-256 de JSON canónico) y
# solo el hash va a la cadena. Agrega el acuerdo, sus hashes de
# transacción y el estado final leído de la cadena a
# blockchain/deployments/testnet.json.
#
# Uso: bash blockchain/scripts/demo-flow.sh [orden.json] [--refund]
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/deployments/testnet.json"
ORDER_FILE="$ROOT/demo/orden-demo.json"
FINAL="release"
for arg in "$@"; do
  case "$arg" in
    --refund) FINAL="refund" ;;
    *) ORDER_FILE="$arg" ;;
  esac
done
LOG_DIR="$(mktemp -d)"
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NETWORK="testnet"
json_get() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(process.argv[2].split(".").reduce((o,k)=>o[k],j))' "$1" "$2"; }

CONTRACT_ID="$(json_get "$OUT" contractId)"
TOKEN_ID="$(json_get "$OUT" testAsset.contractId)"
BUYER="$(json_get "$OUT" accounts.buyer)"
SELLER="$(json_get "$OUT" accounts.seller)"
ARBITER="$(json_get "$OUT" accounts.arbiter)"

ORDER_REF="$(json_get "$ORDER_FILE" orden)"
TOTAL_USD="$(json_get "$ORDER_FILE" totalUsd)"
AMOUNT="$(node -e 'console.log((BigInt(Math.round(Number(process.argv[1])*100))*100000n).toString())' "$TOTAL_USD")" # 7 decimales
TERMS_HASH="$(node "$ROOT/scripts/terms-hash.mjs" "$ORDER_FILE")"
DEADLINE="$(( $(date +%s) + 30 * 86400 ))"

echo "▶ Orden $ORDER_REF · $TOTAL_USD AGROUSD (prueba) · hash condiciones $TERMS_HASH"

invoke() { # invoke <identidad> <función> [args...]
  local who="$1" fn="$2"; shift 2
  stellar contract invoke --id "$CONTRACT_ID" --network "$NETWORK" --source-account "$who" -- "$fn" "$@"
}

ID="$(run_tx create invoke agroglobal-buyer create \
  --buyer "$BUYER" --seller "$SELLER" --arbiter "$ARBITER" --token "$TOKEN_ID" \
  --amount "$AMOUNT" --terms_hash "$TERMS_HASH" --order_ref "$ORDER_REF" --deadline "$DEADLINE" | tail -1)"
echo "  acuerdo #$ID"

run_tx accept invoke agroglobal-seller accept --id "$ID" >/dev/null
run_tx deposit invoke agroglobal-buyer deposit --id "$ID" >/dev/null
if [[ "$FINAL" == "release" ]]; then
  run_tx release invoke agroglobal-buyer release --id "$ID" --by "$BUYER" >/dev/null
else
  run_tx refund invoke agroglobal-arbiter refund --id "$ID" --by "$ARBITER" >/dev/null
fi

echo "▶ Verificación en cadena"
STATE="$(invoke agroglobal-buyer get --id "$ID" 2>/dev/null | tail -1)"
VERIFIED="$(invoke agroglobal-buyer verify_terms --id "$ID" --terms_hash "$TERMS_HASH" 2>/dev/null | tail -1)"
bal() { stellar contract invoke --id "$TOKEN_ID" --network "$NETWORK" --source-account agroglobal-buyer -- balance --id "$1" 2>/dev/null | tail -1 | tr -d '"'; }
BAL_SELLER="$(bal "$SELLER")"; BAL_ESCROW="$(bal "$CONTRACT_ID")"; BAL_BUYER="$(bal "$BUYER")"
echo "  estado: $STATE"
echo "  verify_terms: $VERIFIED"
echo "  saldos (stroops): vendedor=$BAL_SELLER contrato=$BAL_ESCROW comprador=$BAL_BUYER"

node -e '
  const [out, id, orderRef, termsHash, amount, state, verified, txs, balSeller, balEscrow, balBuyer] = process.argv.slice(1);
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(out, "utf8"));
  const explorer = "https://stellar.expert/explorer/testnet/tx/";
  j.agreements = j.agreements ?? [];
  j.agreements.push({
    id: Number(id),
    orderRef,
    termsHash,
    amount,
    onChainState: JSON.parse(state),
    termsVerified: verified === "true",
    balancesAfter: { seller: balSeller, escrowContract: balEscrow, buyer: balBuyer },
    transactions: Object.fromEntries(
      Object.entries(JSON.parse(txs)).map(([k, h]) => [k, { hash: h, url: explorer + h }]),
    ),
    recordedAt: new Date().toISOString(),
  });
  fs.writeFileSync(out, JSON.stringify(j, null, 2) + "\n");
' "$OUT" "$ID" "$ORDER_REF" "$TERMS_HASH" "$AMOUNT" "$STATE" "$VERIFIED" "$(txs_json)" "$BAL_SELLER" "$BAL_ESCROW" "$BAL_BUYER"

echo "✅ Acuerdo #$ID registrado en $OUT"
rm -rf "$LOG_DIR"
