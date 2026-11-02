# Funciones compartidas por los scripts de Testnet. Se usa con `source`.
# Requiere que el script defina LOG_DIR antes de cargarlo.

# "etiqueta=hash" por línea. Archivo (no array) porque run_tx también se
# usa dentro de $(...), que corre en una subshell.
TXS_FILE="$LOG_DIR/txs"
: >"$TXS_FILE"

# Ejecuta un comando del CLI que envía transacciones y registra sus hashes.
# El CLI informa "Signing transaction: <hash>" por cada transacción enviada
# (deploy envía dos: subida del WASM y creación de la instancia).
run_tx() {
  local label="$1"; shift
  local log="$LOG_DIR/$label.log"
  if ! "$@" >"$log.out" 2>"$log"; then
    cat "$log" "$log.out" >&2
    return 1
  fi
  local hashes n=0
  hashes="$(grep -oE 'Signing transaction: [0-9a-f]{64}' "$log" | grep -oE '[0-9a-f]{64}' || true)"
  for hash in $hashes; do
    n=$((n + 1))
    local key="$label"; [[ $n -gt 1 ]] && key="${label}_$n"
    echo "$key=$hash" >>"$TXS_FILE"
    echo "  ✔ $key  tx $hash" >&2
  done
  [[ $n -eq 0 ]] && echo "  ✔ $label  (sin transacción nueva: ya existía)" >&2
  cat "$log.out"
}

# Imprime como objeto JSON los hashes registrados: {"etiqueta":"hash",...}
txs_json() {
  node -e '
    const lines = require("fs").readFileSync(0, "utf8").trim().split("\n").filter(Boolean);
    console.log(JSON.stringify(Object.fromEntries(lines.map((l) => l.split("=")))));
  ' <"$TXS_FILE"
}
