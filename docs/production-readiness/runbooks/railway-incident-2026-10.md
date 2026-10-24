# Railway security incident (2026-10-21) — response

## When to use it

Railway's preliminary report
(https://blog.railway.com/p/preliminary-report-october-security-incident):

- **Exposure window:** 2026-10-20 13:58 UTC to 2026-10-22 03:32 UTC, when
  Railway confirmed the attacker no longer had access to internal systems.
  Every "check activity since" below means since **2026-10-20 13:58 UTC**.
- **What:** environment variables, some decrypted, for at most 1.85% of
  workspaces (about 100,000). Railway recommends rotating credentials for every
  workspace created before 2026-10-21. Methodex's was, so rotate.
- **Why:** the attacker was after AI provider API keys. For Methodex that is
  the shared OpenRouter key, every BYOK user's OpenRouter key, and the
  AssemblyAI key.
- **How** (per third-party summaries of the report; the forensic
  investigation is ongoing): from Railway's build infrastructure, to CI
  credentials, to decrypted environment variables.

Railway hasn't said which workspaces are in the 1.85%, so **treat every
variable on every Methodex service as exposed** and work through this runbook
top to bottom.

What Railway already did (per public reporting; confirm on status.railway.com):
signed everyone out, invalidated **all** API tokens, reset GitHub connection
credentials, rotated storage-bucket credentials (Methodex uses Cloudflare R2,
not Railway buckets, so that part does not apply), paused and then restored
builds in stages by plan tier, and on some projects revoked public TCP proxies
on databases.

## Prerequisites

- Railway dashboard access (sign in again; old sessions were revoked).
- Railway CLI re-authenticated: `railway login && railway link` in the repo root.
- Admin access to OpenRouter, Clerk, Cloudflare (R2 and the
  `methodex-frontend` Pages project), AssemblyAI, Sentry, and the GitHub
  repo's Actions secrets.
- Wrangler authenticated to that Cloudflare account (`wrangler login`), for
  the Pages secret in step 5.

Services that carry secrets: **backend, worker, beat** (all three run
`app.config.Settings`, so all three need every app secret), plus the
Railway-managed **Postgres** and **Redis** services. Outside Railway, the
Cloudflare Pages project **methodex-frontend** holds a second copy of
`CLERK_SECRET_KEY` (step 5).

## What was exposed, by blast radius

| # | Variable(s) | Lives on | What an attacker can do with it |
|---|---|---|---|
| 1 | Postgres password (`DATABASE_URL`, `DATABASE_PUBLIC_URL`, `PG*`) | Postgres, backend, worker, beat | Read and write every project, transcript, analysis and user row from the internet while the public TCP proxy was on. It was on through the exposure window (our runbooks used `DATABASE_PUBLIC_URL`) and was deleted on 2026-10-24. Write access includes `users.role`. |
| 2 | `ENCRYPTION_KEY` | backend, worker, beat | Combined with #1: decrypt every BYOK user's OpenRouter key in `users.encrypted_api_key`. These keys are exactly what this campaign is after. |
| 3 | `OPENROUTER_API_KEY` | backend, worker, beat | Spend the shared OpenRouter balance. An AI provider key, which is what the attacker was after. |
| 4 | `ASSEMBLYAI_API_KEY` | backend, worker, beat | Spend AssemblyAI credit, and list and download every transcript AssemblyAI still holds. The app never deletes transcripts there. Also an AI provider key. |
| 5 | `CLERK_SECRET_KEY` | backend (and worker/beat if set), Cloudflare Pages `methodex-frontend` | Clerk Backend API: list users, mint sign-in tokens, so they can impersonate any user. |
| 6 | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | backend, worker, beat | List, download, overwrite or delete every uploaded interview recording. |
| 7 | Redis password (`REDIS_URL`, `REDIS_PASSWORD`) | Redis, backend, worker, beat | Read results (10-min TTL) and enqueue Celery tasks, from the internet while Redis's TCP proxy was on (deleted 2026-10-24). Celery accepts JSON only, so no pickle RCE. |
| 8 | `SENTRY_AUTH_TOKEN`, `SENTRY_DSN` | backend (if set) | Token: Sentry API under its scopes. DSN: spam events (low). |
| 9 | Railway API token, GitHub link | your machine, Railway | Already invalidated by Railway. Local scripts that call the Railway API, and auto-deploy from GitHub, break until replaced. |

Inventory anything else actually set (the table above is what the code reads):

```bash
for s in backend worker beat Postgres Redis; do
  echo "== $s"; railway variables --service "$s" --kv | sed 's/=.*//' | sort
done
```

Any name that isn't a plain setting (`APP_ENV`, `RATE_LIMIT_*`, ...) is a
secret: rotate it too.

## Commands

Do the steps in order. Steps 1 to 6 change secrets that hold user data or
money. Batch variable changes with `--skip-deploys`, then redeploy each
service once:

```bash
railway variable set KEY --stdin --skip-deploys --service backend   # paste, Enter, Ctrl-D
# ...repeat for worker and beat...
railway redeploy --service backend && railway redeploy --service worker && railway redeploy --service beat
```

### 0. Capture evidence before you rotate

Rotation restarts services, and restarts cost logs. Export these first:

- Railway → Postgres service → Logs, from 2026-10-20 13:58 UTC onward: look
  for connections or auth failures you can't attribute to backend, worker or
  beat.
- Railway → each service → Deployments: any build or deploy inside the window
  is unexpected (`main` hasn't changed since 2026-08-19), and the attacker was
  in Railway's build infrastructure. If you find one, roll back to a
  deployment built before 2026-10-20 or rebuild from `main`.
- Admins in the DB (an attacker with #1 could have promoted an account):
  ```sql
  SELECT id, email, role, created_at FROM users WHERE role = 'admin' ORDER BY created_at;
  ```
- The list of users who must be told to revoke their OpenRouter key (step 2):
  ```bash
  railway ssh --service backend
  python scripts/reencrypt_byok_keys.py --list-users   # copy the CSV it prints somewhere safe
  ```
  `scripts/reencrypt_byok_keys.py` is in the backend image once this change is
  deployed. Until then, run the same `SELECT id, email, key_hint FROM users
  WHERE encrypted_api_key IS NOT NULL` by hand.

### 1. Postgres password

1. Railway → Postgres service → Database → Config → **Regenerate
   password**. Use this button rather than editing `PGPASSWORD` by hand or
   running `ALTER USER`: it changes the role password and the service
   variables together. It restarts Postgres.
2. backend, worker and beat all set `DATABASE_URL` to the reference
   `${{Postgres.DATABASE_URL}}`, so they follow the new password with nothing
   to re-set. Keep it a reference: a pasted literal goes stale on the next
   regenerate.
3. Redeploy backend, worker and beat (containers read variables only at
   start).
4. Railway → Postgres → Settings → Networking should show no **TCP proxy**.
   The Postgres and Redis proxies were deleted on 2026-10-24; don't re-enable
   them. `DATABASE_PUBLIC_URL` no longer reaches the database, so run ad-hoc
   queries from `railway ssh --service backend`. `db-snapshot.md`,
   `stuck-video.md`, `deploy-interrupt-recovery.md` and `redis-inspect.md`
   still assume the proxies exist.

### 2. ENCRYPTION_KEY and the BYOK keys it protects

If #1 and #2 both leaked, every stored BYOK key may already be decrypted.
Rotating `ENCRYPTION_KEY` protects keys from now on. It does not un-leak the
old ones, so users must also revoke them.

**Do not** swap straight to a new single key: every stored key would fail to
decrypt, and `byok_service.resolve_byok()` clears a user's key the
first time that happens.

```bash
NEW=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
OLD=<current ENCRYPTION_KEY value>
# a. new primary + old fallback, on backend, worker AND beat, then redeploy all three
railway variable set "ENCRYPTION_KEY=$NEW,$OLD" --skip-deploys --service backend   # + worker, beat
# b. re-encrypt every stored key under NEW
railway ssh --service backend
python scripts/reencrypt_byok_keys.py          # dry run: expect "N key(s) re-encrypted", no WARNING
python scripts/reencrypt_byok_keys.py --apply
# c. drop OLD on all three services, then redeploy all three
railway variable set "ENCRYPTION_KEY=$NEW" --skip-deploys --service backend      # + worker, beat
```

Then email every user on the `--list-users` CSV from step 0 and tell them to revoke the key
ending in the listed hint at openrouter.ai/settings/keys, check their
OpenRouter activity since 2026-10-20 13:58 UTC, and paste a new key into Methodex
Settings.

### 3. Shared OpenRouter key — `OPENROUTER_API_KEY`

openrouter.ai/settings/keys → create a new key with a credit limit → set it on
backend, worker and beat → redeploy → **delete** the old key. Check OpenRouter
Activity since 2026-10-20 13:58 UTC for spend that doesn't match the app's
models or volume.

### 4. AssemblyAI — `ASSEMBLYAI_API_KEY`

AssemblyAI dashboard → API Keys → create a new key → set it on backend, worker
and beat → redeploy → delete the old key. Check usage since 2026-10-20 13:58
UTC for transcriptions you didn't submit and for transcript list or GET
traffic.

### 5. Clerk — `CLERK_SECRET_KEY`

The key lives in two places. Update both before you revoke the old key, or
methodex.ai stops signing anyone in:

- **Railway:** backend (and worker/beat if set).
- **Cloudflare Pages:** a production secret on the `methodex-frontend`
  project. The Pages Function `frontend/functions/__clerk/[[path]].ts` sends
  it as the `Clerk-Secret-Key` header when it proxies Clerk's Frontend API at
  `methodex.ai/__clerk`. CI's "Deploy Frontend" job doesn't set it, so a
  deploy alone never changes it.

On 2026-10-24 the key was rotated on Railway only. methodex.ai hung on
"Loading..." with "The secret key given with this proxy request is invalid"
until the Pages secret was updated and the frontend redeployed.

1. dashboard.clerk.com → production instance → API Keys → add a new secret
   key.
2. Set it in both places from one prompt, so the value stays out of shell
   history:
   ```bash
   read -rs CLERK_SK   # paste the new key, Enter
   printf '%s' "$CLERK_SK" | railway variable set CLERK_SECRET_KEY --stdin --skip-deploys --service backend   # + worker, beat if set
   printf '%s' "$CLERK_SK" | wrangler pages secret put CLERK_SECRET_KEY --project-name methodex-frontend
   unset CLERK_SK
   ```
3. Redeploy backend (and worker/beat if you set it there).
4. Pages secrets only reach new deployments: the live site keeps the old key
   until the next one. Re-run the "Deploy Frontend" job (GitHub → Actions →
   CI → latest run on `main` → Re-run jobs → Deploy Frontend), then confirm
   the newest production deployment is newer than the `secret put`:
   `wrangler pages deployment list --project-name methodex-frontend --environment production`.
5. Revoke the old key in Clerk.
6. Check that this prints `200`, and that you can sign in to methodex.ai and
   load a project:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://methodex.ai/__clerk/v1/environment
   ```
   Only a check after the revoke counts: while the old key is still valid,
   this returns 200 whichever key Pages has. Anything else (with "The secret
   key given with this proxy request is invalid" in the body) means the live
   Pages deployment still has the old key: redo steps 2 and 4.
7. Review users and sessions created since 2026-10-20 13:58 UTC and the
   instance's audit or webhook logs for Backend-API sign-in tokens you didn't
   issue.

While you are in Clerk, close the outstanding item in `secret-rotation.md`:
the `sk_test_hfvK...` key from git history.

### 6. Cloudflare R2 — `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

Cloudflare → R2 → Manage R2 API Tokens → create a token (Object Read & Write,
this bucket only) → set both values on backend, worker and beat → redeploy →
**delete** the old token. Check the bucket's metrics for Class A/B operations
and egress since 2026-10-20 13:58 UTC that don't match upload and playback
traffic.

### 7. Redis password

Railway → Redis service → Database → Config → **Regenerate password**. It
updates the password and the service variables, and restarts Redis; the
`--requirepass $REDIS_PASSWORD` startCommand in `docs/ops/redis-config.md`
picks it up. backend, worker and beat all set `REDIS_URL` to the reference
`${{Redis.REDIS_URL}}`, so they follow the new password. `CELERY_BROKER_URL`
and `CELERY_RESULT_BACKEND` fall back to `REDIS_URL` when unset
(`backend/app/config.py`); if either is set as a literal, re-set it. Redeploy
all three.

### 8. Sentry

If `SENTRY_AUTH_TOKEN` is set on any Railway service: rotate it per
`secret-rotation.md` §4 (it is also a GitHub Actions secret). Rotating the
`SENTRY_DSN` client key is optional; a leaked DSN can only send events.

### 9. Railway API token and GitHub connection

- CI doesn't use a Railway token: the deploy-wait job was removed in #30
  (see the note at the end of `.github/workflows/ci.yml`). If a
  `RAILWAY_API_TOKEN` Actions secret still exists, delete it rather than
  replace it. Create a new token (Railway → Account → Tokens) only for local
  use of `scripts/railway-service-config.py` or
  `scripts/ci/wait-for-railway-deploy.py`, and re-run `railway login`.
- Railway → each service → Settings → Source: reconnect the GitHub repo if it
  shows as disconnected, or auto-deploy from `main` will not fire.
- Update your local `backend/.env` with any values you use locally.

## Verification

- `curl -s https://api.methodex.ai/health/ready` returns 200.
- Sign in to production, upload a short video, and confirm it transcribes and
  analyzes (exercises Clerk, R2, AssemblyAI, OpenRouter, Redis, Postgres).
- With the old Clerk key revoked,
  `curl -s -o /dev/null -w '%{http_code}\n' https://methodex.ai/__clerk/v1/environment`
  prints `200` (exercises the Pages copy of `CLERK_SECRET_KEY`).
- A BYOK account's Settings page shows its key and balance (exercises
  `ENCRYPTION_KEY`).
- Old OpenRouter, Clerk, R2, AssemblyAI and Sentry keys are deleted in each
  provider dashboard, not just replaced in Railway and Cloudflare Pages.
- Railway → Postgres and Redis → Settings → Networking show no TCP proxy.
- `railway variables --service <svc> --kv` on backend, worker and beat shows a
  single key in `ENCRYPTION_KEY`.

## Escalation

- If step 0 or any provider's logs show access you can't explain, stop
  treating this as hygiene. Uploaded interviews and transcripts are research
  participants' personal data, so evidence that they were accessed can start
  breach-notification clocks (GDPR's is 72 hours from awareness). Bring in
  counsel and preserve the logs.
- `reencrypt_byok_keys.py` prints `WARNING ... could not be decrypted`: those
  rows were already unreadable under the old key. Leave them; those users
  re-enter their key.
