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
| Phase 1 | Stop the bleeding — correctness + deploy lifecycle + frontend robustness | 2026-04-07 (today) | **In progress** |
| Phase 2 | Know before they do — observability, alerting, staging, state machine centralization | 2026-04-14 | Not started |
| Phase 3 | Prove it under load — load test harness, query audit, queue tuning, chaos test | 2026-04-21 | Not started |
| Phase 4 | Polish — feature flags, admin dashboard, backups, runbooks, secret rotation | Ongoing | Not started |

## How to resume this work in a fresh session

1. Read `docs/production-readiness/README.md` (this file) for the phase overview.
2. Read the current phase spec (`2026-04-07-phase-1-spec.md` for Phase 1).
3. Load project memories: `deployment-details.md`, `project_hobby_scaling_progress.md`, `byok_balance_feature.md`, `feedback_deploy_via_git.md`, `feedback_verify_infrastructure_state.md`.
4. Check git state: `git log --oneline -10`, `gh pr list --state open`.
5. Pick up a PR brief from `prs/` that is marked unclaimed.
6. Create a worktree: `git worktree add -b fix/<name> ../5d-worktrees/<name> origin/main`.
7. Execute the brief in isolation. Do not touch files outside the brief's scope.
8. Open the PR, update the status tracker in this file, report back.

## Status tracker — Phase 1 PRs

| PR | Name | Owner | Branch | Status |
|---|---|---|---|---|
| #19 | Celery lifecycle tuning | dispatched subagent `pr19-celery-lifecycle` | `fix/celery-lifecycle-tuning` | **In flight** (see `prs/pr19-celery-lifecycle.md`) |
| #19.5 | Retry-swallow fix | unclaimed | `fix/retry-reset-analysis` | See `prs/pr19-5-retry-swallow.md` |
| #20 | Auto-dispatch analyze after transcription | unclaimed | `fix/auto-dispatch-analyze` | See `prs/pr20-auto-dispatch.md` |
| #21 | Frontend defensive rendering + zod | unclaimed | `fix/frontend-defensive` | See `prs/pr21-frontend-defensive.md` |
| #22 | Status enums + centralized state machine (stretch) | unclaimed | `fix/state-machine` | See `prs/pr22-state-machine-enums.md` |

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
