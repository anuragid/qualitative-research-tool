# Methodex Production Readiness

This folder tracks the work to take methodex from "research prototype that scaled" to "production-grade product students can rely on." It is organized by phase; each phase has a spec, individual PR briefs, and a status tracker.

## Vision — what "production-grade" means for methodex

Concrete, measurable:

| SLO | Target | How we measure |
|---|---|---|
| API availability | 99.5% monthly (~3.6h downtime budget) | Cloudflare health checks + Sentry error rate |
| Chain success rate | ≥99% of dispatched chains reach `completed` without manual intervention | PostHog `chain_completed` / `chain_dispatched` ratio |
| Chain p95 latency | Transcribe → analyzed in <15 min for a 60-min interview | Structured timing log → Sentry traces |
| User-visible error rate | <0.5% of clicks result in an unhandled error | Sentry `unhandled:yes` events / PostHog click count |
| Deploy MTTR | Zero user-visible impact on deploys (no stuck videos, no 5xx spikes) | Synthetic canary every 5 min |
| Mean time to detect regressions | <10 min (automatic alert, not "user noticed") | Sentry + status dashboard |

These are minimums, not aspirations.

## Phases

| Phase | Theme | Target date | Status |
|---|---|---|---|
| Phase 1 | Stop the bleeding — correctness + deploy lifecycle + frontend robustness | 2026-04-07 | **✅ COMPLETE** — 5 PRs shipped + 6 runbooks + state machine centralization as stretch |
| Phase 2 | Know before they do — observability, alerting, staging, DB CHECK constraints, SLO instrumentation | TBD | **Next — spec to be written** |
| Phase 3 | Prove it under load — load test harness, query audit, queue tuning, chaos test | After Phase 2 | Not started |
| Phase 4 | Polish — feature flags, admin dashboard, backups, secret rotation, dep CVE scans | Ongoing | Not started |

### Phase 1 score card

Measured against the 13 invariants in this README. **8 green, 4 yellow, 1 red** (up from 2/5/6 at start of 2026-04-07).

| Invariant | Score | How |
|---|---|---|
| 1. DB state matches reality | 🟢 | 17-min watchdog + 10-min broker sweep (PR #19) |
| 2. Impossible states rejected | 🟡 | SQLEnum ORM-layer enforcement (PR #24); DB CHECK constraints deferred to Phase 2 |
| 3. Single state-machine owner | 🟢 | PR #24 — all ~40 status writes go through `app/state/` |
| 4. Idempotent Celery tasks | 🟢 | PR #21 retry-reset + existing `task_acks_late` |
| 5. Invisible deploys | 🟢 | PR #19 celery lifecycle tuning (REQUIRES `scripts/railway-service-config.py --apply`) |
| 6. Dependency failure = user-visible error | 🟡 | BYOK 402 handling solid; other deps → Phase 2 circuit breakers |
| 7. Frontend never crashes | 🟢 | PR #23 zod + defensive codemod + route error boundaries |
| 8. Request tracing end-to-end | 🟡 | Sentry session replay works; request-ID propagation → Phase 2 |
| 9. Alerts before user notices | 🔴 | Phase 2 |
| 10. Runbooks exist | 🟢 | 6 runbooks committed 2026-04-07 |
| 11. API ≤ 500ms | 🟢 | Most routes sub-100ms |
| 12. SLO for chain completion | 🟡 | SLOs defined, not yet instrumented → Phase 2 |
| 13. Users don't degrade each other | 🟡 | 32 worker slots handle target-B; not load-tested → Phase 3 |

## How to resume this work in a fresh session

1. Read `docs/production-readiness/README.md` (this file) for the phase overview.
2. Read the current phase spec (`2026-04-07-phase-1-spec.md` for Phase 1).
3. Load project memories: `deployment-details.md`, `project_hobby_scaling_progress.md`, `byok_balance_feature.md`, `feedback_deploy_via_git.md`, `feedback_verify_infrastructure_state.md`.
4. Check git state: `git log --oneline -10`, `gh pr list --state open`.
5. Pick up a PR brief from `prs/` that is marked unclaimed.
6. Create a worktree: `git worktree add -b fix/<name> ../5d-worktrees/<name> origin/main`.
7. Execute the brief in isolation. Do not touch files outside the brief's scope.
8. Open the PR, update the status tracker in this file, report back.

## Status tracker — Phase 1 PRs (all merged)

| Spec name | GH PR | Commit | Brief |
|---|---|---|---|
| Celery lifecycle tuning | #19 | `a6c3638` | `prs/pr19-celery-lifecycle.md` |
| Retry-swallow fix | #21 | `be8efa9` | `prs/pr19-5-retry-swallow.md` |
| Auto-dispatch analyze after transcription | #22 | `2a8fc27` | `prs/pr20-auto-dispatch.md` |
| Frontend defensive rendering + zod | #23 | `0d291c6` | `prs/pr21-frontend-defensive.md` |
| State machine enums (stretch) | #24 | `8f1ecfd` | `prs/pr22-state-machine-enums.md` |

Plus the user's own **PR #20** (`9edac89`, upload false-negative + retry clickability + Report feature) shipped in parallel and is on the same production build.

Phase 1 docs commits: `abdb402` (spec), `02452c6` (runbooks).

## Open follow-ups from Phase 1

1. **Apply Railway config:** run `python3 scripts/railway-service-config.py --apply` with `RAILWAY_API_TOKEN` set to push `worker.drainingSeconds=900` to Railway. Script change is in the repo but the Railway API call is gated behind `--apply` per safety convention.
2. **Verify cross-video retry** — 5-min smoke test. PR #24 routed `project_analysis_steps.py` through the new `ProjectAnalysisStateMachine`; confirm a retry on an `error`-state ProjectAnalysis raises `InvalidTransitionError` (visible failure) instead of silently skipping.
3. **Wire `validateResponse()` into per-service frontend files** — PR #23 left `projects.ts`, `analysis.ts`, `transcriptions.ts`, `settings.ts` without the schema wrapper. Mechanical follow-up, small.
4. **Watch `task_time_limit=6min` for legitimate long steps** — any chain step that exceeds 6 min will now fail-fast. Monitor the first dozen real chains post-deploy.

## Execution model for today

Parallel worktrees, dispatched subagents, main session as orchestrator. Same pattern as Wave 1+2 (`../docs/superpowers/specs/2026-04-06-methodex-hobby-scaling-design.md`).

**Wave A (parallel, independent):** PR #19, #19.5, #20, #21. Each in its own worktree, each dispatched as a fresh subagent with the brief from `prs/`. Main session watches, merges when CI passes and scope is respected.

**Wave B (sequential, after Wave A):** PR #22 if time permits. It touches every status-write site in the codebase and will conflict with anything that landed in Wave A, so it rebases on top.

## Out of scope for Phase 1

These will be addressed in later phases — deliberately not today:

- Observability stack (structured logging, trace IDs, Prometheus metrics) → Phase 2
- Alert rules in Sentry/PostHog → Phase 2
- Staging environment → Phase 2
- Load testing harness → Phase 3
- Query profiling / index audit → Phase 3
- Chaos testing (kill -9 mid-chain) → Phase 3
- Feature flags → Phase 4
- Automated DB backups → Phase 4 (Hobby plan has `maxBackupsCount: 0` so this requires an off-Railway solution)
