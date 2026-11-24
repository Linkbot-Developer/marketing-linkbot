# Deploying to the DigitalOcean droplet

Deploys use the same pattern as `linkbot-redesign`, on a separate droplet. A GitHub Action (`.github/workflows/deploy.yml`) installs, typechecks and tests the code, then copies one file to the droplet. The droplet unpacks it and restarts the renderer under PM2, behind Caddy. The server never builds.

## What runs where

| Part | Where | How |
|---|---|---|
| **n8n** | n8n Cloud (`flow.linkbot.sg`) | Not on the droplet (decided 23 Nov 2026) |
| **Renderer** (`renderer/`) | Droplet, PM2 app `linkbot-renderer` on `127.0.0.1:8787` | `https://renderer.linkbot.sg` through Caddy; n8n calls it with the Bearer key |
| **Runner** (`runner/`, `npm run daily`) | Droplet, cron | Every hour, `deploy/run-daily.sh` runs only at **17:00 Singapore time**, after the Gemini free quota resets |
| **Secrets** | `/srv/marketing-linkbot/.env` on the droplet only | Created by hand, never in GitHub, never replaced by a deploy |
| **State** | `/srv/marketing-linkbot/data/` | Render outputs (kept 30 days) and the runner's AI quota ledger; deploys keep it |

## One-time set-up (new droplet)

The marketing system has its **own droplet** (Ubuntu 24.04, SGP1, at least 2 vCPU / 4 GB; see `do-server-request.md`), separate from the website's server.

1. **DNS:** an A record for `renderer.linkbot.sg` pointing to the new droplet's IP. With Cloudflare's proxy on, set SSL/TLS to Full (strict).
2. **A deploy key for GitHub Actions**, made on your PC (never reuse the website's key):
   ```bash
   ssh-keygen -t ed25519 -N "" -C github-actions-marketing -f marketing-deploy-key
   ```
   This gives `marketing-deploy-key` (private, goes into GitHub) and `marketing-deploy-key.pub` (public, goes on the server).
3. **Set up the server.** Copy the `deploy/` folder over, then run the script as root with the public key:
   ```bash
   scp -r deploy root@<droplet-ip>:/root/
   ssh root@<droplet-ip> "bash /root/deploy/server-setup.sh \"$(cat marketing-deploy-key.pub)\""
   ```
   It installs everything on a bare droplet: security updates, a 2 GB swap file, the firewall (SSH, 80 and 443 only), a `deploy` user (SSH key only, no sudo), Node 22 with nvm, PM2 (restarts after a reboot, with log rotation), FFmpeg, Edge TTS, Chromium's libraries, Caddy with `deploy/Caddyfile`, and `/srv/marketing-linkbot`. You can run it again safely.
4. **Secrets:** as `deploy`, fill in `/srv/marketing-linkbot/.env` from `.env.example` (the script creates it empty with `chmod 600`). On the server, set:
   - `RENDERER_API_KEY`: `openssl rand -hex 32`. The deploy refuses to run without it, because the renderer would otherwise answer anyone. Put the same value in the n8n credential that calls the renderer.
   - `RENDERER_URL=http://127.0.0.1:8787`
5. **GitHub secrets** (this repo: Settings → Secrets and variables → Actions). These are separate from the website's `DO_*` secrets, so a deploy can't land on the wrong server:
   - `MARKETING_DO_HOST`: the droplet's IP
   - `MARKETING_DO_USER`: `deploy`
   - `MARKETING_DO_SSH_KEY`: the whole contents of `marketing-deploy-key` (the private key). Then delete the file from your PC.
6. **Optional:** restrict SSH (port 22) to the office IP with a DigitalOcean cloud firewall, and enable DigitalOcean weekly backups.

## Deploying

Push to `main` (or go to Actions → CI/CD Pipeline → Run workflow). Changes to content drafts and docs alone don't trigger a deploy.

Each deploy:
1. Runs `npm ci`, the typechecks and the renderer's unit tests. A failure stops it before the server is touched.
2. Bundles the code with its Linux `node_modules`. It refuses to ship `.env`, `data/` or any render output.
3. On the droplet: replaces the code, keeps `.env` and `data/`, installs Chromium for Playwright if the version changed, reloads PM2, installs the cron entry, and waits for `/health`.
4. Posts start, success or failure to the `flow.linkbot.sg` GitHub notification webhook (project "Linkbot Marketing").

## Day to day on the droplet

```bash
pm2 status
pm2 logs linkbot-renderer
tail -f /srv/marketing-linkbot/logs/runner.log
FORCE=1 /srv/marketing-linkbot/deploy/run-daily.sh     # run the daily generation now
curl https://renderer.linkbot.sg/health
```

**Pause:** the runner respects `agent_switches.generator` in the Lark Base Settings table. To stop rendering completely, run `pm2 stop linkbot-renderer`.

**After the first deploy:** render one reel end to end (for example with `npm run run -- --post <a reel post> --dry` from `runner/`). That confirms HyperFrames, FFmpeg and Edge TTS all work on the server, not just images.

Back up `.env` and `data/` together.
