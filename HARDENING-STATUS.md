# Production Hardening Status — 2026-03-23

## Summary

Hardening methodex.ai for 50+ concurrent students. All changes are live in production.

## Completed

### Infrastructure (zero cost increase)
- [x] **Celery solo → thread pool (concurrency=8)** — 8 concurrent tasks instead of 1
- [x] **Thread-safe DatabaseTask** — `threading.local()` for safe concurrent DB sessions
- [x] **DEFAULT_MODEL fixed** — both Railway services updated from `:free` model to `meta-llama/llama-4-scout`
- [x] **Direct browser-to-R2 upload** — presigned PUT URLs bypass Railway's 5-min proxy timeout. 300-450 MB files upload successfully
- [x] **S3 calls unblocked** — `asyncio.to_thread()` wraps all boto3 calls in async routes
- [x] **Lightweight /analysis/status endpoint** — ~200 bytes vs 50+ KB on every poll

### Frontend
- [x] **401 auth recovery** — redirects to /sign-in instead of silently failing
- [x] **Polling intervals doubled** — 2-4x slower, reduces server load by ~75%
- [x] **Tab visibility polling** — `document.hidden` pauses polls when tab inactive
- [x] **refetchOnWindowFocus disabled** — prevents thundering herd on tab switch
- [x] **staleTime increased** — 5s → 30s, fewer redundant refetches
- [x] **Status-only polling** — `useVideoAnalysisStatus` polls lightweight endpoint, full data fetched once
- [x] **Infinite transcript polling fixed** — `useRef` tracks completion time client-side
- [x] **Speaker role validation fix** — case-insensitive comparison (DB stores lowercase)

### Backend Pipeline
- [x] **Transcription split** — submit + periodic check tasks (frees threads in ~2s instead of 5-30 min)
- [x] **LLM retry backoff reduced** — `min=2s` (was 5s), saves 36s worst case
- [x] **LLM timeout reduced** — 5 min (was 10 min)
- [x] **Chunks removed from Explain prompt** — saves ~25KB tokens per analysis
- [x] **indent=2 removed from JSON dumps** — ~20% token reduction
- [x] **Task timeout reduced** — 30 min (was 2 hours)
- [x] **Single-dict LLM response handling** — wraps in list instead of crashing

### Cleanup
- [x] **Legacy `:free` model validation removed**
- [x] **Unused RECOMMENDED_MODELS import removed**

## E2E Test Results (2026-03-23)

### Upload (4 videos, 312-451 MB each)
- [x] All 4 uploaded via presigned URLs — zero errors, ~6 minutes total
- [x] Direct browser-to-R2 confirmed working (no Railway proxy involvement)

### Transcription (4 videos)
- [x] All 4 transcribed concurrently using new submit + check pattern
- [x] Submit task returns in ~2s (was blocking 5-30 min)
- [x] check_transcription retries work correctly (10s intervals)
- [x] Speaker detection working (2 speakers per video)

### Analysis (4 videos, 5-step pipeline)
- [x] Ewan: COMPLETED — 30 chunks, 30 inferences, 4 patterns, 4 insights, 4 principles (93s)
- [x] Kathleen: COMPLETED — 40 chunks, 40 inferences, 8 patterns, 5 insights, 5 principles (241s)
- [x] Ken: COMPLETED — degraded quality (1 chunk from single-dict LLM response)
- [ ] Kelly: FAILED — LLM repeatedly returns single object instead of list at chunk step
- [ ] Cross-video analysis: Not yet tested (needs 2+ completed analyses)

### Known Issues
1. **LLM single-dict response** — `meta-llama/llama-4-scout` intermittently returns a single chunk object `{...}` instead of a list `[{...}, ...]`. Our fix prevents crashes (wraps in list) but quality degrades to 1 chunk. Affects ~2 of 4 videos. May need a prompt format adjustment or model-specific handling.
2. **Trailing slash duplication** — FastAPI redirects `/transcript` → `/transcript/`, doubling network requests. Cosmetic, not breaking.

## Deployment Info
- **CI/CD**: All green (GitHub Actions → Cloudflare Pages for frontend, Railway auto-deploy for backend/worker)
- **Railway plan**: Hobby (usage-based)
- **Worker config**: `--pool=threads --concurrency=8`
- **Cost impact**: ~$0 increase (threads share memory, sleeping threads don't consume CPU)
