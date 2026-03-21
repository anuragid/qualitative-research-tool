# Security Audit & Remediation — methodex.ai

**Date:** 2026-03-21
**Scope:** Full-stack security audit with fixes and production deployment verification
**Approach:** Domain-parallel agent teams (Approach B)

## Out of Scope
- Credential rotation (user will handle separately)
- Penetration testing from external networks
- Load/stress testing

## Team Structure

### Team 1: Auth & Secrets
**Owns:** Authentication, authorization, encryption, credential handling.

**Fixes:**
1. **Clerk proxy refactor** — `/__clerk_fwd/` currently forwards `CLERK_SECRET_KEY` to Clerk's Frontend API (`frontend-api.clerk.dev`). The Frontend API only needs the publishable key. Remove secret key from proxy headers. Secret key should only be used for backend-to-backend Clerk calls (JWKS fetching).
   - File: `backend/app/main.py` (line 196)

2. **ENCRYPTION_KEY enforcement** — Change from warning to hard failure at startup when `APP_ENV=production` and `ENCRYPTION_KEY` is empty. Add validation in `config.py` or `main.py` lifespan.
   - Files: `backend/app/config.py`, `backend/app/main.py`

3. **BYOK key lifecycle hardening** — Full path audit:
   - UI input → HTTPS transit → backend receives in request body → validates against OpenRouter → encrypts with Fernet → stores in DB → decrypted in Celery worker → used for LLM call → discarded
   - Add: key masking in all log statements, zeroing decrypted keys after use, ensuring keys never appear in error responses or task results
   - Files: `backend/app/routes/users.py`, `backend/app/services/byok_service.py`, `backend/app/services/encryption_service.py`, `backend/app/tasks/analysis_tasks.py`

4. **Dev bypass hardening** — Add explicit startup failure (not warning) if `APP_ENV=production` and dev bypass would be active. Ensure `_is_dev` flag cannot be true in production.
   - File: `backend/app/auth.py`, `backend/app/main.py`

### Team 2: Input Safety
**Owns:** Prompt injection protection, input validation, output validation, CSP.

**Fixes:**
1. **Prompt injection protection** — Wrap all user-controlled content in XML delimiters (`<user_input>`, `<speaker_label>`, `<research_context>`) in LLM prompts. Add system prompt instructions telling the model to treat delimited content as data, not instructions.
   - Files: `backend/app/agents/nodes/*.py`, `backend/app/agents/prompts.py`

2. **Input length limits** — Add Pydantic field validators:
   - `project_description`: max 5000 chars
   - `speaker_name`: max 100 chars
   - `speaker_role`: max 100 chars
   - Files: `backend/app/models/schemas.py`

3. **Output validation** — Validate LLM outputs against expected schemas before storing. Each analysis node should verify its output matches the expected structure (valid JSON, expected keys, reasonable lengths). Reject and retry on malformed output.
   - Files: `backend/app/agents/nodes/*.py`

4. **CSP headers on frontend** — Add Content-Security-Policy via Cloudflare Pages `_headers` file:
   ```
   default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.methodex.ai https://*.clerk.accounts.dev; img-src 'self' data:; object-src 'none'; frame-ancestors 'none';
   ```
   - File: `frontend/public/_headers` (new file)

5. **Input sanitization utility** — Create a shared utility that strips/escapes control characters and prompt injection patterns from user inputs before they reach the LLM pipeline.
   - File: `backend/app/utils/input_sanitizer.py` (new file)

### Team 3: Infrastructure Hardening
**Owns:** Rate limiting, security headers, error disclosure, dependency audit, logging.

**Fixes:**
1. **Rate limiting improvement** — Add per-user rate limiting (by `user_id` from JWT) in addition to per-IP. This prevents a single authenticated user from overwhelming the API and works correctly behind proxies.
   - Files: `backend/app/main.py`, `backend/app/config.py`

2. **Dependency audit** — Pin `openai` package version in `requirements.txt`. Run `pip audit` and `npm audit` to check for known vulnerabilities. Fix any found.
   - Files: `backend/requirements.txt`, `frontend/package.json`

3. **Sensitive data in logs** — Audit all `logger.*` calls for potential credential/transcript leakage. Add log scrubbing for API keys (mask to last 4 chars). Ensure LLM response content is not logged at INFO level.
   - Files: `backend/app/services/llm_service.py`, `backend/app/routes/*.py`

4. **Error response hardening** — Verify no internal paths, stack traces, or sensitive data leak in error responses. Add explicit redaction for any error that might contain user data.
   - File: `backend/app/main.py`

5. **OpenAPI docs production check** — Verify docs endpoints (`/docs`, `/redoc`, `/openapi.json`) are confirmed disabled in production (already conditional on DEBUG, but verify live).

### Team 4: Deploy & Verify
**Owns:** Taking all fixes live and validating production state. Runs AFTER teams 1-3 complete.

**Steps:**
1. **Pre-deploy checks** — Run backend tests, frontend build, lint
2. **Commit all changes** — Single commit with all security fixes
3. **Deploy via git push** — Push to trigger CI/CD pipeline (never bypass with direct deploy)
4. **Live site verification:**
   - Test CSP headers on methodex.ai
   - Test security headers on api.methodex.ai
   - Verify `/docs`, `/redoc`, `/openapi.json` return 404
   - Verify health endpoint returns minimal info
   - Verify CORS rejects unauthorized origins
   - Test that dev bypass tokens are rejected in production
   - Verify ENCRYPTION_KEY is set (check startup logs or test BYOK flow)
5. **Key lifecycle verification** — Test BYOK flow end-to-end:
   - Set a test API key via the settings UI
   - Verify it's encrypted in the database (not plaintext)
   - Run an analysis to verify decryption works
   - Delete the key and verify it's removed
6. **Regression check** — Verify core functionality still works (upload, transcribe, analyze)

## Success Criteria
- All CRITICAL and HIGH findings from the audit are resolved
- Live site passes all verification checks
- No regressions in core functionality
- All changes deployed via CI/CD (not direct deploy)
