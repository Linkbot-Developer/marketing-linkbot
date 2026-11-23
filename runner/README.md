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
cd ../renderer && npm start              # in one terminal
cd runner && npm run run -- --post W49-IG-03   # one post (planned, or failed to retry)
npm run run -- --limit 3                 # next 3 planned posts, earliest first
npm run run -- --post W49-IG-02 --dry    # no writes to Lark (files still saved to out/)
```
Settings come from the Lark Base **Settings** table (`max_generation_attempts`, `agent_switches.generator`) and from `.env` (`AI_TEXT_PROVIDER`, `GEMINI_TEXT_MODELS`).

## Notes
- Lark is accessed as the **app** (tenant token), exactly as n8n will be. The Base must be shared with the app.
- `AI_TEXT_PROVIDER=claude` is reserved; it will be implemented with the official SDK once an API key exists.
- The free-tier checkers can miss things, so a fixed banned-phrase list (`src/pipeline.ts`) runs first, and **human approval is the final gate**.
