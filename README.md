# Creator Command Centre

One private dashboard for all your Instagram and YouTube accounts: analytics, content library, growth intelligence, AI strategist, idea generator, content calendar, brand deals and weekly/monthly reports.

- **App URL:** https://himanshuipe.github.io/creator-command-centre/
- **Backend:** Supabase project `wnuufmkrmppebzikxfdu` (Mumbai, ap-south-1)
- **Stack:** React + TypeScript + Vite + Tailwind, Recharts, Supabase (Auth, Postgres, Edge Functions), Meta Graph API, YouTube Data + Analytics APIs, OpenAI

Until an account is connected, every screen shows **DEMO** sample data with a yellow DEMO banner and badges. Nothing is ever scraped or invented: live numbers only come from the official APIs.

---

## 1. First-time setup (about 30 minutes)

### 1.1 Supabase Auth (2 minutes)
Supabase dashboard → **Authentication → URL Configuration**
- **Site URL:** `https://himanshuipe.github.io/creator-command-centre/`
- **Redirect URLs:** add `https://himanshuipe.github.io/creator-command-centre/**` and `http://localhost:5173/**`

Then open the app, choose **Create account**, confirm the email, and sign in. Your account becomes the **owner** of a new workspace.

**Lock it down:** after you've created your account, go to **Authentication → Sign In / Providers → Email** and turn off **Allow new users to sign up**. Then only you (and people you invite later) can log in.

### 1.2 Edge function secrets
Supabase dashboard → **Edge Functions → Secrets** (Project Settings → Edge Functions). Add:

