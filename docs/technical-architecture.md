# Technical Architecture & Build Workflow (proposal, 20 Nov 2026)

How the system in [`marketing-system-spec.md`](marketing-system-spec.md) is actually built: which parts live where, in what language, and how we develop, test and deploy them.

## 1. Short answer

| Part | Built in | Language | Where it runs |
|---|---|---|---|
| **Orchestration** (W1–W12: schedules, approvals, publishing, analytics) | **n8n**, a visual workflow editor in the browser | n8n nodes, plus small **JavaScript** "Code" nodes | n8n on the DigitalOcean droplet (Docker) |
| **Renderer service** (images with overlays, carousels, Reels/TikToks, Stories) | **VS Code** | **TypeScript (Node.js 22)** | Docker container on the same droplet |
| **AI agents** (Planner, Copywriter, Brand Checker, Analyst) | VS Code (prompts as Markdown, plus JSON schemas) | Markdown / JSON; called from n8n via the Claude API | Claude API |
| **Templates** (brand theme, carousel slides, video scenes) | VS Code | **HTML + CSS** (HyperFrames compositions for video) | Inside the renderer |
| **Set-up and test scripts** | VS Code | TypeScript / JavaScript (Node) | Your PC |
| **Data, approvals, dashboard** | Lark Base, Lark bot, Docs | — (configuration) | Lark |

**Why TypeScript rather than Python?** The core rendering tools (Playwright, HyperFrames) are Node.js tools. n8n's Code nodes are JavaScript, and the repo's scripts are already Node. One language end to end keeps it simpler. Python appears in one place only: **Edge TTS**, whose official version is a Python command-line tool that the renderer calls inside its container.

## 2. The free media tools: what each one is

None of these needs an account or an API key. They're software installed inside the renderer container.

| Tool | What it is | What we use it for |
|---|---|---|
| **HTML templates + Playwright** | Web pages in Linkbot's brand (Inter font, navy/blue/white, logo slot), opened by a headless Chrome and saved as PNG | Carousel slides, quote cards, text overlays on AI images, logo placement. Deterministic: the same input gives the same output. |
| **HyperFrames** (by HeyGen, open source) | Writes a video as an HTML/CSS/JS timeline, then renders it through a headless browser to MP4 (`npx hyperframes render`) | Reels, TikToks and Stories: animated text, workflow diagrams, AI images with motion, end cards |
| **FFmpeg** | The standard open-source video and audio tool | Merging voiceover and music, trimming, converting to each platform's specs, extracting frames for the visual quality check |
| **Edge TTS** | Microsoft Edge's online read-aloud voices, via the open-source `edge-tts` Python CLI | Voiceovers (e.g. an English-UK neural voice). Free but unofficial, so it may change; we can swap it for a paid voice later. |
| **Gemini / Cloudflare Workers AI** | Image-generation APIs (free tiers) | The "AI image" layer under overlays. The renderer adds text and the logo afterwards. |

## 3. How one post gets made (technical flow)

```
n8n W2 (Generate)
 ├─ 1. Claude API: Copywriter → JSON (caption, slides/script, visual brief)   [schema-validated]
 ├─ 2. Gemini API: image(s) from visual_brief.prompt  ──(fail/quota)──► Cloudflare Workers AI
 ├─ 3. Renderer POST /render/{image|carousel|reel|story}
 │      • Playwright: HTML template + AI image + overlay text + logo → PNG(s)
 │      • reel: HyperFrames composition → MP4; Edge TTS voice → FFmpeg mix → final MP4
 │      • uploads results to Lark Drive (platform folder) → returns file tokens
 │      • later, at publish time: /media/<token> gives Instagram an expiring public link
 ├─ 4. Claude API: Brand Checker (text) + vision QC on PNGs / sampled frames
 └─ 5. Lark: update Base record, send approval card (W4)
```

## 4. Repository and development workflow

```
marketing-linkbot/
├── renderer/            # TypeScript service: src/, templates are loaded from ../templates
│   ├── src/server.ts    # HTTP API: /health, /render/*
│   ├── src/render/      # image.ts, carousel.ts, reel.ts, story.ts
│   ├── Dockerfile       # Node 22 + Chromium (Playwright) + FFmpeg + Python edge-tts + HyperFrames
│   └── test/            # vitest + snapshot images
├── templates/brand|carousel|video/
├── agents/              # prompts + schemas/ (JSON Schema per agent output)
├── n8n/workflows/       # exported workflow JSON (W1–W12)
├── docker-compose.yml   # n8n + renderer (+ Postgres for n8n)
└── scripts/             # check-connections, lark-mcp, seed data, deploy helpers
```

**Day-to-day loop**
1. **Code in VS Code.** Claude Code writes and changes the renderer, templates and prompts; you review.
2. **Run locally:** `npm run dev` in `renderer/` renders sample posts into `out/` so you can see them. This is fast and needs no Docker.
3. **Test:** `npm test` runs unit tests and image snapshots, so a template change that breaks the layout gets caught.
4. **Build workflows in n8n's editor** (browser), test them on seed records, then **export to `n8n/workflows/`** and commit.
5. **Commit and push to GitHub.** Small commits per feature (spec §9).
6. **Deploy to DigitalOcean:** automatic on push to `main` (GitHub Actions → PM2 behind Caddy, the same pattern as the website). See [`deploy.md`](deploy.md).

## 5. What your PC needs

| Tool | Status | Action |
|---|---|---|
| VS Code | ✅ installed (1.147) | none |
| Git | ✅ | none |
| Node.js 22 | ✅ installed via nvm (22.13.0), but **20.0.0 is active** | run `nvm use 22.13.0` (Node 20 is past end-of-life) |
| Python 3 | ✅ (`py`) | only needed to test Edge TTS locally |
| FFmpeg | ❌ | install (`winget install Gyan.FFmpeg`) for local video tests |
| Docker Desktop | ❌ not installed | optional locally (needed only to test the full stack on this PC); required on the server |

## 6. Decisions this proposal assumes

- **n8n self-hosted on the DigitalOcean droplet** (free, next to the renderer). n8n Cloud remains possible, but the droplet is needed anyway.
- **TypeScript** for all code; Python only for the Edge TTS command line.
- Build order follows the spec phases. Phase 1 starts with the renderer skeleton and Docker Compose, which can be built and tested on this PC before the server is ready.
