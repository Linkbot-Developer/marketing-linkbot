# Lark App: Complete Permission Request

**App:** Linkbot custom app (App ID in `.env`), international Lark (open.larksuite.com)
**Purpose:** the marketing automation system in [`marketing-system-spec.md`](marketing-system-spec.md), across all build phases.
**Request:** enable everything below in **one version** and publish it, so no further permission rounds are needed. *(Updated 23 Nov 2026.)*

In the Developer Console, go to **Permissions & Scopes**. Each permission has two identity columns. Tick the identity shown in this table. "Both" means tick **App identity (tenant)** and **User identity**. Search by the code; if Lark shows a slightly different name, match it by the description.

## 1. Permissions

The Status column shows what was tested on 23 Nov 2026 with the app's own identity, which is what n8n uses.

| # | Permission code | What it's for (Lark description) | Identity | Used by | Status |
|---|---|---|---|---|---|
| 1 | `offline_access` | Keep access to authorised data | User | Claude set-up tool stays logged in | ✅ granted |
| 2 | `bitable:app` | View, comment, edit and manage Base | Both | Content, Settings, Reports and Leads tables (all workflows) | ✅ granted |
| 3 | `contact:user.id:readonly` | Obtain user ID via email or mobile number | App | Look up the approver's ID, so only they can approve | ✅ granted |
| 4 | `drive:drive` | View, comment, edit and manage all files in Drive | Both | Save images and videos to the FB, IG, LinkedIn and TikTok folders; download them for publishing | User ✅ · **App: tick it** |
| 5 | `docx:document` | Create and edit new-version Docs | Both | Read the brand brief (Planner, W1); write weekly report Docs (W10) | User ✅ · **App: tick it** |
| 6 | `wiki:wiki` | View, comment, edit and manage Wiki | Both | Read wiki pages; file reports in the wiki | User ✅ · **App: tick it** |
| 7 | `im:message:send_as_bot` | Send messages as the app | App | **Approval cards (W4)**, alerts (W11), report summaries | ❌ **needed now** |
| 8 | `im:message` | Read and send messages in private and group chats | App | Update cards after a decision or a missed deadline (W5, W7); post in the alerts group | ❌ **needed now** |
| 9 | `im:resource` | Read and upload images or other files in messages | App | **Preview image inside the approval card (W4)** | ❌ **needed now** |
| 10 | `im:chat:readonly` | Get group information | App | Find the alerts group chat ID (W11) | ❌ |
| 11 | `contact:user.base:readonly` | Obtain basic user information | App | Show the approver's name on cards and in logs | ❌ |

**Optional, phase 4:**
- **Monthly report by email:** Lark Mail's send-email permission (`mail:user_mailbox.message:send` or similar; search "send mail"). Skip it if it's hard to find, and the monthly report goes by Lark message instead.
- **Chatting with the bot:** `im:message.p2p_msg:readonly` (read private messages sent to the bot). This is only needed if we later want to give feedback by replying to the bot in chat. The card buttons don't need it.

Not needed: Lark Approval, Calendar, Tasks, Sheets, HR and Attendance.

## 2. App settings (same version, no extra permissions)

| Setting | Where | Value |
|---|---|---|
| **Bot** capability | Features → Bot | **Enabled** |
| **Card callback** | Events & Callbacks → Callback configuration | Mode "Send callbacks to developer server". Request URL from `n8n/.callback-url.txt` (local, git-ignored; it's the n8n W5 webhook, already live and able to answer Lark's check). Add the callback **`card.action.trigger`**. |
| Encrypt Key | Events & Callbacks → Encryption strategy | **Leave empty** (W5 reads plain callbacks) |
| Redirect URL | Security Settings | `http://localhost:3000/callback` (already set) |
| Availability | Version Management | Must include marketing@linkbot.sg and the marketing team (or the whole company), so the bot can message them |

Then go to **Version Management & Release → Create version → Publish**. The admin may need to approve it.

## 3. After it's approved: user steps (no admin needed)
- Tell Claude, which will then switch on n8n W4 and send the first approval cards.
- Create a Lark group for alerts (for example, "Marketing Alerts") and add the bot to it (needed for W11).
- Claude's set-up tool doesn't need new scopes; only log in again if it reports an expired token: `node scripts/lark-mcp.mjs login --scope offline_access,drive:drive,wiki:wiki,docx:document,bitable:app`
