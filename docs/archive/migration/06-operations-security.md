# 06 - Operations & Security

This guide covers monitoring, security hardening, backups, CORS configuration, hibernate/resume procedures, logging, performance tuning, and incident response. Written for someone maintaining this system for the first time.

---

## 1. Monitoring & Alerting

### Error Monitoring with Sentry

Sentry catches unhandled exceptions in both the backend and frontend. The free tier gives you 5,000 error events per month, which is plenty for a research tool.

#### Backend Setup

Install the SDK:
```bash
pip install sentry-sdk[fastapi]
```

Add to `backend/app/main.py` (before the FastAPI app is created):
```python
import sentry_sdk

sentry_sdk.init(
    dsn="https://your-dsn@o123456.ingest.sentry.io/123456",  # from Sentry dashboard
    environment=settings.APP_ENV,  # "production" or "development"
    traces_sample_rate=0.1,  # 10% of requests get performance tracing
    profiles_sample_rate=0.1,
)
```

What Sentry will catch automatically:
- Unhandled exceptions in FastAPI routes
- Celery task failures (add `sentry_sdk.integrations.celery.CeleryIntegration()`)
- SQLAlchemy errors
- Logging calls at ERROR level

#### Frontend Setup

Install the SDK:
```bash
cd frontend && npm install @sentry/react
```

Initialize in `frontend/src/main.tsx` (before React renders):
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://your-dsn@o123456.ingest.sentry.io/654321",
  environment: import.meta.env.MODE,  // "production" or "development"
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: 0.1,
});
```

What Sentry will catch:
- Unhandled JavaScript errors
- Failed API calls (network errors)
- React rendering errors (if you wrap with `Sentry.ErrorBoundary`)

#### Sentry Setup Steps
1. Create a Sentry account at sentry.io
2. Create a new project for the backend (Python > FastAPI)
3. Create a new project for the frontend (JavaScript > React)
4. Copy the DSN from each project into your environment variables
5. Add `SENTRY_DSN` to your Railway environment variables (backend)
6. Add `VITE_SENTRY_DSN` to your Cloudflare Pages environment variables (frontend)

### Uptime Monitoring

Use UptimeRobot (free tier: 50 monitors, 5-minute intervals) or BetterStack (free tier similar).

Set up these monitors:

| Monitor | URL | Type | Interval |
|---------|-----|------|----------|
| Frontend | `https://yourdomain.com` | HTTP(s) | 5 min |
| API Health | `https://api.yourdomain.com/health` | HTTP(s) | 5 min |
| API Root | `https://api.yourdomain.com/` | HTTP(s) | 5 min |

The `/health` endpoint (from `main.py`) returns:
```json
{"status": "healthy", "environment": "production"}
```

Configure alerts:
- Email notification when any monitor goes down
- Optional: Slack webhook or SMS for faster response

### Railway Built-in Monitoring

Railway provides basic observability out of the box:
- **Metrics:** CPU usage, memory usage, network I/O -- visible in the Railway dashboard per service
- **Logs:** `railway logs` from CLI, or view in the dashboard. Logs are retained for the duration of your plan.
- **Deployments:** Each deploy shows build logs and deploy status

Check these regularly during active semesters. The key things to watch:
- Memory usage on the worker service (AI analysis tasks can be memory-heavy)
- Redis memory usage (should stay low; if it grows, tasks may be stacking up)
- Deploy failures (usually dependency or build issues)

---

## 2. Security Hardening

### API Rate Limiting

The Cloudflare rate limiting rule (from 05-cloudflare-infrastructure.md) provides coarse protection. For finer control, add application-level rate limiting using `slowapi`.

#### Install
```bash
pip install slowapi
```

#### Configure in `main.py`
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

#### Apply to Endpoints

Recommended limits (adjust based on actual usage):

