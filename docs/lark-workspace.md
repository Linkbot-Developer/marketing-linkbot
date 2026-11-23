# Lark Marketing Workspace

Created 19 Nov 2026 on Linkbot's Lark (sglinkbot.sg.larksuite.com). These IDs are used by the automation (n8n) to file content.

## Drive folders

| Folder | Token | Link |
|---|---|---|
| Marketing | `WhAHfSUtOlQKFRd0NjilUQQEgeu` | https://sglinkbot.sg.larksuite.com/drive/folder/WhAHfSUtOlQKFRd0NjilUQQEgeu |
| Marketing / Marketing Agents | `LpZNftVqJlKFRDd7Nt5lH5p9gLf` | https://sglinkbot.sg.larksuite.com/drive/folder/LpZNftVqJlKFRDd7Nt5lH5p9gLf |
| Marketing / Social Media | `LhLvfwRp2lhOANdaHIglWWNagDg` | https://sglinkbot.sg.larksuite.com/drive/folder/LhLvfwRp2lhOANdaHIglWWNagDg |
| Marketing / Social Media / FB | `W8EhfbrlLlCKrpdr9djlbIWDgaf` | https://sglinkbot.sg.larksuite.com/drive/folder/W8EhfbrlLlCKrpdr9djlbIWDgaf |
| Marketing / Social Media / IG | `AWYEfOLANlLHmfdOWAzlnJLjguc` | https://sglinkbot.sg.larksuite.com/drive/folder/AWYEfOLANlLHmfdOWAzlnJLjguc |
| Marketing / Social Media / LinkedIn | `Os5ff3XwKlImXQdkhxellH4NgRq` | https://sglinkbot.sg.larksuite.com/drive/folder/Os5ff3XwKlImXQdkhxellH4NgRq |
| Marketing / Social Media / TikTok | `VWzqf6rzpldbQIdwVNxl7iRKgHd` | https://sglinkbot.sg.larksuite.com/drive/folder/VWzqf6rzpldbQIdwVNxl7iRKgHd |

## Base: "Linkbot Marketing Automation" (in the Marketing folder)

Link: https://sglinkbot.sg.larksuite.com/base/UnVYbyvm2anu0dsmiQ1lGpcsgRh · App token `UnVYbyvm2anu0dsmiQ1lGpcsgRh`

| Table | ID | Contents |
|---|---|---|
| Content | `tblBUzCMudCo8xPZ` | One row per post: 44 fields (spec §4). 11 sample rows from week 49, status `planned`. |
| Settings | `tbl1qgo2zdmi4cfY` | One row per setting (the "dashboard"): 11 defaults, including `pause_publishing` |
| Reports | `tblCPfYgwMqHoHj8` | Weekly and monthly reports |
| Leads | `tblpyKQKKIc9p87C` | CRM; `valid_lead` is a formula: all four tests from CLAUDE.md §3 ticked |

**To do by hand (the Lark tool can't create views or delete tables):**
- Delete the empty default table "Table1" (or similar).
- In Content, add these views:
  - **Calendar** (by `scheduled_at`)
  - **Kanban** (grouped by `status`)
  - **Gallery** (cover: `preview`)
  - **Needs approval** (grid, filter `status` = `pending_approval`)
  - **By platform** (grid grouped by `platform`)
- Share the Base with the Lark app (Share → add app) so n8n can read and write it.

## Wiki: "Linkbot Marketing Wiki" (space `7709700631312748303`, private)

| Page | Node token | Status |
|---|---|---|
**Current pages** (imported with content, 20 Nov 2026):

| Page | Node token | Status |
|---|---|---|
| Marketing Home | `NjG8wA5GJil2KrknO8ZlLuKHg4c` | ✅ Filled |
| ↳ Master Brief | `EPntwgz4ziGT33kQhFelMyFWg0e` | ✅ Filled (summary; PDF to upload) |
| ↳ Brand Guide | `FfUgweBpYie0gckV06jlBpMZg1b` | ✅ Filled |
| ↳ Audience, Offer & Goals | `RX7aw99N5isytxkU95jlizPpg4f` | ✅ Filled |
| ↳ Competitors | `YqnVwnwhLibaBqkwaPelIUVtgXg` | ✅ Filled |
| ↳ Content Workflow & Approvals | `UVe9wEtjSinSLXk1rzelFloHgLf` | ✅ Filled |
| ↳ Marketing Automation System | `UNxCwmjxGiJGmhkQfatltZ5igGd` | ✅ Filled |

**Old empty placeholders** (created 19 Nov, delete by hand in Lark; the MCP has no delete tool): "Marketing Home" `QjAAwgsY7iaFZakM7wpl3mYOgkh` and its 6 empty child pages.

Page link format: `https://sglinkbot.sg.larksuite.com/wiki/<node token>`

## Lark app permissions (user identity)

| Permission | Status | Needed for |
|---|---|---|
| `drive:drive` | ✅ granted | Folders, files |
| `wiki:wiki` | ✅ granted | Wiki space and pages |
| `docx:document` | ✅ granted | Writing page content and content docs |
| `offline_access` | ✅ granted | Staying logged in (automation) |
| `bitable:app` | ❌ not enabled | Creating Base tables (Content, Settings, Reports, Leads) |

Log in again after any permission change: `node scripts/lark-mcp.mjs login --scope drive:drive,wiki:wiki,docx:document,offline_access` (comma-separated, no spaces).

## Still to do
- Upload `brief/Master Brief - Linkbot.pdf` into the **Marketing** folder. The Lark MCP can't upload files, so drag it in by hand for now.
- Fill the wiki pages once `docx:document` is enabled.