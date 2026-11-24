#!/usr/bin/env bash
# One-time set-up of a NEW Ubuntu 24.04 droplet for the marketing renderer and daily runner (docs/deploy.md).
# Run as root, from the copied deploy/ folder, with the GitHub Actions public key as the argument:
#   bash /root/deploy/server-setup.sh "ssh-ed25519 AAAA... github-actions-marketing"
# Safe to run again (e.g. to add a newer key or after a Node/Playwright version change).
set -euo pipefail

DEPLOY_USER=deploy
APP_DIR=/srv/marketing-linkbot
NODE_VERSION=22.23.4        # keep in step with .github/workflows/deploy.yml
NVM_VERSION=v0.40.3
PLAYWRIGHT_VERSION=1.65.1   # keep in step with renderer/package-lock.json
HERE="$(cd "$(dirname "$0")" && pwd)"
CI_KEY="${1:-}"

[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
as_deploy() { sudo -u "$DEPLOY_USER" -H bash -lc "export NVM_DIR=\$HOME/.nvm; . \$NVM_DIR/nvm.sh; $1"; }

echo "== System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw unattended-upgrades util-linux ffmpeg pipx \
  fonts-noto-color-emoji fonts-liberation debian-keyring debian-archive-keyring apt-transport-https gnupg
dpkg-reconfigure -f noninteractive unattended-upgrades   # automatic security updates

echo "== Swap (2 GB), so a heavy video render can't run the server out of memory"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Firewall: SSH, HTTP, HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== Deploy user '$DEPLOY_USER' (SSH key only, no sudo)"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$AUTH"
# admins who can log in as root can also log in as deploy
[ -f /root/.ssh/authorized_keys ] && cat /root/.ssh/authorized_keys >> "$AUTH"
[ -n "$CI_KEY" ] && echo "$CI_KEY" >> "$AUTH"
sort -u "$AUTH" -o "$AUTH"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$AUTH" && chmod 600 "$AUTH"
[ -n "$CI_KEY" ] || echo "!! No GitHub Actions key given: add it to $AUTH before the first deploy."

echo "== Node $NODE_VERSION (nvm) and PM2 for '$DEPLOY_USER'"
if [ ! -s "/home/$DEPLOY_USER/.nvm/nvm.sh" ]; then
  sudo -u "$DEPLOY_USER" -H bash -c "curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh | bash"
fi
as_deploy "nvm install $NODE_VERSION && nvm alias default $NODE_VERSION && npm install -g pm2"
as_deploy "pm2 install pm2-logrotate >/dev/null && pm2 set pm2-logrotate:max_size 20M >/dev/null && pm2 set pm2-logrotate:retain 10 >/dev/null"
NODE_BIN="$(as_deploy 'dirname "$(command -v node)"')"
# start PM2 (and the renderer) again after a reboot
env "PATH=$NODE_BIN:$PATH" pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" >/dev/null

echo "== Edge TTS (voiceovers) into ~$DEPLOY_USER/.local/bin"
sudo -u "$DEPLOY_USER" -H bash -c "pipx install edge-tts || pipx upgrade edge-tts"

echo "== Libraries Chromium needs (Playwright $PLAYWRIGHT_VERSION)"
env "PATH=$NODE_BIN:$PATH" npx -y "playwright@$PLAYWRIGHT_VERSION" install-deps chromium

echo "== Caddy (HTTPS reverse proxy)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
if [ -f "$HERE/Caddyfile" ]; then
  cp "$HERE/Caddyfile" /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl reload caddy || systemctl restart caddy
fi

echo "== App folder $APP_DIR"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/data" "$APP_DIR/data/renderer-jobs" "$APP_DIR/data/runner-out" "$APP_DIR/logs"
if [ ! -f "$APP_DIR/.env" ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$APP_DIR/.env"
  echo "!! $APP_DIR/.env is empty: fill it in (docs/deploy.md, step 4) before the first deploy."
fi

echo
echo "Done."
as_deploy 'echo "node $(node -v) · pm2 $(pm2 -v)"'
ffmpeg -version | head -1
caddy version
ufw status | head -8
