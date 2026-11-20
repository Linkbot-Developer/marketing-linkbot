# Connecting the Tools — Step by Step

Do these yourself, in order. Each one ends with values to paste into **`.env`** (never into chat).
After each one, run `npm run check` in this folder: the tool should turn from ⬜ to ✅.

Console screens change often. If a button name differs slightly, look for the closest match.

| # | Tool | Cost | Lead time | Needed for |
|---|---|---|---|---|
| A | Gemini API | Free tier | 5 min | Images (phase 2) |
| B | Cloudflare (Workers AI) ✅ done | Free tier | 15 min | Main image source (FLUX) |
| C | Claude API | **Paid, ~US$10–20/month estimated; needs your OK** | 10 min | Planner, Copywriter, Brand Checker, Analyst |
| D | Meta developer app (FB and IG) | Free | App review: days to weeks | Publishing (phase 3) |
| E | LinkedIn developer app | Free | Community Management API review: often weeks | Publishing (phase 3) |
| F | TikTok developer app | Free | Audit for public posts: weeks | Publishing (phase 3) |
| G | DigitalOcean server | Existing (to confirm) | Depends on IT | Renderer and n8n (phase 1) |

**Start D, E and F early.** Their reviews take the longest, and nothing else depends on their timing.

---

## A. Gemini API (free)
1. Go to **aistudio.google.com** and sign in with a Linkbot Google account.
2. Click **Get API key → Create API key**, choosing or creating a Google Cloud project (e.g. "linkbot-marketing").
3. Copy the key into `.env` as `GEMINI_API_KEY=`.
4. Before relying on it, read the free-tier terms on how Google may use prompts and outputs (spec §11.3).

## B. Cloudflare: Workers AI and R2
1. Sign up or log in at **dash.cloudflare.com** with a Linkbot account.
2. **Account ID:** shown on the account home page (right sidebar). Copy it into `CLOUDFLARE_ACCOUNT_ID=`.
3. **API token:** go to My Profile → **API Tokens** → **Create Token** → *Custom token*.
   - Permissions: **Account → Workers AI → Read**, and **Account → Workers R2 Storage → Edit**.
   - Account resources: your account only.
   - Copy the token into `CLOUDFLARE_API_TOKEN=` (it's shown only once).
4. ~~R2 bucket~~. **Not needed** (decided 20 Nov 2026): media is stored in Lark Drive, and the renderer serves expiring links for Instagram. No card needed on Cloudflare.

## C. Claude API (paid, confirm first)
1. Go to **console.anthropic.com** and sign up with a Linkbot email (create an organisation, e.g. "Linkbot").
2. **Billing:** add a payment method and a small credit amount, and set a **monthly spend limit** (e.g. US$30) under Settings → Limits.
3. **API Keys** → **Create key**, named "marketing-automation". Copy it into `ANTHROPIC_API_KEY=`.
4. `CLAUDE_MODEL=claude-opus-5-5` is already the default.

This is separate from any Claude Pro or Max subscription, which n8n can't use.

## D. Meta (Facebook Page and Instagram)
**Before you start:** on the test accounts, the Instagram account must be a **Professional (Business)** account linked to the **test Facebook Page** (Instagram app → Settings → Account type and tools; Meta Business Suite → Settings → Instagram accounts).
1. Go to **developers.facebook.com** → My Apps → **Create App**, use case *Other* → type **Business**, name "Linkbot Marketing".
2. Add the products **Facebook Login for Business** and **Instagram** (Instagram API with Facebook Login).
3. Under *App Review → Permissions*, request:
   - Page posting: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
   - Instagram: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`
   - `business_management`

   While the app is in development mode, these work for accounts that have a role on the app (you as admin). App review is needed before going live on the company accounts.
4. **Graph API Explorer:** pick the app, generate a **User token** with those permissions, then exchange it for a **long-lived Page token** (Access Token Debugger → *Extend*, then `me/accounts`). Put the Page token in `META_PAGE_ACCESS_TOKEN=`, the Page ID in `META_PAGE_ID=`, and the Instagram Business account ID in `META_IG_USER_ID=` (from `{page-id}?fields=instagram_business_account`).
5. Copy the App ID and App Secret (App settings → Basic) into `META_APP_ID=` and `META_APP_SECRET=`.

I can walk you through step 4 live in the browser when you get there.

## E. LinkedIn
1. Go to **linkedin.com/developers** → **Create app**: name "Linkbot Marketing", LinkedIn Page = the **company page** (it must be verified by a page admin), logo = `brand/01_Logos/Light_Just_Logo.png`.
2. **Products** tab:
   - Add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** (self-serve; lets you post to your own test profile).
   - **Request access** to the **Community Management API**, which is needed to post as, and read analytics for, the company page. Fill in the use case truthfully: "Scheduling and publishing Linkbot's own company page content, approved by our marketing team, and reading our own post analytics."
3. **Auth** tab: copy the Client ID and Secret into `LINKEDIN_CLIENT_ID=` and `LINKEDIN_CLIENT_SECRET=`. Add the redirect URL `http://localhost:3000/callback` for now (n8n's callback comes later).
4. The company page ID goes in `LINKEDIN_ORG_ID=` (the number in the page admin URL).

## F. TikTok
1. Go to **developers.tiktok.com** → log in → **Manage apps** → **Connect an app**, name "Linkbot Marketing", category Business.
2. Add the products **Login Kit** and **Content Posting API** (enable **Direct Post**).
3. Scopes: `user.info.basic`, `video.publish`, `video.list` (for analytics).
4. Fill in the app details (website https://linkbot.sg/, terms and privacy URLs; ask the web developers if those pages don't exist yet), then **submit for review**.
5. Once it's approved, **apply for the Content Posting audit**. Until then, posts are private only.
6. Copy the Client key and Secret into `TIKTOK_CLIENT_KEY=` and `TIKTOK_CLIENT_SECRET=`.
7. Use TikTok's **file upload** mode (n8n uploads the video from Lark Drive), so no domain verification is needed.

## G. DigitalOcean server (ask IT)
Send IT this request:
> For the marketing automation we need: (1) access to the DigitalOcean droplet, or a new one: Ubuntu 24.04, at least 2 vCPU / 4 GB RAM, with Docker; (2) two DNS records on linkbot.sg: `n8n.linkbot.sg` and `renderer.linkbot.sg` pointing to the droplet; (3) SSH access for setup.
