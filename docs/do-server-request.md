# Server Request — Marketing Automation (DigitalOcean)

**For:** IT / supervisor  **From:** Marketing  **Date:** 20 Nov 2026
**Purpose:** host the marketing automation system: n8n (workflow automation) and a small rendering service that turns approved content into images and videos. See `docs/marketing-system-spec.md` for the full design.

## 1. Server

| Item | Request |
|---|---|
| Droplet | Use the existing company droplet **if it has spare capacity**; otherwise a **new dedicated droplet** (preferred: isolates marketing tools from other company systems) |
| Region | **SGP1 (Singapore)** |
| Size | **1 vCPU / 1 GB RAM / 25 GB SSD to start** (with a 2 GB swap file). Resize to 1 vCPU / 2 GB if video renders struggle. *(Updated 24 Nov 2026.)* |
| OS | **Ubuntu 24.04 LTS** |
| Software | Nothing pre-installed: `deploy/server-setup.sh` installs Node, PM2, Caddy, FFmpeg and the rest natively (no Docker). See `docs/deploy.md`. |
| Backups | Enable **DigitalOcean weekly backups** (n8n's database holds the workflows and connection settings) |

## 2. Domain names (DNS on linkbot.sg)

Two **A records** pointing to the droplet's public IP:

| Name | Used for |
|---|---|
| `n8n.linkbot.sg` | n8n editor and webhooks (Lark approval buttons call this) |
| `renderer.linkbot.sg` | Rendering service, plus short-lived media links that Instagram downloads posts from |

HTTPS certificates are issued automatically (Let's Encrypt via a Caddy reverse proxy). No certificate purchase needed.

## 3. Network and firewall

| Port | Open to | Why |
|---|---|---|
| 22 (SSH) | **Restricted:** office IP(s) or VPN only, if possible | Server administration |
| 80, 443 (HTTP/HTTPS) | Public | Webhooks from Lark; media fetches from Meta; HTTPS certificate issuance |
| Everything else | **Closed** | |

Outbound internet access is needed to: Lark, Meta (Facebook/Instagram), LinkedIn, TikTok, Anthropic (Claude), Google (Gemini) and Cloudflare APIs.

## 4. Access

- An **SSH login for the marketing automation set-up**: a non-root user with `sudo` (e.g. `deploy`), using an SSH key (no password login).
- Or, if IT prefers to keep shell access in-house, IT runs the provided set-up commands (about 30 minutes, documented step by step).

## 5. Security and operations (handled by us once access is given)

- Secrets (API keys, tokens) live only in a protected `.env` file on the server. Never in GitHub.
- Automatic security updates enabled; n8n protected by its own login.
- n8n database backed up nightly, in addition to DigitalOcean's weekly backups.
- Expected load: light. A few renders a day, scheduled jobs every 5–15 minutes.

## 6. Cost

- **Existing droplet:** no extra cost if capacity allows.
- **New droplet:** DigitalOcean's monthly price for the chosen size, plus about 20% for backups. Check the current price on DigitalOcean's pricing page.
- Everything else on the server (n8n, rendering tools) is free and open source.
