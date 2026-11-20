# Project Spec: Linkbot Automated Marketing Content System

**Status:** v1.0, merged on 19 Nov 2026 from the original system spec and the decisions made with Linkbot marketing.
**This file says *how the system is built*.** [`CLAUDE.md`](../CLAUDE.md) says *what we say and how we look* (brand, tone, audience, offer, compliance). If the two conflict on brand or content rules, CLAUDE.md wins. If they conflict on system behaviour, this file wins.
When something here conflicts with current official API docs (APIs change often), follow the docs and record what changed in §12.

---

## 1. Goal

A closed-loop system that plans, creates, schedules, publishes, measures and reports on Linkbot's social content on **Facebook, Instagram, LinkedIn and TikTok** (images, carousels, Reels/short video, Stories), with **no human involvement except one step: approving content**.

```
Plan → Generate → Quality check → [HUMAN APPROVES] → Schedule & publish → Collect analytics → Report & learn → (back to Plan)
```

### Hard rules (never break these)

1. **Nothing is ever published without explicit human approval** from the approver (**marketing@linkbot.sg only**, via their Lark account). If a post isn't approved before its deadline, it's marked `skipped`. Nothing ever auto-posts as a fallback.
2. **A global pause switch** (`pause_publishing` in Lark Base Settings) stops all scheduling and publishing immediately.
3. **Every failure alerts the approver** through the Lark bot. No silent failures.
4. **Secrets live only in `.env`** (and in n8n's credential store). Never committed, logged, or put in prompts or Lark messages.
5. **Prefer free and open-source tools.** Ask before adding anything that costs money. Paid upgrades belong to a later phase.
6. **Brand and compliance rules come from `CLAUDE.md`:** British English, no invented claims, approved CTAs, AI-content labelling, and so on.

---

## 2. Stack

| Layer | Tool | Role | Cost |
|---|---|---|---|
| Human workspace | **Lark Base** | Content DB plus calendar, Kanban and gallery views; Settings; Reports; CRM (later) | Lark plan |
| | **Lark Docs / Wiki** | Brand brief (read by the planner), weekly reports | Lark plan |
| | **Lark bot** (custom app `cli_…` in `.env`) | Approval cards (Approve / Reject / Regenerate), alerts, report summaries | Lark plan |
| | **Lark Base Dashboard** | Live analytics | Lark plan |
| Orchestrator | **n8n**: hosting **decision pending** (Cloud or self-hosted on the DO droplet, see §11) | All schedules, webhooks, glue | Cloud: paid after trial · self-host: free |
| Server | **DigitalOcean droplet** (company's, to confirm), Docker Compose | Renderer service (and n8n if self-hosted) | Existing |
| Text "brain" | **Claude API**: `claude-opus-5-5` (model ID from env) | Planning, copywriting, brand/QC check (text **and** vision), reports | Pay per use (~US$10–20/month estimated, §6) |
| Images | **Gemini API** image model (free tier, **on trial**) → fallback **Cloudflare Workers AI** | Image generation | Free tiers |
| Video | **HyperFrames** (+ FFmpeg, Node ≥ 22), **to be verified in phase 2** | Reels, TikTok and Stories from HTML compositions | Free / OSS |
| Voice | **Edge TTS** (on trial; unofficial route, may be unreliable) | Voiceovers | Free |
| Carousels and overlays | **HTML templates → PNG** via headless Chromium (Playwright) | On-brand slides, overlay text, logo placement | Free / OSS |
| Storage | **Lark Drive** (Marketing › Social Media › FB / IG / LinkedIn / TikTok) | Single home for every rendered asset; previews attached in Base | Lark plan |
| Public media links | **Renderer `/media/<token>` endpoint** (DO droplet) | Streams a file from Lark Drive for platforms that fetch by URL (Instagram); unguessable, expiring tokens | Free |
| Publishing | **n8n → each platform's official API** (no Postiz) | Meta Graph API (FB and IG), LinkedIn Posts API, TikTok Content Posting API | Free |
| Later (paid, optional) | Higgsfield / HeyGen (AI presenter) / Creatomate; Hermes Agent | Upgrades once the free stack is proven | Paid |

---

## 3. Architecture

```
┌──────────────────────── Lark (human workspace) ─────────────────────────┐
│  Base (content DB)   Docs/Wiki (brief, reports)   Bot cards   Dashboard  │
└───────────────▲─────────────────────────────────┬────────────────────────┘
                │ API (records, cards)             │ webhooks (card clicks, Base automations)
┌───────────────┴─────────────────────────────────▼────────────────────────┐
│                               n8n (orchestrator)                          │
└──────┬───────────────────────────┬──────────────────────┬────────────────┘
       │                           │                      │
┌──────▼─────────────┐   ┌─────────▼────────┐   ┌─────────▼────────────────────┐
│ CREATE             │   │ STORE            │   │ PUBLISH (official APIs)       │
│ Claude (copy, QC)  │──▶│ Lark Drive       │──▶│ Meta Graph: FB Page, IG       │
│ Gemini / CF images │   │ (public URLs)    │   │ LinkedIn Posts API            │
│ Renderer service   │   └──────────────────┘   │ TikTok Content Posting API    │
│ (DO droplet):      │                          │ → insights back to n8n        │
│  carousels, video  │                          └───────────────────────────────┘
└────────────────────┘
```

### Design decisions
- **n8n is the backbone, not an agent.** It must be predictable and debuggable. LLMs are called only for creative or analytical steps, always with structured JSON output and schema validation.
- **The renderer is a separate service** (a small Node HTTP API in its own container on the DO droplet) that n8n calls over HTTPS with an API key. Heavy tools (Chromium, FFmpeg, HyperFrames) never run inside n8n. **n8n Cloud can't run them anyway, so the droplet is required whatever the n8n hosting decision.**
- **Push, not poll, for Lark.** Card clicks and Base automations call n8n webhooks. Scheduled jobs are used only for time-based triggers.
- **Model IDs, prompts and templates are configuration** (env vars, `agents/`, `templates/`), not hard-coded.
- **Media are platform-specific renders:** one content record per platform post, each with its own format and size (CLAUDE.md and `agents/copywriter.md` platform specs).

---

## 4. Data model (Lark Base)

### Table `Content` (one record = one post on one platform)

| Field | Type | Notes |
|---|---|---|
| `post_id` | Text | e.g. `W49-LI-01` (week, platform, number) |
| `platform` | Single select | `facebook`, `instagram`, `linkedin`, `tiktok` |
| `topic` | Text | |
| `pillar` | Single select | `educate`, `prove`, `show`, `engage`, `promote` |
| `segment` | Single select | `A`, `B`, `C`, `D` (CLAUDE.md §2) |
| `format` | Single select | `text`, `image`, `carousel`, `document`, `poll`, `reel`, `short_video`, `story` |
| `hook` | Text | |
| `caption` | Long text | Includes hashtags and CTA link with UTM |
| `slides_json` | Long text | Carousel slides or video script (JSON) |
| `visual_brief` | Long text | JSON from the Copywriter |
| `media_files` | Long text | Lark Drive file tokens (JSON array, ordered) |
| `media_public_urls` | Long text | Expiring renderer `/media/<token>` links, created only at publish time for platforms that fetch by URL |
| `preview` | Attachment | Copy of media for previewing in Lark only |
| `alt_text` | Long text | |
| `ai_generated` | Checkbox | Drives each platform's AI-content label |
| `scheduled_at` | Date-time | Asia/Singapore |
| `approval_deadline` | Date-time | `scheduled_at` minus `approval_lead_hours` |
| `status` | Single select | State machine below |
| `rejection_reason` | Long text | Entered by the approver; fed back to the Copywriter |
| `attempts` | Number | Capped at `max_generation_attempts` |
| `qc_notes` | Long text | Brand Checker and vision QC output, plus the **prompt versions** used |
| `card_message_id` | Text | Lark message ID of the approval card |
| `platform_post_id` | Text | ID returned by the platform API |
| `published_at` | Date-time | |
| `reach_24h`, `impressions_24h`, `engagements_24h`, `clicks_24h`, `saves_24h`, `shares_24h`, `views_24h` | Number | Collected 24 h after publishing |
| `reach_7d`, `impressions_7d`, `engagements_7d`, `clicks_7d`, `saves_7d`, `shares_7d`, `views_7d` | Number | Collected 7 days after publishing |
| `error` | Long text | Last error |

Metrics a platform doesn't provide stay empty, never zero.

### Table `Settings` (single record): the "dashboard" for agent parameters
`pause_publishing` (checkbox) · `posts_per_week_facebook` / `_instagram` / `_linkedin` / `_tiktok` · `content_mix` (JSON) · `format_mix` (JSON) · `posting_times` (JSON, defaults below) · `approval_lead_hours` · `max_generation_attempts` · `weekly_lead_target` (10) · `monthly_consultation_target` (10) · `monthly_budget_caps` (JSON: ai, images, video, ads) · `agent_switches` (JSON on/off per workflow).

**Default posting times (SGT):** LinkedIn Tue–Thu 08:30 · Instagram and Facebook 12:30 or 19:30 · TikTok 11:00 or 19:00.

### Table `Reports`
One record per weekly or monthly report: period, Lark Doc link, key metrics, recommendations (JSON) used by the next planning run.

### Table `Leads` (phase 4)
As in `docs/automation-design.md` §4: valid-lead definition from CLAUDE.md §3.

### Status state machine
```
planned → generating → pending_approval → approved → scheduled → published
              ↑               │
              │               ├── rejected (with reason) → generating   (attempts + 1)
              │               └── deadline passed → skipped
              └── failed (alert approver; retry allowed up to max attempts)
```
Only n8n changes statuses. The approver alone sets `approved` / `rejected` (via the card or Base). n8n checks that the clicker is the approver before accepting.

### Views
Calendar (`scheduled_at`), Kanban (`status`), Gallery (`preview`), Needs approval (`status = pending_approval`), By platform.

---

## 5. Workflows (n8n)

Name each `W<n> - <name>`, and export each to `n8n/workflows/` (one JSON file per workflow, in git).

| ID | Trigger | What it does |
|---|---|---|
| **W1 - Plan week** | Weekly cron (Mon, for the week starting ≥ 7 days later) | Reads the brief (Lark Doc/Wiki), the latest `Reports` recommendations, recent `Content` topics and `Settings`. Calls the **Planner** (`agents/planner.md`). Validates the schema, dedupes, and creates `Content` records as `planned`. |
| **W2 - Generate** | After W1; on reject or regenerate | Sets `generating`. Calls the **Copywriter** (Claude); then images (Gemini → Cloudflare fallback); then the renderer (carousel / reel / story / overlay + logo); uploads the files to the platform's Lark Drive folder and attaches previews in Base; runs W3. On a pass, sets `pending_approval` and runs W4. On failure, increments `attempts`, sets `failed` and alerts. |
| **W3 - Quality check** | Sub-workflow | The **Brand Checker** (`agents/brand-checker.md`, text) plus Claude **vision QC** on images and sampled video frames (garbled text, off-brand colours, logo missing or misplaced, sci-fi imagery). A fail triggers regeneration and counts as an attempt. |
| **W4 - Send approval card** | Sub-workflow | A Lark interactive card to marketing@linkbot.sg: platform, preview, caption, format, scheduled time and QC summary, with buttons **Approve / Reject / Regenerate**. Stores `card_message_id`. |
| **W5 - Handle approval** | Webhooks: Lark card callback and Base automation | Verifies the signature and that the clicker is the approver. Approve → `approved`, card updated, W6. Reject → record the reason, `rejected`, W2 with feedback. Regenerate → W2. Idempotent. |
| **W6 - Schedule** | Called by W5 | If `pause_publishing` is off, sets `scheduled`. (n8n holds the queue; W8 publishes at the time.) |
| **W7 - Deadline guard** | Hourly cron | Records still `pending_approval` past `approval_deadline` become `skipped`; the card is updated and the approver notified. |
| **W8 - Publish** | Cron, every 5–15 min | For `scheduled` records that are due, with pause off: publishes via the platform API (see §6), stores `platform_post_id` and `published_at`, sets `published`, and sets the AI-content label when `ai_generated`. Alerts on failure. |
| **W9 - Collect analytics** | Daily cron | At 24 h and 7 days after publishing, fetches insights per platform and writes the metric fields. |
| **W10 - Reports** | Weekly cron (before W1) and monthly | The **Analyst** (`agents/analyst.md`) writes the report and recommendations. Weekly: Lark Doc plus a summary card. Monthly: by email (or Lark). Saved to `Reports`. |
| **W11 - Error alerts** | n8n Error Trigger | Lark alert with the workflow, node, record ID and error (never secrets). |
| **W12 - Token maintenance** | Daily cron | Refreshes Meta, LinkedIn and TikTok tokens before they expire, plus the Lark token; alerts on failure. |

---

## 6. Integration notes

Verify every endpoint, scope and payload against current official docs before implementing.

### Lark (international, `https://open.larksuite.com/open-apis`)
- Custom app with **Bot** enabled. Scopes for messaging (send and update cards), Base (read/write records), Docs/Wiki, Drive. Published and approved by the admin.
- n8n uses a **tenant_access_token** (App ID + Secret), fetched fresh or cached with its expiry.
- The **Lark MCP** (`scripts/lark-mcp.mjs`, user token) is for setup by Claude Code only, not for production flows.
- Card button clicks go to the **card callback URL** (the n8n W5 webhook). Update the card after handling. A plain group-webhook bot can't receive clicks.
- Verify callback signatures and tokens on every incoming webhook.
- The existing workspace (folders and wiki) is mapped in [`docs/lark-workspace.md`](lark-workspace.md).

### Claude API (text brain)
- Model from `CLAUDE_MODEL` (default `claude-opus-5-5`, US$4 in / $20 out per million tokens). Structured JSON output (`output_config.format`) with schemas; retries with backoff.
- Prompt caching on the stable prefix (CLAUDE.md plus agent instructions) keeps repeated input cheap.
- **Estimated cost:** about 50 posts a month (with regenerations), at 2–3 calls each, plus weekly planning and reports. That's roughly 2M input and 0.5M output tokens, so **about US$10–20 a month**, and less with caching. Billed from a Claude **API** account (console.anthropic.com). **A Claude Pro/Max subscription can't be used by n8n**, and upgrading the subscription doesn't help.

### Gemini API (images, trial)
- Model from `GEMINI_IMAGE_MODEL`. Check the free-tier terms on data use before relying on it, and decide after a few trial runs.

### Cloudflare
- Workers AI for fallback images (`CLOUDFLARE_IMAGE_MODEL`).
- *(R2 is no longer used; see "Media storage" below.)*

### Media storage (decided 20 Nov 2026: Lark Drive, no R2)
- Rendered files are uploaded to Lark Drive at `Marketing/Social Media/<platform>/<post_id>/<attempt>/<filename>` (app identity, `drive:drive`). Their file tokens are stored in `media_files`.
- **Facebook, LinkedIn and TikTok:** n8n downloads the file from Lark and **uploads it directly** to each API (binary or file-upload modes), with no public URL needed. Verify each API's current upload method in phase 3.
- **Instagram** fetches media by URL. At publish time, W8 asks the renderer for a link `https://renderer.linkbot.sg/media/<token>`. The token is random (≥ 32 bytes), single-post and expires within 24 h. The renderer streams the file from Lark Drive and serves it with the right `Content-Type`. Tokens are invalidated after publishing.
- Watch Lark's API rate limits on the workspace plan. Downloads happen once per publish, not per view.

### Renderer (`renderer/`, on the DO droplet)
- Node ≥ 22, FFmpeg, Chromium (Playwright), HyperFrames, Edge TTS. Protected by `RENDERER_API_KEY` over HTTPS.
- `POST /render/carousel` · `POST /render/image` (AI image plus overlay text plus logo) · `POST /render/reel` (9:16 MP4) · `POST /render/story` · `GET /health`.
- Brand theme (colours, Inter font, logos) in `templates/brand/`, from `brand/`.
- Respect each platform's media specs (aspect ratio, duration, size, carousel limits).

### Facebook and Instagram (Meta Graph API)
- Meta developer app (Business type). FB Page plus IG **Professional (Business)** account linked to it. Permissions for page publishing and IG content publishing, plus insights. Long-lived Page token (W12).
- IG supports images, carousels, Reels and Stories from public URLs. Set the AI label when `ai_generated`.

### LinkedIn (Posts API)
- LinkedIn developer app linked to the **company page**. Company-page posting and analytics need **Community Management API** access (an application and review, which can take weeks).
- Meanwhile: approved LinkedIn posts land in Lark marked "post manually" (fallback), or post to the test personal profile via self-serve *Share on LinkedIn*.

### TikTok (Content Posting API)
- TikTok developer app with Login Kit plus the Content Posting API (Direct Post). **Until TikTok audits the app, posts can only be private** (self-only). Apply for the audit early.
- Fallback until audited: approved TikToks land in Lark marked "post manually". Set the AI-generated flag on every AI video.

---

## 7. Repository layout

```
.
├── CLAUDE.md                     # brand, tone, audience, compliance (source of truth for content)
├── docs/
│   ├── marketing-system-spec.md  # this file (source of truth for the system)
│   ├── automation-design.md      # earlier design notes and decision history
│   ├── lark-workspace.md         # Lark folder and wiki IDs
│   └── runbook.md                # operate, recover, rotate secrets (phase 1)
├── agents/                       # prompts: planner, copywriter, brand-checker, analyst (+ schemas/)
├── content/                      # hand-written and test batches
├── brand/, brief/                # brand kit and master brief
├── docker-compose.yml            # renderer (+ n8n if self-hosted)
├── .env.example                  # every variable, no values
├── n8n/workflows/                # exported workflows
├── renderer/                     # rendering microservice (src/, Dockerfile, package.json)
├── templates/                    # brand/, carousel/, video/
├── lark/                         # base-schema.md, cards/ (approval, alert, report)
└── scripts/                      # setup helpers (lark-mcp.mjs, tests)
```
(The original spec's `prompts/` folder is `agents/` here.)

---

## 8. Build phases

Build one phase at a time, each working end to end. At the end of each: how to test it, and what must be set up by hand.

1. **Foundation:** renderer skeleton (`/health`) on the droplet; n8n running (Cloud or self-hosted); `.env.example`; README. Lark bot and permissions (guided steps). Base tables and views. Brand brief in the wiki. A test workflow that writes a Base record and sends a Lark card. **Done when** n8n can create a record and send the approver a Lark card.
2. **Create and approve:** W2–W5 and W11; renderer endpoints; Lark Drive uploads; templates; agents wired in. Seed a few `planned` records. **Done when** real media arrive on approval cards, and Approve/Reject/Regenerate update both Base and the card. Posting is still manual.
3. **Publish:** W6–W8, the pause switch. FB and IG first; LinkedIn and TikTok as their API access is granted (manual fallback until then). **Done when** an approved post publishes on time, an unapproved one is skipped, and the pause switch blocks publishing.
4. **Measure:** W9, W10, W12; Base Dashboard; Leads table and UTM tracking. **Done when** metrics fill in automatically and the weekly report Doc and card arrive.
5. **Self-plan:** W1. **Done when** next week's content is planned, created and queued with only approvals from a human.

---

## 9. Conventions
- Every workflow is **idempotent**.
- Every LLM output is validated against a JSON schema; invalid output is retried, then fails with an alert.
- Log record IDs and step names, never secrets or tokens.
- Exponential backoff on external calls; respect rate limits (including Lark's plan limits).
- Prompts in `agents/` are versioned, and each post records which prompt versions produced it.
- Small, reviewable commits per workflow or feature.

## 10. How to work with the marketing lead
- Ask before spending money, deleting data, changing Lark permissions, or publishing anything live.
- Give exact numbered steps for anything clicked in a console (Lark, Meta, LinkedIn, TikTok, Cloudflare, DigitalOcean).
- If a tool proves unsuitable (API change, limits too low), stop, explain and propose an alternative.

## 11. Open decisions
1. **n8n hosting:** n8n Cloud (paid after trial) vs self-hosted on the DO droplet (free; the droplet is needed for the renderer anyway).
2. **DigitalOcean droplet:** confirm it exists, plus its specs, OS, access and subdomains for HTTPS: `n8n.linkbot.sg` (webhooks) and `renderer.linkbot.sg` (renderer and media links).
3. **Gemini image free tier:** keep or replace after trial runs.
4. **Edge TTS and HyperFrames:** keep or replace after phase 2 testing.

## 12. Change log
- **19 Nov 2026:** merged from the original spec.
  - Platforms widened from Instagram-only to FB/IG/LinkedIn/TikTok.
  - Claude replaces Gemini as the text brain (Gemini kept for images).
  - Postiz removed: n8n calls the platform APIs directly.
  - Approver fixed as marketing@linkbot.sg.
  - Brand rules delegated to CLAUDE.md.
  - Prompts live in `agents/`.
- **20 Nov 2026:**
  - Storage moved from Cloudflare R2 to **Lark Drive**. A renderer `/media/<token>` endpoint serves expiring public links for Instagram, and the other platforms get direct uploads. R2 is no longer used.
  - Gemini's free tier has no image quota, so **Cloudflare Workers AI (FLUX) is the main image source for now**, with Gemini as an option if billing is added later.
