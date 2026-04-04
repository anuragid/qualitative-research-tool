# Security Hardening — Targeted Fixes (Approach 1)

**Date**: 2026-04-04
**Status**: Approved
**Threat model**: External attackers, curious students, cost abuse — all weighted equally
**Strategy**: Incremental PRs, no downtime, each verified independently

---

## Context

Full security audit completed 2026-04-04 across backend, frontend, and infrastructure. The app (methodex) is live on Railway (backend) + Cloudflare Pages (frontend) serving students for class assignments. No compliance requirements (no IRB/FERPA). Secrets are local-only (.env in .gitignore, never committed).

### What's already solid
- Prompt injection: defense-in-depth with `_INJECTION_GUARD` on all 8 system prompts, XML delimiter boundaries, `input_sanitizer.py`
- SQL injection: 100% SQLAlchemy ORM, zero raw SQL
- Command injection: no subprocess/os.system/shell=True
- Path traversal: UUID-based S3 keys, server-side path construction
- SSRF: no user-controlled URLs in server-side fetches
- Deserialization: Celery JSON-only (`accept_content=["json"]`)
- XSS: no dangerouslySetInnerHTML, no eval()
- Auth architecture: Clerk JWT + startup validation prevents dev bypass in production
- Error handling: path redaction, generic client messages, no stack traces
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options all set

### What needs fixing

| # | Finding | Severity | Workstream |
|---|---------|----------|------------|
| 1 | Sentry captures PII (`send_default_pii=True`) | Critical | WS1 |
| 2 | Sentry captures LLM prompts (`include_prompts=True`) | Critical | WS1 |
| 3 | Sentry replays unmasked (`maskAllText: false`) | High | WS1 |
| 4 | Sentry sampling at 100% (excessive data capture) | Medium | WS1 |
| 5 | Rate limits missing on expensive endpoints | Medium | WS2 |
| 6 | No per-user daily cap on analysis/transcription | Medium | WS2 |
| 7 | Dev bypass constant in production code | High | WS3 |
| 8 | Source maps accessible in production | High | WS3 |
| 9 | No CSP headers on frontend | Low | WS3 |
| 10 | No LLM output anomaly monitoring | Low | WS4 |

---

## Workstream 1: Sentry Lockdown

### Backend (`backend/app/sentry_setup.py`)
- Set `send_default_pii=False`
- Set `include_prompts=False`
- Change `traces_sample_rate` from `1.0` to `0.1`
- Change `profile_session_sample_rate` from `1.0` to `0.1`

### Frontend (`frontend/src/instrument.ts`)
- Set `sendDefaultPii: false`
- Set `maskAllText: true` in Replay integration
- Set `blockAllMedia: true` in Replay integration
- Reduce `replaysSessionSampleRate` to `0.1`
- Reduce `tracesSampleRate` to `0.1`

### Verification
- Run backend tests — no regressions
- Run frontend tests — no regressions
- Sentry SDK initializes without errors (check startup logs)

---

## Workstream 2: Rate Limiting + Cost Protection

### Rate limits on expensive endpoints
- `POST /api/videos/{id}/upload-url` — 10/minute (already configured but verify applied)
- `POST /api/videos/{id}/transcribe` — 5/minute per user
- `POST /api/projects/{id}/analyze` — 5/minute per user
- `POST /api/projects/{id}/analyze/retry` — 5/minute per user

### Per-user daily caps
- Add `DAILY_ANALYSIS_LIMIT` setting (default: 50)
- Add `DAILY_TRANSCRIPTION_LIMIT` setting (default: 50)
- Track in database or Redis counter with TTL
- Return 429 with clear message when exceeded

### Verification
- Run existing test suite — no regressions
- Add tests for rate limit responses (429 on excess)
- Add tests for daily cap enforcement

---

## Workstream 3: Auth Hardening + Headers

### Dev bypass elimination from production builds
- In `backend/app/auth.py`: keep dev bypass but ensure it's dead code in production
- Option: use `if settings.APP_ENV == "development" and __debug__:` — Docker builds with `PYTHONOPTIMIZE=1` strip `__debug__` blocks
- Simpler option: the startup validation in `main.py` already raises RuntimeError if `_is_dev` is True in production. Verify this is airtight and add a test for it.

### Source maps
- `frontend/vite.config.ts`: change `sourcemap: "hidden"` to only generate in CI with Sentry upload, not in the dist output
- Or: add `frontend/public/_headers` file for Cloudflare Pages to block `.map` file access

### CSP headers
- Add `frontend/public/_headers` file:
  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self' https://clerk.methodex.ai https://*.clerk.accounts.dev; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.methodex.ai https://*.clerk.accounts.dev https://*.sentry.io; frame-ancestors 'none'
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
  ```

### Verification
- Run backend tests — auth tests pass, dev bypass tests pass in dev mode
- Add test: startup with `APP_ENV=production` + `_is_dev=True` raises RuntimeError
- `curl -I` production frontend — confirm CSP header present
- Attempt to access `.map` file — confirm blocked

---

## Workstream 4: Prompt Injection Monitoring

### Structured logging for LLM anomalies
- In `backend/app/services/llm_service.py`: enhance `parse_json_response()` to log structured events when:
  - JSON parsing fails (already logs, ensure structured format)
  - Output is suspiciously short (< 50 chars for analysis nodes)
  - Output contains known injection echo patterns (e.g., "IGNORE PREVIOUS", "SYSTEM:", "ASSISTANT:")
- Log level: WARNING (not ERROR) — these are signals, not failures
- No blocking — analysis continues normally

### Verification
- Run existing analysis pipeline tests — no regressions
- Verify warning logs appear in test output when feeding edge-case inputs

---

## Execution Plan

All 4 workstreams are independent. Each runs on its own git worktree branching from `main`. Each must:
1. Check out latest `main`
2. Make changes
3. Run full test suite (backend: `pytest`, frontend: `npm test`)
4. Report test results as evidence
5. Only merge if all tests pass

Workstreams can execute in parallel.

---

## Out of Scope (deferred)

- DB/Redis TLS enforcement (Railway private networking is sufficient)
- JWT upload leeway reduction (trade-off not worth the upload UX risk)
- Quota race condition row-level locking (low probability, low impact)
- BYOK revalidation interval (24h is acceptable for class tool)
- Full dependency audit (run separately via `pip-audit` / `npm audit`)
- Credential rotation (not needed — secrets are local-only)
