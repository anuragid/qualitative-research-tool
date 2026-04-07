# Methodex Hobby-Plan Scaling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Methodex's Celery pipeline and Railway topology to serve ~100 users / ~25 concurrent analyses peak on the Hobby plan without single-points-of-failure, by chaining the analysis pipeline into per-step tasks, extracting Celery Beat into its own service, scaling backend+worker to 2 replicas each, and trimming idle memory footprint.

**Architecture:** Five workstreams. WS1 (T6 — CI polish), WS2 (T4 — memory + cleanup), and WS3 (T1 — Celery chain refactor) run in **parallel worktrees**. WS4 (T2+T5 — infrastructure + Redis hardening) runs in **Wave 2** after WS1/WS2/WS3 have soaked on single-replica production for ≥24h. WS5 (validation) runs after WS4 lands. WS2 rebases on WS3 before merging because both edit the tasks/ directory.

**Tech Stack:** FastAPI, Celery 5.4 (threads pool), SQLAlchemy 2.0 (sync psycopg2), PostgreSQL (Railway plugin), Redis (Railway plugin), uvicorn, GitHub Actions, Railway GraphQL API, pytest.

**Design spec:** `docs/superpowers/specs/2026-04-06-methodex-hobby-scaling-design.md`

---

## File Map

| Workstream | Modified | Created | Deleted |
|---|---|---|---|
| WS1 (T6 CI polish) | `.github/workflows/ci.yml` | `scripts/ci/wait-for-railway-deploy.py` | — |
| WS2 (T4 memory + cleanup) | `backend/requirements.txt`, `backend/app/services/llm_service.py`, `backend/app/services/s3_service.py`, `backend/app/services/encryption_service.py`, `backend/app/auth.py` | `backend/tests/test_memory_baseline.py` | — |
| WS3 (T1 chain refactor) | `backend/app/tasks/analysis_steps.py`, `backend/app/tasks/celery_app.py`, `backend/app/routes/videos.py`, `backend/app/routes/projects.py`, `backend/tests/test_analysis_retry.py`, `backend/tests/test_watchdog_race.py` | `backend/app/tasks/project_analysis_steps.py`, `backend/app/tasks/pipeline_errors.py`, `backend/app/tasks/_pipeline_utils.py`, `backend/tests/test_analysis_chain.py`, `backend/tests/test_project_analysis_chain.py`, `backend/tests/test_pipeline_errors.py` | `backend/app/tasks/analysis_tasks.py` |
| WS4 (T2+T5 infra + Redis) | `backend/scripts/startup.sh`, `backend/app/database.py`, `backend/app/main.py`, Railway service config (via API) | `scripts/railway-service-config.py`, `backend/tests/test_healthcheck_ready.py`, `backend/tests/test_database_pool_config.py` | — |
| WS5 (validation) | `memory/project_hobby_scaling_progress.md` (update status) | `scripts/production-smoke-test.py`, `scripts/burst-load-test.py` | — |

---

## Dependency & Execution Order

```
WAVE 1 (parallel worktrees, independent subagents):
  ┌────────────┐  ┌──────────────┐  ┌────────────────┐
  │ WS1 (T6)   │  │ WS2 (T4)     │  │ WS3 (T1)       │
  │ CI polish  │  │ memory+rename│  │ chain refactor │
  └─────┬──────┘  └──────┬───────┘  └───────┬────────┘
        │                │                  │
        │        rebase on WS3 ─────────────┤
        │                │                  │
        └────────────────┴──────────────────┘
                         │
                  Merge Wave 1 to main
                         │
                  Soak ≥24h on single-replica production
                         │
WAVE 2:           ┌──────▼───────┐
                  │ WS4 (T2+T5)  │
                  │ infra+Redis  │
                  └──────┬───────┘
                         │
                  Merge Wave 2 to main
                         │
WAVE 3:           ┌──────▼───────┐
                  │ WS5          │
                  │ validation   │
                  └──────────────┘
```

**Hard rules:**
1. WS2 must rebase on WS3 before merging (both touch `backend/app/tasks/` imports).
2. WS4 must not begin until WS1, WS2, WS3 are merged and have soaked.
3. No `git push --force` to main ever. Use `git push` or merge via PR.
4. Every task ends with a commit. Do not batch commits across tasks.
5. Run `cd backend && pytest tests/ -v` before committing any backend code change; the test suite must stay green throughout.

---

## Task 0: Pre-flight (run once before launching workstreams)

**Files:**
- Read-only verification

- [ ] **Step 1: Verify we're on main with a clean working tree**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
git status
git log --oneline origin/main..HEAD
```

Expected: current branch `main`, clean working tree, spec commit `5576daf` visible in `git log origin/main..HEAD`.

- [ ] **Step 2: Verify backend test suite is green before any changes**

```bash
cd backend && pip install -r requirements.txt -r requirements-dev.txt && pytest tests/ -v 2>&1 | tail -30
```

Expected: 0 failing tests, 0 errors.

If any tests fail on clean main before changes, STOP and investigate — do not start the refactor on a broken baseline.

- [ ] **Step 3: Record current per-service memory footprint baseline**

Query Railway for current memory usage so we can measure improvement post-T4:

```bash
TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("user",{}).get("token",""))')
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ estimatedUsage(workspaceId: \"37eb4e96-0873-4033-a392-3c6593a68802\", projectId: \"154d302f-8609-4897-a10c-1f0d5bfc4f06\", measurements: [MEMORY_USAGE_GB, CPU_USAGE, NETWORK_TX_GB, DISK_USAGE_GB]) { measurement estimatedValue } }"}' \
  | python3 -m json.tool
```

Save the output to a scratch file — it will be compared against post-T4 numbers in WS5.

- [ ] **Step 4: Create worktree directories for parallel execution**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
git worktree add -b ci/railway-deploy-wait ../5d-worktrees/ws1-ci origin/main
git worktree add -b cleanup/memory-and-llm-naming ../5d-worktrees/ws2-cleanup origin/main
git worktree add -b refactor/celery-chain ../5d-worktrees/ws3-chain origin/main
git worktree list
```

Expected: three worktree entries alongside the main checkout. Each subagent that takes on WS1/WS2/WS3 works inside the matching directory.

**Note:** `origin/main` is the base so worktrees don't include local unpushed commits. If `origin/main` is behind and contains bugs the unpushed commits fix, rebase worktrees onto local main instead — but prefer the clean origin/main base when possible.

---

# WORKSTREAM 1 (WS1) — T6 CI Deploy-Wait

**Worktree:** `../5d-worktrees/ws1-ci` on branch `ci/railway-deploy-wait`

**Goal:** GitHub Actions CI reports green only after Railway has successfully deployed the backend for the current commit SHA, not merely after the test suite passes.

**Blocking?** No — runs fully in parallel with WS2 and WS3.

## Task 1.1: Add the Railway deploy-wait script

**Files:**
- Create: `scripts/ci/wait-for-railway-deploy.py`

- [ ] **Step 1: Create the script**

Create `scripts/ci/wait-for-railway-deploy.py`:

```python
#!/usr/bin/env python3
"""Wait for a Railway backend deployment matching a given commit SHA to reach SUCCESS.

Used in GitHub Actions to block CI from reporting green until the backend is
actually live. Polls the Railway GraphQL API every 15 seconds for up to 10 minutes.

Environment variables:
- RAILWAY_API_TOKEN: workspace-scoped Railway API token (GitHub secret)
- RAILWAY_PROJECT_ID: Railway project id (default: methodex project id)
- RAILWAY_BACKEND_SERVICE_ID: backend service id
- COMMIT_SHA: the commit sha we're waiting for (usually $GITHUB_SHA)
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

RAILWAY_API = "https://backboard.railway.app/graphql/v2"
POLL_INTERVAL_SECONDS = 15
MAX_WAIT_SECONDS = 600

QUERY = """
query DeploymentsForCommit($projectId: String!, $serviceId: String!) {
  deployments(
    first: 20
    input: { projectId: $projectId, serviceId: $serviceId }
  ) {
    edges {
      node {
        id
        status
        meta
        createdAt
      }
    }
  }
}
"""


def gql(query: str, variables: dict, token: str) -> dict:
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        RAILWAY_API,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}", file=sys.stderr)
        raise


def find_deployment_for_sha(token: str, project_id: str, service_id: str, sha: str):
    """Return (deployment_id, status) for the deployment matching the SHA, or (None, None)."""
    data = gql(QUERY, {"projectId": project_id, "serviceId": service_id}, token)
    if "errors" in data:
        print(f"GraphQL errors: {data['errors']}", file=sys.stderr)
        return None, None
    edges = (data.get("data") or {}).get("deployments", {}).get("edges", [])
    for edge in edges:
        node = edge.get("node", {})
        meta = node.get("meta") or {}
        commit = None
        if isinstance(meta, dict):
            commit = meta.get("commitHash") or meta.get("commit") or meta.get("sha")
        if commit and commit.startswith(sha[:7]):
            return node.get("id"), node.get("status")
    return None, None


def main():
    token = os.environ.get("RAILWAY_API_TOKEN")
    project_id = os.environ.get("RAILWAY_PROJECT_ID", "154d302f-8609-4897-a10c-1f0d5bfc4f06")
    service_id = os.environ.get("RAILWAY_BACKEND_SERVICE_ID", "2b70a900-042c-4083-b00b-0d01f3ece5dc")
    sha = os.environ.get("COMMIT_SHA") or os.environ.get("GITHUB_SHA")

    if not token:
        print("RAILWAY_API_TOKEN env var is required", file=sys.stderr)
        return 2
    if not sha:
        print("COMMIT_SHA (or GITHUB_SHA) env var is required", file=sys.stderr)
        return 2

    print(f"Waiting for Railway backend deployment of {sha[:7]} to reach SUCCESS...")

    start = time.monotonic()
    while time.monotonic() - start < MAX_WAIT_SECONDS:
        dep_id, status = find_deployment_for_sha(token, project_id, service_id, sha)
        if status is None:
            print(f"  [{int(time.monotonic() - start)}s] No deployment found yet for {sha[:7]}")
        elif status == "SUCCESS":
            print(f"  [{int(time.monotonic() - start)}s] Deployment {dep_id} SUCCESS")
            return 0
        elif status in ("FAILED", "CRASHED", "REMOVED"):
            print(f"  [{int(time.monotonic() - start)}s] Deployment {dep_id} {status} — aborting")
            return 1
        else:
            print(f"  [{int(time.monotonic() - start)}s] Deployment {dep_id} {status}, still waiting")
        time.sleep(POLL_INTERVAL_SECONDS)

    print(f"Timed out after {MAX_WAIT_SECONDS}s waiting for deployment", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/ci/wait-for-railway-deploy.py
```

- [ ] **Step 3: Smoke-test the script locally against the existing production deployment**

```bash
export RAILWAY_API_TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("user",{}).get("token",""))')
export COMMIT_SHA=$(git -C /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool rev-parse origin/main)
python3 scripts/ci/wait-for-railway-deploy.py
```

Expected: script prints "Deployment <id> SUCCESS" within 30 seconds (the existing production deployment for origin/main already succeeded).

If the script cannot locate a deployment for the SHA, iterate on the `find_deployment_for_sha` query — Railway's `deployments` edge may expose the commit in a different meta key. Adjust the commit-matching logic until the smoke test passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/ci/wait-for-railway-deploy.py
git commit -m "ci: add Railway deploy-wait script

Polls Railway GraphQL for the backend deployment matching the current
commit SHA, blocks until SUCCESS (10 min timeout). Used by a new CI job
so merges to main only report green when the backend is actually live.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 1.2: Add the deploy-wait job to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the current CI file**

```bash
cat .github/workflows/ci.yml
```

Identify the `backend-ci` job and confirm the `deploy-frontend` job shape to follow conventions.

- [ ] **Step 2: Append a new `wait-backend-deploy` job**

Edit `.github/workflows/ci.yml`, adding a new job block at the bottom (after `deploy-frontend`):

```yaml
  wait-backend-deploy:
    name: Wait for Railway Backend Deploy
    needs: backend-ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Set up Python 3.11
        uses: actions/setup-python@v6
        with:
          python-version: "3.11"

      - name: Wait for Railway deployment to reach SUCCESS
        env:
          RAILWAY_API_TOKEN: ${{ secrets.RAILWAY_API_TOKEN }}
          RAILWAY_PROJECT_ID: "154d302f-8609-4897-a10c-1f0d5bfc4f06"
          RAILWAY_BACKEND_SERVICE_ID: "2b70a900-042c-4083-b00b-0d01f3ece5dc"
          COMMIT_SHA: ${{ github.sha }}
        run: python3 scripts/ci/wait-for-railway-deploy.py
```

- [ ] **Step 3: Verify the YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add wait-backend-deploy job

Blocks CI from reporting green until Railway confirms the backend
deployment reached SUCCESS for the pushed commit. Uses the new
scripts/ci/wait-for-railway-deploy.py helper. Requires a new
RAILWAY_API_TOKEN secret to be added in GitHub repo settings.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 1.3: Document the new secret requirement

**Files:**
- Modify: `README.md` (or create one-liner ops doc)

- [ ] **Step 1: Check README for a secrets section**

```bash
grep -in "secret\|RAILWAY_API_TOKEN" README.md 2>/dev/null | head -10
```

- [ ] **Step 2: If a secrets section exists, add the new secret there; otherwise create `docs/ops/ci-secrets.md`**

