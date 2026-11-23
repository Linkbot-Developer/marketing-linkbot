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

## Free AI quota and planning
- Gemini's free tier allows **20 requests per model per day**. With 4 models that's 80 a day, and it resets at midnight US Pacific time, about 16:00 in Singapore.
- Every call is counted in `out/ai-usage.json`, so several runs on the same day share one budget. A model that reports its daily limit isn't tried again until the reset.
- Each run works out how many posts fit: (requests left − `reserve_calls`) ÷ `calls_per_post_estimate`. It also prints whether the weekly plan (`posts_per_week`) fits the free tier. The default plan of 11 posts needs about 55 requests, against about 530 a week.
- Posts are generated earliest posting date first, and only if they're due within `generate_days_ahead`. A warning lists any post that is already inside the `plan_days_ahead` approval window.
- If the quota runs out mid-run, the post goes back to `planned` and the run stops cleanly.

## Notes
- Lark is accessed as the **app** (tenant token), exactly as n8n will be. The Base must be shared with the app.
- `AI_TEXT_PROVIDER=claude` switches to Claude (paid, `claude-opus-5-5` by default, `CLAUDE_MODEL` to override). It has no daily cap, and server-side refusal fallback is on. It's off until billing is approved.
- The free-tier checkers can miss things, so a fixed banned-phrase list (`src/pipeline.ts`) runs first, and **human approval is the final gate**.
