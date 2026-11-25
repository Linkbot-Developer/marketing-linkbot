#!/usr/bin/env bash
# The daily runner on the droplet (runner/README.md: npm run daily).
# Started by n8n (W2 - Daily generation → renderer POST /jobs/daily, which sets FORCE=1) at 17:00 Singapore time,
# an hour after the Gemini free quota resets (midnight US Pacific ≈ 16:00 SGT). No server cron is used.
# Without FORCE=1 it only acts during the 17:00 hour. Run it by hand any time with FORCE=1 deploy/run-daily.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_HOUR="${RUN_HOUR:-17}"

if [ "${FORCE:-0}" != 1 ] && [ "$(TZ=Asia/Singapore date +%H)" != "$RUN_HOUR" ]; then
  exit 0
fi

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use default >/dev/null
export PATH="$HOME/.local/bin:$PATH"
# the runner talks to the renderer that PM2 keeps running
export RENDERER_URL="http://127.0.0.1:8787"

# never two runs at once (a long batch of reels can pass the hour)
exec 9>"$APP_DIR/data/run-daily.lock"
if ! flock -n 9; then
  echo "$(date -Is) a run is still going, skipping"
  exit 0
fi

echo "=== $(date -Is) daily run"
cd "$APP_DIR/runner"
node --import tsx src/cli.ts --daily

# rendered files are kept 30 days (posts are proposed at least 7 days ahead, then published from these files)
find "$APP_DIR/data/renderer-jobs" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} + || true
# keep the log small
tail -n 5000 "$APP_DIR/logs/runner.log" > "$APP_DIR/logs/runner.log.tmp" 2>/dev/null && mv "$APP_DIR/logs/runner.log.tmp" "$APP_DIR/logs/runner.log" || true