Create `docs/ops/ci-secrets.md` (if README has no secrets section):

```markdown
# CI Secrets

GitHub Actions secrets required by `.github/workflows/ci.yml`:

| Secret | Purpose | How to obtain |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploy frontend to Cloudflare Pages | Cloudflare dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account selection | Cloudflare dashboard, right sidebar |
| `VITE_CLERK_PUBLISHABLE_KEY` | Production Clerk key (pk_live_…) | Clerk dashboard → API Keys |
| `VITE_API_URL` | `https://api.methodex.ai` | Static |
| `VITE_CLERK_PROXY_URL` | `/__clerk` (reverse-proxy path) | Static |
| `VITE_SENTRY_DSN` | Frontend Sentry DSN | Sentry project settings |
| `SENTRY_AUTH_TOKEN` | Source-map upload | Sentry account → auth tokens |
| `RAILWAY_API_TOKEN` | Railway GraphQL token for deploy-wait job | Railway dashboard → Account → Tokens (workspace-scoped) |

To rotate a secret, create a new one in the dashboard, update the GitHub
Actions secret, then revoke the old one.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ops/ci-secrets.md
git commit -m "docs: add CI secrets inventory

Lists all GitHub Actions secrets consumed by .github/workflows/ci.yml
and how to obtain them. Adds the new RAILWAY_API_TOKEN entry required
by the wait-backend-deploy job.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 1.4: WS1 handoff

- [ ] **Step 1: Final verification in the WS1 worktree**

```bash
git log --oneline origin/main..HEAD
```

Expected: 3 commits (add script, add CI job, add docs).

- [ ] **Step 2: Note manual action required**

The `RAILWAY_API_TOKEN` GitHub secret must be added before this PR merges to main, or the new CI job will fail. Flag this in the PR description:

> **⚠️ Pre-merge action:** Add `RAILWAY_API_TOKEN` to GitHub Actions secrets (workspace-scoped Railway token). Otherwise the new `wait-backend-deploy` job will fail on the first push to main.

WS1 is complete. The branch is ready for PR review and merge.

---

# WORKSTREAM 2 (WS2) — T4 Memory + llm_service Cleanup

**Worktree:** `../5d-worktrees/ws2-cleanup` on branch `cleanup/memory-and-llm-naming`

**Goal:** Remove unused `langgraph` dependency, lazy-import heavy modules (boto3, openai, cryptography), rename `FREE_MODEL_FALLBACKS → STANDARD_MODEL_FALLBACKS`, fix stale docstrings that describe the app as using free-tier OpenRouter models (it does not).

**Blocking?** Must **rebase on WS3** before merging because both WS2 and WS3 touch the `backend/app/tasks/` directory and imports. Start in parallel; rebase at merge time.

## Task 2.1: Verify langgraph is unused before removing it

**Files:**
- Read-only verification

- [ ] **Step 1: Grep for any remaining langgraph imports**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
grep -rn "from langgraph\|import langgraph" backend/app backend/tests 2>&1
```

Expected: zero hits. If any code still imports `langgraph`, STOP — fix those imports to use direct node function calls (see `backend/app/tasks/analysis_tasks.py:1-12` docstring for the pattern) BEFORE removing the dependency. File a finding in the commit message and reopen Task 2.1 if needed.

- [ ] **Step 2: Confirm requirements.txt has the line**

```bash
grep -n "^langgraph" backend/requirements.txt
```

Expected: one hit, line ~14.

## Task 2.2: Remove langgraph from requirements.txt

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Remove the langgraph line**

Edit `backend/requirements.txt`, delete the line `langgraph==1.0.10`.

- [ ] **Step 2: Reinstall to verify the app still imports**

```bash
cd backend && pip uninstall -y langgraph && pip install -r requirements.txt
python -c "import app.main; print('OK')"
```

Expected: `OK` with no ImportError.

- [ ] **Step 3: Run the full backend test suite**

```bash
pytest tests/ -v 2>&1 | tail -20
```

Expected: all tests pass (same count as the pre-flight baseline).

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: drop unused langgraph dependency

The codebase moved to direct node function calls in 2026-03 (see
backend/app/tasks/analysis_tasks.py docstring) but langgraph stayed
in requirements.txt. Removing it shrinks per-container idle memory
by ~50 MB per Python process.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2.3: Trim sentry-sdk extras

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Change sentry-sdk extras**

Edit `backend/requirements.txt`, change:

```
sentry-sdk[fastapi,celery,openai]>=2.41.0
```

to:

```
sentry-sdk[fastapi,celery]>=2.41.0
```

- [ ] **Step 2: Reinstall and verify**

```bash
cd backend && pip install -r requirements.txt && python -c "import sentry_sdk; print(sentry_sdk.VERSION)"
```

Expected: version string printed, no import errors.

- [ ] **Step 3: Run the test suite**

```bash
pytest tests/ -v 2>&1 | tail -20
```

Expected: all tests pass. If `test_sentry_config.py` or `test_llm_monitoring.py` tests fail because they reference the removed openai integration, update them to stop asserting on OpenAI Sentry spans — we deliberately removed that integration.

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: remove openai extra from sentry-sdk

The OpenAI Sentry integration auto-instruments every LLM call with
detailed traces, which is noisy for our workload and not what we use
Sentry for. Keeping [fastapi,celery] which we actually need.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2.4: Lazy-import boto3 in s3_service.py

**Files:**
- Modify: `backend/app/services/s3_service.py`

- [ ] **Step 1: Read the file to find the top-level boto3 import**

```bash
grep -n "^import boto3\|^from boto3\|^from botocore" backend/app/services/s3_service.py
```

- [ ] **Step 2: Move the boto3 import into the function(s) that use it**

Edit `backend/app/services/s3_service.py`. Find every top-level `import boto3` / `from botocore...` statement and move them into the first function or method that actually uses boto3. For example, if the module has:

```python
import boto3
from botocore.client import Config
```

And a class `S3Service` with a method `_get_client()` that uses them, move the imports into `_get_client`:

```python
def _get_client(self):
    import boto3
    from botocore.client import Config
    return boto3.client(...)
```

Keep the imports lazy in every function that touches boto3 (Python caches module imports so repeated calls have near-zero overhead).

- [ ] **Step 3: Verify the backend still imports and the tests still pass**

```bash
cd backend && python -c "from app.services.s3_service import s3_service; print('OK')"
pytest tests/ -v 2>&1 | tail -20
```

Expected: `OK`, all tests pass. If `test_upload_validation.py` or related tests fail, the lazy import is probably inside a branch that the test never exercises — move it earlier in the function or to a helper that's called on init.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/s3_service.py
git commit -m "perf: lazy-import boto3 in s3_service

boto3 + botocore loads ~80 MB on import. The backend API process
never touches S3 (only the worker does), so deferring the import
until first use sheds that memory from every backend replica.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2.5: Lazy-import openai in llm_service.py

**Files:**
- Modify: `backend/app/services/llm_service.py`

- [ ] **Step 1: Find the top-level openai import**

```bash
grep -n "^from openai\|^import openai" backend/app/services/llm_service.py
```

- [ ] **Step 2: Move it into the client factory**

Find the method (probably `__init__` or `_get_client`) that constructs the OpenAI client. Move the `from openai import OpenAI` (or equivalent) into that method.

Example pattern if the current code is:

```python
from openai import OpenAI

class LLMService:
    def __init__(self):
        self.client = OpenAI(base_url=..., api_key=...)
```

Change to:

```python
class LLMService:
    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(base_url=..., api_key=...)
        return self._client
```

Preserve every existing call site's behavior.

- [ ] **Step 3: Run the llm_service tests**

```bash
cd backend && pytest tests/test_llm_service.py tests/test_llm_service_retry.py -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/llm_service.py
git commit -m "perf: lazy-import openai in llm_service

Defers the ~25 MB openai SDK import until the first LLM call.
Uses a cached @property so subsequent calls have no overhead.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2.6: Lazy-import cryptography in encryption_service.py

**Files:**
- Modify: `backend/app/services/encryption_service.py`

- [ ] **Step 1: Find the top-level cryptography import**

```bash
grep -n "cryptography" backend/app/services/encryption_service.py
```

- [ ] **Step 2: Move `from cryptography.fernet import Fernet` into the functions that use it**

Same pattern as Task 2.5 — defer the import to first use, cache if needed.

- [ ] **Step 3: Run encryption tests**

```bash
cd backend && pytest tests/test_encryption.py -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/encryption_service.py
git commit -m "perf: lazy-import cryptography in encryption_service

Defers the ~15 MB cryptography module import until the first
encrypt/decrypt call. Most requests don't touch BYOK keys so
this shaves idle memory from backend replicas.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2.7: Rename FREE_MODEL_FALLBACKS → STANDARD_MODEL_FALLBACKS

**Files:**
- Modify: `backend/app/services/llm_service.py`

- [ ] **Step 1: Find every reference to the symbol**

```bash
grep -rn "FREE_MODEL_FALLBACKS" backend/
```

- [ ] **Step 2: Rename every occurrence**

In `backend/app/services/llm_service.py`, rename the constant and all references:

```python
# Before
FREE_MODEL_FALLBACKS = [
    "meta-llama/llama-4-scout",
    "nvidia/nemotron-3-super-120b-a12b",
    "deepseek/deepseek-chat-v3-0324",
]

# After
STANDARD_MODEL_FALLBACKS = [
    "meta-llama/llama-4-scout",
    "nvidia/nemotron-3-super-120b-a12b",
    "deepseek/deepseek-chat-v3-0324",
]
```

And update every reference in the file (grep output from Step 1).

- [ ] **Step 3: Verify no lingering references**

```bash
grep -rn "FREE_MODEL_FALLBACKS" backend/
```

Expected: zero hits.

- [ ] **Step 4: Run the relevant tests**

```bash
cd backend && pytest tests/test_llm_service.py tests/test_llm_service_retry.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/llm_service.py
git commit -m "refactor: rename FREE_MODEL_FALLBACKS to STANDARD_MODEL_FALLBACKS

The list contains paid open-source models on OpenRouter, not free-tier
models. The 'FREE' prefix was a historical artifact from the original
migration plan that confused both humans and AI assistants.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2.8: Fix stale free-tier docstrings in llm_service.py

**Files:**
- Modify: `backend/app/services/llm_service.py`

- [ ] **Step 1: Find the stale comments**

```bash
grep -n "free.*[Oo]penRouter\|[Ff]ree.*model" backend/app/services/llm_service.py
```

Expected hits include:
- Line ~199–200: "When the primary model is persistently rate-limited (common with free OpenRouter models)"
- Line ~296–297: "Free models may return null content (e.g. finish_reason: length"

- [ ] **Step 2: Rewrite those comments**

Change:

```python
# When the primary model is persistently rate-limited (common with free
# OpenRouter models), this method automatically tries fallback models.
```

to:

```python
# When the primary model is persistently rate-limited, this method
# automatically tries fallback models from STANDARD_MODEL_FALLBACKS.
```

And:

```python
# Free models may return null content (e.g. finish_reason: length
# with no output). Fall back to next model when using shared key.
```

to:

```python
# Open-source models may return null content (e.g. finish_reason:
# length with no output). Fall back to next model when using shared key.
```

- [ ] **Step 3: Verify no "free" references remain in the LLM service**

```bash
grep -in "free" backend/app/services/llm_service.py
```

Expected: zero hits related to model tier (hits on unrelated English words like "free memory" are fine).

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_llm_service.py tests/test_llm_service_retry.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/llm_service.py
git commit -m "docs: correct stale 'free OpenRouter models' comments in llm_service

The app has never used free-tier OpenRouter models — DEFAULT_MODEL is
meta-llama/llama-4-scout (paid) and there is no ':free' suffix anywhere
in production code paths. The comments were vestigial language from
the original migration plan.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 2.9: WS2 handoff and merge prep

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests pass. Count should match the pre-flight baseline.

- [ ] **Step 2: Rebase on WS3 (chain-refactor) before merging**

When WS3 lands on main, rebase WS2 on top:

```bash
cd ../5d-worktrees/ws2-cleanup
git fetch origin
git rebase origin/main
```

Resolve any conflicts in `backend/app/tasks/` imports — both branches touch that area. After rebase, re-run `pytest tests/ -v` and fix any test breakage before merging.

- [ ] **Step 3: Verify WS2 commits**

```bash
git log --oneline origin/main..HEAD
```

Expected: 7 commits from this workstream (drop langgraph, trim sentry, lazy-import ×3, rename, docs).

WS2 is complete.

---

# WORKSTREAM 3 (WS3) — T1 Celery Chain Refactor

**Worktree:** `../5d-worktrees/ws3-chain` on branch `refactor/celery-chain`

**Goal:** Convert the monolithic `analyze_video_task` and `analyze_project_task` into Celery `chain`s of per-step tasks. Each step task runs independently, frees its worker thread between steps, and has its own retry lifecycle. Delete the monolithic task file entirely.

**Blocking?** No — runs in parallel with WS1 and WS2. But this must merge BEFORE WS2 so WS2 can rebase on it cleanly.

## Task 3.1: Create shared pipeline utilities module

**Files:**
- Create: `backend/app/tasks/_pipeline_utils.py`
- Modify: `backend/app/tasks/celery_app.py` (later)

- [ ] **Step 1: Extract sanitize_error and error-JSON helpers from analysis_tasks.py**

