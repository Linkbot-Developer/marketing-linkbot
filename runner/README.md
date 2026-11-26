# Linkbot Runner

Runs the AI agents on posts in the Lark Base. This is the local version of n8n workflows W2 (Generate) and W3 (Quality check).

```
Lark Base (status planned)
  → Copywriter (Gemini free tier for now) → banned-phrase guard → Brand Checker
  → Renderer (image / carousel / story / reel) → Visual QC (looks at the images)
  → retries with feedback (re-render images up to 3×, rewrite up to max_generation_attempts)
  → back to Lark Base: copy, preview, QC notes, prompt version, status pending_approval (or failed + error)
```

## Run
```bash
npm run daily                            # the normal way: as many planned posts as today's free AI quota allows
                                         # (starts the renderer itself, earliest posting date first)
cd ../renderer && npm start              # for the manual commands below, in another terminal
cd runner && npm run run -- --post W49-IG-03   # one post (planned, or failed to retry)
npm run run -- --limit 3                 # next 3 planned posts, earliest first
npm run run -- --post W49-IG-02 --dry    # no writes to Lark (files still saved to out/)
```
Settings come from the Lark Base **Settings** table (`max_generation_attempts`, `agent_switches.generator`, `ai_quota`, `plan_days_ahead`, `posts_per_week`) and from `.env` (`AI_TEXT_PROVIDER`, `GEMINI_TEXT_MODELS`, `CLAUDE_MODEL`).

## Runs automatically every day
**On the server** (once it's live), n8n **W2** starts it at 17:00 Singapore time through the renderer's `POST /jobs/daily`, which runs `deploy/run-daily.sh` (see `docs/deploy.md`).

**Until then**, the Windows scheduled task **"Linkbot Marketing - Daily generation"** runs `scripts/daily-run.ps1` at **16:30 PC time**. That's after the quota reset, and if the PC was off it runs as soon as it's back on. Each day's log is in `out/daily-<date>.log`. To change or stop it, use Task Scheduler. Once the renderer is on the server, n8n takes this over.

After each post is ready, the runner calls n8n W4 so the approval card goes out at once. Failed posts, a crash, or running out of quota with posts close to their deadline are reported in the Marketing Alerts group. Posts already past their approval deadline are left alone, because n8n W7 skips them.

## Free AI quota and planning
- Gemini's free tier allows **20 requests per model per day**. With 6 models (4 Flash, then 2 Flash-Lite as fallbacks) that's about 120 a day, and it resets at midnight US Pacific time, about 16:00 in Singapore.
- Every call is counted in `out/ai-usage.json`, so several runs on the same day share one budget. A model that reports its daily limit isn't tried again until the reset.
- Each run works out how many posts fit: (requests left − `reserve_calls`) ÷ `calls_per_post_estimate`. It also prints whether the weekly plan (`posts_per_week`) fits the free tier. The default plan of 11 posts needs about 55 requests, against about 530 a week.
- Posts are generated earliest posting date first, and only if they're due within `generate_days_ahead`. A warning lists any post that is already inside the `plan_days_ahead` approval window.
- If the quota runs out mid-run, the post goes back to `planned` and the run stops cleanly.

## Free backup AI (Cloudflare Workers AI)
When **every** Gemini model is used up or overloaded, the runner switches to Cloudflare Workers AI (same free account as the photos, no extra sign-up):
- **Writing:** Llama 4 Scout (cleaner, less salesy copy)
- **Brand check:** GPT-OSS 120B (strict, catches unproven claims)
- **Visual check:** Mistral Small 3.1, then Llama 4 Scout (models that can see images)

It's limited to `max_neurons_per_day` (default 6,000 of Cloudflare's free 10,000 a day, which resets at 00:00 UTC), so the rest is kept for photos. Usage is counted in `out/cf-usage.json`. Posts made with the backup say so at the top of their QC notes (and on the approval card), because its checks are less strict than Gemini's.
Settings: `ai_text.fallback` in Lark (`enabled`, `writer_models`, `models`, `vision_models`, `max_neurons_per_day`). To test it without touching Gemini, run `AI_FORCE_BACKUP=1 npm run run -- --post <id> --dry`.

Every model's output is also tidied automatically: headings are put in sentence case (names like Lark, HubSpot and WhatsApp stay capitalised), and Markdown links in captions become plain links.

## Notes
- Lark is accessed as the **app** (tenant token), exactly as n8n will be. The Base must be shared with the app.
- `AI_TEXT_PROVIDER=claude` switches to Claude (paid, `claude-opus-5-5` by default, `CLAUDE_MODEL` to override). It has no daily cap, and server-side refusal fallback is on. It's off until billing is approved.
- The free-tier checkers can miss things, so a fixed banned-phrase list (`src/pipeline.ts`) runs first, and **human approval is the final gate**.
