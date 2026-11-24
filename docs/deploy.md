# Deploying to the DigitalOcean droplet

Deploys use the same pattern as `linkbot-redesign`. A GitHub Action (`.github/workflows/deploy.yml`) installs, typechecks and tests the code, then copies one file to the droplet. The droplet unpacks it and restarts the renderer under PM2, behind Caddy. The server never builds.

## What runs where

| Part | Where | How |
|---|---|---|
| **n8n** | n8n Cloud (`flow.linkbot.sg`) | Not on the droplet (decided 23 Nov 2026) |
| **Renderer** (`renderer/`) | Droplet, PM2 app `linkbot-renderer` on `127.0.0.1:8787` | `https://renderer.linkbot.sg` through Caddy; n8n calls it with the Bearer key |
| **Runner** (`runner/`, `npm run daily`) | Droplet, cron | Every hour, `deploy/run-daily.sh` runs only at **17:00 Singapore time**, after the Gemini free quota resets |
| **Secrets** | `/srv/marketing-linkbot/.env` on the droplet only | Created by hand, never in GitHub, never replaced by a deploy |
| **State** | `/srv/marketing-linkbot/data/` | Render outputs (kept 30 days) and the runner's AI quota ledger; deploys keep it |

## One-time set-up

1. **DNS:** an A record for `renderer.linkbot.sg` pointing to the droplet's IP. With Cloudflare's proxy on, set SSL/TLS to Full (strict).
2. **Server packages:** copy `deploy/server-setup.sh` to the droplet and run it as the deploy user: `bash server-setup.sh`. It installs FFmpeg, Edge TTS (pipx), Chromium's libraries and the `/srv/marketing-linkbot` folder. It expects nvm, Node 22, PM2 and Caddy, which the website deploy already set up.
3. **Secrets:** create `/srv/marketing-linkbot/.env` from `.env.example`, filling in the same keys as your local `.env`, then run `chmod 600 .env`. On the server, set:
   - `RENDERER_API_KEY`: a long random value (`openssl rand -hex 32`). Put the same value in the n8n credential that calls the renderer.
   - `RENDERER_URL=http://127.0.0.1:8787`
4. **Caddy:** add the block from `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, then run `sudo systemctl reload caddy`.
5. **GitHub secrets** (this repo: Settings → Secrets and variables → Actions): `DO_HOST`, `DO_USER` and `DO_SSH_KEY`, the same ones `linkbot-redesign` uses. Skip this if they're set at organisation level.
6. **Firewall:** only 22, 80 and 443 open (see `do-server-request.md`). The renderer listens on 127.0.0.1 only.

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