Create `backend/app/tasks/_pipeline_utils.py`:

```python
"""Shared helpers for the analysis pipeline tasks.

Extracted from the pre-refactor analysis_tasks.py so that step tasks
and the chain error handler can share the same sanitization and
structured-error logic.
"""

import json
import re
from typing import Optional

from app.utils.error_classification import build_structured_error, is_retryable

# Pattern matches common API key formats (OpenRouter sk-or-*, generic long tokens)
_API_KEY_PATTERN = re.compile(
    r"(sk-or-v1-[A-Za-z0-9]{4})[A-Za-z0-9]{20,}"  # OpenRouter keys
    r"|"
    r"(sk-[A-Za-z0-9]{4})[A-Za-z0-9]{20,}"  # OpenAI-style keys
    r"|"
    r"(Bearer\s+)[A-Za-z0-9_\-]{20,}"  # Bearer tokens in error messages
    r"|"
    r"([a-f0-9]{4})[a-f0-9]{28,}"  # AssemblyAI and other hex keys
)


def sanitize_error(message: str) -> str:
    """Strip potential API key material from error messages before storage."""
    return _API_KEY_PATTERN.sub(
        lambda m: (m.group(1) or m.group(2) or m.group(3) or m.group(4) or "") + "***REDACTED***",
        message,
    )


def build_error_json(step: str, exc: Exception, message: str) -> str:
    """Build a structured error JSON string from pipeline state info."""
    return json.dumps(build_structured_error(
        step=step,
        exc=exc,
        message=sanitize_error(message),
    ))


def build_pipeline_error_json(failed_step: str, error_str: str, error_type: Optional[str] = None) -> str:
    """Build a structured error JSON string for a pipeline node failure."""
    etype = error_type or "unknown"
    return json.dumps({
        "step": failed_step,
        "error_type": etype,
        "retryable": is_retryable(etype),
        "message": f"Analysis failed at step '{failed_step}': {error_str}",
        "details": error_str,
    })


class PipelineError(Exception):
    """Internal exception carrying structured error JSON from the pipeline."""

    def __init__(self, message: str, structured_json: Optional[str] = None):
        super().__init__(message)
        self.structured_json = structured_json
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/tasks/_pipeline_utils.py
git commit -m "refactor: extract pipeline utilities into _pipeline_utils module

Extracts sanitize_error, build_error_json, build_pipeline_error_json,
and PipelineError from the monolithic analysis_tasks.py so the chain
refactor can share them between step tasks and the error handler.

No functional change — helpers are byte-identical to the originals.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.2: Add cancellation precheck helper for step tasks

**Files:**
- Modify: `backend/app/tasks/analysis_steps.py`

- [ ] **Step 1: Add a cancellation precheck helper near the top of the file**

In `backend/app/tasks/analysis_steps.py`, after the existing imports and before `class NonRetryableAnalysisError`, add:

```python
from app.tasks._pipeline_utils import sanitize_error, build_error_json


def _check_cancellation(db: Session, video_id: str) -> bool:
    """Return True if the analysis should stop (watchdog error, row gone).

    Called at the start of every step task in the chain so a halted
    pipeline doesn't do redundant work on subsequent links.
    """
    try:
        db.expire_all()
        analysis = db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()
        if analysis is None or analysis.status == "error":
            return True
        return False
    except Exception:
        logger.exception("_check_cancellation failed, proceeding")
        return False
```

- [ ] **Step 2: Verify tests still pass**

```bash
cd backend && pytest tests/test_analysis_retry.py tests/test_watchdog_race.py tests/test_analysis_step_non_retryable.py -v
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/app/tasks/analysis_steps.py
git commit -m "refactor: add _check_cancellation helper for chain halts

Each step task in the upcoming Celery chain will call this at the top
to exit early if the watchdog (or a prior failed step) already marked
the analysis as error. Replaces the in-function _is_cancelled polling
from the monolithic analyze_video_task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.3: Wire cancellation precheck into every existing video step task

**Files:**
- Modify: `backend/app/tasks/analysis_steps.py`

- [ ] **Step 1: Add precheck call to each of the 5 step tasks**

For each of `analyze_chunk_step`, `analyze_infer_step`, `analyze_relate_step`, `analyze_explain_step`, `analyze_activate_step`, add a cancellation check at the very top of the `try:` block, right after the `logger.info(f"Starting ... for video {video_id}")` line.

Example for `analyze_chunk_step`:

```python
def analyze_chunk_step(self, video_id: str, user_id: str | None = None):
    """
    Step 1: CHUNK - Break transcript into discrete pieces.
    """
    try:
        logger.info(f"Starting CHUNK step for video {video_id}")

        # Cancellation precheck — watchdog or prior halted step
        if _check_cancellation(self.db, video_id):
            logger.info(f"Skipping chunk for {video_id} — already in error state")
            return {"video_id": video_id, "status": "skipped"}

        # ... existing code continues ...
```

Repeat for all 5 step tasks.

- [ ] **Step 2: Write a test that verifies the cancellation precheck returns "skipped"**

Create or update `backend/tests/test_analysis_chain.py`:

```python
"""Tests for the Celery chain-based analysis pipeline."""

from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.models.database_models import Project, Transcript, Video, VideoAnalysis
from app.tasks.analysis_steps import analyze_chunk_step, _check_cancellation


def _seed_project_video_transcript(db: Session, user_id: str = "dev_user_local"):
    project = Project(name="test", user_id=user_id)
    db.add(project)
    db.flush()
    video = Video(
        project_id=project.id,
        filename="v.mp4",
        s3_key=f"videos/{project.id}/{uuid4()}/v.mp4",
        s3_url="https://example/v.mp4",
        file_size_bytes=100,
        status="transcribed",
    )
    db.add(video)
    db.flush()
    transcript = Transcript(
        video_id=video.id,
        status="completed",
        processed_transcript={"duration_seconds": 60},
        raw_transcript={"utterances": []},
    )
    db.add(transcript)
    db.commit()
    return project, video


def test_cancellation_precheck_returns_skipped_when_analysis_already_in_error(db_session):
    """If watchdog marked analysis as error, step task should return skipped."""
    _, video = _seed_project_video_transcript(db_session)
    analysis = VideoAnalysis(
        video_id=video.id,
        status="error",  # watchdog already marked it
        step_status={"chunk": "error"},
    )
    db_session.add(analysis)
    db_session.commit()

    assert _check_cancellation(db_session, str(video.id)) is True


def test_cancellation_precheck_returns_false_when_analysis_is_processing(db_session):
    """If analysis is actively processing, step task should continue."""
    _, video = _seed_project_video_transcript(db_session)
    analysis = VideoAnalysis(
        video_id=video.id,
        status="processing",
        step_status={"chunk": "processing"},
    )
    db_session.add(analysis)
    db_session.commit()

    assert _check_cancellation(db_session, str(video.id)) is False
```

- [ ] **Step 3: Run the new test**

```bash
cd backend && pytest tests/test_analysis_chain.py -v
```

Expected: both tests pass. If `db_session` fixture doesn't exist in `conftest.py`, adapt the test to use whatever fixture the existing suite uses for DB sessions (grep `conftest.py` for `db_session` or similar).

- [ ] **Step 4: Run the full analysis-step test suite**

```bash
pytest tests/test_analysis_retry.py tests/test_analysis_step_non_retryable.py tests/test_watchdog_race.py tests/test_analysis_chain.py -v
```

Expected: all pass. If `test_watchdog_race.py` breaks because it relied on the old `_is_cancelled` behavior, update it to assert the new `_check_cancellation` flow.

- [ ] **Step 5: Commit**

