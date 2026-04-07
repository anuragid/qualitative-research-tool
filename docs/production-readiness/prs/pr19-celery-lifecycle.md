# PR #19 — Celery lifecycle tuning

**Branch:** `fix/celery-lifecycle-tuning`
**Worktree:** `/Users/idstuart/Projects/ai-prototyping/5d-worktrees/pr19-celery-lifecycle`
**Base:** `origin/main`
**Status:** Dispatched to subagent `pr19-celery-lifecycle` on 2026-04-07 at ~20:15 UTC
**Estimated effort:** 1 hour

## TL;DR

Tighten Celery task time limits and Redis broker visibility timeout so that every Railway deploy is invisible to users and in-flight chain steps are recovered within minutes instead of being watchdog-errored after 35 minutes.

## Problem (verified in prod)

- `task_time_limit = 30 min` (loose — chain steps are designed small, 1-5 min each)
- `task_soft_time_limit` unset (no graceful shutdown signal)
- `broker_transport_options.visibility_timeout` **unset → default 3600 s (1 hour)**
- `_ANALYSIS_TIMEOUT = 35 min` (watchdog)
- Worker `drainingSeconds = 60 s` on Railway (way shorter than a single chain step)

Net effect: every deploy SIGTERMs the worker within 60 seconds, killing the in-flight LLM call. The orphaned Celery task sits in Redis `unacked` for up to 3600 s. The watchdog at 35 min stamps it `errored` before the broker gets a chance to re-deliver it. Users see "Analysis failed — retry" 35 minutes after a deploy they didn't know happened.

Proven in prod today: Kathleen video `4b1f4b25-c94f-4bf8-9a6a-0958ddfc4e41` task `ab793cc0-218e-49fd-8362-903f3bdf2998` sat in unacked from 18:26:34 until 19:27:14 (exactly 3601 s). The watchdog had already errored her at 18:52:58. The re-delivered task saw `status=error` and skip-short-circuited.

## Fix

| Knob | Before | After | Why |
|---|---|---|---|
| `task_time_limit` | 1800 s (30 min) | **360 s (6 min)** | Chain steps are designed 1-5 min; anything longer is stuck |
| `task_soft_time_limit` | unset | **330 s (5.5 min)** | Give the task 30 s to clean up before hard kill |
| `broker_transport_options.visibility_timeout` | default 3600 s | **600 s (10 min)** | Must be > `task_time_limit` to avoid duplicate delivery, < watchdog_timeout to recover before watchdog steps in |
| `_ANALYSIS_TIMEOUT` (watchdog) | 35 min | **15 min** | Must be > `task_time_limit + visibility_timeout + slack` = 6+10+ buffer |
| Railway worker `drainingSeconds` | 60 s | **900 s (15 min)** | Must be > longest step so Celery can finish in-flight work during rolling deploy |

The relationship `task_time_limit < visibility_timeout < watchdog_timeout` is locked in by 3 new invariant tests. Any future tuning that violates the relationship breaks the test.

## Files touched

- `backend/app/tasks/celery_app.py` — add `task_time_limit`, `task_soft_time_limit`, `broker_transport_options` keys
- `backend/app/tasks/watchdog_tasks.py` — lower `_ANALYSIS_TIMEOUT` from 35 min to 15 min
- `scripts/railway-service-config.py` — update worker `drainingSeconds` from 60 to 900
- `backend/tests/test_celery_lifecycle.py` — **new** — 3 invariant tests

## Tests

3 new invariant tests:
1. `test_task_time_limit_is_6_minutes` — hard + soft limits set, soft < hard
2. `test_broker_visibility_timeout_under_watchdog` — visibility_timeout > 0 AND < watchdog threshold
3. `test_watchdog_threshold_exceeds_task_time_limit_plus_visibility` — arithmetic relationship

## Acceptance

1. On the next post-merge deploy, any chain steps in flight complete on the old worker (drainingSeconds=900 gives them time) OR are re-delivered to the new worker within 10 min (visibility_timeout=600).
2. No videos get watchdog-errored because of deploy interrupts.
3. Manual verification: trigger a chain on a test video, immediately deploy a no-op commit, watch the chain finish without user-visible errors.

## Dependency

None. Independent of other Phase 1 PRs. Merge first because it's the one that makes all subsequent deploys safe.

## Scope guardrails

- **Touch only** the 4 files listed
- **Do not** change chain task definitions, error handling, or routes
- **Do not** apply the Railway config mutation (`--apply`) — leave it to the user to do after merge (follow the existing deploy-via-git convention)
- **Single-purpose PR**

## Post-merge runbook

After PR #19 merges and Railway redeploys:

1. Run `python3 scripts/railway-service-config.py --dry-run` and confirm the only diff is `worker.drainingSeconds: 60 → 900`
2. Run `python3 scripts/railway-service-config.py --apply` to push the Railway config change
3. Verify in the Railway dashboard that the worker service shows `drainingSeconds: 900`
4. Trigger a test chain and intentionally redeploy while it runs — verify the chain finishes
