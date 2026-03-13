# CI/CD Pipeline Design — Qualitative Research Tool

**Date:** 2026-03-13
**Status:** Approved (user selected Approach A)

## Problem

No CI/CD pipeline exists. Code pushes directly to `main`, which auto-deploys to production (Railway + Cloudflare Pages) with zero quality gates. 46 modified files + 25 untracked files sit uncommitted. No backend tests or linting. Frontend has Storybook stories but no unit tests.

## Solution: GitHub Actions CI + Existing Auto-Deploy

### Architecture

```
Feature branch → PR → GitHub Actions CI → Merge to main → Auto-deploy
                         ├─ backend-ci (ruff lint + pytest smoke tests)
                         └─ frontend-ci (eslint + tsc --noEmit + vite build)
```

Railway and Cloudflare Pages continue auto-deploying from `main`. The CI gate prevents broken code from reaching `main`.

### Components

#### 1. GitHub Actions Workflow (`.github/workflows/ci.yml`)
- **Trigger:** push to `main`, PR to `main`
- **Jobs (parallel):**
  - `backend-ci`: Python 3.11, install deps, `ruff check`, `pytest` (smoke tests)
  - `frontend-ci`: Node 20, install deps, `npm run lint`, `tsc -b --noEmit`, `npm run build`
- **Cost:** $0 (GitHub free tier)

#### 2. Backend Testing Foundation
- Add `ruff` + `pytest` + `pytest-asyncio` + `httpx` to `requirements-dev.txt`
- Add `ruff.toml` config (line length 120, target Python 3.11)
- Create `backend/tests/conftest.py` with test fixtures
- Create `backend/tests/test_health.py` (smoke test for health endpoint)
- Create `backend/tests/test_config.py` (settings load correctly)

#### 3. Git Cleanup
- Add `frontend/coverage/` to `.gitignore`
- Organize uncommitted changes into logical commits
- Establish feature-branch workflow going forward

#### 4. Developer Experience (Makefile)
- `make dev` — start local docker stack
- `make test` — run all tests
- `make lint` — run all linters
- `make ci` — run full CI locally before pushing

### What We're NOT Doing
- No staging environment (cost concern)
- No backend unit tests beyond smoke tests (needs domain expertise to write meaningful tests)
- No branch protection rules (user can add later via GitHub settings)
- Not deleting `Dockerfile.worker` (may be used by Railway worker service config)
- Not restructuring Storybook tests (they work as-is)

### Success Criteria
1. `make ci` passes locally
2. GitHub Actions workflow runs on push/PR
3. Frontend builds successfully in CI
4. Backend lint + smoke tests pass in CI
5. All uncommitted changes organized into clean commits
