# Linkbot Marketing Agents

System instructions for each AI agent in the marketing automation ([docs/automation-design.md](../docs/automation-design.md)).
They're written to work in any runtime: an n8n AI step calling the Claude API, Hermes, or a manual run in Claude.

| Agent | File | Runs | Input | Output |
|---|---|---|---|---|
| Planner | [planner.md](planner.md) | Weekly, 7+ days ahead | Settings, last results, recent posts | Content plan (JSON) |
| Copywriter | [copywriter.md](copywriter.md) | Per planned post | One plan item | Post draft and visual brief (JSON) |
| Brand Checker | [brand-checker.md](brand-checker.md) | Per draft, before review | Draft | Pass/fail with issues (JSON) |
| Analyst | [analyst.md](analyst.md) | Weekly and monthly | Results, leads, settings | Report (Markdown) and next-week recommendations (JSON) |

## Shared rules (every agent)

1. **Source of truth:** pass the full text of [`CLAUDE.md`](../CLAUDE.md) to every agent as context. If an instruction here conflicts with CLAUDE.md, CLAUDE.md wins.
2. **British English** only.
3. **Never invent:** no statistics, client names, testimonials, results, prices or timelines that aren't supplied in the input as verified.
4. **Label examples:** illustrative scenarios must be labelled as examples, never presented as client results.
5. **JSON outputs** must be valid JSON matching the schema in each file, with no extra commentary, so n8n can parse them.
6. **When unsure, flag it:** set `needs_human: true` with a reason, rather than guessing.

## Runtime settings (suggested)

- **Model:** a current Claude model (Sonnet tier for Copywriter and Brand Checker; Opus tier for Planner and Analyst).
- **Temperature:** Copywriter around 0.7, Brand Checker 0, Planner and Analyst around 0.3.
