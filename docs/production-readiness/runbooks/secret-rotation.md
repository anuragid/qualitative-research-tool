# Secret Rotation Runbook

This runbook covers rotation of the 5 critical credentials in the backend `.env` file. All credentials are also referenced in GitHub Actions secrets and/or Railway service environment variables.

## Cloudflare R2 Access Key + Secret

**Where to rotate:**
- Cloudflare Dashboard → R2 → Settings → API Tokens → (find and delete old token) → Create New API Token

**Step-by-step:**
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to R2 → Settings → API Tokens
3. Click "Create API Token"
4. Grant permissions: `Object List`, `Object Read`, `Object Write`, `Object Delete` for all buckets
5. Copy the **Access Key ID** and **Secret Access Key**
6. Update locally in `backend/.env`:
   ```
   CLOUDFLARE_R2_ACCESS_KEY=<new-access-key>
   CLOUDFLARE_R2_SECRET_KEY=<new-secret-key>
   ```
7. Update in Railway:
   ```bash
   railway link  # if needed
   railway service list  # find backend service ID
   railway service set R2_ACCESS_KEY=<new-access-key>
   railway service set R2_SECRET_KEY=<new-secret-key>
   ```
8. Or via GitHub Actions secrets (if used for deploys):
   - Go to repo Settings → Secrets and variables → Actions
   - Update `CLOUDFLARE_R2_ACCESS_KEY` and `CLOUDFLARE_R2_SECRET_KEY`

**Verification:**
- Test R2 access: `boto3` call in backend works without errors
- Check Railway logs: `railway logs --follow` and confirm no auth errors

**Revoke old credentials:**
- Cloudflare Dashboard → R2 → Settings → API Tokens → delete old token

---

## OpenRouter API Key

**Where to rotate:**
- [OpenRouter Settings](https://openrouter.ai/account/api-keys) → API Keys section

**Step-by-step:**
1. Go to [openrouter.ai](https://openrouter.ai/) and log in
2. Navigate to Account Settings → API Keys
3. Generate a new API key
4. Copy the key
5. Update locally in `backend/.env`:
   ```
   OPENROUTER_API_KEY=<new-key>
   ```
6. Update in Railway:
   ```bash
   railway service set OPENROUTER_API_KEY=<new-key>
   ```
7. Or update GitHub Actions secret `OPENROUTER_API_KEY` if used for tests/deploys

**Verification:**
- Run a test analysis job: verify calls to OpenRouter API succeed
- Check backend logs for successful LLM invocations

**Revoke old credentials:**
- OpenRouter Settings → API Keys → delete old key

---

## AssemblyAI API Key

**Where to rotate:**
- [AssemblyAI Dashboard](https://www.assemblyai.com/app/account) → API Keys

**Step-by-step:**
1. Go to [Assemblyai.com](https://www.assemblyai.com/) and log in
2. Navigate to Account → API Keys
3. Generate a new API key
4. Copy the key
5. Update locally in `backend/.env`:
   ```
   ASSEMBLYAI_API_KEY=<new-key>
   ```
6. Update in Railway:
   ```bash
   railway service set ASSEMBLYAI_API_KEY=<new-key>
   ```
7. Or update GitHub Actions secret `ASSEMBLYAI_API_KEY`

**Verification:**
- Upload a test video and run transcription
- Confirm transcription completes without auth errors

**Revoke old credentials:**
- AssemblyAI Dashboard → API Keys → delete old key (or it auto-rotates)

---

## Sentry Auth Token

**Where to rotate:**
- [Sentry Settings](https://sentry.io/settings/account/api/auth-tokens/) → Auth Tokens

**Step-by-step:**
1. Go to [sentry.io](https://sentry.io/) and log in
2. Settings (profile icon) → Auth Tokens
3. Click "Create New Token"
4. Grant scopes: `project:write`, `event:write`, `org:read` (check current token scopes if unsure)
5. Copy the token
6. Update locally in `backend/.env`:
   ```
   SENTRY_AUTH_TOKEN=<new-token>
   ```
7. Update in Railway:
   ```bash
   railway service set SENTRY_AUTH_TOKEN=<new-token>
   ```
8. Update GitHub Actions secret:
   - Settings → Secrets and variables → Actions → `SENTRY_AUTH_TOKEN`

**Verification:**
- Deploy a new backend version with `SENTRY_ORG` and `SENTRY_PROJECT` set
- Confirm `npm run build` (frontend) completes source map upload to Sentry
- Check [Sentry Release](https://sentry.io/releases/) page for new release with source maps

**Revoke old credentials:**
- Sentry Settings → Auth Tokens → delete old token

---

## Clerk Secret Key

**Where to rotate:**
- [Clerk Dashboard](https://dashboard.clerk.com/) → API Keys → Secret Key

**Step-by-step:**
1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Select the project (if not auto-selected)
3. Locate the **Secret Key** under API Keys
4. Click the (circled "i") info icon or "Reveal" to confirm you're viewing it
5. Click the copy icon or "Create New Secret Key" if Clerk allows rotation (check Clerk docs)
6. Update locally in `backend/.env`:
   ```
   CLERK_SECRET_KEY=<new-secret>
   ```
7. Update in Railway:
   ```bash
   railway service set CLERK_SECRET_KEY=<new-secret>
   ```
8. Update GitHub Actions secret (if used for tests):
   - Settings → Secrets and variables → Actions → `CLERK_SECRET_KEY`

**Verification:**
- Restart backend service
- Test user sign-in: create a new session and confirm JWT verification passes
- Check backend logs for no `Clerk` auth errors

**Revoke old credentials:**
- Clerk Dashboard: old secret is auto-revoked on new secret generation (check Clerk UI or API)

---

## Full Rotation Workflow

1. **Plan & communicate:** Schedule rotation (e.g., off-hours if needed)
2. **Rotate all 5 credentials** in order above
3. **Update Railway** with all new values:
   ```bash
   railway link
   railway service set R2_ACCESS_KEY=... R2_SECRET_KEY=... OPENROUTER_API_KEY=... ASSEMBLYAI_API_KEY=... SENTRY_AUTH_TOKEN=... CLERK_SECRET_KEY=...
   railway up  # or push via git (recommended)
   ```
4. **Update GitHub Actions secrets** (if used for CI/deploy):
   - Repo Settings → Secrets and variables → Actions
   - Update all 5 secrets
5. **Verify** in production:
   - Check logs: `railway logs --follow`
   - Test end-to-end: upload video → transcribe → analyze
   - Confirm Sentry/PostHog metrics post normally
6. **Local .env:** update with new values for future local dev
7. **Revoke old credentials** in each service dashboard (see above)

---

## Notes

- **All credentials are environment variables:** Changes take effect on next service restart
- **Railway auto-deploys:** Pushing `.env` updates via Railway CLI triggers redeploy; git push does not (config is Railway-managed, not code)
- **GitHub Actions secrets:** Used only in `ci.yml` for frontend builds and Sentry source map uploads; backend does NOT use GitHub secrets at runtime
- **Gitleaks pre-commit hook:** Prevents accidental commit of credentials to git history

For further assistance, consult Railway docs, service dashboards, or ping the team.
