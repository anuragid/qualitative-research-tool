# Production Hardening Campaign — 2026-06-12/13

A multi-agent campaign hardening methodex across **performance, reliability, security, and build quality**, prompted by a report of "performance issues, sudden breakage midway with no recovery, and build quality below a public high-traffic product." Builds on the Phase-1 reframe (the 13 invariants).

**Method:** 4 parallel Opus audits (reliability/data-pipeline, performance, security, build-quality) → a swarm where every PR had a **builder + independent adversarial reviewer + deterministic verifier**, one concern per PR, TDD for behavioral changes, waves ordered by file-conflict analysis. **20 PRs merged**, each green CI + adversarially reviewed. A confirmation re-audit (one agent per dimension) verified findings closed and caught 4 closeout items, which were also fixed.

The adversarial-reviewer-per-PR pattern caught, before merge: a deterministic Railway deploy deadlock, a route-vs-route lock-order deadlock, a fail-open drift gate, a Celery errback-protocol bug that had silently broken the chain error handler, a pagination-corruption bug, and a CI concurrency regression.

## What shipped, by wave

| Wave | Theme | PRs |
|---|---|---|
| 0 | CI/tooling | vitest in CI + Playwright (#41); alembic drift gate, fail-closed, empty allowlist (#29); gitleaks Secret Scanning + pip-audit blocking (#28); prod scripts default dry-run (#27); Railway checkSuites deploy-gate code (#30); frontend test fixes (#31); CI concurrency group (#26, restored #51) |
| 1 | correctness/security | cross-video RETRY_RESET (#40); node post-retry validation→retryable (#35); R2 boto timeouts (#32); stop swallowing exceptions (#37); BYOK cached balance (#34); JWT issuer pin + APP_ENV Literal + fail-fast prod validator (#36); route code-splitting (#33); presigned-upload size+magic-byte validation (#39); backend dep CVE upgrades (#38) |
| 2 | migrations | 7 missing indexes CONCURRENTLY + drift reconciliation (#42); ProjectAnalysis.error_message + structured payload + API surface (#45) |
| 3 | read-path perf | lightweight list/status payloads ~98% smaller, SQL-level regression test (#43); projects list 1-2 SELECTs, zero video_analyses access, pagination-correct (#46) |
| 4 | concurrency | atomic per-step commit + retryable-stays-processing (#44); SELECT FOR UPDATE/CAS + watchdog SKIP LOCKED + global lock order (#48); project delete fails clean on R2 error (#47); link_error on standalone dispatches + dual errback-protocol handling (#49) |
| 5 | the perf amplifier | 34 DB-only `async def` route handlers → sync `def` for threadpool offload + AST invariant test (#50) |
| Closeout | re-audit fixes | restore CI concurrency (#51); BYOK gate sync def + invariant extended to dependencies (#52); partial indexes for watchdog sweeps (#54); rate-limit upload routes (#53) |

## Scorecard movement (13 invariants)

Start of 2026-04-07: 2🟢/5🟡/6🔴 → end of Phase 1: 8🟢/4🟡/1🔴 → **after this campaign: 11🟢/2🟡/0🔴**.

Notable upgrades this campaign:
- **#2 Impossible states rejected** 🟡→🟢 (model/migration drift reconciled + drift gate enforces parity; CHECK constraints still deferred but SQLEnum + state machines + drift gate cover it).
- **#6 Dependency failure = user-visible error** 🟡→🟢 (R2 timeouts, retryable LLM-validation failures, cross-video error_message surfaced, exception-swallowing removed).
- **#11 API ≤500ms / #13 users don't degrade each other** strengthened: event-loop no longer blocked by sync SQLAlchemy (sync-def conversion), polled payloads ~98% smaller, missing indexes added (list/detail + watchdog), row-locking prevents cross-request corruption.

Remaining 🟡: **#8 end-to-end request tracing** and **#12 SLO instrumentation** — both belong to the original Phase 2 (observability/alerting), still pending.

## Operator actions still pending

1. **Activate deploy gate + worker drain:** `RAILWAY_API_TOKEN=<token> python3 scripts/railway-service-config.py --apply` (sets checkSuites=true on main triggers + drainingSeconds 60→900). Runbook: `runbooks/deploy-gating.md`. Babysit the first main push after.
2. **Rotate the leaked dev Clerk key** (in git history, baselined). Runbook: `runbooks/secret-rotation.md`. Low urgency (dev instance).

`CLERK_ISSUER=https://methodex.ai/__clerk` is already set on backend+worker (Clerk proxy mode); login verified working post-#36.

## Still deferred (future work)

Postgres-backed pytest (suite is SQLite-only), mypy, ruff rule expansion, coverage thresholds, release-phase migrations, redbeat singleton beat, and the full **Phase 2 observability/alerting/staging** stack.
