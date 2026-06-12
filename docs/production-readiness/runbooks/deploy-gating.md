# Deploy Gating — Preventing Red Commits from Reaching Railway

## Problem

Railway auto-deploys backend and worker on every push to `main` via its GitHub
integration. Historically this deployment raced GitHub Actions CI — a commit
with failing backend tests could be live before CI finished.

## Architecture (final)

**The gate lives entirely on the Railway side.** Railway's `DeploymentTrigger`
has a `checkSuites: Boolean` field ("Wait for CI" in the dashboard). When
`true`:

- On push, Railway creates the deployment in a **WAITING** state.
- It stays WAITING until **every GitHub check suite on the pushed commit**
  concludes. Note: this is *all* suites — GitHub Actions plus any other
  installed GitHub Apps (Codecov, Pages, etc.) that create suites on the commit.
- All suites succeed → deployment proceeds (BUILDING → DEPLOYING → SUCCESS).
- Any suite fails → deployment is **SKIPPED**. The red commit never goes live.

**There is deliberately NO "wait for Railway deploy" job in `ci.yml`.**
The original design had `wait-backend-deploy`/`wait-worker-deploy` jobs that
polled the Railway API for the deployment to reach SUCCESS. Combined with
`checkSuites=true` that is a deterministic deadlock:

```
Railway waits for the check suite to conclude
  → the check suite contains a job waiting for the Railway deployment
    → the deployment never starts
      → the suite never concludes (job times out at 10 min, goes red)
        → deployment is SKIPPED. Every main push hangs and never deploys.
```

We evaluated moving those jobs to a separate `workflow_run`-triggered workflow,
but `workflow_run` workflows create a **new check suite on the same commit**,
and Railway watches all suites on the commit (confirmed by Railway community
reports of deploys stuck in "waiting for CI" due to third-party check suites).
Railway's documentation does not state that only push-time suites are
considered, so the `workflow_run` variant could not be confirmed deadlock-free.
We chose deletion: a wrong gate halts production; simplicity wins.

**Post-deploy failure handling is Railway-side instead:**

| Mechanism | Where | What it covers |
|-----------|-------|----------------|
| `checkSuites=true` on main triggers | Railway deployment trigger | Failing tests/lint never deploy |
| Healthcheck `/health/ready` (timeout 10s) | backend service instance | A deploy that builds but can't serve never receives traffic |
| `restartPolicyType = ON_FAILURE` (max 10) | `railway.toml` | Crash-looping containers restart |
| `scripts/ci/wait-for-railway-deploy.py` | manual, run locally | Operator confirmation that a specific SHA reached SUCCESS |

Only **main-branch** triggers are gated. PR/preview-environment triggers stay
ungated so experimental branches deploy without waiting on (possibly absent or
never-concluding) check suites.

## Activating the Gate

### Pre-requisites

1. A Railway **workspace-scoped** API token (the GitHub Actions secret
   `RAILWAY_API_TOKEN` qualifies; a personal token from
   `~/.railway/config.json` works if it has write access to the project).
2. Backend and worker services connected to the GitHub repo in the Railway
   dashboard. The script updates existing triggers; it cannot create them.

### Command

```bash
export RAILWAY_API_TOKEN=<workspace-token>

# Dry-run (read-only) — shows current checkSuites state per trigger:
python3 scripts/railway-service-config.py

# Apply — sets checkSuites=True on main-branch triggers for backend + worker:
python3 scripts/railway-service-config.py --apply
```

Idempotent: re-running prints "already gated — no change needed".
Non-main triggers print "skipping — branch ... (only main deploys are gated on CI)".

## Verifying the Gate Works (and is not deadlocked)

The failure mode to rule out is not just "gate off" — it is **gate-deadlocked**:
a check suite on the commit that never concludes leaves the deployment in
WAITING forever. The verification below distinguishes all three states.

### Step 1 — Confirm the setting

```bash
python3 scripts/railway-service-config.py   # dry-run
```

Expected Step 4 output for a correctly gated project:

```
==> Step 4: gate auto-deploy on GitHub check suites (Wait for CI)
  backend: trigger <id> branch=main repo=org/repo checkSuites=True
    already gated — no change needed
  worker: trigger <id> branch=main repo=org/repo checkSuites=True
    already gated — no change needed
```

Dashboard equivalent: service → Settings → Deploy → "Wait for CI" toggled on.

### Step 2 — Green-path timing test (proves gate works AND completes)

1. Push a harmless commit to `main` (e.g., a comment change).
2. Open the Railway dashboard immediately. The new deployment must appear as
   **WAITING** (not BUILDING) while GitHub Actions runs. If it goes straight
   to BUILDING, the gate is not active.
3. Watch the GitHub Actions run finish green.
4. Within ~1 minute of the last check suite concluding, the Railway deployment
   must leave WAITING and proceed to BUILDING → SUCCESS.
5. Confirm the exact SHA deployed, from your machine:

   ```bash
   export RAILWAY_API_TOKEN=<token>
   COMMIT_SHA=$(git rev-parse origin/main) python3 scripts/ci/wait-for-railway-deploy.py
   ```

**Deadlock signature:** all checks on the commit show green/complete in the
GitHub UI, but the Railway deployment is still WAITING after several minutes.
Diagnose which suite never concluded:

```bash
gh api repos/<owner>/<repo>/commits/$(git rev-parse origin/main)/check-suites \
  --jq '.check_suites[] | {app: .app.name, status, conclusion}'
```

Any suite with `status != "completed"` is the blocker. Common culprits:
a GitHub App that registers suites but never runs them, or a workflow that
itself waits on the deployment (which is why `ci.yml` must never re-grow a
wait-for-Railway job). Fix the offending suite or, as a stopgap, disable the
gate (see Rollback) to unblock the deploy.

### Step 3 — Red-path test (proves failing CI blocks the deploy)

Do this once after activation, at a low-traffic time:

1. Push a commit to `main` with a deliberately failing backend test
   (e.g., `assert False` in any test file) — or, if pushing red to `main` is
   unacceptable, temporarily point a scratch Railway service's trigger at a
   test branch with `checkSuites=true` and push the red commit there.
2. CI goes red.
3. The Railway deployment must transition WAITING → **SKIPPED**. The previous
   deployment keeps serving traffic.
4. Revert the commit; CI goes green; the revert deploys normally.

## Monitoring deploys (now that CI has no wait job)

- Railway dashboard → service → Deployments: status history per commit.
- `railway logs --service backend` (or `--service worker`) for live logs.
- `COMMIT_SHA=<sha> python3 scripts/ci/wait-for-railway-deploy.py` to block
  until a specific commit reaches SUCCESS (manual use only — never in CI).
- Sentry will surface runtime regressions that pass tests but fail in prod.

## Rollback (emergency hotfix that must bypass CI)

1. Railway dashboard → backend service → Settings → Deploy → toggle
   "Wait for CI" **off**. Repeat for worker.
2. Push/deploy the hotfix.
3. Re-enable: `python3 scripts/railway-service-config.py --apply`.

Do not leave the gate disabled after the hotfix.
