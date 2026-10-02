# Deploying VendoPOS

| Piece    | Host      | Address                          |
| -------- | --------- | -------------------------------- |
| Frontend | Vercel    | `https://vendopos.shop` (+ `www`) |
| Backend  | Render    | `https://api.vendopos.shop`     |
| Database | NeonDB    | (already running)                |
| Domain   | Hostinger | DNS records point at Vercel and Render |

Domain: **vendopos.shop** (registered at Hostinger) — already filled in below and in `render.yaml`.

> **Why the custom domain is required:** the session cookie is `SameSite=Lax`. The browser
> only sends it to the API when the frontend and API share a site, e.g. `vendopos.shop` and
> `api.vendopos.shop`. On the default `*.vercel.app` + `*.onrender.com` addresses, login
> appears to succeed but every later request is rejected with 401.

## 0. Before you start

1. **Rotate the Neon password.** An earlier `backend/.env.example` contained the real
   connection string, so it is in git history. Neon console → your project → **Roles** →
   `neondb_owner` → **Reset password**. Copy the new **pooled** connection string.
2. Merge this branch into `main` (or deploy this branch directly).

## 1. Backend on Render

1. Render dashboard → **New → Blueprint** → connect GitHub → pick `emciiowhy/VENDO`, branch
   to deploy (e.g. `main`). Render reads `render.yaml`.
2. Fill the prompted secrets:
   - `DATABASE_URL` — the new Neon connection string.
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from step 4 (can be added later).
   - `RESEND_API_KEY`, `ADMIN_ALERT_EMAIL` — optional; leave blank to log e-mails instead.
   - `JWT_SECRET` is generated automatically.
3. Click **Apply**. The build installs, compiles, runs the idempotent migration, then starts.
4. Check `https://vendopos-api.onrender.com/health` returns `{"ok":true,…}` (your service URL
   is shown at the top of the service page).
5. Service → **Settings → Custom Domains → Add** `api.vendopos.shop`. Render shows a
   CNAME target — keep it for step 3.

The plan is **Starter** with a 1 GB disk for uploaded images. On the Free plan the server
sleeps after 15 minutes idle (about 50 s to wake at the till) and uploaded images are erased
on every deploy; to use Free anyway, change `plan: free` and delete the `disk:` block.

## 2. Frontend on Vercel

1. vercel.com → **Add New → Project** → import `emciiowhy/VENDO`.
2. **Root Directory:** `frontend` (Framework preset: Next.js — build settings stay default).
3. **Environment Variables:** `NEXT_PUBLIC_API_URL` = `https://api.vendopos.shop`.
4. **Deploy.**
5. Project → **Settings → Domains** → add `vendopos.shop` and `www.vendopos.shop`
   (set `www` to redirect to the apex). Vercel shows the DNS records to create.

## 3. Domain DNS on Hostinger

hPanel → **Domains** → your domain → **DNS / Nameservers** → **DNS records**. Delete any
existing `A` record for `@` and `CNAME` for `www` that point to Hostinger parking, then add:

| Type  | Name  | Points to                                   | TTL  |
| ----- | ----- | ------------------------------------------- | ---- |
| A     | `@`   | `76.76.21.21` (or the IP Vercel shows)      | 3600 |
| CNAME | `www` | `cname.vercel-dns.com` (or what Vercel shows) | 3600 |
| CNAME | `api` | `vendopos-api.onrender.com` (what Render shows) | 3600 |

Keep the domain on Hostinger's nameservers. Propagation usually takes minutes, up to 24 h.
Then click **Verify** in both Vercel and Render; both issue HTTPS certificates automatically.

If you send e-mail with Resend from your domain, also add the DNS records Resend lists
(SPF/DKIM) here and set `EMAIL_FROM` to an address on that domain.

## 4. Google sign-in

Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID → Web
application**:

- Authorized JavaScript origins: `https://vendopos.shop`
- Authorized redirect URIs: `https://api.vendopos.shop/auth/google/callback`

Put the client ID/secret into Render's environment, then **Manual Deploy → Deploy latest commit**.
On the OAuth consent screen, publish the app (or add your accounts as test users).

## 5. First Super Admin

Neon → **SQL Editor**:

```sql
INSERT INTO users (email, name, role) VALUES ('you@gmail.com', 'Your Name', 'SUPER_ADMIN');
```

Sign in at `https://vendopos.shop/login` with that Google account → you land on `/admin`.

## 6. Smoke test

- `https://api.vendopos.shop/health` → `ok: true`
- Submit the demo form on the homepage → it appears in `/admin/leads`
- Approve the lead → sign in as the owner → add a product with an image → ring a sale on `/pos`
- Reload the page — you stay signed in (confirms the cookie domain is right)

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Signed in, but next page says signed out / 401 | `COOKIE_DOMAIN` must be `.vendopos.shop`, and the site must be opened on the custom domain, not `*.vercel.app` |
| "Could not reach the server" / CORS error | `CORS_ORIGIN` must list the exact origin in the browser bar (`https://`, with or without `www`) |
| Google says `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` and the Google console entry must match exactly |
| Product images vanish after a deploy | Uploads disk missing (Free plan) — see §1 |
| Render build fails on `tsc: not found` | Build command must keep `--include=dev` |
