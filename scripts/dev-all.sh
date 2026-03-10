#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"

mkdir -p "$RUN_DIR"

"$ROOT/scripts/dev-stop.sh" >/dev/null 2>&1 || true

set -a
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
fi
set +a

pnpm --dir "$ROOT" infra:up >/dev/null
rm -rf "$ROOT/apps/web/.next"

start_service() {
  local name="$1"
  local command="$2"
  local logfile="$RUN_DIR/$name.log"
  local pidfile="$RUN_DIR/$name.pid"

  nohup bash -lc "cd '$ROOT' && set -a && [ -f '$ROOT/.env' ] && source '$ROOT/.env'; set +a; exec $command" \
    >"$logfile" 2>&1 &
  local pid=$!
  echo "$pid" >"$pidfile"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-40}"
  local delay="${3:-0.5}"

  for ((i=1; i<=attempts; i+=1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

start_service "api" "pnpm --filter @rayscan/api dev"
start_service "indexer" "pnpm --filter @rayscan/indexer-stream dev"
start_service "web" "pnpm --filter @rayscan/web dev"

wait_for_http "http://127.0.0.1:8080/health" || {
  echo "API failed to start. Check $RUN_DIR/api.log"
  exit 1
}

wait_for_http "http://127.0.0.1:3000" || {
  echo "Web failed to start. Check $RUN_DIR/web.log"
  exit 1
}

if [[ -f "$RUN_DIR/indexer.pid" ]]; then
  indexer_pid="$(cat "$RUN_DIR/indexer.pid" 2>/dev/null || true)"
  if [[ -n "${indexer_pid:-}" ]] && ! kill -0 "$indexer_pid" 2>/dev/null; then
    echo "Indexer failed to stay running. Check $RUN_DIR/indexer.log"
    exit 1
  fi
fi

cat <<EOF
Rayscan dev stack is running.

Web:      http://127.0.0.1:3000
API:      http://127.0.0.1:8080
Logs:     $RUN_DIR/web.log
          $RUN_DIR/api.log
          $RUN_DIR/indexer.log

Stop it with:
pnpm dev:stop
EOF