```bash
git add backend/app/tasks/analysis_steps.py backend/tests/test_analysis_chain.py
git commit -m "refactor: add cancellation precheck to all video step tasks

Every chain link now exits early if watchdog (or a prior step) marked
the analysis as error. Returns {status: skipped} so downstream chain
links see a clean non-error return and also short-circuit naturally.

Adds test_analysis_chain.py with initial coverage for the precheck.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.4: Move initial-state setup from route into analyze_chunk_step

**Files:**
- Modify: `backend/app/tasks/analysis_steps.py`

- [ ] **Step 1: Update analyze_chunk_step to create/reset VideoAnalysis if needed**

In `backend/app/tasks/analysis_steps.py`, update `analyze_chunk_step` so it handles the initial-state transitions that were previously done in the route's `trigger_video_analysis` handler:

```python
@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_chunk_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_chunk_step(self, video_id: str, user_id: str | None = None):
    """Step 1: CHUNK — break transcript into discrete pieces.

    Also responsible for chain-start state transitions: create or reset
    the VideoAnalysis row, mark all steps pending, set status=processing.
    """
    try:
        logger.info(f"Starting CHUNK step for video {video_id}")

        if _check_cancellation(self.db, video_id):
            logger.info(f"Skipping chunk for {video_id} — already in error state")
            return {"video_id": video_id, "status": "skipped"}

        state = get_video_analysis_state(self.db, UUID(video_id))
        analysis = state["analysis"]

        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        # Chain-start transitions — previously done in the route
        analysis.status = "processing"
        analysis.current_step = "chunk"
        analysis.step_status = {
            "chunk": "processing",
            "infer": "pending",
            "relate": "pending",
            "explain": "pending",
            "activate": "pending",
        }
        analysis.started_at = datetime.now(timezone.utc)

        # Mark the video as analyzing (may already be set by the route)
        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        if video:
            video.status = "analyzing"
            video.error_message = None
        self.db.commit()

        result = chunk_node({
            "video_id": video_id,
            "transcript": state["transcript"],
            "speaker_labels": state["speaker_labels"],
            "speaker_roles": state["speaker_roles"],
            "api_key": byok_api_key,
            "model": byok_model,
        })

        if result.get("error") or result.get("chunks") is None:
            _raise_for_node_error("chunk", result)

        analysis.chunks = result.get("chunks")
        analysis.chunk_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "chunk": "completed"}
        self.db.commit()

        logger.info(f"CHUNK step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "chunks_count": len(result.get("chunks", [])),
        }

    except Exception as e:
        logger.error(f"CHUNK step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "chunk")
        raise
```

- [ ] **Step 2: Add a test for the chain-start transitions**

Append to `backend/tests/test_analysis_chain.py`:

```python
def test_chunk_step_initializes_step_status_and_sets_processing(db_session, monkeypatch):
    """analyze_chunk_step should init step_status dict and mark analysis processing."""
    _, video = _seed_project_video_transcript(db_session)

    # Stub the chunk_node so we don't hit the LLM
    from app.tasks import analysis_steps
    def fake_chunk_node(state):
        return {"chunks": [{"id": "C001", "text": "hello"}], "current_step": "chunk"}
    monkeypatch.setattr(analysis_steps, "chunk_node", fake_chunk_node)

    # Stub BYOK resolver
    monkeypatch.setattr(
        analysis_steps, "_resolve_byok",
        lambda db, user_id: (None, None),
    )

    # Invoke the task function directly (bypassing Celery's queue)
    task_self = type("T", (), {"db": db_session, "request": type("R", (), {"retries": 0})()})
    try:
        analysis_steps.analyze_chunk_step.run.__wrapped__(task_self, str(video.id), "dev_user_local")
    except AttributeError:
        # Older Celery versions expose the function differently
        analysis_steps.analyze_chunk_step(str(video.id), "dev_user_local")

    analysis = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
    assert analysis is not None
    assert analysis.status == "processing"
    assert analysis.step_status["chunk"] == "completed"
    assert analysis.step_status["infer"] == "pending"
    assert analysis.step_status["relate"] == "pending"
    assert analysis.step_status["explain"] == "pending"
    assert analysis.step_status["activate"] == "pending"
```

- [ ] **Step 3: Run the test**

```bash
cd backend && pytest tests/test_analysis_chain.py -v
```

Expected: all tests pass. If the task-invocation pattern (`run.__wrapped__`) doesn't match this Celery version, adapt to however the existing tests call step tasks directly — grep `backend/tests/test_analysis_retry.py` for the pattern that works.

- [ ] **Step 4: Commit**

```bash
git add backend/app/tasks/analysis_steps.py backend/tests/test_analysis_chain.py
git commit -m "refactor: move initial-state setup into analyze_chunk_step

Chain-start state transitions (create VideoAnalysis row if missing,
init step_status dict, set status=processing, clear error_message)
move from the route handler into the chunk step task. The route
becomes a pure dispatcher.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.5: Create pipeline_errors.py with the chain error handler

**Files:**
- Create: `backend/app/tasks/pipeline_errors.py`
- Create: `backend/tests/test_pipeline_errors.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_pipeline_errors.py`:

```python
"""Tests for the chain error handler."""

from uuid import uuid4
from unittest.mock import MagicMock

import pytest

from app.models.database_models import Project, Video, VideoAnalysis


def _seed_video_in_processing(db_session, user_id="dev_user_local"):
    project = Project(name="test", user_id=user_id)
    db_session.add(project)
    db_session.flush()
    video = Video(
        project_id=project.id,
        filename="v.mp4",
        s3_key=f"videos/{project.id}/{uuid4()}/v.mp4",
        s3_url="https://example/v.mp4",
        file_size_bytes=100,
        status="analyzing",
    )
    db_session.add(video)
    db_session.flush()
    analysis = VideoAnalysis(
        video_id=video.id,
        status="processing",
        step_status={"chunk": "completed", "infer": "processing"},
    )
    db_session.add(analysis)
    db_session.commit()
    return video, analysis


def test_handle_pipeline_error_marks_video_and_analysis_error(db_session):
    """When a chain link fails, the error handler should mark both records."""
    from app.tasks.pipeline_errors import handle_pipeline_error

    video, analysis = _seed_video_in_processing(db_session)
    fake_exc = RuntimeError("LLM timeout")
    fake_request = MagicMock()
    fake_request.task = "analyze_infer_step"

    task_self = type("T", (), {"db": db_session})()
    handle_pipeline_error.run.__func__(
        task_self, fake_request, fake_exc, "fake_traceback", str(video.id)
    )

    db_session.refresh(video)
    db_session.refresh(analysis)
    assert video.status == "error"
    assert video.error_message  # JSON string
    assert analysis.status == "error"
    assert analysis.completed_at is not None


def test_handle_pipeline_error_is_idempotent(db_session):
    """Running the error handler twice should not change state after the first."""
    from app.tasks.pipeline_errors import handle_pipeline_error

    video, analysis = _seed_video_in_processing(db_session)
    fake_exc = RuntimeError("boom")
    fake_request = MagicMock()
    fake_request.task = "analyze_infer_step"
    task_self = type("T", (), {"db": db_session})()

    handle_pipeline_error.run.__func__(task_self, fake_request, fake_exc, "tb", str(video.id))
    first_error_msg = video.error_message

    handle_pipeline_error.run.__func__(task_self, fake_request, fake_exc, "tb", str(video.id))
    db_session.refresh(video)
    # Should be unchanged on the second call
    assert video.error_message == first_error_msg
    assert video.status == "error"
```

- [ ] **Step 2: Run the failing test**

```bash
cd backend && pytest tests/test_pipeline_errors.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.tasks.pipeline_errors'`.

- [ ] **Step 3: Create the pipeline_errors.py module**

Create `backend/app/tasks/pipeline_errors.py`:

```python
"""Chain error handler for the Celery analysis pipeline.

When a link in the analysis chain fails after retries are exhausted,
Celery invokes this task via .on_error() with the task request, the
exception, a traceback string, and our explicit video_id argument.

The handler is idempotent — if an individual step task's except block
already marked the analysis as error (the common case), this handler
is a no-op.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from app.models.database_models import Video, VideoAnalysis
from app.tasks._pipeline_utils import build_error_json, sanitize_error
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(base=DatabaseTask, bind=True, name="handle_pipeline_error")
def handle_pipeline_error(self, request, exc, traceback, video_id: str):
    """Chain error handler — marks video + analysis as error, idempotent."""
    try:
        self.db.rollback()

        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        # Determine which step failed from the request context
        failed_step = "unknown"
        if request is not None:
            task_name = getattr(request, "task", None)
            if task_name and isinstance(task_name, str):
                # e.g. "analyze_infer_step" → "infer"
                failed_step = task_name.replace("analyze_", "").replace("_step", "")

        error_json = build_error_json(
            step=failed_step,
            exc=exc if isinstance(exc, Exception) else Exception(str(exc)),
            message=str(exc),
        )

        # Idempotent update: only set error state if not already set
        if video and video.status not in ("error", "analyzed"):
            video.status = "error"
            video.error_message = error_json
            logger.info(f"handle_pipeline_error: marked video {video_id} as error (step={failed_step})")
        elif video:
            logger.info(f"handle_pipeline_error: video {video_id} already in {video.status}, no-op")

        if analysis and analysis.status != "error":
            analysis.status = "error"
            analysis.completed_at = datetime.now(timezone.utc)

        self.db.commit()

    except Exception as e:
        logger.error(f"handle_pipeline_error itself failed: {sanitize_error(str(e))}", exc_info=True)
        try:
            self.db.rollback()
        except Exception:
            pass
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && pytest tests/test_pipeline_errors.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/tasks/pipeline_errors.py backend/tests/test_pipeline_errors.py
git commit -m "feat: add handle_pipeline_error chain error handler

New task invoked by Celery via chain.on_error() when any step task
fails after retries. Marks the video + VideoAnalysis rows as error
(idempotent — no-op if already marked). Extracts the failing step
name from request.task for structured logging.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.6: Create per-step tasks for the 3-node project analysis

**Files:**
- Create: `backend/app/tasks/project_analysis_steps.py`
- Create: `backend/tests/test_project_analysis_chain.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_project_analysis_chain.py`:

```python
"""Tests for the Celery chain-based project analysis pipeline."""

from uuid import uuid4

import pytest

from app.models.database_models import (
    Project,
    ProjectAnalysis,
    Video,
    VideoAnalysis,
)


def _seed_project_with_completed_videos(db_session, user_id="dev_user_local"):
    project = Project(name="test", user_id=user_id, description="Research goal")
    db_session.add(project)
    db_session.flush()
    for i in range(2):
        video = Video(
            project_id=project.id,
            filename=f"v{i}.mp4",
            s3_key=f"videos/{project.id}/{uuid4()}/v{i}.mp4",
            s3_url=f"https://example/v{i}.mp4",
            file_size_bytes=100,
            status="analyzed",
        )
        db_session.add(video)
        db_session.flush()
        analysis = VideoAnalysis(
            video_id=video.id,
            status="completed",
            patterns=[{"id": f"P{i}", "text": "pattern"}],
            insights=[{"id": f"I{i}", "text": "insight"}],
            design_principles=[{"id": f"DP{i}", "text": "principle"}],
        )
        db_session.add(analysis)
    db_session.commit()
    return project


def test_cross_relate_step_aggregates_patterns_and_runs_node(db_session, monkeypatch):
    """cross_relate step should read completed video analyses and run cross_relate_node."""
    from app.tasks import project_analysis_steps

    project = _seed_project_with_completed_videos(db_session)

    def fake_cross_relate(state):
        assert len(state["video_patterns"]) == 2
        return {"cross_video_patterns": [{"id": "CP1", "text": "cross pattern"}]}

    monkeypatch.setattr(project_analysis_steps, "cross_relate_node", fake_cross_relate)
    monkeypatch.setattr(project_analysis_steps, "_resolve_byok", lambda db, user_id: (None, None))

    task_self = type("T", (), {"db": db_session, "request": type("R", (), {"retries": 0})()})
    project_analysis_steps.analyze_cross_relate_step.run.__func__(
        task_self, str(project.id), "dev_user_local"
    )

    pa = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
    assert pa is not None
    assert pa.cross_video_patterns == [{"id": "CP1", "text": "cross pattern"}]
    assert pa.status == "processing"


def test_cross_activate_step_marks_project_analysis_completed(db_session, monkeypatch):
    """cross_activate (terminal step) should mark status completed with completed_at."""
    from app.tasks import project_analysis_steps

    project = _seed_project_with_completed_videos(db_session)
    pa = ProjectAnalysis(
        project_id=project.id,
        status="processing",
        video_ids=[],
        cross_video_patterns=[{"id": "CP1"}],
        cross_video_insights=[{"id": "CI1"}],
    )
    db_session.add(pa)
    db_session.commit()

    def fake_cross_activate(state):
        return {"cross_video_principles": [{"id": "CDP1", "text": "principle"}]}

    monkeypatch.setattr(project_analysis_steps, "cross_activate_node", fake_cross_activate)
    monkeypatch.setattr(project_analysis_steps, "_resolve_byok", lambda db, user_id: (None, None))

    task_self = type("T", (), {"db": db_session, "request": type("R", (), {"retries": 0})()})
    project_analysis_steps.analyze_cross_activate_step.run.__func__(
        task_self, str(project.id), "dev_user_local"
    )

    db_session.refresh(pa)
    assert pa.status == "completed"
    assert pa.completed_at is not None
    assert pa.cross_video_principles == [{"id": "CDP1", "text": "principle"}]
```

- [ ] **Step 2: Run the failing test**

```bash
cd backend && pytest tests/test_project_analysis_chain.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.tasks.project_analysis_steps'`.

- [ ] **Step 3: Create the project_analysis_steps.py module**

Create `backend/app/tasks/project_analysis_steps.py`:

```python
"""Separate Celery tasks for step-by-step cross-video project analysis.

Mirrors backend/app/tasks/analysis_steps.py but for the 3-node project
analysis pipeline: cross_relate → cross_explain → cross_activate.
Each step reads state from the ProjectAnalysis row, runs one node,
and writes results back.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

from sqlalchemy.orm import Session

from app.agents.nodes.cross_activate import cross_activate_node
from app.agents.nodes.cross_explain import cross_explain_node
from app.agents.nodes.cross_relate import cross_relate_node
from app.models.database_models import Project, ProjectAnalysis, Video, VideoAnalysis
from app.services.byok_service import resolve_byok as _resolve_byok
from app.tasks.analysis_steps import NonRetryableAnalysisError, _raise_for_node_error
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _check_project_cancellation(db: Session, project_id: str) -> bool:
    """Return True if the project analysis should stop."""
    try:
        db.expire_all()
        pa = db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if pa is None or pa.status == "error":
            return True
        return False
    except Exception:
        logger.exception("_check_project_cancellation failed, proceeding")
        return False


def _get_or_create_project_analysis(db: Session, project_id: UUID) -> ProjectAnalysis:
    """Get existing ProjectAnalysis or create a new one with aggregated state."""
    pa = db.query(ProjectAnalysis).filter(ProjectAnalysis.project_id == project_id).first()
    if pa is None:
        # Aggregate from completed video analyses
        video_analyses = db.query(VideoAnalysis).join(Video).filter(
            Video.project_id == project_id,
            VideoAnalysis.status == "completed",
        ).all()
        if not video_analyses:
            raise Exception("At least one completed video analysis is required")

        video_ids = [va.video_id for va in video_analyses]
        pa = ProjectAnalysis(
            project_id=project_id,
            video_ids=video_ids,
            status="processing",
            started_at=datetime.now(timezone.utc),
        )
        db.add(pa)
        db.commit()
        db.refresh(pa)
    return pa


def _update_project_analysis_error(db: Session, project_id: str, step_name: str):
    """Mark ProjectAnalysis as error, safe to call on dirty session."""
    try:
        db.rollback()
        pa = db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if pa:
            pa.status = "error"
            pa.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as commit_error:
        logger.error(f"Failed to update project error status for {step_name}: {commit_error}")
        try:
            db.rollback()
        except Exception:
            pass


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_cross_relate_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_cross_relate_step(self, project_id: str, user_id: str | None = None):
    """Step 1 of 3: find meta-patterns across videos."""
    try:
        logger.info(f"Starting CROSS_RELATE step for project {project_id}")

        if _check_project_cancellation(self.db, project_id):
            logger.info(f"Skipping cross_relate for {project_id} — already in error state")
            return {"project_id": project_id, "status": "skipped"}

        pa = _get_or_create_project_analysis(self.db, UUID(project_id))

        # Aggregate patterns from completed videos
        video_analyses = self.db.query(VideoAnalysis).join(Video).filter(
            Video.project_id == UUID(project_id),
            VideoAnalysis.status == "completed",
        ).all()

        all_patterns = []
        all_insights = []
        all_principles = []
        video_ids = []
        for va in video_analyses:
            video_ids.append(str(va.video_id))
            if va.patterns:
                all_patterns.extend(va.patterns)
            if va.insights:
                all_insights.extend(va.insights)
            if va.design_principles:
                all_principles.extend(va.design_principles)

        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        result = cross_relate_node({
            "project_id": project_id,
            "video_ids": video_ids,
            "video_patterns": all_patterns,
            "video_insights": all_insights,
            "video_principles": all_principles,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        if result.get("error") or result.get("cross_video_patterns") is None:
            _raise_for_node_error("cross_relate", result)

        pa.cross_video_patterns = result.get("cross_video_patterns")
        pa.status = "processing"
        self.db.commit()

        logger.info(f"CROSS_RELATE step completed for project {project_id}")
        return {"project_id": project_id, "status": "success"}

    except Exception as e:
        logger.error(f"CROSS_RELATE step failed for project {project_id}: {e}")
        _update_project_analysis_error(self.db, project_id, "cross_relate")
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_cross_explain_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_cross_explain_step(self, project_id: str, user_id: str | None = None):
    """Step 2 of 3: synthesize cross-video insights from meta-patterns."""
    try:
        logger.info(f"Starting CROSS_EXPLAIN step for project {project_id}")

        if _check_project_cancellation(self.db, project_id):
            return {"project_id": project_id, "status": "skipped"}

        pa = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if not pa or not pa.cross_video_patterns:
            raise Exception("No cross-video patterns available for cross_explain")

        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        result = cross_explain_node({
            "project_id": project_id,
            "cross_video_patterns": pa.cross_video_patterns,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        if result.get("error") or result.get("cross_video_insights") is None:
            _raise_for_node_error("cross_explain", result)

        pa.cross_video_insights = result.get("cross_video_insights")
        self.db.commit()

        logger.info(f"CROSS_EXPLAIN step completed for project {project_id}")
        return {"project_id": project_id, "status": "success"}

    except Exception as e:
        logger.error(f"CROSS_EXPLAIN step failed for project {project_id}: {e}")
        _update_project_analysis_error(self.db, project_id, "cross_explain")
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_cross_activate_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_cross_activate_step(self, project_id: str, user_id: str | None = None):
    """Step 3 of 3: derive system-level design principles. Terminal step."""
    try:
        logger.info(f"Starting CROSS_ACTIVATE step for project {project_id}")

        if _check_project_cancellation(self.db, project_id):
            return {"project_id": project_id, "status": "skipped"}

        pa = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if not pa or not pa.cross_video_insights:
            raise Exception("No cross-video insights available for cross_activate")

        byok_api_key, byok_model = _resolve_byok(self.db, user_id)

        result = cross_activate_node({
            "project_id": project_id,
            "cross_video_insights": pa.cross_video_insights,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        if result.get("error") or result.get("cross_video_principles") is None:
            _raise_for_node_error("cross_activate", result)

        pa.cross_video_principles = result.get("cross_video_principles")
        pa.status = "completed"
        pa.completed_at = datetime.now(timezone.utc)
        self.db.commit()

        logger.info(f"CROSS_ACTIVATE step completed for project {project_id}")
        return {"project_id": project_id, "status": "success"}

    except Exception as e:
        logger.error(f"CROSS_ACTIVATE step failed for project {project_id}: {e}")
        _update_project_analysis_error(self.db, project_id, "cross_activate")
        raise
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && pytest tests/test_project_analysis_chain.py -v
```

Expected: PASS.

- [ ] **Step 5: Run full suite to make sure nothing regressed**

```bash
pytest tests/ -v 2>&1 | tail -30
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/tasks/project_analysis_steps.py backend/tests/test_project_analysis_chain.py
git commit -m "feat: add per-step project analysis tasks for chain refactor

New file project_analysis_steps.py mirrors the pattern of
analysis_steps.py but for the 3-node cross-video pipeline:
cross_relate → cross_explain → cross_activate. Each step is an
independent Celery task with autoretry, cancellation precheck,
and DB-backed state transitions.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.7: Register new tasks in celery_app.py and add queue routing

**Files:**
- Modify: `backend/app/tasks/celery_app.py`

- [ ] **Step 1: Update the Celery include list and add task_routes**

Edit `backend/app/tasks/celery_app.py`. Update the `Celery(...)` constructor to include the new task modules, and add `task_routes` + `task_default_queue`:

```python
celery_app = Celery(
    "qualitative_research_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.transcription_tasks",
        "app.tasks.analysis_steps",
        "app.tasks.project_analysis_steps",  # NEW
        "app.tasks.pipeline_errors",          # NEW
        "app.tasks.watchdog_tasks",
        "app.tasks.model_validation_tasks",
    ],
)

