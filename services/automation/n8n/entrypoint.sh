#!/bin/sh
# n8n container entrypoint:
#   1. Import every workflow JSON that's mounted into /workflows. n8n's
#      import command is idempotent — re-importing an existing workflow
#      updates it in place, so running on every boot is safe.
#   2. Hand off to the normal `n8n start` command.
#
# The mounted JSON files declare `"active": true`, so workflows come up
# enabled without manual activation.

set -e

if [ -d /workflows ] && [ "$(ls -A /workflows 2>/dev/null)" ]; then
  echo "[entrypoint] importing workflows from /workflows"
  # --separate handles a directory of JSONs; tolerate non-zero exit so a
  # bad file in /workflows doesn't block the server from starting.
  n8n import:workflow --separate --input=/workflows || \
    echo "[entrypoint] workflow import reported errors; continuing"

  # n8n's import command ignores the "active" flag in the JSON. Activate
  # via CLI. n8n 1.x supports `update:workflow --all --active=true`; n8n
  # 2.x replaced it with per-id `publish:workflow`. Try the 1.x command
  # first (it short-circuits on 2.x with a clear error), then fall back.
  echo "[entrypoint] activating imported workflows"
  if n8n update:workflow --all --active=true >/tmp/activate.log 2>&1; then
    echo "[entrypoint]   activated via update:workflow --all"
  else
    echo "[entrypoint]   update:workflow --all unavailable, falling back to publish:workflow per-id"
    n8n list:workflow --onlyId 2>/dev/null | while IFS= read -r wf_id; do
      [ -z "$wf_id" ] && continue
      n8n publish:workflow --id="$wf_id" >/dev/null 2>&1 \
        && echo "[entrypoint]   published $wf_id" \
        || echo "[entrypoint]   FAILED to publish $wf_id"
    done
  fi
else
  echo "[entrypoint] no /workflows directory or it is empty; skipping import"
fi

echo "[entrypoint] starting n8n server"
exec n8n start
