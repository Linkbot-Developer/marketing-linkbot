# Lark App — Complete Permission Request

**App:** Linkbot custom app (App ID in `.env`), international Lark (open.larksuite.com)
**Purpose:** the marketing automation system in [`marketing-system-spec.md`](marketing-system-spec.md), across all build phases.
**Request:** enable everything below in **one version** and publish it, so no further permission rounds are needed.

In the Developer Console, go to **Permissions & Scopes**. Each permission has two identity columns. Tick the identity shown in this table. "Both" means tick **App identity (tenant)** and **User identity**. Search by the code; if Lark shows a slightly different name, match it by the description.

## 1. Permissions

| # | Permission code | What it's for (Lark description) | Identity | Used by | Status |
|---|---|---|---|---|---|
| 1 | `offline_access` | Keep access to authorised data | User | Claude set-up tool stays logged in | ✅ granted |
| 2 | `drive:drive` | View, comment, edit and manage all files in Drive | Both | Media folders, uploads (brief, images, videos) | User ✅ · App ❓ |
| 3 | `wiki:wiki` | View, comment, edit and manage Wiki | Both | Wiki pages; reports filed in the wiki | User ✅ · App ❓ |
| 4 | `docx:document` | Create and edit new-version Docs | Both | Brand brief (read by the Planner); weekly report Docs | User ✅ · App ❓ |
| 5 | `bitable:app` | View, comment, edit and manage Base | Both | Content, Settings, Reports and Leads tables | ❌ **needed now** |
| 6 | `im:message` | Read and send messages in private and group chats | App | Approval cards, alerts, report summaries | ❌ |
| 7 | `im:message:send_as_bot` | Send messages as the app | App | Bot sends cards to the approver | ❌ |
| 8 | `im:resource` | Read and upload images or other files in messages | App | Image and video previews inside approval cards | ❌ |
| 9 | `im:chat:readonly` | Get group information | App | Find the alerts group chat ID | ❌ |
| 10 | `contact:user.id:readonly` | Obtain user ID via email or mobile number | App | Look up marketing@linkbot.sg's ID, so only they can approve | ❌ |
| 11 | `contact:user.base:readonly` | Obtain basic user information | App | Show the approver's name on cards and in logs | ❌ |

**Optional (phase 4, monthly report by email):** Lark Mail's "send email as user/mailbox" permission. Skip it for now if it's hard to find; the monthly report can go by Lark message instead.

## 2. App settings (same version, no extra permissions)

| Setting | Where | Value |
|---|---|---|
| **Bot** capability | Features → Bot | **Enabled** |
| Redirect URL | Security Settings | `http://localhost:3000/callback` (already set) |
| Availability | Version Management | Available to marketing@linkbot.sg and the marketing team (or the whole company) |

## 3. Still needed later: one setting change, no new permissions

When n8n is running (phase 1), the **card request URL** (Features → Bot → message card request URL) must point to n8n's approval webhook, e.g. `https://n8n.linkbot.sg/webhook/lark-card`. This is a **settings change, not a permission**. It may need one more version publish, because that address doesn't exist until the server is set up.

## 4. After it's approved: user steps (no admin needed)

- Log in again so Claude's set-up tool picks up the new permissions: `node scripts/lark-mcp.mjs login --scope offline_access,drive:drive,wiki:wiki,docx:document,bitable:app`
- When the Base is created, add the app as a collaborator on that Base (Base → Share → add the app) so n8n can read and write it.
- Add the bot to the alerts group chat.
