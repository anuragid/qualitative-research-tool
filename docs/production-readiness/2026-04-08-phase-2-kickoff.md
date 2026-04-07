# Phase 2 — Kickoff stub

**Status:** Not started (spec not yet written)
**Date:** 2026-04-08 target kickoff
**Depends on:** Phase 1 complete (2026-04-07) — see `2026-04-07-phase-1-spec.md`

This is a STUB, not a spec. A fresh Claude session should read this, confirm the scope with the user, and then write the full Phase 2 spec in the same format as the Phase 1 spec before dispatching any subagents.

## Why this stub exists

Phase 1 shipped in a single intense 8h session on 2026-04-07. To avoid losing context when the user starts Phase 2 in a fresh Claude session tomorrow (or later), we need:

1. A pointer at the existing memory + runbooks (done — see `runbooks/bootstrap-session.md`)
2. A rough scope + target for Phase 2 so the user doesn't have to re-derive the plan
3. The known constraints + non-goals that the user already signed off on during Phase 1 brainstorming

## Theme: "Know before they do"

Phase 1 made the system CORRECT. Phase 2 makes the system OBSERVABLE. You should find out about problems before users do.

## Target SLOs Phase 2 must instrument

These were committed to in the README's SLO table. Phase 1 defined them. Phase 2 measures them.

| SLO | Target | Phase 2 instrumentation |
|---|---|---|
| API availability | 99.5% monthly | Cloudflare health check + Sentry error rate alert |
| Chain success rate | ≥99% | PostHog `chain_completed` / `chain_dispatched` dashboard + alert on <99% over 10 min |
| Chain p95 latency | <15 min for 60-min video | Structured timing log per step → Sentry spans + percentile alert |
| User-visible error rate | <0.5% | Sentry `unhandled:yes` filter + PostHog correlation |
| Deploy MTTR | Zero user-visible impact | Synthetic canary every 5 min on staging, page on failure |
| Regression detection | <10 min | All of the above wired to email/Slack |

## Phase 2 PR candidates (not final)

Work the user approved during Phase 1 brainstorming, to be organized into Wave A / Wave B in the real spec:

**Wave A (independent, parallel-friendly):**

1. **Structured logging + request-ID propagation** — FastAPI middleware generates a request ID at the API entry, propagates into Celery task headers, logged everywhere. Replace `logging.info(f"...")` with `logger.info("event_name", extra={...})`. JSON formatter configured via env var. Enables invariant #8 (end-to-end request tracing).

2. **Staging environment** — Railway supports multiple environments per project. Create `staging` env with smaller replicas, separate Postgres + Redis + R2 bucket. Wire CI to push `staging` branch to staging env. Enables safe end-to-end testing of future PRs before they touch production.

3. **Synthetic canary** — scheduled GitHub Action or Railway cron that every 5 min uploads a tiny pre-recorded video to staging, runs the chain, asserts `completed` within 3 min, pages on failure. Enables invariant #9 (alerts before user notices) + deploy MTTR measurement.

4. **DB CHECK constraints** — raise invariants 1+2 from 🟡 to 🟢. Add `CHECK (videos.status != 'transcribed' OR EXISTS (SELECT 1 FROM transcripts WHERE video_id = videos.id))`, etc. Alembic migration. Tests that try to violate the constraint and expect `IntegrityError`.

5. **Sentry alert rules** — define the 6 SLO alerts in Sentry's UI (via API + committed config) so they can be re-created. Document the alert inventory in `runbooks/sentry-alerts.md`.

**Wave B (sequential after Wave A):**

6. **Circuit breakers** — wrap OpenRouter, AssemblyAI, R2, Clerk in `pybreaker` or equivalent. Fail fast with a structured user-visible error when a dependency is degraded. Enables invariant #6.

7. **SLO instrumentation** — emit Prometheus-style metrics for the 6 SLOs. Use the Railway-native metrics dashboard + PostHog for product metrics. No new service required.

## Known constraints

- Don't add a new paid service unless strictly necessary. Sentry + PostHog + Railway metrics are sufficient for Phase 2 observability at methodex's scale.
- Structured logging MUST preserve the existing Railway log format well enough that `railway logs --service backend` remains readable. JSON is fine but include human-readable summary fields.
- Staging env can't use production Clerk keys (paid plan constraint). Use Clerk test keys or a dev tenant.
- Alert fatigue is real. Start with 3-5 alerts max and tighten from there.

## Phase 1 follow-ups to fold into Phase 2

Things noted during Phase 1 that belong in Phase 2 rather than as standalone PRs:

- **Cross-video retry verification** (Phase 1 task #16) — smoke test the new `ProjectAnalysisStateMachine` retry path. If it fails, small fix PR inside Phase 2.
- **`validateResponse()` wiring in per-service frontend files** — mechanical, but belongs in Phase 2 because Phase 2 adds the schema mismatch Sentry category that these calls will fire into.
- **Railway config apply** (`drainingSeconds=900`) — prerequisite, do this BEFORE Phase 2 kickoff.

## How to start a Phase 2 session

1. Read `runbooks/bootstrap-session.md` for the general session-start routine.
2. Load memories: `phase_1_complete.md`, `production_grade_reframe.md`, `reference_production_readiness_docs.md`.
3. Read this stub.
4. Read the Phase 1 spec at `2026-04-07-phase-1-spec.md` for the spec format.
5. Confirm scope with the user. Maybe they want to trim or expand this list.
6. Write the full `2026-04-08-phase-2-spec.md` in the same format as Phase 1.
7. Write individual PR briefs in `prs/phase2-*.md`.
8. Get user approval on the spec before dispatching subagents.
9. Create worktrees + dispatch per the Wave A / Wave B plan.

## What you should NOT do in Phase 2

- Don't touch the core chain architecture. Wave 1+2 (2026-04-06) + Phase 1 (2026-04-07) got it right. Phase 2 is about seeing it, not rewriting it.
- Don't add new user-facing features. Phase 2 is operational.
- Don't delete any Phase 1 work. If an invariant needs to be tightened (e.g., `task_time_limit`), that's a separate discussion.
- Don't ship a single mega-PR. Follow the Wave pattern: small, focused, parallelizable.
