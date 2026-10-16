#!/usr/bin/env bash
# Prueba las migraciones, el seed y las políticas RLS en un PostgreSQL efímero.
#   - Con Docker: imagen oficial supabase/postgres (roles y esquema auth reales de Supabase).
#   - Sin Docker (o AGROMATCH_DB_MODE=local): binarios locales de PostgreSQL + supabase/tests/auth_stub.sql.
# No usa la red ni credenciales de un proyecto Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${AGROMATCH_DB_MODE:-}"
IMAGE="${AGROMATCH_PG_IMAGE:-supabase/postgres:15.8.1.085}"
PORT="${AGROMATCH_PG_PORT:-54329}"
CONTAINER="agromatch-db-test-$$"
PSQL=()
CLEANUP=()

cleanup() {
  for cmd in "${CLEANUP[@]}"; do eval "$cmd" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

if [[ -z "$MODE" ]]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then MODE=docker; else MODE=local; fi
fi

if [[ "$MODE" == "docker" ]]; then
  echo "# PostgreSQL de Supabase en Docker ($IMAGE)"
  NET=(-p "127.0.0.1:$PORT:$PORT")
  [[ "$(uname -s)" == "Linux" ]] && NET=(--network host)
  docker run -d --rm --name "$CONTAINER" "${NET[@]}" -e POSTGRES_PASSWORD=postgres \
    -v "$ROOT/supabase:/agromatch/supabase:ro" "$IMAGE" postgres -D /etc/postgresql -c port="$PORT" >/dev/null
  CLEANUP+=("docker rm -f $CONTAINER")
  PSQL=(docker exec -i -e PGPASSWORD=postgres "$CONTAINER" psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
  SQL_DIR=/agromatch/supabase
else
  PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  [[ -x "$PG_BIN/initdb" ]] || { echo "No se encontró PostgreSQL (definir PG_BIN) ni Docker." >&2; exit 1; }
  echo "# PostgreSQL local ($PG_BIN) con stub de auth"
  WORK="$(mktemp -d)"
  CLEANUP+=("rm -rf $WORK")
  RUN=()
  if [[ "$(id -u)" == "0" ]]; then
    chown postgres "$WORK"
    RUN=(runuser -u postgres --)
  fi
  "${RUN[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
  "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
  CLEANUP=("${RUN[*]} $PG_BIN/pg_ctl -D $WORK/data -m immediate stop" "${CLEANUP[@]}")
  PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
  SQL_DIR="$ROOT/supabase"
  "${PSQL[@]}" -f "$SQL_DIR/tests/auth_stub.sql"
fi

for _ in $(seq 1 60); do
  if "${PSQL[@]}" -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done

if command -v npx >/dev/null 2>&1 && [[ -d "$ROOT/node_modules" ]]; then
  (cd "$ROOT" && npx tsx --tsconfig tsconfig.node.json scripts/db/export-seed.ts --check)
fi

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "# migración $(basename "$migration")"
  if ! OUT="$("${PSQL[@]}" -1 -f "$SQL_DIR/migrations/$(basename "$migration")" 2>&1)"; then echo "$OUT"; exit 1; fi
  echo "$OUT" | grep -v -e 'already exists, skipping' -e '^$' || true
done

echo "# seed demo"
"${PSQL[@]}" -f "$SQL_DIR/seed.sql"

echo "# pruebas RLS e integridad"
OUTPUT="$("${PSQL[@]}" -f "$SQL_DIR/tests/rls.test.sql" 2>&1)" || { echo "$OUTPUT"; exit 1; }
echo "$OUTPUT" | grep -v '^$'
PASSED="$(echo "$OUTPUT" | grep -c '^ok - ')"
echo "# $PASSED aserciones correctas"
