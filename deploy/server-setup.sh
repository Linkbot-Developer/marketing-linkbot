#!/usr/bin/env bash
# One-time set-up of the droplet for the marketing renderer. Run it as the deploy user (the one in DO_USER),
# which needs sudo. Safe to run again. It assumes what linkbot-redesign already set up on this server:
# nvm with Node 22, PM2 (with `pm2 startup`), Caddy and curl.
#   bash deploy/server-setup.sh
set -euo pipefail

APP_DIR=/srv/marketing-linkbot
PLAYWRIGHT_VERSION=1.65.1   # keep in step with renderer/package-lock.json

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use default >/dev/null
command -v node >/dev/null || { echo "Node is missing: install Node 22 with nvm first."; exit 1; }
command -v pm2 >/dev/null || { echo "PM2 is missing: npm install -g pm2, then pm2 startup."; exit 1; }

echo "== System packages: FFmpeg (video), pipx (Edge TTS), fonts"
sudo apt-get update -y
sudo apt-get install -y ffmpeg pipx curl util-linux fonts-noto-color-emoji fonts-liberation

echo "== Edge TTS (voiceovers) into ~/.local/bin"
pipx install edge-tts || pipx upgrade edge-tts
pipx ensurepath

echo "== Libraries Chromium needs (Playwright)"
sudo env "PATH=$PATH" npx -y "playwright@$PLAYWRIGHT_VERSION" install-deps chromium

echo "== App folder"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
mkdir -p "$APP_DIR/data/renderer-jobs" "$APP_DIR/data/runner-out" "$APP_DIR/logs"

if [ ! -f "$APP_DIR/.env" ]; then
  echo
  echo "Next: create $APP_DIR/.env from .env.example (docs/deploy.md), then: chmod 600 $APP_DIR/.env"
fi
echo "Done. Versions:"
node -v; pm2 -v; ffmpeg -version | head -1; "$HOME/.local/bin/edge-tts" --version 2>/dev/null || true
