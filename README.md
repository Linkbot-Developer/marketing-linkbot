# marketing-linkbot

Marketing workspace for **Linkbot**: content, campaigns, scripts and automations used by the marketing team.

## Getting started

1. Clone the repo:
   ```bash
   git clone https://github.com/Linkbot-Developer/marketing-linkbot.git
   ```
2. Copy `.env.example` to `.env` and fill in the API keys and tokens you need.
   `.env` is git-ignored and must never be committed.

## Requirements

- Node.js **22** (via nvm: `nvm use 22.13.0`)
- Python 3 (for Edge TTS)
- Git
- FFmpeg

## Setting up on a new computer

What lives where, and what each person must do once:

| Item | Where it lives | In GitHub? | On a new computer |
|---|---|---|---|
| Code, prompts, templates, docs | This repo | ✅ yes | `git clone` |
| npm packages (Claude SDK, Playwright, HyperFrames) | `node_modules/` and `renderer/node_modules/` | ❌ (listed in `package.json`) | `npm install` and `npm install --prefix renderer` |
| Chromium for Playwright | Your user folder (`%LOCALAPPDATA%\ms-playwright`) | ❌ | `npx --prefix renderer playwright install chromium` |
| FFmpeg | Installed on the PC | ❌ | `winget install Gyan.FFmpeg` |
| Edge TTS | Python packages on the PC | ❌ | `py -m pip install --user edge-tts` |
| API keys and tokens | `.env` on that PC only | ❌ never | Get your own keys or receive `.env` securely, never by chat or email |

Then run `npm run check` to confirm every connection.
On the production server none of this is needed per person: see [`docs/deploy.md`](docs/deploy.md). A push to `main` deploys the renderer and the daily runner to the DigitalOcean droplet (GitHub Actions → PM2, behind Caddy).

**Windows PowerShell says `npm.ps1 cannot be loaded`?** Use `npm.cmd run check`, or run the command in Command Prompt or Git Bash. To fix it permanently for your user, an admin or you can run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell.

## Secrets

All API keys and tokens live in `.env` (local only). Add the variable *name* (without a value) to `.env.example` so others know what to set.