| Endpoint Pattern | Limit | Rationale |
|-----------------|-------|-----------|
| `POST /api/videos/{id}/upload` | 10/hour per IP | Video uploads are expensive (storage + bandwidth) |
| `POST /api/videos/{id}/analyze` | 5/hour per IP | Each analysis triggers multiple LLM calls |
| `POST /api/videos/{id}/transcribe` | 5/hour per IP | Each transcription costs money (AssemblyAI) |
| `POST /api/users/login` | 5/15min per IP | Prevent brute force (if using local auth) |
| General API | 100/minute per IP | Prevent abuse |

Example usage on a route:
```python
from app.main import limiter

@router.post("/{video_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
async def trigger_video_analysis(request: Request, video_id: UUID, ...):
    ...
```

**Note:** `slowapi` requires the `Request` object as the first parameter to the route function. You will need to add `request: Request` to route signatures where you apply rate limits.

**Note on proxied requests:** When behind Cloudflare, the client's real IP is in the `CF-Connecting-IP` header. Configure `slowapi` to use it:
```python
def get_real_ip(request: Request) -> str:
    return request.headers.get("CF-Connecting-IP", request.client.host)

limiter = Limiter(key_func=get_real_ip)
```

### CORS Configuration

The current CORS setup in `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

The `ALLOWED_ORIGINS` setting in `config.py` defaults to `http://localhost:5173,http://localhost:3000`. This needs to change for production.

**Production CORS configuration:**

Set this environment variable on Railway:
```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

For tighter security, also restrict methods and headers:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    max_age=86400,  # Cache preflight responses for 24 hours
)
```

**Important:** `allow_origins=["*"]` must NEVER be used in production. The current code correctly uses the settings list, but verify no one has set `ALLOWED_ORIGINS=*` in the environment.

**Note on `config_enhanced.py`:** The codebase has both `config.py` and `config_enhanced.py`. The actual imports throughout the codebase (`main.py`, `videos.py`, `database.py`, etc.) all use `from app.config import settings`. The `config_enhanced.py` file has additional AWS-specific logic (ECS detection, auto-adjusting database URLs) that is not currently in use. For the migration, continue using `config.py` and remove the AWS-specific logic later.

### Security Headers

Add security headers via FastAPI middleware. Create a middleware or add to `main.py`:

```python
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

**Note:** If you set these headers in both Cloudflare (Transform Rules) and FastAPI, they will be duplicated. Pick one place. Recommendation: set them in FastAPI so they are version-controlled and work consistently regardless of CDN.

### Authentication Security

With Clerk handling authentication:
- **JWT tokens:** Clerk issues short-lived tokens (typically 5 minutes), automatically refreshed by the frontend SDK
- **Session management:** Clerk handles session rotation, device tracking, and revocation
- **No passwords stored in your database:** Clerk manages all credential storage
- **BYOK API key encryption:** If users bring their own LLM API keys, encrypt at rest using Fernet symmetric encryption before storing in the database (see the LLM migration doc for details)

### File Upload Validation

The current upload route in `videos.py` already validates:
- File extension against `ALLOWED_VIDEO_EXTENSIONS` (`.mp4`, `.mov`, `.webm`, `.avi`)
- File size against `MAX_FILE_SIZE_MB` (500 MB)

Additional hardening to consider:
```python
import magic  # python-magic library

# After receiving the file, check actual MIME type (not just extension)
mime = magic.from_buffer(await file.read(2048), mime=True)
await file.seek(0)  # Reset file position
if mime not in ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"]:
    raise HTTPException(status_code=400, detail="Invalid file type")
