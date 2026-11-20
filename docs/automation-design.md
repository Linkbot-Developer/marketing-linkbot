# Linkbot Marketing Automation — Design (draft v1, 18 Nov 2026)

> **Superseded for system build by [marketing-system-spec.md](marketing-system-spec.md) (19 Nov 2026).** Kept as decision history. In particular, §8 (the paid Higgsfield, HeyGen and Creatomate stack) is now a *later-phase upgrade*; the current stack is free and open source.

Goal: a mostly hands-off system that plans, generates, stores, gets approval for, publishes, measures and reports on Linkbot's social content. A human approves every post. Brand rules come from [`CLAUDE.md`](../CLAUDE.md).

## 1. Flow

```
 Settings (Lark Base) ──► 1 PLAN ──► 2 GENERATE ──► 3 BRAND CHECK ──► 4 STORE
   posts/week, mix,        weekly      copy: Claude    rules from        Lark Base row
   lead target, budget     calendar    media: Higgsfield CLAUDE.md       + Lark Drive
                                       + logo overlay                     folder
                                                                            │
   ┌──────────── request changes (with comments) ◄── 5 REVIEW ◄────────────┘
   │                                                  Lark card to approver:
   └──► back to 2                                     Approve / Request changes
                                                            │ approved
 9 REPORT ◄── 8 ANALYSE ◄── 7 COLLECT RESULTS ◄── 6 PUBLISH at scheduled time
 weekly: Lark    Claude vs     n8n pulls metrics     FB · IG · LinkedIn · TikTok
 monthly: email  lead goals    + leads from CRM      (unapproved = never posted)
```

## 2. Decisions so far

| Area | Decision |
|---|---|
| Platforms | **Main:** Facebook, Instagram, LinkedIn, TikTok. **Later:** blog/website. |
| Formats | Single images, carousels, reels and short videos, rotated over time |
| Generator | Higgsfield for images and video. Claude for captions, planning, checks and analysis. |
| Orchestration | n8n Cloud (runs 24/7) |
| Storage | Lark Base (content calendar, results, CRM, settings) + Lark Drive (media) |
| Lead time | Content proposed **at least 7 days** before its posting date |
| Approver | **marketing@linkbot.sg only.** Unapproved posts are held, never published. |
| Reports | **Weekly:** Lark message. **Monthly:** email (falls back to Lark if email is a hassle). |
| Leads | WhatsApp, social DMs and the website form, all logged into a **new CRM** |
| Scope v1 | Publishing and reporting. Comment and DM handling comes in a later version. |
| Control | A **dashboard** for adjusting each agent's parameters (see §4) |

## 3. Components

| Component | Tool | Notes |
|---|---|---|
| Planner agent | n8n + Claude | Weekly run. Reads Settings and last week's results, and writes draft rows to the Content Calendar. |
| Copy agent | n8n + Claude | Caption, hook, hashtags and approved CTA with UTM link, in British English |
| Media agent | n8n → Higgsfield API (HTTP Request node; no native n8n node) | Asynchronous: submit, then webhook or polling. The logo is added afterwards, never by the AI. |
| Brand checker | n8n + Claude | Flags prices, guarantees, invented stats, competitor names, US spelling and off-brand colours |
| Approval | Lark Base + Lark message card | Button → n8n webhook → status update |
| Publisher | n8n, scheduled every 15 min | Meta Graph API (FB + IG), LinkedIn Community Management API, TikTok Content Posting API |
| Results collector | n8n, scheduled | Pulls post metrics at 24 h, 7 days and 28 days |
| CRM | Lark Base | Leads from the WhatsApp, DM and website-form webhooks, with source and UTM |
| Analyst + reporter | n8n + Claude | Weekly Lark message, monthly email |

## 4. Lark Base tables (proposed)

- **Settings (dashboard):** posts per week per platform, content mix %, format mix, weekly lead target, monthly consultation target, monthly budget caps (Higgsfield, AI, ads), and an on/off switch per agent.
- **Content Calendar:** platform, publish date and time, pillar, segment, format, caption, media link, brand-check result, status (`Draft → Brand-checked → In review → Approved / Changes requested → Scheduled → Published / Failed / Held`), approver comments.
- **Results:** post, date pulled, reach, impressions, engagement, clicks, follows, video views.
- **Leads (CRM):** name, company, source (WhatsApp/FB/IG/LinkedIn/TikTok/website), UTM, date, *valid?*, consultation booked?, notes.
- **Reports:** week or month, summary, link to the full report.

