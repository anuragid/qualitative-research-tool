# Deploy Gating — Preventing Red Commits from Reaching Railway

## Problem

Railway auto-deploys backend and worker on every push to `main` via its GitHub
integration. This deployment races GitHub Actions CI — a commit with failing
backend tests can be live before CI finishes.

The `wait-backend-deploy` / `wait-worker-deploy` jobs in `ci.yml` only
*observe* Railway reaching `SUCCESS`; they do not prevent the deployment from
starting. They are post-deploy verification, not a gate.

## Solution: Railway "Wait for CI" (checkSuites gate)

Railway's `DeploymentTrigger` has a `checkSuites: Boolean` field. When set to
`true`, Railway holds the auto-deploy until **all GitHub check suites on the
pushed commit have a successful conclusion**. This means `backend-ci` and
`frontend-ci` must pass before Railway fires the deployment.

This is the correct layer for the gate: it is enforced by Railway itself, with
no extra CI job required. The `wait-backend-deploy` / `wait-worker-deploy` jobs
continue to run as post-deploy observability (confirming Railway reached
`SUCCESS` after the gate passed).

## Activating the Gate

### Pre-requisites

1. You must have a Railway **workspace-scoped** API token (not a project token).
   The GitHub Actions secret `RAILWAY_API_TOKEN` is workspace-scoped and works.
   A personal token from `~/.railway/config.json` also works if it has write
   access to the project.

2. The backend and worker services must already be connected to the GitHub repo
   in the Railway dashboard (Settings → Source → GitHub). The script can only
   update existing deployment triggers; it cannot create them.

### Command

```bash
export RAILWAY_API_TOKEN=<your-workspace-token>

# Dry-run (read-only) — shows current checkSuites state for each trigger:
python3 scripts/railway-service-config.py

# Apply — sets checkSuites=True on every trigger for backend + worker:
python3 scripts/railway-service-config.py --apply
```

The script is idempotent. Re-running `--apply` on an already-gated trigger
prints "already gated — no change needed" and exits zero.

### What the script does (Step 4)

- Queries `deploymentTriggers` for the backend service
  (`2b70a900-042c-4083-b00b-0d01f3ece5dc`) and worker service
  (`08097b12-1501-4dff-a990-edcd95c73ed4`) in the production environment.
- For each trigger where `checkSuites != true`, calls
  `deploymentTriggerUpdate(id, input: { branch, checkSuites: true })`.
- Steps 1–3 (topology, beat service, worker domain) are unchanged.

## Verifying the Gate Works

### Option A — Check Railway dashboard

1. Open the Railway project → backend service → Settings → Deploy.
2. Confirm "Wait for CI checks to pass before deploying" is toggled **on**.
3. Repeat for the worker service.

### Option B — Push a deliberately failing commit to a test branch

1. Create a branch off `main`.
2. Add a trivially failing test (e.g., `assert False` in any test file).
3. Open a draft PR or push directly if the branch is wired to a Railway
   preview environment.
4. Observe that Railway shows the deployment in a **pending** or **waiting**
   state (not `BUILDING`) until CI reaches a conclusion.
5. After CI fails, Railway should **not** deploy.
6. Revert the failing test, push again — CI passes, Railway deploys.

### Option C — Inspect the trigger via GraphQL (read-only)

```bash
export RAILWAY_API_TOKEN=<token>
python3 scripts/railway-service-config.py   # dry-run prints current checkSuites value
```

A correct output for Step 4 looks like:

```
==> Step 4: gate auto-deploy on GitHub check suites (Wait for CI)
  backend: trigger <id> branch=main repo=org/repo checkSuites=True
    already gated — no change needed
  worker: trigger <id> branch=main repo=org/repo checkSuites=True
    already gated — no change needed
```

## Relationship to ci.yml jobs

| Job | Purpose | Blocks deploy? |
|-----|---------|---------------|
| `backend-ci` | Run tests + lint | Not directly — Railway's checkSuites gate uses this as the signal |
| `frontend-ci` | Lint, typecheck, build | Same |
| `wait-backend-deploy` | Confirm backend reached SUCCESS after CI | No — observability only |
| `wait-worker-deploy` | Confirm worker reached SUCCESS after CI | No — observability only |

The `wait-*` jobs have `needs: backend-ci` so they only run after CI passes.
But the real enforcement is at the Railway layer via `checkSuites=True`.

## Rollback

To disable the gate (e.g., emergency hotfix that must bypass CI):

1. Railway dashboard → backend service → Settings → Deploy → toggle "Wait for CI" **off**.
2. Repeat for worker.
3. Deploy the hotfix.
4. Re-enable the gate: `python3 scripts/railway-service-config.py --apply`.

Do not leave the gate disabled after the hotfix.