| Secret | Value |
|---|---|
| `APP_URL` | `https://himanshuipe.github.io/creator-command-centre/` |
| `TOKEN_ENCRYPTION_KEY` | A long random string, at least 32 characters. Generate one with `openssl rand -base64 48` or any password manager. **Never change it** after connecting accounts, or stored tokens become unreadable (you'd just reconnect). |
| `META_APP_ID`, `META_APP_SECRET` | From step 2 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 3 |
| `OPENAI_API_KEY` | From step 4 |
| `OPENAI_MODEL` (optional) | Defaults to `gpt-4.1-mini` |
| `CRON_SECRET` | Another random string, used by the daily sync (step 5) |
| `META_GRAPH_VERSION` (optional) | Defaults to `v23.0` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically. The app's **Settings & Integrations** page shows a green tick for each secret that is set.

---

## 2. Instagram (Meta Graph API)

**Account requirements:** each Instagram account must be a **Professional account (Business or Creator)** and **linked to a Facebook Page** you manage. (Instagram app → Settings → Account type and tools → Switch to professional; then in Meta Business Suite or the Page settings, link the Instagram account.)

1. Go to https://developers.facebook.com/apps → **Create app**.
2. Use case: **Other** → app type **Business**. Give it a name (e.g. "Creator Command Centre").
3. In the app dashboard, add the product **Facebook Login for Business** (or "Facebook Login"), and add **Instagram Graph API** / "Instagram" (API setup with Facebook Login).
4. **Facebook Login → Settings → Valid OAuth Redirect URIs:**
   `https://wnuufmkrmppebzikxfdu.supabase.co/functions/v1/api/oauth-callback`
5. **App settings → Basic:** copy **App ID** → `META_APP_ID` and **App Secret** → `META_APP_SECRET`. Add a Privacy Policy URL (any page you own works for development).
6. Permissions used: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`.
7. **Development mode is fine for your own accounts.** Add yourself (and anyone else who'll connect accounts) under **App roles → Roles** as Admin/Developer/Tester. App Review is only needed if people outside your app roles must connect.
8. In the app: **Settings & Integrations → Connect Instagram**. On Meta's screen select **every** Page and Instagram account you want. One login connects all of them.

**What the API gives you:** followers, daily reach, views, accounts engaged, likes, comments, shares, saves, profile visits; per-Reel views, reach, likes, comments, shares, saves and average watch time. Daily new followers only for the **last 30 days** and only for accounts with 100+ followers; account insights generally go back up to 2 years. The app backfills 30 days on first connect and builds history from daily snapshots after that.

## 3. YouTube (Google Cloud)

1. https://console.cloud.google.com → create a project (e.g. "Creator Command Centre").
2. **APIs & Services → Library:** enable **YouTube Data API v3** and **YouTube Analytics API**.
3. **OAuth consent screen** (Google Auth Platform): User type **External**, app name, your email. Scopes: `youtube.readonly` and `yt-analytics.readonly`. Under **Audience → Test users**, add the Google account(s) that own your channels. Leaving it in **Testing** works but Google expires refresh tokens after 7 days in Testing, so **Publish app** (to "In production") once it works. For read-only scopes on your own channels, Google shows an "unverified app" notice you can click through; verification isn't required for personal use.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorised redirect URI: `https://wnuufmkrmppebzikxfdu.supabase.co/functions/v1/api/oauth-callback`
5. Copy **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`.
6. In the app: **Connect YouTube**. Pick the Google account, and if the channel is a **Brand Account**, choose that channel on Google's account picker. Repeat **Connect YouTube** once per channel.

**What the API gives you:** subscribers, total views, daily views, watch time, average view duration, likes, comments, shares, subscribers gained/lost, and per-video views, watch time, average view %, subscribers gained. First connect backfills ~13 months. YouTube Analytics data usually arrives 2 to 3 days late. The API doesn't label Shorts, so uploads of 3 minutes or less are treated as Shorts.

## 4. OpenAI
https://platform.openai.com/api-keys → create a key → `OPENAI_API_KEY`. Set a monthly budget limit in OpenAI billing. Without a key, the AI Strategist and Idea Generator still work using rule-based analysis and templates (clearly labelled).

## 5. Daily automatic sync
1. Set the `CRON_SECRET` secret (step 1.2).
2. Open `supabase/migrations/0002_daily_sync_cron.sql`, replace `<CRON_SECRET>` with the same value, and run it in **Supabase → SQL Editor**. It syncs every account at 02:30 IST each night.
3. You can always press **Sync now** in Settings.

---

## 6. Architecture

```
Browser (GitHub Pages, React)  ──supabase-js (anon key + your JWT)──▶  Postgres (RLS)
        │                                                                 ▲
        └── /functions/v1/api ──▶ Edge function "api" (Deno) ─service role┘
                                     ├─ OAuth start + /oauth-callback (Meta, Google)
                                     ├─ sync: Graph API / YouTube APIs → daily snapshots
                                     ├─ /cron (pg_cron, x-cron-secret)
                                     └─ /ai-strategist, /ai-ideas (OpenAI)
```

- **Secrets never reach the browser.** The page only has the public Supabase URL and anon key.
- **Tokens** are AES-256-GCM encrypted in `oauth_tokens` with `TOKEN_ENCRYPTION_KEY`; that table has RLS on and no client policies, so only the edge function can read it.
- **OAuth** uses a single-use `state` (15 min expiry) stored server-side to prevent CSRF; return URLs are restricted to `APP_URL` and localhost.
- **Roles:** every table is scoped by workspace with `owner / admin / editor / viewer` roles enforced by RLS (`has_workspace_role`). Admins connect accounts; editors plan content and deals; viewers read.

### Database schema (`supabase/migrations/0001_init.sql`)
| Table | Purpose |
|---|---|
| `workspaces`, `workspace_members`, `profiles` | Workspace per user, role-based membership |
| `social_accounts` | Connected IG accounts / YT channels, status, last sync, last error |
| `oauth_tokens` | Encrypted access/refresh tokens (service role only) |
| `oauth_states` | Short-lived OAuth CSRF state (service role only) |
| `account_daily_metrics` | One row per account per day: followers, gained/lost, views, reach, engaged, profile visits, likes, comments, shares, saves, watch time, avg view duration |
| `content_items` | One row per Reel / Short / video: title, caption, format, category, publish date, link |
| `content_metrics_snapshots` | Daily lifetime totals per post (views, reach, likes, comments, shares, saves, followers gained, retention) |
| `content_latest` (view) | Each post with its latest metrics |
| `sync_runs` | Sync log per account |
| `calendar_items` | Planned content: platform, date, status (idea/draft/ready/scheduled/published/repurpose), priority, hook, caption, script, hashtags |
| `brand_collaborations` | Brand deals: contact, type, paid/barter, quoted/final amount, deliverables, deadline, stage, payment status, performance |
| `ai_insights` | Saved AI answers with the exact data snapshot they were based on |
| `reports` | Saved weekly/monthly reports |

---

## 7. Local development
```bash
npm install
cp .env.example .env.local   # values are already in .env.production
npm run dev                  # http://localhost:5173
```
Deploy the backend function after changes (needs the Supabase CLI and a login):
```bash
supabase functions deploy api --project-ref wnuufmkrmppebzikxfdu --no-verify-jwt
```
(`--no-verify-jwt` is intentional: the function checks the user's JWT itself so the OAuth callback and cron can share it.)

Pushing to `main` rebuilds and redeploys the site through GitHub Actions (`.github/workflows/deploy.yml`).

## 8. Ongoing maintenance
- **Weekly:** glance at Settings → Connected accounts. A red "Access expired" means reconnect that account (password change, revoked access, or Google Testing-mode expiry).
- **Instagram tokens:** Page tokens don't expire on their own, but changing your Facebook password or removing the app revokes them. Reconnect when flagged.
- **Meta Graph API versions** are retired about 2 years after release. When Meta emails about deprecation, set `META_GRAPH_VERSION` to the newest version and run a sync to check.
- **Google:** keep the OAuth app "In production" or tokens expire every 7 days.
- **OpenAI cost:** each strategist answer is one small request; ideas are one larger request. Keep a budget limit in OpenAI.
- **Supabase free tier** pauses a project after a week with no activity. The daily cron keeps it active. If paused, restore it from the dashboard.
- **Sync health:** `select * from sync_runs order by started_at desc limit 50;` in the SQL editor shows recent runs and errors. Edge function logs are under Edge Functions → api → Logs.
- **Backups:** Supabase free tier has no point-in-time recovery; export important tables (brand deals, calendar) as CSV from the Table Editor occasionally.
