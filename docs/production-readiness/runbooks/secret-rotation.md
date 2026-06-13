# Secret Rotation Runbook

Rotation procedures for the 5 credentials in `backend/.env`. Env var names below match `backend/app/config.py` exactly.

> **OUTSTANDING ROTATION ITEM (2026-06-12):** A real Clerk secret key
> (`sk_test_hfvK...`, instance `selected-longhorn-37.clerk.accounts.dev`) was
> committed to `backend/.env.example` in commit `340d8a1` and remains in the
> public git history. It cannot be removed from history — it MUST be treated
> as compromised. Rotate it using the Clerk section below if that instance is
> still in use; otherwise verify the instance is deleted/disabled.

## Where live values actually live

- **Railway service env vars** — the only place backend runtime secrets exist in production. Both the **backend** and **worker** services need updating (they share most vars).
- **GitHub Actions secrets** — used only by `ci.yml` for the frontend build/deploy. Of the 5 credentials in this runbook, only `SENTRY_AUTH_TOKEN` exists as a GitHub Actions secret (for frontend source map upload). The R2 keys, OpenRouter key, AssemblyAI key, and Clerk secret key are NOT in GitHub Actions. (The `CLOUDFLARE_API_TOKEN` / `RAILWAY_API_TOKEN` Actions secrets are separate deploy credentials, not covered here.)

Railway CLI syntax (verified against `railway variable set --help`):

```bash
railway link   # once, in the repo root
railway variable set KEY=VALUE --service <backend-service>
railway variable set KEY=VALUE --service <worker-service>
# or paste the value without shell history: railway variable set KEY --stdin --service <svc>
```

Setting a variable triggers a redeploy by default (use `--skip-deploys` to batch, then `railway redeploy`).

---

## 1. Cloudflare R2 access key + secret

Env vars: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

- **Rotate:** Cloudflare dashboard → R2 → Overview → "Manage R2 API Tokens" (`dash.cloudflare.com` → R2 → API Tokens). Create a new token with Object Read & Write scoped to the bucket; copy the Access Key ID + Secret Access Key.
- **Update:** Railway backend + worker services (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). Not in GitHub Actions.
- **Verify:** upload a video in the app (exercises presigned PUT) and play one back (presigned GET); or `railway logs --service <backend-service>` for boto3 auth errors.

## 2. OpenRouter API key

Env var: `OPENROUTER_API_KEY`

- **Rotate:** openrouter.ai → Settings → API Keys (`openrouter.ai/settings/keys`) → Create Key.
- **Update:** Railway backend + worker services. Not in GitHub Actions.
- **Verify:** run an analysis on an existing transcript; confirm LLM calls succeed (worker logs, or Settings page balance check which hits OpenRouter).

## 3. AssemblyAI API key

Env var: `ASSEMBLYAI_API_KEY`

- **Rotate:** assemblyai.com dashboard → Account → API Keys (`www.assemblyai.com/app`) → regenerate/create key.
- **Update:** Railway backend + worker services. Not in GitHub Actions.
- **Verify:** upload a short video and confirm transcription completes.

## 4. Sentry auth token

Env var: `SENTRY_AUTH_TOKEN`

- **Rotate:** sentry.io → Settings → Auth Tokens (`sentry.io/settings/auth-tokens/`) → create new org auth token with `project:releases` scope.
- **Update:**
  - Railway backend service (`SENTRY_AUTH_TOKEN`).
  - GitHub Actions secret `SENTRY_AUTH_TOKEN` (repo → Settings → Secrets and variables → Actions) — used by the `deploy-frontend` job for source map upload.
- **Verify:** push to main; confirm the frontend build's Sentry source map upload step succeeds and a new release appears in Sentry.

## 5. Clerk secret key

Env var: `CLERK_SECRET_KEY`

- **Rotate:** dashboard.clerk.com → (select application/instance) → Configure → API Keys → Secret keys → Add new key, then revoke the old one after cutover.
- **Update:** Railway backend service. Not in GitHub Actions (the frontend uses only the publishable key).
- **Verify:** sign in to the production app and load a project (exercises JWT verification against Clerk); check backend logs for 401s.

---

## Closeout (every rotation)

1. Update local `backend/.env` with the new values.
2. Revoke the old keys in each provider dashboard (Clerk and R2 require explicit revoke; OpenRouter/AssemblyAI/Sentry: delete the old token).
3. Confirm the app is healthy end-to-end: upload → transcribe → analyze.
