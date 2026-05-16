#!/usr/bin/env bash
# Fire a sample traffic event so a frontend dev can see the whole flow
# (n8n -> gateway -> optimizer -> realtime -> web-admin) without crafting
# a JSON body or remembering which URL is the n8n webhook vs the gateway.
#
# Usage:
#   ./trigger-event.sh                  # default: hits n8n on localhost:5678
#   ./trigger-event.sh --direct         # bypass n8n, POST straight to gateway
#   ./trigger-event.sh --payload <file> # use a custom JSON file
#   ./trigger-event.sh --host <url>     # override target host
#
# Requires: curl, jq (jq optional — only used for pretty output if present).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PAYLOAD="${SCRIPT_DIR}/../sample-data/traffic-event.json"

MODE="n8n"
HOST=""
PAYLOAD="${DEFAULT_PAYLOAD}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --direct) MODE="direct"; shift ;;
    --host)   HOST="$2"; shift 2 ;;
    --payload) PAYLOAD="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "${PAYLOAD}" ]]; then
  echo "Payload file not found: ${PAYLOAD}" >&2
  exit 1
fi

if [[ "${MODE}" == "direct" ]]; then
  TARGET="${HOST:-http://localhost:3002}/api/v1/webhook"
  echo "[trigger] mode=direct -> ${TARGET}"
  EMAIL="${GATEWAY_AUTH_EMAIL:-admin@logiflow.app}"
  PASSWORD="${GATEWAY_AUTH_PASSWORD:-Admin2026!}"
  echo "[trigger] logging in as ${EMAIL}"
  TOKEN="$(curl -fsS -X POST "${HOST:-http://localhost:3002}/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
    | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
  if [[ -z "${TOKEN}" ]]; then
    echo "[trigger] failed to obtain JWT" >&2
    exit 1
  fi
  echo "[trigger] POST ${TARGET}"
  curl -fsS -X POST "${TARGET}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -H 'X-Correlation-Id: dev-trigger-direct' \
    --data @"${PAYLOAD}"
else
  TARGET="${HOST:-http://localhost:5678}/webhook/logiflow/traffic-event"
  echo "[trigger] mode=n8n -> ${TARGET}"
  curl -fsS -X POST "${TARGET}" \
    -H 'Content-Type: application/json' \
    -H 'X-Correlation-Id: dev-trigger-n8n' \
    --data @"${PAYLOAD}"
fi

echo
echo "[trigger] done. Watch the web-admin or:"
echo "  docker logs -f logiflow-realtime  # see route:update emit"
echo "  docker logs -f logiflow-gateway   # see webhook handling"
