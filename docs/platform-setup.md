# Connecting the social platforms (test accounts first)

**Goal:** let n8n publish approved posts through each platform's **official API**. Start with the **test accounts**, then switch to the live company accounts once publishing is proven.
**Rule:** keys and tokens go **only into `.env`** (and later n8n credentials). Never paste them in chat, Lark or GitHub.
**Note:** developer consoles change their menus often. If a name below doesn't match exactly, look for the closest option, and tell Claude what you see.

## Overview
| Platform | What we need | Works on test accounts right away? | Main catch |
|---|---|---|---|
| **Facebook Page** | Meta developer app + Page token | ✅ Yes, in the app's Development mode | Live company accounts need App Review and Business Verification |
| **Instagram** | Same Meta app + an Instagram **Professional** account linked to the Page | ✅ Yes, in Development mode | Instagram downloads media **from a public link**, so it needs our media link (server, or an n8n link as a stopgap) |
| **LinkedIn Page** | LinkedIn developer app + **Community Management API** access | ⚠ Posting as a **personal profile** works at once; posting as a **company Page** needs approval (days to weeks) | Apply early |
| **TikTok** | TikTok developer app + **Content Posting API** | ⚠ Only **private (self-only)** posts until TikTok audits the app | Audit needs a privacy policy and terms page on linkbot.sg |

Suggested order: **Facebook → Instagram → LinkedIn (apply now) → TikTok (apply now)**.

---

## 1. Meta: Facebook Page + Instagram (one app for both)

### Before you start (test accounts)
1. A **Facebook Page** for testing, where your Facebook account is an admin.
2. An **Instagram account switched to Professional** (Business or Creator): Instagram → Settings → Account type and tools → Switch to professional account.
3. **Link Instagram to the Page:** Facebook Page → Settings → Linked accounts → Instagram → Connect.
4. A **Meta Business portfolio** (business.facebook.com) that owns, or has access to, the test Page and Instagram account.

### Create the app
1. Go to **developers.facebook.com** → My Apps → **Create app**.
2. Use case: choose the one for **managing Pages / Instagram content** (for example "Manage everything on your Page" plus Instagram). App type, if asked: **Business**. Connect it to the Business portfolio above.
3. In the app dashboard, add the products **Facebook Login for Business** and **Instagram** (Instagram API with Facebook Login).
4. Request these **permissions** (in Development mode they work without review for admins and testers of the app):
   - Publishing: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
   - Analytics (for W9 later): `read_insights`, `instagram_manage_insights`
5. **App settings → Basic:** note the **App ID** and **App Secret**.

### Get a long-lasting token (recommended: a System User)
1. **Business settings → Users → System users → Add**, with the role **Admin**. Name it, for example, "linkbot-marketing-automation".
2. **Assign assets** to it: the test **Page** (full control) and the **Instagram account**, and **add the app** to it.
3. Click **Generate new token** → choose the app → tick the permissions above → expiry **Never**.
4. This token goes into `.env` as `META_PAGE_ACCESS_TOKEN` (Claude converts it into the Page token and finds the IDs).

### Put into `.env` (yourself)
```
META_APP_ID=
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=     # the System User token from step 3
META_PAGE_ID=               # Claude can fill this in
META_IG_USER_ID=            # Claude can fill this in
```

### Later, for the live company accounts
- **Business Verification** (company documents) and **App Review** for the permissions above, with a short screen recording of how the app uses them. Then switch the app to **Live** mode.
- Instagram content must be **AI-labelled** when `ai_generated`. Check what the API currently supports; if there's no API switch, it's labelled in the caption.

---

## 2. LinkedIn

### Before you start
1. A **LinkedIn Page** for testing (Company Page) where your profile is a **Super admin**.

### Create the app
1. Go to **linkedin.com/developers** → **Create app**.
2. App name, for example "Linkbot Marketing". **LinkedIn Page:** select the test Page. Upload the logo and accept the terms.
3. **Verify the app with the Page:** Settings → Verify → send the link to a Page admin (you), and approve it.
4. **Products tab:**
   - **Share on LinkedIn** (instant): posting as your **personal profile** (`w_member_social`). It's useful for a first test.
   - **Community Management API** (request access): posting **as the company Page**, plus Page analytics (`w_organization_social`, `r_organization_social`, `rw_organization_admin`). Fill in the form: use case "posting approved marketing content and reading Page analytics for our own Page". **Apply now**, because it can take days to weeks.
5. **Auth tab:**
   - Note the **Client ID** and **Client Secret**.
   - Add the **Authorized redirect URL** Claude gives you (an n8n link on `flow.linkbot.sg`, used once to collect the login token).

### Put into `.env`
```
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ORG_ID=            # the test Page's number (in its admin URL: linkedin.com/company/<number>/admin)
LINKEDIN_ACCESS_TOKEN=      # Claude fills this in after the one-time login
LINKEDIN_REFRESH_TOKEN=     # Claude fills this in after the one-time login
```
Access tokens last about 60 days and refresh tokens about a year. W12 renews them automatically.

---

## 3. TikTok

### Before you start
1. A TikTok **test account** (yours).
2. **Public pages on linkbot.sg:** a **Privacy Policy** and **Terms of Service**. TikTok requires both URLs for the app, and checks them in the audit. Ask the web developers (`Linkbot-Developer/linkbot-redesign`) if they don't exist yet.

### Create the app
1. Go to **developers.tiktok.com** → log in → **Manage apps → Connect an app** (register as an organisation: Linkbot).
2. Fill in the app details: name, icon, category, description, platform **Web**, website `https://linkbot.sg`, and the Terms and Privacy URLs.
3. **Add products:** **Login Kit** and **Content Posting API**. In the Content Posting API settings, turn on **Direct Post**.
4. **Scopes:** `user.info.basic`, `video.upload`, `video.publish`.
5. **Redirect URI:** the one Claude gives you (an n8n link on `flow.linkbot.sg`).
6. Use **Sandbox** to test with your test account (add it as a target user), then **submit for review/audit**.
7. Note the **Client key** and **Client secret**.

### Limits until the audit passes
- Posts are **private (only the account owner can see them)**, and only a few accounts can use the app. Perfect for testing; not for real posting.
- Every AI video must be posted with TikTok's **AI-generated content** flag on.

### Put into `.env`
```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=        # Claude fills this in after the one-time login
TIKTOK_REFRESH_TOKEN=       # Claude fills this in after the one-time login
```
Access tokens last about 24 hours and refresh tokens about a year. W12 renews them automatically.

---

## What Claude builds once the apps exist
1. A one-time **"connect" link** in n8n for LinkedIn and TikTok: you log in once and the tokens are saved (never shown).
2. `npm run check` shows each platform as ✅ connected.
3. A **test post** to each test account. Facebook and Instagram first, because they work immediately.
4. Then **W6 Schedule** and **W8 Publish**: approved posts go out at their time, with the pause switch and AI labels.
