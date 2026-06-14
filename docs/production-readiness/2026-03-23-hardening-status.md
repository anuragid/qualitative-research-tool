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
- [x] **Tab visibility polling** — `document.hidden` pauses polls when tab inactive (all hooks including useProjects)
- [x] **refetchOnWindowFocus disabled** — prevents thundering herd on tab switch
- [x] **staleTime increased** — 5s → 30s, fewer redundant refetches
- [x] **Status-only polling** — `useVideoAnalysisStatus` polls lightweight endpoint, full data fetched once
- [x] **Infinite transcript polling fixed** — `useRef` tracks completion time client-side
- [x] **Speaker role validation fix** — case-insensitive comparison (DB stores lowercase)
- [x] **Retry buttons for failed states** — retry transcription/analysis/individual steps from error state
- [x] **Structured error display** — parses JSON error messages, shows step name, error type, retryable badge
- [x] **Error-to-query invalidation** — status transitions to "error" trigger full analysis + video refetch
- [x] **Upload retry toast** — shows "Retrying upload for [filename]..." on retry
- [x] **Step-by-step retry UX** — error step shows retry button, error banner under step tab

### Backend Pipeline
- [x] **Transcription split** — submit + periodic check tasks (frees threads in ~2s instead of 5-30 min)
- [x] **LLM retry backoff reduced** — `min=2s` (was 5s), saves 36s worst case
- [x] **LLM timeout reduced** — 5 min (was 10 min)
- [x] **Chunks removed from Explain prompt** — saves ~25KB tokens per analysis
- [x] **indent=2 removed from JSON dumps** — ~20% token reduction
- [x] **Task timeout reduced** — 30 min (was 2 hours)
- [x] **Single-dict LLM response handling** — retries with augmented prompt before wrapping in list
- [x] **Per-node retry in pipeline** — each node retried up to 2x with exponential backoff
- [x] **Structured error messages** — JSON with step/error_type/retryable/message/details
- [x] **Error type classification** — all 8 analysis nodes classify errors (llm_error, rate_limit, timeout, validation_error, network_error)
- [x] **Project analysis autoretry** — max_retries=2 with backoff and jitter
- [x] **DB session rollback hardened** — all error handlers rollback before re-querying
- [x] **DatabaseTask error cleanup** — rollback on FAILURE/RETRY/REVOKED before session close

### Cleanup
- [x] **Legacy `:free` model validation removed**
- [x] **Unused RECOMMENDED_MODELS import removed**

## Build Verification (2026-03-23)
- [x] Backend tests: 127 passed, 2 skipped, 0 failures
- [x] Frontend build: passes (893KB JS, non-blocking warning)
- [x] TypeScript: zero errors
- [x] ESLint: 0 errors
- [x] Ruff: all checks passed
- [x] Performance audit: DB sessions thread-safe, async routes non-blocking, Celery config optimal

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
- [ ] Kelly: FAILED — LLM repeatedly returns single object instead of list at chunk step (should now auto-retry with augmented prompt)
- [ ] Cross-video analysis: Not yet tested (needs 2+ completed analyses)
- [ ] Post-hardening E2E retest pending

### Known Issues
1. **LLM single-dict response** — now mitigated with auto-retry using augmented prompt ("IMPORTANT: Return a JSON array"). Falls back to wrap-in-list only if retry also fails.
2. **Trailing slash duplication** — FastAPI redirects `/transcript` → `/transcript/`, doubling network requests. Cosmetic, not breaking.

## Deployment Info
- **CI/CD**: All green (GitHub Actions → Cloudflare Pages for frontend, Railway auto-deploy for backend/worker)
- **Railway plan**: Hobby (usage-based)
- **Worker config**: `--pool=threads --concurrency=8`
- **Cost impact**: ~$0 increase (threads share memory, sleeping threads don't consume CPU)