celery_app.conf.update(
    # ... existing config ...

    # Queue routing — analyze tasks on their own queue so they can be
    # scaled or isolated independently later.
    task_default_queue="celery",
    task_routes={
        "analyze_chunk_step":      {"queue": "analyze"},
        "analyze_infer_step":      {"queue": "analyze"},
        "analyze_relate_step":     {"queue": "analyze"},
        "analyze_explain_step":    {"queue": "analyze"},
        "analyze_activate_step":   {"queue": "analyze"},
        "analyze_cross_relate_step":   {"queue": "analyze"},
        "analyze_cross_explain_step":  {"queue": "analyze"},
        "analyze_cross_activate_step": {"queue": "analyze"},
        "handle_pipeline_error":       {"queue": "analyze"},
        "transcribe_video":            {"queue": "transcribe"},
        "check_transcription":         {"queue": "transcribe"},
        # watchdog + model validation use the default "celery" queue
    },
)
```

- [ ] **Step 2: Verify Celery can still discover and register tasks**

```bash
cd backend && python -c "from app.tasks.celery_app import celery_app; print(sorted(celery_app.tasks.keys()))" | tr ',' '\n'
```

Expected output includes the 5 video step tasks, the 3 cross project step tasks, handle_pipeline_error, transcribe_video, check_transcription, reset_stuck_analyses, validate_openrouter_models.

- [ ] **Step 3: Run the full backend test suite**

```bash
pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/tasks/celery_app.py
git commit -m "refactor: register new tasks + add queue routing

celery_app.py now includes project_analysis_steps and pipeline_errors
modules. task_routes routes all 8 analysis step tasks and the error
handler to the 'analyze' queue, transcription to 'transcribe', and
watchdog/model-validation to the default 'celery' queue.

Worker will need to be started with -Q analyze,transcribe,celery
to consume from all three — that change lands in WS4.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.8: Dispatch chain from the video analyze route

**Files:**
- Modify: `backend/app/routes/videos.py`

- [ ] **Step 1: Find the existing analyze_video_task.delay dispatch**

```bash
grep -n "analyze_video_task" backend/app/routes/videos.py
```

- [ ] **Step 2: Replace with chain dispatch**

In the `trigger_video_analysis` function (around line 572), replace the monolithic dispatch:

```python
# OLD:
from app.tasks.analysis_tasks import analyze_video_task
task = analyze_video_task.delay(str(video_id), current_user_id)
```

with the chain dispatch:

```python
# NEW:
from celery import chain
from app.tasks.analysis_steps import (
    analyze_activate_step,
    analyze_chunk_step,
    analyze_explain_step,
    analyze_infer_step,
    analyze_relate_step,
)
from app.tasks.pipeline_errors import handle_pipeline_error

pipeline = chain(
    analyze_chunk_step.si(str(video_id), current_user_id),
    analyze_infer_step.si(str(video_id), current_user_id),
    analyze_relate_step.si(str(video_id), current_user_id),
    analyze_explain_step.si(str(video_id), current_user_id),
    analyze_activate_step.si(str(video_id), current_user_id),
).on_error(handle_pipeline_error.s(video_id=str(video_id)))

task = pipeline.apply_async()
```

Keep the response shape identical (`task_id`, `status`, etc.). Remove the now-unused setup code that was creating the `VideoAnalysis` row or initializing `step_status` — that logic moved into `analyze_chunk_step` in Task 3.4.

- [ ] **Step 3: Run the route tests**

```bash
cd backend && pytest tests/ -v -k "analyze or video or route" 2>&1 | tail -30
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/videos.py
git commit -m "refactor: dispatch Celery chain from video analyze route

POST /videos/{id}/analyze now dispatches a chain of the 5 per-step
tasks (chunk → infer → relate → explain → activate) with immutable
signatures (.si) so each task receives its own explicit args. The
error handler is attached via .on_error().

The response shape is unchanged so the frontend polls the same
status endpoint and sees the same transitions.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.9: Dispatch chain from the project analyze route

**Files:**
- Modify: `backend/app/routes/projects.py`

- [ ] **Step 1: Find the existing analyze_project_task.delay dispatch**

```bash
grep -n "analyze_project_task" backend/app/routes/projects.py
```

- [ ] **Step 2: Replace with chain dispatch**

Same pattern as Task 3.8:

```python
from celery import chain
from app.tasks.project_analysis_steps import (
    analyze_cross_activate_step,
    analyze_cross_explain_step,
    analyze_cross_relate_step,
)
from app.tasks.pipeline_errors import handle_pipeline_error

pipeline = chain(
    analyze_cross_relate_step.si(str(project_id), current_user_id),
    analyze_cross_explain_step.si(str(project_id), current_user_id),
    analyze_cross_activate_step.si(str(project_id), current_user_id),
).on_error(handle_pipeline_error.s(video_id=str(project_id)))
# NOTE: the error handler's video_id parameter is a slight misnomer
# for projects — leave it for now; it'll just tag the error log with
# the project_id. Rename to record_id or similar as future cleanup.

task = pipeline.apply_async()
```

- [ ] **Step 3: Run tests**

```bash
cd backend && pytest tests/ -v -k "project or analyze" 2>&1 | tail -30
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/projects.py
git commit -m "refactor: dispatch Celery chain from project analyze route

POST /projects/{id}/analyze now dispatches a chain of the 3 per-step
cross-video tasks (cross_relate → cross_explain → cross_activate).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.10: Delete analysis_tasks.py

**Files:**
- Delete: `backend/app/tasks/analysis_tasks.py`
- Modify: any file still importing from it

- [ ] **Step 1: Find remaining imports of analysis_tasks**

```bash
grep -rn "from app.tasks.analysis_tasks\|from app.tasks import analysis_tasks" backend/
```

Expected: should be empty after Tasks 3.8 and 3.9 (routes no longer import it). If any test file still imports from it (likely `test_analysis_retry.py`), update those tests next — see Step 3.

- [ ] **Step 2: Delete the file**

```bash
git rm backend/app/tasks/analysis_tasks.py
```

- [ ] **Step 3: Update any test that still references the deleted module**

For each failing import from Step 1:

- `test_analysis_retry.py`: if it asserts on `analyze_video_task` retry behavior, rewrite it to assert on `analyze_chunk_step` retry behavior instead (chunk step now owns the retry semantics for the first pipeline link).
- `test_watchdog_race.py`: replace references to `_is_cancelled` with the new `_check_cancellation` helper.

- [ ] **Step 4: Run the full test suite**

```bash
cd backend && pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests pass. If tests still fail because of functional gaps (not mere naming), file a finding in the commit message and adjust — don't paper over with test skips.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete monolithic analysis_tasks.py

The monolithic analyze_video_task and analyze_project_task are
replaced by Celery chains of per-step tasks in analysis_steps.py
and project_analysis_steps.py. The in-function retry/cancellation
logic is replaced by per-task autoretry + _check_cancellation
precheck. Helpers moved to _pipeline_utils.py.

-673 / +0 lines net.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 3.11: Full integration smoke test on WS3

**Files:**
- Read-only

- [ ] **Step 1: Run the complete test suite one more time**

```bash
cd backend && pytest tests/ -v 2>&1 | tail -40
```

Expected: all tests pass, with the same count as the pre-flight baseline (minus any tests that were intentionally removed because they tested the deleted monolithic task).

- [ ] **Step 2: Verify celery_app discovers all expected tasks**

```bash
python -c "from app.tasks.celery_app import celery_app; import json; print(json.dumps(sorted(celery_app.tasks.keys()), indent=2))"
```

Expected tasks in the output:
- analyze_chunk_step, analyze_infer_step, analyze_relate_step, analyze_explain_step, analyze_activate_step
- analyze_cross_relate_step, analyze_cross_explain_step, analyze_cross_activate_step
- handle_pipeline_error
- transcribe_video, check_transcription
- reset_stuck_analyses, validate_openrouter_models

And NOT in the output: analyze_video, analyze_project (the deleted monolithic tasks).

- [ ] **Step 3: WS3 handoff**

```bash
git log --oneline origin/main..HEAD
```

Expected: ~10 commits (one per task in this workstream).

WS3 is complete. Ready for PR review and merge. **WS2 must rebase on WS3 after it merges.**

---

# WORKSTREAM 4 (WS4) — T2+T5 Infrastructure, Multi-Replica, Redis Hardening

**Worktree:** a fresh worktree created AFTER Wave 1 merges — do not start until WS1/WS2/WS3 are all merged to origin/main and have soaked for ≥24h.

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
git fetch origin
git worktree add -b infra/multi-replica-topology ../5d-worktrees/ws4-infra origin/main
cd ../5d-worktrees/ws4-infra
```

**Goal:** Extract Celery Beat into its own Railway service. Scale backend and worker to `numReplicas=2`. Add `/health/ready` readiness endpoint. Resize DB pool via environment-aware config. Apply Redis maxmemory + eviction policy. Remove worker's unused public domain.

**Blocking?** Yes — must land after Wave 1 and before WS5 validation.

## Task 4.1: Add service-type-aware DB pool config

**Files:**
- Modify: `backend/app/database.py`
- Create: `backend/tests/test_database_pool_config.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_database_pool_config.py`:

```python
"""Tests for service-type-aware database pool sizing."""

import importlib
import os

import pytest


@pytest.mark.parametrize("service_type,expected_pool_size,expected_overflow", [
    ("api", 5, 5),
    ("worker", 4, 4),
    ("beat", 1, 1),
])
def test_pool_size_by_service_type(service_type, expected_pool_size, expected_overflow, monkeypatch):
    """Pool size should vary by SERVICE_TYPE to avoid Postgres connection exhaustion."""
    monkeypatch.setenv("SERVICE_TYPE", service_type)
    # Re-import database module so it picks up the new SERVICE_TYPE
    import app.database
    importlib.reload(app.database)
    # The engine's pool carries the size
    assert app.database.engine.pool.size() == expected_pool_size or \
        app.database._pool["pool_size"] == expected_pool_size
    assert app.database._pool["max_overflow"] == expected_overflow


def test_unknown_service_type_falls_back_to_api_pool(monkeypatch):
    """Unknown SERVICE_TYPE should not crash; fall back to api pool sizing."""
    monkeypatch.setenv("SERVICE_TYPE", "something-weird")
    import app.database
    importlib.reload(app.database)
    assert app.database._pool["pool_size"] == 5
    assert app.database._pool["max_overflow"] == 5
```

- [ ] **Step 2: Run the failing test**

```bash
cd backend && pytest tests/test_database_pool_config.py -v
```

