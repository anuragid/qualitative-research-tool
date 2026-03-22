# Production Hardening: 50+ Concurrent Students

> **Status: EXECUTED** — All changes applied 2026-03-22

**Goal:** Make methodex.ai handle 50+ concurrent students without degraded performance.

**Approach:** Minimal, high-impact changes only. No over-provisioning.

---

## Changes Made

### 1. Fix DEFAULT_MODEL env var (Railway)
Both `backend` and `worker` services had `DEFAULT_MODEL=meta-llama/llama-3.3-70b-instruct:free` — the old free-tier model with strict rate limits (~10-20 req/min). Updated to `meta-llama/llama-4-scout` (paid via wallet, much higher limits). This was the #1 real bottleneck.

### 2. Celery solo → threads (concurrency=8)
- **`backend/scripts/startup.sh`**: Changed `--pool=solo` to `--pool=threads --concurrency=${CELERY_CONCURRENCY:-8}`
- **`backend/app/tasks/base.py`**: Made `DatabaseTask` thread-safe using `threading.local()` (threads share the task instance, so `self._db` was a race condition)
- **`backend/app/tasks/celery_app.py`**: Updated comments for thread pool

**Why 8 threads costs ~$0 extra:** Threads share process memory. Sleeping threads (AssemblyAI poll loops with `time.sleep(5)`) don't consume CPU. Railway bills CPU, so idle threads = free. The machine has 48 cores — we use 8.

### 3. Frontend: 401 auth recovery + polling optimization
- **`frontend/src/services/api.ts`**: 401 now redirects to `/sign-in` instead of silently failing
- **`frontend/src/hooks/useVideos.ts`**: Polling 2s → 4s, pauses when tab hidden
- **`frontend/src/hooks/useAnalysis.ts`**: Polling 1s → 3s (video), 2s → 4s (project), pauses when tab hidden
- **`frontend/src/hooks/useTranscriptions.ts`**: Polling 2s → 4s, speaker detection 1.5s → 3s, pauses when tab hidden

`refetchOnWindowFocus: false` was already set globally.

### 4. Remove legacy `:free` model validation
- **`backend/app/routes/users.py`**: Removed `endswith(":free")` check — dead code, no standard models use the suffix.

## What We Didn't Do (and why)
- **Uvicorn workers**: FastAPI async handles 50 concurrent REST clients fine with 1 process
- **DB pool tuning**: 30 connections is plenty for 50 students with 1 API process + Celery
- **Railway replicas**: Usage-based Hobby plan, no need to over-provision
- **Health check enhancement**: Current health check works; not a bottleneck
- **Code splitting**: 269KB gzipped is fine for a classroom tool

## Capacity After Changes
| Resource | Capacity | 50 students OK? |
|----------|----------|-----------------|
| LLM calls | Paid model via wallet (high limits) | Yes |
| Task throughput | 8 concurrent (was 1) | Yes — handles mix of transcriptions + analyses |
| HTTP requests | 1 async uvicorn (~100+ concurrent connections) | Yes |
| DB connections | Pool of 30 | Yes |
| Polling load | ~12 req/sec (was ~50 req/sec) | Yes |
| Auth recovery | Redirects to /sign-in on 401 | Yes |

## Deployment
- ENV vars updated via `railway variables --set` (already applied, services will pick up on next deploy)
- Code changes deploy via `git push` to main → Railway auto-deploys backend/worker, CI/CD deploys frontend to Cloudflare Pages