```

This prevents someone from uploading a malicious file with a `.mp4` extension. Install with `pip install python-magic` (requires `libmagic` system library -- available on Railway's Ubuntu base).

### Database Security

- Railway Postgres is accessible only via private networking (not exposed to the public internet)
- The connection string uses SSL by default in Railway
- The `pool_pre_ping=True` setting in `database.py` handles stale connections gracefully
- Connection pooling (`pool_size=10`, `max_overflow=20`) is appropriate for Railway's resource limits

---

## 3. Backup Strategy

### Database Backups

Your database contains projects, videos metadata, transcripts, analysis results, and user records. Losing this means re-running all analyses.

#### Manual Backup (Run Before Any Risky Operation)

```bash
# Connect to Railway and dump the database
railway run pg_dump -Fc --no-owner --no-acl $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).dump
```

The `-Fc` flag creates a custom-format dump (compressed, supports selective restore).

#### Verify a Backup

```bash
# List contents without restoring
pg_restore --list backup_20260303_120000.dump
```

If this command succeeds and shows tables/data, the backup is good.

#### Upload Backup to R2

```bash
# Using AWS CLI with R2 endpoint
aws s3 cp backup_20260303_120000.dump \
  s3://qualitative-research-backups/db/backup_20260303_120000.dump \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
```

Set up a dedicated R2 bucket or prefix (`db/`) for backups, separate from video storage.

#### Automated Daily Backups

Option 1: **Railway Cron Service** -- deploy a lightweight container that runs `pg_dump` daily and uploads to R2.

Option 2: **External cron** -- use a free cron service (cron-job.org, GitHub Actions scheduled workflow) to trigger a backup endpoint or script.

Example GitHub Actions workflow (`.github/workflows/backup.yml`):
```yaml
name: Database Backup
on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install tools
        run: sudo apt-get install -y postgresql-client awscli

      - name: Dump database
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: pg_dump -Fc --no-owner "$DATABASE_URL" > backup.dump

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
        run: |
          aws s3 cp backup.dump \
            s3://qualitative-research-backups/db/backup_$(date +%Y%m%d).dump \
            --endpoint-url https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
```

#### Retention Policy

| Type | Keep | Cleanup |
|------|------|---------|
| Daily backups | Last 7 days | Delete older via R2 lifecycle rule |
| Weekly backups | Last 4 weeks | Keep every Monday's backup |
| Pre-migration | Forever | Manual, before major changes |

Set up R2 lifecycle rules to auto-delete old daily backups.

#### Restore from Backup

```bash
# Create a fresh database (or drop existing)
railway run pg_restore --clean --if-exists --no-owner -d $DATABASE_URL backup.dump
```

**Warning:** `--clean` drops existing tables before restoring. Only use this if you intend a full restore.

### Video Backups

- R2 provides 99.999999999% (eleven nines) durability -- data loss is extremely unlikely
- The original research videos exist with the students who recorded them
- Optional: keep the local backup (`5d-analysis/videos-backup/`, 3.2 GB) as a secondary copy
- For extra safety, you could enable cross-region replication in R2, but this is overkill for a research tool

### Configuration Backups

Environment variables are not in version control (correctly). To avoid losing them:

- [ ] Store all environment variables in a password manager (1Password, Bitwarden, etc.)
- [ ] Document which variables each service needs in a `env.example` file (without values)
- [ ] Railway project config can be viewed in the dashboard -- screenshot or export periodically
- [ ] Clerk configuration lives in their dashboard -- note the project ID and API keys

---

## 4. CORS Configuration (Detailed)

CORS is the most common source of confusing errors when deploying a frontend + API on different domains. Here is the exact setup.

### How It Works in This Codebase

The CORS middleware is configured in `backend/app/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

The `allowed_origins_list` property in `config.py` splits the `ALLOWED_ORIGINS` environment variable by commas:
```python
ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

@property
def allowed_origins_list(self) -> List[str]:
    return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
```

### Production Environment Variable

Set on Railway:
```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

If you also want to allow Cloudflare Pages preview URLs (for testing branches):
```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://*.your-project.pages.dev
```

**Note:** Wildcard subdomains (`https://*.pages.dev`) require careful handling. FastAPI's `CORSMiddleware` supports wildcard patterns, but test this. An alternative is to use a regex-based origin check.

### Debugging CORS Issues

If you see `Access-Control-Allow-Origin` errors in the browser console:

1. **Check the request origin:** Open browser dev tools > Network tab > find the failed request > look at the `Origin` header. It must exactly match one of your `ALLOWED_ORIGINS` values (including protocol and port).

2. **Check the response headers:** Look for `Access-Control-Allow-Origin` in the response. If it is missing, the origin is not in your allowed list.

3. **Preflight requests:** For non-simple requests (POST with JSON body, requests with Authorization header), the browser sends an OPTIONS request first. If the backend does not handle OPTIONS correctly, the actual request fails. FastAPI's `CORSMiddleware` handles this automatically.

4. **Common mistakes:**
   - Trailing slash mismatch: `https://yourdomain.com` vs `https://yourdomain.com/`
   - Protocol mismatch: `http://` vs `https://`
   - Missing `www`: `https://yourdomain.com` vs `https://www.yourdomain.com`

---

## 5. Semester Break: Hibernate Procedure

This application is used during academic semesters. Between semesters, you can shut down most services to save money. Cloudflare Pages and R2 are free, so the frontend and stored videos remain accessible at zero cost.

### To Hibernate

Follow these steps in order:

- [ ] **1. Notify users.** Send an announcement that the tool will be offline for break. Give at least 1 week notice.

- [ ] **2. Export the database.**
  ```bash
  railway run pg_dump -Fc --no-owner --no-acl $DATABASE_URL > hibernate_backup_$(date +%Y%m%d).dump
  ```

- [ ] **3. Upload backup to R2.**
  ```bash
  aws s3 cp hibernate_backup_*.dump \
    s3://qualitative-research-backups/hibernate/hibernate_backup_$(date +%Y%m%d).dump \
    --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
  ```

- [ ] **4. Verify backup integrity.**
  ```bash
  pg_restore --list hibernate_backup_*.dump
  # Should print a list of tables and data -- no errors
  ```

- [ ] **5. (Optional) Set frontend to maintenance page.** Deploy a simple static page to Cloudflare Pages that says "On break -- returning [date]." You can do this by creating a `maintenance` branch with a minimal `index.html` and temporarily setting it as the production branch in Pages settings.

- [ ] **6. Stop Railway services.** In the Railway dashboard:
  - Click on the backend API service > Settings > Remove service (or stop deploys)
  - Click on the worker service > Settings > Remove service
  - This stops billing for compute

- [ ] **7. Delete Railway Postgres and Redis** (optional, saves the plan fee):
  - Only do this if you have verified your backup
  - Delete the Postgres and Redis services in Railway
  - You can recreate them when resuming

- [ ] **8. Downgrade or cancel Railway plan** (if no other projects use it).

- [ ] **9. Verify what remains running:**
  - Cloudflare Pages: frontend still accessible (or maintenance page)
  - Cloudflare R2: videos still stored, accessible via presigned URLs (though the backend that generates URLs is down)
  - Clerk: account remains active on free tier
  - Total cost during hibernate: ~$0-2/month (Clerk free tier + R2 free tier)

### To Resume

Follow these steps in order:

- [ ] **1. Upgrade Railway plan** (or create a new project if you cancelled).

- [ ] **2. Deploy services from GitHub.**
  - Connect your repository to Railway
  - Create a new Postgres service
  - Create a new Redis service
  - Deploy the backend API service
  - Deploy the worker service

