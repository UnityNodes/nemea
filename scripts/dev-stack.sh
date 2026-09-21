#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FAKE_PORT="${FAKE_CMC_PORT:-47800}"
API_PORT="${API_PORT:-4000}"

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

FAKE_CMC_PORT="$FAKE_PORT" pnpm --silent tsx apps/api/src/dev/dev-server.ts &
pids+=($!)

for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:${FAKE_PORT}/v1/key/info" >/dev/null && break
  sleep 0.25
done

NODE_ENV=development \
PORT="$API_PORT" \
CMC_API_KEY="dev-fake-key-not-real" \
CMC_BASE_URL="http://127.0.0.1:${FAKE_PORT}" \
SESSION_SECRET="dev-only-session-secret-dev-only-session-secret" \
INTERNAL_API_SECRET="dev-only-internal-secret" \
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:3000}" \
PGLITE_DIR="${PGLITE_DIR:-.pglite}" \
pnpm --silent --filter @nemea/api start &
pids+=($!)

echo "dev stack: fake CMC :${FAKE_PORT} (development only, NOT real market data), API :${API_PORT}"
wait
