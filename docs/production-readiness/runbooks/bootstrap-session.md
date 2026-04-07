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

## Step 7 — Understand the 4 things that break in production

Before touching anything, read this list. It's the cause of 90% of recent incidents:

1. **State machine writes are scattered.** ~20 places write `video.status = "X"` directly. PR #22 (state-machine-enums, in progress as of 2026-04-07) centralizes this. Until it lands, grep before you write.

2. **Celery chain steps are interrupted by deploys.** Pre-PR #19 they sat orphaned for 1 hour before re-delivery. Post-PR #19, they recover in 10 min. Always check `railway-deploy.md` if you're doing infra work.

3. **Frontend crashes on unexpected API shapes.** PR #21 (frontend-defensive) adds zod schemas at the API boundary. Until it lands, any new backend response field that might be null/undefined can crash a React `.map()`.

4. **The retry path used to silently swallow clicks** (fixed in PR #21 retry-reset-analysis on 2026-04-07). If you see a video stuck after a retry, check `stuck-video.md` — the cross-video chain has the same bug still open (follow-up task #16).

## Rules of engagement

- **Never skip pre-push hooks** (`--no-verify`). The hook runs backend ruff + frontend eslint + tsc. It exists to catch regressions.
- **Never deploy directly** via `railway up` or similar. All deploys go through CI/CD via git push → GitHub Actions → Railway wait-backend-deploy.
- **Verify infrastructure state before trusting memory.** Memories decay. Always check `railway status`, `gh pr list`, `git log` before asserting anything about the current state.
- **Work in isolated git worktrees** for any non-trivial change. Never touch the user's current checkout. See `docs/superpowers/specs/2026-04-06-methodex-hobby-scaling-design.md` for the parallel-worktree pattern used in Wave 1+2.
- **Ship one PR at a time when possible.** Batching correctness changes with refactors hides regressions.
