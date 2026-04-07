# Runbook: Bootstrap a fresh Claude session

## When to use

Starting a brand-new Claude session on methodex with no prior context. Follow this runbook to load enough context to be productive without re-learning the project from scratch.

## Step 1 — Load the memory

```
cat /Users/idstuart/.claude/projects/-Users-idstuart-Projects-ai-prototyping-5d-analysis/memory/MEMORY.md
```

This is your index. Read the short file descriptions and pick the ones relevant to your task. Always load at minimum:
- `deployment-details.md` — live URLs, service IDs, Railway + Cloudflare + Clerk config
- `project_hobby_scaling_progress.md` — current state of the scaling work
- `byok_balance_feature.md` — BYOK + balance visibility that shipped 2026-04-07
- `feedback_deploy_via_git.md` — never bypass CI/CD
- `feedback_verify_infrastructure_state.md` — verify with live tools, don't assume
- `feedback_openrouter_paid_tier.md` — paid tier, never "free"
- `feedback_dev_auth_bypass.md` — use VITE_DEV_AUTH_BYPASS=true locally

## Step 2 — Load the production-readiness spec

```
cat docs/production-readiness/README.md
cat docs/production-readiness/2026-04-07-phase-1-spec.md
```

This tells you what phase the project is in, what SLOs we committed to, and what PRs are shipped/in flight.

## Step 3 — Check current git state

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
git log --oneline -15         # what's on main recently
git branch --show-current     # what branch you're on
git status --short            # any uncommitted work
git worktree list             # any parallel worktrees in progress
gh pr list --state open       # what PRs are open
```

## Step 4 — Check production state

```bash
# Sentry
# (use mcp__sentry__search_issues with "unresolved issues from the last 24h")

# Railway deploy state
railway status --json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in d['environments']['edges'][0]['node']['serviceInstances']['edges']:
    node = e['node']
    meta = node['latestDeployment'].get('meta', {})
    print(f\"{node['serviceName']:<10} | commit {meta.get('commitHash','?')[:8]} | {node['latestDeployment'].get('status')}\")
"

# Railway logs sanity check (look for recent errors)
railway logs --service backend 2>&1 | tail -20
railway logs --service worker 2>&1 | tail -20
```

## Step 5 — Start the live monitor (optional but recommended for active work)

```bash
python3 /tmp/methodex-live-monitor.py > /tmp/methodex-live.log &
tail -f /tmp/methodex-live.log
```

If `/tmp/methodex-live-monitor.py` doesn't exist, it was deleted between sessions. Re-create it from the version used during the 2026-04-07 incident (see the git history of that date, or re-derive from `db-snapshot.md` + the Railway logs tailing pattern).

## Step 6 — Load the runbooks relevant to your task

- Debugging a stuck video → `stuck-video.md`
- Recovering from a deploy → `deploy-interrupt-recovery.md`
- Celery queue questions → `redis-inspect.md`
- Need to query prod DB → `db-snapshot.md`

## Step 7 — What Phase 1 (2026-04-07) fixed, and what's still risky

Before touching anything, read this list. These are the bugs and the fixes.

**Phase 1 shipped these 5 fixes (all deployed; all now on main):**

| PR | Fix | Where |
|---|---|---|
| #19 (`a6c3638`) | Celery lifecycle: `task_time_limit=6min`, `visibility_timeout=10min`, watchdog=17min, drainingSeconds=900 | `backend/app/tasks/celery_app.py`, `backend/app/tasks/watchdog_tasks.py`, `scripts/railway-service-config.py` |
| #21 (`be8efa9`) | Retry resets `VideoAnalysis` row so chain doesn't skip-swallow | `backend/app/routes/videos.py` analyze handler |
| #22 (`2a8fc27`) | Auto-dispatch analyze chain after transcription | `backend/app/tasks/transcription_tasks.py` |
| #23 (`0d291c6`) | Zod schemas at API boundary + defensive rendering + route error boundaries | `frontend/src/schemas/`, `frontend/src/services/api.ts`, `frontend/src/components/` |
| #24 (`8f1ecfd`) | Status enums + `backend/app/state/` centralized state machines + SQLEnum ORM enforcement | ~20 call sites across routes + tasks + services |

**Things to still be careful about:**

1. **DB CHECK constraints are NOT yet in place** (invariant #2 is 🟡). SQLAlchemy's `SQLEnum` enforces at the ORM layer, not the DB layer. Raw SQL inserts or a different ORM could still write an invalid value. Phase 2 fixes this.

2. **Observability is still thin** (invariants #8, #9, #12 are 🟡/🔴). We find out about regressions when users tell us. Phase 2 fixes this with structured logging + request IDs + Sentry alert rules + synthetic canary.

3. **No staging environment.** Every PR today went from dev → main → production with no intermediate soak. Phase 2 adds a staging env.

4. **Railway `drainingSeconds=900` is in the script but NOT applied to Railway yet.** Until the user runs `scripts/railway-service-config.py --apply`, the worker drains in 60s during deploys and in-flight chain steps can still be killed (though they'll be re-delivered within 10 min by the new `visibility_timeout=600`, so it's degraded, not broken).

5. **Cross-video retry is untested post-PR-#24.** Task #16. 5-min smoke test: confirm retrying an errored cross-video chain either succeeds or raises `InvalidTransitionError`, not silently skips.

6. **Legacy behaviors to preserve when refactoring:**
   - `transcribe_video_task` can fail before flipping `UPLOADED → TRANSCRIBING` (R2 download errors). State machine has `(UPLOADED, TRANSCRIBE_FAILED) → ERROR` and `(PENDING, TRANSCRIBE_FAILED) → ERROR` edges.
   - Legacy `/upload` route jumps `UPLOADED` directly without passing through `UPLOADING`. State machine fires two events back-to-back to preserve this.
   - Historical `archived` project status exists in some rows. `ProjectStatus.ARCHIVED` has ZERO transition edges — firing any event from ARCHIVED raises `InvalidTransitionError`.
   - `NOT_STARTED` is an API sentinel, NOT a persisted state. Lives as `VIDEO_ANALYSIS_NOT_STARTED_SENTINEL: str = "not_started"` in `backend/app/state/statuses.py`, not in the enum.

## Rules of engagement

- **Never skip pre-push hooks** (`--no-verify`). The hook runs backend ruff + frontend eslint + tsc. It exists to catch regressions.
- **Never deploy directly** via `railway up` or similar. All deploys go through CI/CD via git push → GitHub Actions → Railway wait-backend-deploy.
- **Verify infrastructure state before trusting memory.** Memories decay. Always check `railway status`, `gh pr list`, `git log` before asserting anything about the current state.
- **Work in isolated git worktrees** for any non-trivial change. Never touch the user's current checkout. See `docs/superpowers/specs/2026-04-06-methodex-hobby-scaling-design.md` for the parallel-worktree pattern used in Wave 1+2.
- **Ship one PR at a time when possible.** Batching correctness changes with refactors hides regressions.
