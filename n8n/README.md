# n8n workflows (Linkbot Marketing)

n8n Cloud at `flow.linkbot.sg`. **The instance also runs client workflows.** The scripts here only create or change workflows whose name starts with `[Marketing]`.

| Workflow | Trigger | What it does |
|---|---|---|
| `[Marketing] W4 - Send approval card` | Every 10 minutes | Finds posts at `pending_approval` without a card. Sends the approver (Settings → `approver`) a Lark card with the preview, caption, checks and **Approve / Reject with feedback / Regenerate**. Saves `card_message_id` on the post. |
| `[Marketing] W5 - Handle approval` | Webhook (Lark card callback) | Answers Lark's URL check. Accepts a click only from the approver, only on the latest card, and only while the post is `pending_approval`. Approve sets `approved`. Reject (a reason is required) and Regenerate set `rejected` and save the reason. The card is replaced with the decision. |

A rejected post is picked up by the next `npm run daily` in `runner/`, which rewrites it using the feedback and sends a new card.

## Files
- `build.mjs` creates or updates the workflows through the n8n API, then saves a git-safe copy to `workflows/` with the secret webhook path replaced by `<N8N_WEBHOOK_SECRET>`.
  Run `node n8n/build.mjs`; add `--activate W4 W5` to switch workflows on.
- `api.mjs` is a small n8n API helper that reads `N8N_BASE_URL` and `N8N_API_KEY` from `.env`.
- `.credential-ids.json` and `.callback-url.txt` are local and git-ignored.
- The Lark app ID and secret live only in the n8n credential **[Marketing] Lark app (tenant token)** (Custom Auth), never in workflow JSON.

## Security
- The webhook path contains a random secret (`N8N_WEBHOOK_SECRET` in `.env`).
- Clicks are accepted only from the approver's Lark open_id and only on the card stored on the post.
- Leave the Lark **Encrypt Key** empty; W5 reads plain callbacks.

## One-time Lark set-up (developer console, app `cli_aa76…`)
1. **Features → Bot:** switch the bot on.
2. **Permissions & Scopes:** add `im:message:send_as_bot` (send messages as the app) and `im:resource` (upload images for the card preview).
3. **Events & Callbacks → Callback configuration:** choose "Send callbacks to developer server". Paste the URL from `n8n/.callback-url.txt` as the request URL and save. Lark checks it straight away, and W5 answers. Then **add the callback `card.action.trigger`**.
4. **Version Management & Release:** create a version and publish it. The admin may need to approve it.
5. Make sure marketing@linkbot.sg is within the app's availability, so the bot can message it.