- [ ] **3. Set all environment variables** on each Railway service. Reference your password manager for the values. Key variables:
  - `DATABASE_URL` (from the new Postgres service)
  - `REDIS_URL` (from the new Redis service)
  - `ALLOWED_ORIGINS`
  - `ANTHROPIC_API_KEY` (or `OPENROUTER_API_KEY`)
  - `ASSEMBLYAI_API_KEY`
  - `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`
  - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`
  - `SENTRY_DSN`
  - `APP_ENV=production`

- [ ] **4. Restore the database.**
  ```bash
  # Download the hibernate backup from R2
  aws s3 cp \
    s3://qualitative-research-backups/hibernate/hibernate_backup_YYYYMMDD.dump \
    ./hibernate_backup.dump \
    --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com

  # Restore into the new Postgres instance
  railway run pg_restore --clean --if-exists --no-owner -d $DATABASE_URL hibernate_backup.dump
  ```

- [ ] **5. Run pending Alembic migrations** (if any were added since hibernation):
  ```bash
  railway run alembic upgrade head
  ```

- [ ] **6. Restore the frontend.**
  - If you switched to a maintenance branch, set the production branch back to `main` in Cloudflare Pages settings
  - Trigger a rebuild if needed
  - Update `VITE_API_URL` if the Railway backend URL changed

- [ ] **7. Verify everything works:**
  - [ ] Health check: `curl https://api.yourdomain.com/health`
  - [ ] Frontend loads: visit `https://yourdomain.com`
  - [ ] Login works: sign in with Clerk
  - [ ] Video playback: open a project with videos, verify playback URLs work
  - [ ] Upload works: upload a test video
  - [ ] Analysis works: trigger analysis on a video with a transcript
  - [ ] Transcription works: transcribe a new video

- [ ] **8. Notify users** that the tool is back online.

---

## 6. Logging Best Practices

### Current Setup

The backend uses Python's `logging` module configured in `main.py`:
```python
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
```

This is fine for development. For production, consider structured JSON logging.

### Production Logging Configuration

```python
import logging
import json
from datetime import datetime, timezone

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

# Apply in production
if settings.APP_ENV == "production":
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.root.handlers = [handler]
    logging.root.setLevel(logging.INFO)
```

Structured JSON logs are easier to search and filter in Railway's log viewer.

### What to Log

**Do log:**
- API requests: method, path, status code, response time
- Celery task lifecycle: task started, task completed, task failed (with error)
- LLM API calls: which model, token count, duration (for cost tracking)
- Authentication events: login, logout, failed auth
- Video operations: upload started, upload completed, file size
- Database errors and connection issues

**Do NOT log:**
- User passwords or auth tokens
- API keys (Anthropic, AssemblyAI, Clerk secrets)
- Full request/response bodies (may contain transcript content or personal data)
- Video file contents
- Full LLM prompts or responses (may contain sensitive interview data)

### Log Levels

| Level | Use For | Example |
|-------|---------|---------|
| ERROR | Something failed that needs attention | Task failed, database connection lost |
| WARNING | Something unexpected but handled | S3 delete failed but DB cleanup succeeded |
| INFO | Normal operations worth tracking | Video uploaded, analysis completed |
| DEBUG | Detailed info for troubleshooting | SQL queries, request headers (dev only) |

Set `INFO` for production, `DEBUG` for development.

---

## 7. Performance Considerations

### Database Connection Pool

Current settings in `database.py`:
```python
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG,
)
```

- `pool_size=10`: keeps 10 connections open at all times
- `max_overflow=20`: allows up to 30 total connections under load
- `pool_pre_ping=True`: tests connections before use (prevents "connection closed" errors after Railway maintenance)
- `echo=settings.DEBUG`: **make sure this is False in production** -- SQL logging is very verbose

For Railway's typical Postgres instances, 10+20 connections is fine. If you see `too many connections` errors, reduce `pool_size` to 5 and `max_overflow` to 10.

### Celery Worker Configuration

Current settings in `celery_app.py`:
```python
worker_prefetch_multiplier=1,     # Fetch one task at a time
worker_max_tasks_per_child=100,   # Restart worker after 100 tasks
task_time_limit=7200,             # 2 hours max per task
task_soft_time_limit=6900,        # Soft limit at 1h55m
```

These are correct for AI-heavy workloads:
- `prefetch_multiplier=1` means the worker only grabs one task at a time (since each AI analysis task is long-running and memory-intensive)
- `max_tasks_per_child=100` prevents memory leaks by recycling the worker process
- The 2-hour time limit is generous but appropriate -- a full 5-step analysis with multiple LLM calls can take 10-20 minutes