## 5. Platform access (each needs set-up and some need review)

| Platform | Requirement | Risk |
|---|---|---|
| Facebook + Instagram | IG must be a **Professional (Business)** account linked to the FB Page. A Meta app with page-publishing and IG content-publishing permissions. | Medium (Meta app review) |
| LinkedIn | Company page admin. A LinkedIn app with **Community Management API** access, applied for as Linkbot. | High (approval can take weeks) → fallback: a scheduler tool or a manual post from the approved row |
| TikTok | TikTok Business account. **Content Posting API**; unaudited apps can only post privately until TikTok audits the app. | High → fallback: manual post or a scheduler tool |
| Higgsfield | API balance at cloud.higgsfield.ai (separate from the web plan) | Pricing per model not published |

## 6. Build phases

1. **Foundations:** Lark permissions (blocked on approval), Lark Base tables, n8n Cloud account, Claude API key, Meta/LinkedIn/TikTok developer apps applied for (start early because of review times).
2. **Plan → Generate → Check → Store → Review**, end to end in Lark, with no publishing yet.
3. **Publish:** FB + IG first, then LinkedIn and TikTok as access is granted (fallbacks meanwhile).
4. **Results + CRM + reports.**
5. **Later:** blog/website, comment and DM handling, ads.

## 7. Answers (18 Nov 2026)

| Question | Answer |
|---|---|
| Budget caps | Set from the **Settings dashboard** and varied per agent (posts per week, budgets, lead targets). Not hard-coded. |
| Ads | A later phase. Any change to spend will need the approver's sign-off. |
| Valid lead | A business, in a target segment, with a real automation need, and contactable (see CLAUDE.md §3) |
| Website | Source at `github.com/Linkbot-Developer/linkbot-redesign`, edited by the developers. The lead form will post to an n8n webhook, which writes to the Lark CRM. |
| Accounts | Admin on new **test** accounts (FB, IG, LinkedIn, TikTok). The live company LinkedIn page comes after testing. |
| Approver | marketing@linkbot.sg is a Lark user. It receives the approval cards. |

## 8. Media generation stack (recommended 18 Nov 2026)

Decision: video and images are **AI-generated**, including an **AI presenter** for TikTok. Everything is labelled as AI on each platform.

| Job | Recommended | Why | Fallback |
|---|---|---|---|
| AI images and B-roll video | **Higgsfield API** (one key covering 50+ models such as Kling, Veo and Seedance) | Already chosen; switch models without re-integrating | **fal.ai** (developer-focused, pay-per-use, many models) |
| AI presenter (talking head) | **HeyGen API** (pay-as-you-go from US$5; separate from web plans) | Built for script-to-avatar video with lip-sync | Creatify; Higgsfield, if its avatar models fit |
| Brand overlay, logo, captions, carousels, final render | **Creatomate** (JSON API, image and video templates) | Enforces the brand on every asset: Inter font, palette, logo corner, overlay text, end cards. Fits the "no text in AI media" rule. | **Placid** (cheaper, images and simple video) or **Shotstack** |

**Pipeline:** Copywriter brief → Higgsfield (visuals) and/or HeyGen (presenter) → Creatomate template (overlay text, logo, captions, end card) → Lark Drive → Brand Checker → review.

**Notes**
- Higgsfield, HeyGen and Creatomate all bill API use separately from their web plans. Top up small amounts first and track the cost per post in the Settings dashboard.
- One source says OpenAI's Sora API is being sunset in 2026, so don't build on it.
- Platform AI labels: TikTok's posting API has an AI-generated flag, and Instagram has "AI info". Confirm the exact field names in the official API docs during the build.
- Vendor prices vary by source and change often. Check each pricing page before committing.

## 9. Agent runtime options

- **n8n Cloud (current plan):** scheduled, auditable workflows. Each AI step calls the Claude API.
- **Hermes Agent (Nous Research), suggested by a supervisor:** an open-source, self-hosted agent with cron, memory, skills, MCP and messaging gateways. It could act as the "brain" for planning and analysis, with n8n kept for the deterministic plumbing. See the chat of 18 Nov 2026 for the assessment. It isn't adopted yet.