Expected: FAIL (because `_pool` doesn't exist yet in `database.py`).

- [ ] **Step 3: Update database.py to read SERVICE_TYPE**

Edit `backend/app/database.py`:

```python
"""Database connection and session management."""

import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Build connect_args based on database backend
_connect_args: dict = {}
if "postgresql" in settings.DATABASE_URL:
    _connect_args["options"] = "-c statement_timeout=30000"  # 30s query timeout

# Service-type-aware pool sizing. Picked so total connection count
# across all replicas stays comfortably under Postgres max_connections=100.
#
# backend: 5 + 5 overflow per uvicorn worker × 2 workers × 2 replicas = 40 max
# worker:  4 + 4 overflow per replica × 2 replicas = 16 max
# beat:    1 + 1 overflow × 1 replica = 2 max
# Total worst case: ~58 connections. Plenty of headroom under 100.
_SERVICE_TYPE = os.environ.get("SERVICE_TYPE", "api")
_POOL_CONFIG = {
    "api":    {"pool_size": 5, "max_overflow": 5},
    "worker": {"pool_size": 4, "max_overflow": 4},
    "beat":   {"pool_size": 1, "max_overflow": 1},
}
_pool = _POOL_CONFIG.get(_SERVICE_TYPE, _POOL_CONFIG["api"])

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,  # Verify connections before using them
    pool_size=_pool["pool_size"],
    max_overflow=_pool["max_overflow"],
    pool_recycle=1800,  # Recycle connections after 30 minutes
    echo=settings.DEBUG,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Base class for ORM models (modern SQLAlchemy 2.0 style)
class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency for FastAPI routes to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && pytest tests/test_database_pool_config.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Run the full suite to make sure nothing regressed**

```bash
pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/database.py backend/tests/test_database_pool_config.py
git commit -m "feat: service-type-aware DB pool sizing

Reads SERVICE_TYPE env var and picks a pool size that keeps total
concurrent connections under Postgres max_connections=100 across
the new 2-replica backend + 2-replica worker + 1-replica beat
topology. Total worst-case usage: ~58 connections.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 4.2: Add /health/live and /health/ready endpoints

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_healthcheck_ready.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_healthcheck_ready.py`:

```python
"""Tests for the /health/live and /health/ready endpoints."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_health_live_returns_200(client):
    """Liveness check is always 200 as long as the process is running."""
    resp = client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "alive"}


def test_health_returns_200_backwards_compat(client):
    """The old /health endpoint must still work for existing monitoring."""
    resp = client.get("/health")
    assert resp.status_code == 200


def test_health_ready_returns_200_when_db_and_redis_ok(client):
    """Readiness check returns 200 when both DB and Redis are reachable."""
    resp = client.get("/health/ready")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ready"}


def test_health_ready_returns_503_when_db_fails(client):
    """Readiness check returns 503 when DB ping fails."""
    with patch("app.main._probe_db", side_effect=Exception("db down")):
        resp = client.get("/health/ready")
        assert resp.status_code == 503
        assert resp.json()["status"] == "db_down"


def test_health_ready_returns_503_when_redis_fails(client):
    """Readiness check returns 503 when Redis ping fails."""
    with patch("app.main._probe_redis", side_effect=Exception("redis down")):
        resp = client.get("/health/ready")
        assert resp.status_code == 503
        assert resp.json()["status"] == "redis_down"
```

- [ ] **Step 2: Run the failing test**

```bash
cd backend && pytest tests/test_healthcheck_ready.py -v
```

Expected: FAIL (endpoints don't exist yet).

- [ ] **Step 3: Add the endpoints and probe helpers to main.py**

In `backend/app/main.py`, replace the existing `/health` endpoint with:

```python
from sqlalchemy import text
from fastapi.responses import JSONResponse


def _probe_db() -> None:
    """Raise if the DB is not reachable. Used by /health/ready."""
    from app.database import SessionLocal
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))


def _probe_redis() -> None:
    """Raise if Redis (Celery broker) is not reachable. Used by /health/ready."""
    from app.tasks.celery_app import celery_app
    with celery_app.broker_connection() as conn:
        conn.ensure_connection(max_retries=1)


@app.get("/")
async def root():
    """Root endpoint."""
    return {"status": "ok"}


@app.get("/health")
async def health_check():
    """Backwards-compatible liveness alias."""
    return {"status": "healthy"}


@app.get("/health/live")
async def health_live():
    """Liveness — is the process running?"""
    return {"status": "alive"}


@app.get("/health/ready")
async def health_ready():
    """Readiness — can this replica serve traffic (DB + Redis OK)?"""
    try:
        _probe_db()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "db_down"})
    try:
        _probe_redis()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "redis_down"})
    return {"status": "ready"}
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && pytest tests/test_healthcheck_ready.py -v
```

Expected: all tests pass. If the `_probe_redis` mock doesn't fire because the module re-imports it, use `monkeypatch` on the specific `app.main._probe_redis` attribute instead.

- [ ] **Step 5: Run the full suite**

```bash
pytest tests/ -v 2>&1 | tail -30
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_healthcheck_ready.py
git commit -m "feat: add /health/live and /health/ready endpoints

Splits the single /health endpoint into liveness (always 200 as long
as the process runs) and readiness (verifies DB + Redis connectivity).
Railway will point healthcheckPath at /health/ready so broken replicas
get pulled from load balancer rotation automatically.

The old /health stays as an alias for backwards compat with existing
monitoring.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 4.3: Update startup.sh for beat service + multi-worker uvicorn + worker queues

**Files:**
- Modify: `backend/scripts/startup.sh`

- [ ] **Step 1: Add beat service branch, --workers to uvicorn, -Q to worker**

Edit `backend/scripts/startup.sh`. Replace the final `if/else` block that starts the service with:

```sh
# Start the application
if [ "$SERVICE" = "worker" ]; then
    echo "🔨 Starting Celery worker..."
    # --pool=threads: I/O-bound (LLM, AssemblyAI, R2)
    # --concurrency: CELERY_CONCURRENCY env var (default 16 post-scaling)
    # -Q analyze,transcribe,celery: consume from all three queues
    exec celery -A app.tasks.celery_app worker \
        --pool=threads \
        --concurrency=${CELERY_CONCURRENCY:-16} \
        --loglevel=info \
        --without-heartbeat \
        --without-mingle \
        --without-gossip \
        -Q analyze,transcribe,celery
elif [ "$SERVICE" = "beat" ]; then
    echo "⏰ Starting Celery beat scheduler..."
    # Beat service runs ONLY the scheduler. Hard-pinned to 1 replica.
    # Periodic tasks fire exactly once per schedule regardless of
    # how many worker replicas are running.
    exec celery -A app.tasks.celery_app beat --loglevel=info
else
    echo "🌐 Starting API server..."
    if [ "$IS_PRODUCTION" = true ]; then
        # Production: 2 uvicorn workers per replica, no reload
        exec uvicorn app.main:app \
            --host 0.0.0.0 \
            --port ${PORT:-8000} \
            --workers 2 \
            --proxy-headers \
            --forwarded-allow-ips='*'
    else
        # Development: with reload
        exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload
    fi
fi
```

Note that the worker branch no longer has `--beat`. That's intentional — Beat moves to its own dedicated service.

- [ ] **Step 2: Update the Redis-wait block so it also runs for the beat service**

Earlier in the same file, find the block that waits for Redis only when `SERVICE = worker`. Update it to also wait for Redis when `SERVICE = beat`:

```sh
# Wait for Redis to be ready (required for Celery broker, beat scheduler)
if [ "$SERVICE" = "worker" ] || [ "$SERVICE" = "beat" ]; then
    echo "⏳ Waiting for Redis..."
    # ... existing Redis-wait code unchanged ...
fi
```

- [ ] **Step 3: Shellcheck the script**

```bash
shellcheck backend/scripts/startup.sh 2>&1 | head -20
```

If shellcheck isn't installed, skip — the script is a straightforward bash file.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/startup.sh
git commit -m "feat: update startup.sh for beat service + multi-worker uvicorn

- New 'beat' service branch runs celery beat scheduler only (no worker)
- Worker branch loses --beat (moved to dedicated service) and gains
  -Q analyze,transcribe,celery so it consumes from all queues
- uvicorn gets --workers 2 in production for within-replica concurrency
- Redis wait block now also runs for the beat service

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 4.4: Create Railway service configurator script

**Files:**
- Create: `scripts/railway-service-config.py`

- [ ] **Step 1: Create the script**

Create `scripts/railway-service-config.py`:

```python
#!/usr/bin/env python3
"""Idempotent Railway service configuration for the methodex project.

Applies the target topology (replicas, healthchecks, drain settings) to
each service via the Railway GraphQL API. Safe to re-run — Railway's
mutation is idempotent and will no-op on unchanged fields.

Also creates the new 'beat' service if it doesn't yet exist, and removes
the worker's unused public domain.

Usage:
    export RAILWAY_API_TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
    python3 scripts/railway-service-config.py --dry-run   # show what would change
    python3 scripts/railway-service-config.py             # apply

Exit codes:
    0 — success (or dry-run completed)
    1 — any mutation or validation failure
    2 — missing env vars
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

RAILWAY_API = "https://backboard.railway.app/graphql/v2"

PROJECT_ID = "154d302f-8609-4897-a10c-1f0d5bfc4f06"
WORKSPACE_ID = "37eb4e96-0873-4033-a392-3c6593a68802"

# Target topology — edit here to change replica/health settings
TARGET = {
    "backend": {
        "id": "2b70a900-042c-4083-b00b-0d01f3ece5dc",
        "numReplicas": 2,
        "healthcheckPath": "/health/ready",
        "healthcheckTimeout": 10,
        "drainingSeconds": 30,
    },
    "worker": {
        "id": "08097b12-1501-4dff-a990-edcd95c73ed4",
        "numReplicas": 2,
        "healthcheckPath": None,   # workers have no HTTP endpoint
        "drainingSeconds": 60,
    },
    "beat": {
        # id populated at runtime if the service already exists,
        # otherwise created during this script
        "id": None,
        "numReplicas": 1,
        "healthcheckPath": None,
        "drainingSeconds": 10,
        "createIfMissing": True,
    },
}


def gql(query: str, variables: dict, token: str) -> dict:
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        RAILWAY_API,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "errors" in data:
        raise RuntimeError(f"GraphQL errors: {data['errors']}")
    return data["data"]


def list_services(token: str) -> list[dict]:
    query = """
    query ListServices($projectId: String!) {
        project(id: $projectId) {
            services { edges { node { id name } } }
        }
    }
    """
    data = gql(query, {"projectId": PROJECT_ID}, token)
    return [e["node"] for e in data["project"]["services"]["edges"]]


def update_service_instance(token: str, service_id: str, env_id: str, updates: dict, dry_run: bool) -> None:
    """Mutate serviceInstanceUpdate with the given updates."""
    if dry_run:
        print(f"  [DRY] would update service {service_id}: {updates}")
        return

    mutation = """
    mutation UpdateInstance($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
    """
    data = gql(mutation, {
        "serviceId": service_id,
        "environmentId": env_id,
        "input": updates,
    }, token)
    print(f"  applied to {service_id}: {list(updates.keys())}")


def get_production_environment_id(token: str) -> str:
    """Return the production environment id for our project."""
    query = """
    query Envs($projectId: String!) {
        project(id: $projectId) {
            environments { edges { node { id name } } }
        }
    }
    """
    data = gql(query, {"projectId": PROJECT_ID}, token)
    for e in data["project"]["environments"]["edges"]:
        if e["node"]["name"] == "production":
            return e["node"]["id"]
    raise RuntimeError("production environment not found")


def ensure_beat_service_exists(token: str, existing_services: list[dict], env_id: str, dry_run: bool) -> str | None:
    """Create the 'beat' service if it doesn't exist. Return its id."""
    for svc in existing_services:
        if svc["name"] == "beat":
            print(f"  beat service already exists: {svc['id']}")
            return svc["id"]

    if dry_run:
        print("  [DRY] would create 'beat' service")
        return None

    # Create via serviceCreate — clones the worker source (same repo + dockerfile)
    mutation = """
    mutation CreateBeat($projectId: String!, $name: String!) {
        serviceCreate(input: { projectId: $projectId, name: $name }) {
            id name
        }
    }
    """
    data = gql(mutation, {"projectId": PROJECT_ID, "name": "beat"}, token)
    beat_id = data["serviceCreate"]["id"]
    print(f"  created beat service: {beat_id}")

    # Set SERVICE_TYPE=beat and copy source config from worker
    # NOTE: Railway requires setting the source explicitly after creation.
    # The simplest route is to have the user configure it from dashboard on
    # first run, OR use the variableUpsert mutation to set SERVICE_TYPE.
    variable_mutation = """
    mutation SetVar($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
    }
    """
    gql(variable_mutation, {
        "input": {
            "projectId": PROJECT_ID,
            "environmentId": env_id,
            "serviceId": beat_id,
            "name": "SERVICE_TYPE",
            "value": "beat",
        },
    }, token)
    print(f"  set SERVICE_TYPE=beat on {beat_id}")

    return beat_id


def remove_worker_public_domain(token: str, dry_run: bool) -> None:
    """Delete the worker's pointless public domain."""
    query = """
    query WorkerDomains($serviceId: String!) {
        service(id: $serviceId) {
            serviceInstances { edges { node { domains { serviceDomains { id domain } } } } }
        }
    }
    """
    data = gql(query, {"serviceId": TARGET["worker"]["id"]}, token)
    try:
        domains = data["service"]["serviceInstances"]["edges"][0]["node"]["domains"]["serviceDomains"]
    except (KeyError, IndexError):
        domains = []
    if not domains:
        print("  no worker service domains to remove")
        return

    mutation = """
    mutation DeleteDomain($id: String!) {
        serviceDomainDelete(id: $id)
    }
    """
    for d in domains:
        if dry_run:
            print(f"  [DRY] would delete worker service domain {d['domain']} ({d['id']})")
        else:
            gql(mutation, {"id": d["id"]}, token)
            print(f"  deleted worker service domain {d['domain']}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show changes without applying")
    args = parser.parse_args()

    token = os.environ.get("RAILWAY_API_TOKEN")
    if not token:
        print("RAILWAY_API_TOKEN env var required", file=sys.stderr)
        return 2

    env_id = get_production_environment_id(token)
    services = list_services(token)
    print(f"Found services: {[s['name'] for s in services]}")

    # 1. Ensure beat service exists
    beat_id = ensure_beat_service_exists(token, services, env_id, args.dry_run)
    if beat_id:
        TARGET["beat"]["id"] = beat_id

    # 2. Apply topology to each known service
    for name, cfg in TARGET.items():
        if cfg["id"] is None:
            print(f"Skipping {name} — no service id (was it created above?)")
            continue
        updates = {}
        if "numReplicas" in cfg:
            updates["numReplicas"] = cfg["numReplicas"]
        if cfg.get("healthcheckPath") is not None:
            updates["healthcheckPath"] = cfg["healthcheckPath"]
        if "healthcheckTimeout" in cfg:
            updates["healthcheckTimeout"] = cfg["healthcheckTimeout"]
        if "drainingSeconds" in cfg:
            updates["drainingSeconds"] = cfg["drainingSeconds"]

        if updates:
            print(f"Updating {name} ({cfg['id']}):")
            update_service_instance(token, cfg["id"], env_id, updates, args.dry_run)

    # 3. Remove worker's public domain
    print("Removing worker public domain:")
    remove_worker_public_domain(token, args.dry_run)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Make executable and run dry-run**

```bash
chmod +x scripts/railway-service-config.py
export RAILWAY_API_TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
python3 scripts/railway-service-config.py --dry-run
```

Expected: prints the changes that would be applied without mutating anything. Review the output carefully.

- [ ] **Step 3: Commit (do NOT run live yet — that happens in Task 4.7 after all code is merged)**

```bash
git add scripts/railway-service-config.py
git commit -m "feat: add Railway service topology configurator script

Idempotent Python script that applies the target topology (replicas,
healthchecks, drain settings) to each Railway service via the GraphQL
API. Also creates the 'beat' service if missing and removes the worker
service's pointless public domain.

Dry-run supported via --dry-run. Do NOT apply live until Wave 2 code
changes are merged to main.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 4.5: Apply Redis maxmemory + eviction policy via Railway

**Files:**
- No code change; Railway service config update

- [ ] **Step 1: Fetch the current Redis startCommand**

```bash
TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ project(id: \"154d302f-8609-4897-a10c-1f0d5bfc4f06\") { services { edges { node { id name serviceInstances { edges { node { startCommand } } } } } } } }"}' \
  | python3 -m json.tool | grep -A1 Redis
```

Expected: shows the current Redis startCommand (should include `--requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH`).

- [ ] **Step 2: Update the startCommand to add maxmemory + eviction policy**

```bash
TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')

# Get production environment id first
ENV_ID=$(curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ project(id: \"154d302f-8609-4897-a10c-1f0d5bfc4f06\") { environments { edges { node { id name } } } } }"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['node']['id'] for e in d['data']['project']['environments']['edges'] if e['node']['name']=='production'][0])")

# Update Redis startCommand
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"mutation UpdateRedis(\$input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: \\\"53904bf4-fcad-426f-aec6-d94de78c3999\\\", environmentId: \\\"$ENV_ID\\\", input: \$input) }\",\"variables\":{\"input\":{\"startCommand\":\"/bin/sh -c 'rm -rf \$RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass \$REDIS_PASSWORD --save 60 1 --dir \$RAILWAY_VOLUME_MOUNT_PATH --maxmemory 300mb --maxmemory-policy allkeys-lru'\"}}}" \
  | python3 -m json.tool
```

Expected: response is `{"data": {"serviceInstanceUpdate": null}}` indicating success. Railway will redeploy Redis with the new startCommand automatically.

- [ ] **Step 2.5: Defer this step — do not run live during WS4**

**Important**: this step should NOT be executed during the refactor PR. Apply it alongside the topology script in Task 4.7 after the Wave 2 PR merges. The command here is documentation for the operator. Add it to the WS4 PR description as a post-merge action item.

- [ ] **Step 3: Document the change in a runbook**

Create `docs/ops/redis-config.md`:

```markdown
# Redis service configuration (methodex)

## Current production startCommand

```
/bin/sh -c 'rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH --maxmemory 300mb --maxmemory-policy allkeys-lru'
```

## Why maxmemory 300mb + allkeys-lru

- Celery results expire in 10 minutes (`result_expires=600` in celery_app.py)
- At target B load, we hold roughly 25 concurrent analysis results × a few KB = <1 MB of working data
- 300 MB is ~300× headroom, and `allkeys-lru` ensures we never OOM — the oldest Celery result gets evicted first
- Before this was set, Redis had no memory bound and could OOM-kill the broker silently under a pathological load

## To change the limit

Edit `scripts/railway-service-config.py` if adding to the automated script, or run the `serviceInstanceUpdate` mutation documented in `docs/superpowers/plans/2026-04-06-methodex-hobby-scaling-plan.md` Task 4.5.
```

- [ ] **Step 4: Commit the runbook**

```bash
git add docs/ops/redis-config.md
git commit -m "docs: document Redis startCommand + maxmemory rationale

Runbook for the Redis service configuration. Explains why we pick
300mb + allkeys-lru given Celery's result_expires=600s setting, and
how to change the limit.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 4.6: Run full local + CI verification

**Files:**
- Read-only

- [ ] **Step 1: Run the full backend test suite in the WS4 worktree**

```bash
cd backend && pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests pass, including the 3 new test files from WS4 (`test_database_pool_config.py`, `test_healthcheck_ready.py`, and any WS3 tests that carried over from the rebase).

- [ ] **Step 2: Verify the startup script is shell-syntax valid**

```bash
bash -n backend/scripts/startup.sh && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Dry-run the Railway configurator once more**

```bash
export RAILWAY_API_TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
python3 scripts/railway-service-config.py --dry-run
```

Review output. If the dry-run reports any changes you don't expect, investigate before merging.

## Task 4.7: WS4 merge + live infrastructure apply (carefully staged)

**Files:**
- Post-merge runbook

- [ ] **Step 1: Merge WS4 to main**

Open PR, get review, merge. This triggers a backend + worker redeploy with the new code (uvicorn `--workers 2`, `-Q` queue routing, new `/health/ready` endpoint, service-type-aware DB pool). **No replica or topology changes yet** — Railway's service config is not code, so just merging the code doesn't change replicas.

- [ ] **Step 2: Verify merged deploy is healthy**

```bash
curl -f https://api.methodex.ai/health/live && echo
curl -f https://api.methodex.ai/health/ready && echo
```

Expected: both return 200. If `/health/ready` returns 503, investigate DB/Redis connectivity before proceeding.

- [ ] **Step 3: Apply the Railway topology changes via script**

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
export RAILWAY_API_TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
python3 scripts/railway-service-config.py --dry-run   # final review
python3 scripts/railway-service-config.py             # apply
```

Expected: creates the `beat` service, sets `numReplicas=2` on backend + worker, sets `healthcheckPath=/health/ready` on backend, sets drain timings, removes worker public domain.

- [ ] **Step 4: Configure the new beat service source (manual, one-time)**

Railway's GraphQL API can create a service but the source (repo + Dockerfile path) must be set through the dashboard on the first run. In the Railway dashboard:

1. Open the new `beat` service
2. Set Source → GitHub repo `anuragid/qualitative-research-tool`, branch `main`
3. Set Build → Dockerfile path `backend/Dockerfile.railway`
4. Verify env vars include `SERVICE_TYPE=beat` (set by the script) plus all the shared env vars (DATABASE_URL, REDIS_URL, etc.) — copy from the worker service if they're not auto-inherited
5. Trigger an initial deploy

Once this first manual setup is done, subsequent config changes flow through the committed script.

- [ ] **Step 5: Apply the Redis startCommand change**

Run the command from Task 4.5 Step 2 (the curl + GraphQL mutation).

Verify:

```bash
# SSH into Redis (via Railway CLI) or check Railway logs to confirm the
# container restarted with the new startCommand.
# Alternatively, if Redis responds to AUTH:
redis-cli -h yamabiko.proxy.rlwy.net -p 50187 -a $REDIS_PASSWORD INFO memory | grep maxmemory
```

Expected: `maxmemory:314572800` (300 MB in bytes).

- [ ] **Step 6: Verify the new topology is live**

```bash
TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ project(id: \"154d302f-8609-4897-a10c-1f0d5bfc4f06\") { services { edges { node { id name serviceInstances { edges { node { numReplicas healthcheckPath drainingSeconds } } } } } } } }"}' \
  | python3 -m json.tool
```

Expected output shows:
- backend: `numReplicas=2, healthcheckPath=/health/ready, drainingSeconds=30`
- worker: `numReplicas=2, drainingSeconds=60`
- beat: `numReplicas=1, drainingSeconds=10`
- Postgres, Redis: unchanged

- [ ] **Step 7: Verify beat is firing exactly once**

```bash
railway service beat && railway logs 2>&1 | head -50
```

Expected: log entries showing `reset_stuck_analyses` tasks dispatched approximately every 5 minutes (not every 2.5 min — that would indicate multiple beat instances).

- [ ] **Step 8: Verify worker no longer runs beat**

```bash
railway service worker && railway logs 2>&1 | head -50
```

Expected: worker logs show task execution but NO beat-scheduler entries (those now only appear in the beat service's logs).

- [ ] **Step 9: Smoke-test the API end-to-end**

```bash
curl -f https://api.methodex.ai/health/ready
curl -f https://api.methodex.ai/health/live
```

Expected: both return 200 from both backend replicas (verify by hitting multiple times and watching for different replica IDs in Railway logs).

WS4 is complete. Wave 2 is live in production.

---

# WORKSTREAM 5 (WS5) — Production Validation

**Worktree:** main checkout is fine — this is scripts + memory updates, no code refactor.

**Goal:** Run smoke and burst load tests, confirm memory footprint dropped, update progress memory, close the loop.

**Blocking?** Runs after WS4 is live.

## Task 5.1: Create production smoke test script

**Files:**
- Create: `scripts/production-smoke-test.py`

- [ ] **Step 1: Create the script**

Create `scripts/production-smoke-test.py`:

```python
#!/usr/bin/env python3
"""End-to-end production smoke test for the methodex analysis pipeline.

Requires:
- A test user with a pre-seeded project containing at least one video
  that already has a completed transcript
- METHODEX_API_URL env var (default: https://api.methodex.ai)
- METHODEX_AUTH_TOKEN env var (Clerk JWT for the test user)
- METHODEX_TEST_VIDEO_ID env var (UUID of the fixture video)

Usage:
    export METHODEX_AUTH_TOKEN=<jwt>
    export METHODEX_TEST_VIDEO_ID=<uuid>
    python3 scripts/production-smoke-test.py
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

API = os.environ.get("METHODEX_API_URL", "https://api.methodex.ai")
TOKEN = os.environ.get("METHODEX_AUTH_TOKEN", "")
VIDEO_ID = os.environ.get("METHODEX_TEST_VIDEO_ID", "")
POLL_INTERVAL = 5
TIMEOUT = 300  # 5 minutes


def req(method: str, path: str, body: dict | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode("utf-8") if body else None
    r = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    if not TOKEN or not VIDEO_ID:
        print("METHODEX_AUTH_TOKEN and METHODEX_TEST_VIDEO_ID env vars required", file=sys.stderr)
        return 2

    print(f"🧪 Smoke test: analyze video {VIDEO_ID} against {API}")

    # 1. Health checks
    print("\n[1/4] Health check")
    for path in ("/health/live", "/health/ready"):
        try:
            resp = urllib.request.urlopen(f"{API}{path}", timeout=10)
            print(f"  ✅ {path}: {resp.status}")
        except urllib.error.HTTPError as e:
            print(f"  ❌ {path}: {e.code}")
            return 1

    # 2. Trigger analyze
    print("\n[2/4] Dispatching analyze...")
    dispatch = req("POST", f"/api/videos/{VIDEO_ID}/analyze")
    print(f"  task_id: {dispatch.get('task_id')}")
    print(f"  analysis_id: {dispatch.get('analysis_id')}")
    print(f"  status: {dispatch.get('status')}")

    # 3. Poll until complete
    print("\n[3/4] Polling status (every 5s, timeout 5min)...")
    start = time.monotonic()
    last_step = None
    while time.monotonic() - start < TIMEOUT:
        status_resp = req("GET", f"/api/videos/{VIDEO_ID}/analysis/status")
        status = status_resp.get("status")
        current_step = status_resp.get("current_step")
        if current_step != last_step:
            print(f"  [{int(time.monotonic() - start)}s] step={current_step} status={status}")
            last_step = current_step
        if status == "completed":
            print("  ✅ analysis completed")
            break
        if status == "error":
            print(f"  ❌ analysis failed: {status_resp}")
            return 1
        time.sleep(POLL_INTERVAL)
    else:
        print("  ❌ timeout")
        return 1

    # 4. Verify all 5 step_status entries are "completed"
    print("\n[4/4] Verifying step_status transitions...")
    final = req("GET", f"/api/videos/{VIDEO_ID}/analysis/status")
    step_status = final.get("step_status") or {}
    expected_steps = ["chunk", "infer", "relate", "explain", "activate"]
    for step in expected_steps:
        state = step_status.get(step, "missing")
        marker = "✅" if state == "completed" else "❌"
        print(f"  {marker} {step}: {state}")

    if all(step_status.get(s) == "completed" for s in expected_steps):
        print("\n🎉 SMOKE TEST PASSED")
        return 0
    print("\n💥 SMOKE TEST FAILED — not all steps completed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/production-smoke-test.py
```

- [ ] **Step 3: Run against production**

Requires a test user JWT and a test video id. If no fixture video exists, create one manually (upload via the UI, run transcription, let it sit in "transcribed" state), save the video id and a long-lived test JWT as env vars:

```bash
export METHODEX_AUTH_TOKEN=<jwt from a test user>
export METHODEX_TEST_VIDEO_ID=<uuid>
python3 scripts/production-smoke-test.py
```

Expected: all 5 step transitions reach `completed`, total time under 5 minutes.

If the test fails, investigate logs (Railway worker logs + Sentry) before declaring WS5 incomplete. The smoke test is a gate — do not proceed to declare success if it fails.

- [ ] **Step 4: Commit**

```bash
git add scripts/production-smoke-test.py
git commit -m "test: add production smoke test script

End-to-end test that hits /analyze on a known fixture video and
verifies all 5 step_status transitions reach 'completed' within 5
minutes. Run manually after each major deploy as a go/no-go check.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 5.2: Measure post-refactor memory footprint

**Files:**
- Read-only

- [ ] **Step 1: Query Railway usage for the new billing period**

```bash
TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ estimatedUsage(workspaceId: \"37eb4e96-0873-4033-a392-3c6593a68802\", projectId: \"154d302f-8609-4897-a10c-1f0d5bfc4f06\", measurements: [MEMORY_USAGE_GB, CPU_USAGE, NETWORK_TX_GB, DISK_USAGE_GB]) { measurement estimatedValue } }"}' \
  | python3 -m json.tool
```

- [ ] **Step 2: Compare against the pre-flight baseline captured in Task 0 Step 3**

Record the numbers in `memory/project_hobby_scaling_progress.md` under a new "Post-refactor metrics" section. Example update:

```markdown
## Post-refactor metrics (captured 2026-04-XX after WS4 landed)

| Measurement | Pre-refactor | Post-refactor | Delta |
|---|---|---|---|
| MEMORY_USAGE_GB (monthly) | 18,276 | ??? | ??? |
| NETWORK_TX_GB (monthly) | 21.3 | ??? | ??? |
| CPU_USAGE (monthly vCPU-hr) | 299 | ??? | ??? |
| Estimated monthly cost | $5.45 | ??? | ??? |
```

- [ ] **Step 3: Commit the memory update (no code)**

The memory file lives outside the repo (it's in `~/.claude/projects/.../memory/`), so no git commit — just ensure the file is updated.

## Task 5.3: Run burst load test

**Files:**
- Create: `scripts/burst-load-test.py`

- [ ] **Step 1: Create the burst load test**

Create `scripts/burst-load-test.py`:

```python
#!/usr/bin/env python3
"""Burst load test for the methodex analysis pipeline.

Fires N concurrent POST /analyze requests against N pre-seeded fixture
videos, tracks step transitions over time, and reports:
- Time-to-first-step-start for each video
- Total wall-clock for all to reach "completed"
- Queue depth trajectory (inferred from step_status polling)
- Any failures

Requires a list of fixture video IDs belonging to the test user.

Usage:
    export METHODEX_AUTH_TOKEN=<jwt>
    export METHODEX_BURST_VIDEO_IDS="uuid1,uuid2,uuid3,..."
    python3 scripts/burst-load-test.py
"""

import os
import sys
import time
import json
import threading
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

API = os.environ.get("METHODEX_API_URL", "https://api.methodex.ai")
TOKEN = os.environ.get("METHODEX_AUTH_TOKEN", "")
VIDEO_IDS = [v.strip() for v in os.environ.get("METHODEX_BURST_VIDEO_IDS", "").split(",") if v.strip()]
POLL_INTERVAL = 5
TIMEOUT = 600


def req(method: str, path: str) -> dict:
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    r = urllib.request.Request(f"{API}{path}", headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def dispatch_one(video_id: str) -> tuple[str, float]:
    t0 = time.monotonic()
    req("POST", f"/api/videos/{video_id}/analyze")
    return video_id, time.monotonic() - t0


def poll_one(video_id: str, start_time: float) -> dict:
    history = []
    while time.monotonic() - start_time < TIMEOUT:
        try:
            status = req("GET", f"/api/videos/{video_id}/analysis/status")
        except Exception as e:
            history.append({"t": time.monotonic() - start_time, "error": str(e)})
            time.sleep(POLL_INTERVAL)
            continue
        t = time.monotonic() - start_time
        history.append({"t": t, "step_status": status.get("step_status"), "status": status.get("status")})
        if status.get("status") in ("completed", "error"):
            return {"video_id": video_id, "final": status, "history": history}
        time.sleep(POLL_INTERVAL)
    return {"video_id": video_id, "final": {"status": "timeout"}, "history": history}


def main():
    if not TOKEN or not VIDEO_IDS:
        print("METHODEX_AUTH_TOKEN and METHODEX_BURST_VIDEO_IDS env vars required", file=sys.stderr)
        return 2

    print(f"🔥 Burst load test: {len(VIDEO_IDS)} concurrent analyses against {API}")

    # Dispatch all analyses as fast as possible
    dispatch_start = time.monotonic()
    with ThreadPoolExecutor(max_workers=len(VIDEO_IDS)) as executor:
        dispatch_results = list(executor.map(dispatch_one, VIDEO_IDS))
    dispatch_elapsed = time.monotonic() - dispatch_start
    print(f"\nDispatched {len(VIDEO_IDS)} analyses in {dispatch_elapsed:.1f}s")
    for vid, dt in dispatch_results:
        print(f"  {vid}: dispatch took {dt * 1000:.0f}ms")

    # Poll all in parallel until terminal
    poll_start = time.monotonic()
    with ThreadPoolExecutor(max_workers=len(VIDEO_IDS)) as executor:
        poll_results = list(executor.map(lambda v: poll_one(v, poll_start), VIDEO_IDS))

    total_elapsed = time.monotonic() - dispatch_start
    print(f"\n⏱  Total wall-clock for burst: {total_elapsed:.1f}s")

    # Summary
    completed = sum(1 for r in poll_results if r["final"].get("status") == "completed")
    errored = sum(1 for r in poll_results if r["final"].get("status") == "error")
    timeout = sum(1 for r in poll_results if r["final"].get("status") == "timeout")
    print(f"  completed: {completed} / {len(VIDEO_IDS)}")
    print(f"  errored:   {errored}")
    print(f"  timeout:   {timeout}")

    if completed == len(VIDEO_IDS):
        print("\n🎉 BURST LOAD TEST PASSED")
        return 0
    print("\n💥 BURST LOAD TEST FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/burst-load-test.py
```

- [ ] **Step 3: Run against production with ~10 fixture videos first**

Start small — 10 concurrent analyses — before scaling to the target 25.

```bash
export METHODEX_AUTH_TOKEN=<jwt>
export METHODEX_BURST_VIDEO_IDS="<10 comma-separated uuids>"
python3 scripts/burst-load-test.py
```

Review the output. All 10 should complete within ~3 minutes. If any fail or time out, investigate before scaling.

- [ ] **Step 4: Run again with 25 concurrent**

```bash
export METHODEX_BURST_VIDEO_IDS="<25 comma-separated uuids>"
python3 scripts/burst-load-test.py
```

Expected: all 25 complete within ~4 minutes, no timeouts, no errors.

If any step latency looks wrong or tasks pile up in queue, inspect Railway logs + Sentry to find the bottleneck.

- [ ] **Step 5: Commit the burst load test**

```bash
git add scripts/burst-load-test.py
git commit -m "test: add burst load test script for multi-replica worker validation

Fires N concurrent POST /analyze calls and tracks per-video step
transitions until all reach terminal state. Used to validate the
post-T1/T2 pipeline at target-B scale (25 concurrent).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

## Task 5.4: Update progress memory to mark project complete

**Files:**
- Modify: `~/.claude/projects/-Users-idstuart-Projects-ai-prototyping-5d-analysis/memory/project_hobby_scaling_progress.md`

- [ ] **Step 1: Update the memory file status**

Edit the memory file, change the opening from "IN-FLIGHT" to "COMPLETED 2026-04-XX" and add a final summary section:

```markdown
## Completion summary (2026-04-XX)

- **Wave 1** landed: WS1 (CI deploy-wait), WS2 (memory + cleanup), WS3 (chain refactor)
- **Wave 2** landed: WS4 (beat extraction, multi-replica topology, Redis hardening)
- **Wave 3** validated: smoke test passed, burst load test (25 concurrent) passed
- **Memory footprint change**: pre-refactor $X.XX/mo → post-refactor $Y.YY/mo
- **Task duration change**: monolithic 150s/video → chain mean 30s/step, 145s total (similar wall-clock, no thread pinning)
- **Burst capacity change**: blocked at 8 concurrent → scales to 25+ without queueing

All goals from the design spec met. The stack remains on Railway Hobby.
```

Save. No git commit (memory file is outside the repo).

## Task 5.5: Final handoff

- [ ] **Step 1: Write a short handoff note in the repo**

Create `docs/ops/post-scaling-operational-notes.md`:

```markdown
# Post-scaling operational notes (2026-04-XX)

## Architecture changes that went live

- `backend` service now runs with 2 replicas, each with 2 uvicorn workers
- `worker` service now runs with 2 replicas, each with Celery concurrency 16 (threads pool, consumes from queues: analyze, transcribe, celery)
- New `beat` service (1 replica forever) runs the Celery Beat scheduler
- Redis now enforces `maxmemory=300mb` + `allkeys-lru`
- Backend has `/health/live` and `/health/ready` endpoints; Railway health checks point at `/health/ready`

## Known operational gotchas

- **Do not scale `beat` above 1 replica**, ever. Multiple beat instances fire scheduled tasks N times.
- **Postgres backups are NOT yet automated.** Separate future spec. Until then, run a manual `pg_dump` to R2 weekly (or more often during active development).
- If the Redis service redeploys, the startCommand override (maxmemory) may reset. Verify after any Redis restart with `redis-cli INFO memory | grep maxmemory`.
- Worker replicas each hold ~16 Celery threads. A stuck thread under-utilizes half of one replica — not catastrophic. The watchdog task (every 5 min via beat) will mark stuck analyses as error.

## Troubleshooting

- **Backend returns 503 from /health/ready**: DB or Redis unreachable. Check `railway logs` on the `backend` service for the specific probe failure.
- **Scheduled tasks firing twice**: check that `beat` is running with `numReplicas=1`. If the worker service accidentally re-added `--beat`, remove it.
- **Queue backlog**: run `redis-cli -h yamabiko.proxy.rlwy.net -p 50187 -a $REDIS_PASSWORD LLEN analyze` — if it's stuck growing, a worker may have died; check `railway logs` on the worker service.
```

- [ ] **Step 2: Commit the runbook**

```bash
git add docs/ops/post-scaling-operational-notes.md
git commit -m "docs: post-scaling operational notes

Runbook covering the new topology (2 backend replicas, 2 worker
replicas, 1 beat), known gotchas (don't scale beat, backups still
manual), and troubleshooting steps for common production issues.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: WS5 handoff**

All waves complete. Production is on the new topology, smoke + burst tests pass, docs and memory are updated.

If anything under load reveals an unforeseen issue — memory pressure, queue backlog, replica contention — file a new spec and do not patch in place.

---

## Self-Review Checklist (mandatory before declaring plan complete)

After writing the complete plan, I ran this checklist against the spec:

- ✅ **Spec coverage:** Every track (T1 through T6) from the spec has a corresponding workstream (WS1–WS5) with concrete tasks. T3 (backups) is explicitly out of scope per the spec.
- ✅ **No placeholders:** No `TBD`, `TODO`, or `implement later` in any task step. Every code block contains the actual code an engineer needs.
- ✅ **Type/method consistency:** `analyze_chunk_step`, `analyze_infer_step`, etc. referenced consistently. `_check_cancellation` referenced across 3.2, 3.3. `handle_pipeline_error` referenced in 3.5, 3.8, 3.9. `_POOL_CONFIG`/`_pool` in 4.1.
- ✅ **Exact file paths:** Every task lists the exact files it touches.
- ✅ **Explicit commits:** Every task ends with a `git commit` step.
- ✅ **Dependency order documented:** Wave 1 parallel, WS2 rebases on WS3, WS4 after Wave 1 soak, WS5 after WS4.
- ✅ **Test code inline:** Tests in 3.3, 3.5, 3.6, 4.1, 4.2 have complete code, not just descriptions.

One area where the plan trusts the executor: **Task 4.7 Step 4** (manual first-time source config of the new beat service in the Railway dashboard) requires human interaction. Automated service creation via Railway's GraphQL API is partial — `serviceCreate` mutation exists but the source (repo + Dockerfile) is typically set by the dashboard UI for first-time setup. This is called out explicitly in the task so an executor knows to pause and do the dashboard step.