**Scaling:** If you need to process videos faster, deploy a second worker service on Railway pointing to the same Redis broker. Celery handles work distribution automatically.

### Redis Memory

Redis is used for two things:
1. Celery task broker (message queue)
2. Celery result backend (task results)

Expected memory usage is very low (< 50 MB) because:
- Task messages are small (just video IDs)
- Results expire after 1 hour (`result_expires=3600`)
- There is no caching layer using Redis

Monitor Redis memory in Railway. If it grows unexpectedly, tasks may be failing without cleanup. Check for stuck tasks:
```bash
railway run celery -A app.tasks.celery_app inspect active
railway run celery -A app.tasks.celery_app inspect reserved
```

### Frontend Performance

Vite (v7) already optimizes the build:
- Tree shaking (removes unused code)
- Minification (smaller file sizes)
- Code splitting (lazy loading of routes)
- Content-hashed filenames (cache-safe)

Cloudflare Pages serves these assets from a global CDN with automatic compression (Brotli/gzip). No additional frontend optimization is needed.

The frontend dependencies are reasonable (~15 runtime deps). The main bundle should be under 500 KB gzipped. If it grows, check for large dependencies with:
```bash
cd frontend && npx vite-bundle-visualizer
```

### Video Streaming

Videos are served via presigned URLs directly from R2 to the browser. The backend only generates the URL (fast, <50ms), it does not proxy the video bytes. This means:
- No load on Railway for video playback
- R2 handles all bandwidth (free egress)
- Playback performance depends on the user's connection to the nearest Cloudflare edge

### API Response Times

Expected response times for key endpoints:

| Endpoint | Expected | What Affects It |
|----------|----------|-----------------|
| `GET /health` | <10ms | Nothing (no DB query) |
| `GET /api/videos/{id}` | <50ms | Single DB query |
| `GET /api/videos/{id}/playback-url` | <100ms | DB query + presigned URL generation |
| `POST /api/videos/{id}/upload` | 1-60s | File size + R2 upload speed |
| `POST /api/videos/{id}/analyze` | <200ms | Just enqueues a Celery task |
| `GET /api/videos/{id}/analysis` | <100ms | DB query + JSON serialization |

If any of these are significantly slower, check:
1. Database query performance (`echo=True` temporarily to see SQL)
2. Railway region (should be close to your users)
3. Network latency between Railway and R2

---

## 8. Incident Response

Things will break. Here is what to do when they do.

### Railway Is Down

**Symptoms:** Frontend shows API errors, `api.yourdomain.com` returns 502/503.

