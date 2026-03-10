#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"

kill_pid_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$file"
}

kill_pattern() {
  local pattern="$1"
  local pids
  pids="$(pgrep -f "$pattern" || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"
}

mkdir -p "$RUN_DIR"

kill_pid_file "$RUN_DIR/web.pid"
kill_pid_file "$RUN_DIR/api.pid"
kill_pid_file "$RUN_DIR/indexer.pid"
kill_pid_file "$RUN_DIR/verifier.pid"

kill_pattern "$ROOT/apps/web.*next dev -p 3000"
kill_pattern "$ROOT/services/api.*tsx src/server.ts"
kill_pattern "$ROOT/services/indexer-stream.*tsx src/index.ts"
kill_pattern "$ROOT/services/verifier.*tsx src/index.ts"

kill_port 3000
kill_port 8080
kill_port 8081

echo "Stopped Rayscan dev services."
