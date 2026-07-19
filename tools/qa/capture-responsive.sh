#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_url="${KAKI_SURF_QA_URL:-http://127.0.0.1:9876/index.html}"
capture_dir="${KAKI_SURF_RESPONSIVE_DIR:-$project_root/docs/images/qa-responsive}"
debug_port="${KAKI_SURF_CDP_PORT:-9224}"
browser_profile="$(mktemp -d /tmp/kaki-responsive-cdp.XXXXXX)"

chromium \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --disable-breakpad \
  --disable-crash-reporter \
  --hide-scrollbars \
  --remote-debugging-port="$debug_port" \
  --user-data-dir="$browser_profile" \
  about:blank >/tmp/kaki-responsive-chromium.log 2>&1 &
browser_pid=$!
trap 'kill "$browser_pid" 2>/dev/null || true' EXIT

for _attempt in {1..40}; do
  if curl --silent --fail "http://127.0.0.1:$debug_port/json/list" >/dev/null; then
    break
  fi
  sleep 0.1
done

KAKI_SURF_CDP_URL="http://127.0.0.1:$debug_port" \
KAKI_SURF_QA_URL="$base_url" \
KAKI_SURF_RESPONSIVE_DIR="$capture_dir" \
node "$project_root/tools/qa/capture-responsive.mjs"