**Check:** Visit [status.railway.app](https://status.railway.app) for platform-wide issues.

**Actions:**
1. Check Railway dashboard for deployment status
2. Check service logs for crash loops
3. If Railway platform is down, wait for resolution (nothing you can do)
4. Frontend continues to load (served by Cloudflare Pages), but all API features are broken
5. Communicate to users if outage is extended

### Celery Worker Crashes

**Symptoms:** Analysis or transcription tasks are stuck in "processing" state forever.

**Check:** Railway dashboard > worker service > logs.

**Common causes:**
- **Out of Memory (OOM):** Worker killed because LLM response was too large. Fix: increase Railway memory limit or reduce `CLAUDE_MAX_TOKENS`.
- **Task timeout:** Task exceeded `task_time_limit` (2 hours). Fix: check if the LLM API is slow/hanging.
- **Dependency error:** Import failure or missing package after deploy.

**Actions:**
1. Railway auto-restarts crashed services, so check if it recovered
2. Check logs for the specific error
3. Failed tasks may need to be manually re-triggered from the UI (click "Analyze" again)
4. If tasks are stuck in Redis, purge the queue:
   ```bash
   railway run celery -A app.tasks.celery_app purge
   ```

### R2 Is Unreachable

**Symptoms:** Video upload fails, video playback fails, presigned URLs return errors.

**Check:** Visit [cloudflarestatus.com](https://www.cloudflarestatus.com/) for R2 status.

**Actions:**
1. Video upload and playback are broken, but other features (viewing analysis, projects) still work
2. Wait for Cloudflare to resolve
3. R2 outages are rare (Cloudflare's infrastructure is highly redundant)

### Clerk Is Down

**Symptoms:** Users cannot log in. The login page hangs or errors.

**Check:** Visit [status.clerk.com](https://status.clerk.com/).

**Actions:**
1. Users with active sessions may continue to work briefly (JWT tokens are valid for ~5 minutes)
2. New logins are impossible until Clerk recovers
3. No action you can take -- wait for Clerk to resolve
4. If this is a recurring problem, consider adding a local auth fallback (significant development effort)

### LLM Provider Is Down (OpenRouter / Anthropic)

**Symptoms:** Analysis tasks fail with API errors. Celery logs show connection errors or 500s from the LLM provider.

**Check:** Visit [status.openrouter.ai](https://status.openrouter.ai/) or [status.anthropic.com](https://status.anthropic.com/).

**Actions:**
1. The codebase uses `tenacity` for retries -- tasks will retry automatically
2. If the outage is long, tasks will eventually hit `task_time_limit` and fail
3. Failed analyses can be re-triggered from the UI once the provider is back
4. If using OpenRouter, you could switch to a different model/provider in the config
5. No data is lost -- the transcript is preserved, only the analysis step fails

### Database Is Full

**Symptoms:** INSERT operations fail. Logs show "disk full" or "insufficient storage" errors.

**Check:** Railway dashboard > Postgres service > Storage metrics.

**Actions:**
1. Check what is using space:
   ```sql
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC;
   ```
2. The `raw_transcript` JSONB field on transcripts is likely the largest -- each transcript can be several MB
3. Old analysis results (`chunks`, `inferences`, `patterns`, `insights`, `principles` JSONB fields) can also be large
4. Options: scale up Railway Postgres storage, or clean out old/unused project data
5. Take a backup before any cleanup operation

### Quick Contacts Checklist

Keep these bookmarked:
- Railway status: `https://status.railway.app`
- Cloudflare status: `https://www.cloudflarestatus.com`
- Clerk status: `https://status.clerk.com`
- Sentry dashboard: `https://sentry.io` (your org)
- UptimeRobot dashboard: `https://uptimerobot.com/dashboard`

---

## Checklist

### Monitoring
- [ ] Create Sentry account and projects (backend + frontend)
- [ ] Install `sentry-sdk[fastapi]` in backend
- [ ] Install `@sentry/react` in frontend
- [ ] Add Sentry DSN to Railway and Cloudflare Pages environment variables
- [ ] Set up UptimeRobot monitors for frontend and API health
- [ ] Configure email alerts for downtime

### Security
- [ ] Install `slowapi` and configure rate limiting
- [ ] Set `ALLOWED_ORIGINS` to production domains on Railway
- [ ] Tighten CORS `allow_methods` and `allow_headers`
- [ ] Add security headers middleware to FastAPI
- [ ] Verify `echo=False` for SQLAlchemy in production (check `settings.DEBUG` is `False`)
- [ ] **Decision:** Add MIME type checking for uploads? (requires `python-magic`)

### Backups
- [ ] Set up R2 backup bucket (or prefix in existing bucket)
- [ ] Run a manual pg_dump and verify the backup
- [ ] Set up automated daily backups (GitHub Actions or Railway cron)
- [ ] Configure R2 lifecycle rules for backup retention
- [ ] Store all environment variables in a password manager
- [ ] Create `env.example` file with variable names (no values)

### Operations
- [ ] Document the hibernate procedure for end-of-semester
- [ ] Test the full hibernate/resume cycle at least once before relying on it
- [ ] Set up structured JSON logging for production
- [ ] Bookmark all status pages
