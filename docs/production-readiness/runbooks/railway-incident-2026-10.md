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
- Admin access to OpenRouter, Clerk, Cloudflare (R2), AssemblyAI, Sentry, and
  the GitHub repo's Actions secrets.

Services that carry secrets: **backend, worker, beat** (all three run
`app.config.Settings`, so all three need every app secret), plus the
Railway-managed **Postgres** and **Redis** services.

## What was exposed, by blast radius

| # | Variable(s) | Lives on | What an attacker can do with it |
|---|---|---|---|
| 1 | Postgres password (`DATABASE_URL`, `DATABASE_PUBLIC_URL`, `PG*`) | Postgres, backend, worker, beat | Read and write every project, transcript, analysis and user row from the internet if the public TCP proxy is still on (our runbooks use `DATABASE_PUBLIC_URL`, so it was on). Write access includes `users.role`. |
| 2 | `ENCRYPTION_KEY` | backend, worker, beat | Combined with #1: decrypt every BYOK user's OpenRouter key in `users.encrypted_api_key`. These keys are exactly what this campaign is after. |
| 3 | `OPENROUTER_API_KEY` | backend, worker, beat | Spend the shared OpenRouter balance. An AI provider key, which is what the attacker was after. |
| 4 | `ASSEMBLYAI_API_KEY` | backend, worker, beat | Spend AssemblyAI credit, and list and download every transcript AssemblyAI still holds. The app never deletes transcripts there. Also an AI provider key. |
| 5 | `CLERK_SECRET_KEY` | backend (and worker/beat if set) | Clerk Backend API: list users, mint sign-in tokens, so they can impersonate any user. |
| 6 | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | backend, worker, beat | List, download, overwrite or delete every uploaded interview recording. |
| 7 | Redis password (`REDIS_URL`, `REDIS_PASSWORD`) | Redis, backend, worker, beat | Read results (10-min TTL) and enqueue Celery tasks. Celery accepts JSON only, so no pickle RCE. |
| 8 | `SENTRY_AUTH_TOKEN`, `SENTRY_DSN` | backend (if set) | Token: Sentry API under its scopes. DSN: spam events (low). |
| 9 | Railway API token, GitHub link | Railway / GitHub Actions | Already invalidated by Railway; CI's deploy-wait job and auto-deploy break until replaced. |

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

1. Railway → Postgres service → Database → Credentials → **Regenerate
   password**. Use this button rather than editing `PGPASSWORD` by hand or
   running `ALTER USER`: it changes the role password and the service
   variables together. It restarts Postgres.
2. Check how backend, worker and beat get `DATABASE_URL`. A reference
   (`${{Postgres.DATABASE_URL}}`) follows the new password automatically. A
   pasted literal does not: set it again.
3. Redeploy backend, worker and beat (containers read variables only at
   start).
4. Railway → Postgres → Settings → Networking: if a **TCP proxy** is still
   enabled, remove it. For ad-hoc queries, use `railway ssh --service backend`
   instead of `DATABASE_PUBLIC_URL`. `db-snapshot.md`, `stuck-video.md` and
   `deploy-interrupt-recovery.md` assume the proxy exists.

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

dashboard.clerk.com → production instance → API Keys → add a new secret key →
set it on every service that has `CLERK_SECRET_KEY` (at least backend) →
redeploy → revoke the old key. Review users and sessions created since
2026-10-20 13:58 UTC and the instance's audit or webhook logs for Backend-API
sign-in tokens you didn't issue.
While you are in Clerk, close the outstanding item in `secret-rotation.md`:
the `sk_test_hfvK...` key from git history.

### 6. Cloudflare R2 — `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

Cloudflare → R2 → Manage R2 API Tokens → create a token (Object Read & Write,
this bucket only) → set both values on backend, worker and beat → redeploy →
**delete** the old token. Check the bucket's metrics for Class A/B operations
and egress since 2026-10-20 13:58 UTC that don't match upload and playback
traffic.

### 7. Redis password

Railway → Redis service → Database → **Regenerate password**. It updates the
password and the service variables, and restarts Redis; the `--requirepass
$REDIS_PASSWORD` startCommand in `docs/ops/redis-config.md` picks it up. Then
re-set `REDIS_URL` on backend, worker and beat if it is a pasted literal (also
`CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` if set), and redeploy all
three.

### 8. Sentry

If `SENTRY_AUTH_TOKEN` is set on any Railway service: rotate it per
`secret-rotation.md` §4 (it is also a GitHub Actions secret). Rotating the
`SENTRY_DSN` client key is optional; a leaked DSN can only send events.

### 9. Railway API token and GitHub connection

- Railway → Account → Tokens → create a workspace token → repo Settings →
  Secrets and variables → Actions → update `RAILWAY_API_TOKEN`. Until you do,
  the `deploy-wait` CI job fails.
- Railway → each service → Settings → Source: reconnect the GitHub repo if it
  shows as disconnected, or auto-deploy from `main` will not fire.
- Update your local `backend/.env` with any values you use locally.

## Verification

- `curl -s https://api.methodex.ai/health/ready` returns 200.
- Sign in to production, upload a short video, and confirm it transcribes and
  analyzes (exercises Clerk, R2, AssemblyAI, OpenRouter, Redis, Postgres).
- A BYOK account's Settings page shows its key and balance (exercises
  `ENCRYPTION_KEY`).
- Old OpenRouter, Clerk, R2, AssemblyAI and Sentry keys are deleted in each
  provider dashboard, not just replaced in Railway.
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
