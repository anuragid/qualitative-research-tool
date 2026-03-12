# Railway Deployment Guide

This guide walks through deploying the Qualitative Research Tool backend (FastAPI API + Celery worker) and its data services (PostgreSQL, Redis) on Railway. The frontend is deployed separately on Cloudflare Pages (see `02-cloudflare-frontend.md` when available).

**Prerequisites:**
- A GitHub account with the repository pushed
- A Railway account (https://railway.com -- the Pro plan at $5/month is required for production workloads)
- Railway CLI installed locally (`npm install -g @railway/cli` or `brew install railway`)
- Familiarity with Docker basics

**Depends on these migration docs being complete first:**
- LLM migration (ANTHROPIC_API_KEY -> OPENROUTER_API_KEY) -- needed for correct env vars
- Storage migration (AWS S3 -> Cloudflare R2) -- needed for correct env vars
- Auth migration (Cognito -> Clerk) -- needed for correct env vars

> If those migrations are not yet complete, you can still deploy to Railway using the existing env vars. Update them later.

---

## Table of Contents

1. [Railway Project Setup](#1-railway-project-setup)
2. [Services Configuration](#2-services-configuration)
3. [Environment Variables](#3-environment-variables)
4. [Networking](#4-networking)
5. [Dockerfile Changes](#5-dockerfile-changes)
6. [Railway CLI](#6-railway-cli)
7. [Deployment Workflow](#7-deployment-workflow)
8. [Spending Cap Configuration](#8-spending-cap-configuration)
9. [Scaling](#9-scaling)
10. [Hibernate / Resume for Semester Breaks](#10-hibernate--resume-for-semester-breaks)

---

## 1. Railway Project Setup

### 1.1 Create a Railway Account and Project

1. Go to https://railway.com and sign up (GitHub OAuth is easiest).
2. Subscribe to the **Pro plan** ($5/month). The free Starter plan has limits that will block production use (500 execution hours, 5 GB disk, no persistent volumes).
3. From the Railway dashboard, click **"New Project"**.
4. Select **"Empty Project"** -- we will add services manually for full control.
5. Name the project something recognizable, e.g., `qualitative-research-tool`.

### 1.2 Connect to GitHub

1. In the project, click **"New Service" -> "GitHub Repo"**.
2. Authorize Railway to access your GitHub account if not already done.
3. Select the repository containing the monorepo.
4. Railway will detect the repo structure. We will configure the root directory per-service in the next section.

> **Decision point:** You can either connect the same GitHub repo to both the API and Worker services (recommended) or deploy via CLI pushes. The GitHub connection gives you automatic deploys on push.

### 1.3 Project Structure

The repository is a monorepo:

```
qualitative-research-tool/
  backend/                  # FastAPI + Celery (Python)
    Dockerfile.unified      # Shared Dockerfile for API and Worker
    app/
    alembic/
    requirements.txt
    scripts/startup.sh
  frontend/                 # React + Vite + TypeScript
    package.json
    src/
  docker-compose.yml        # Local dev only -- not used on Railway
```

Railway will build the `backend/` directory for both the API and Worker services. The frontend is deployed elsewhere (Cloudflare Pages).

---

## 2. Services Configuration

You will create **four services** in the Railway project:

| Service | Type | Purpose |
|---------|------|---------|
| `api` | Custom (Dockerfile) | FastAPI web server |
| `worker` | Custom (Dockerfile) | Celery background task processor |
| `postgres` | Plugin (one-click) | PostgreSQL database |
| `redis` | Plugin (one-click) | Redis for Celery broker + result backend |

### 2.1 PostgreSQL

**Setup:**

1. In your Railway project, click **"New Service" -> "Database" -> "PostgreSQL"**.
2. Railway provisions a managed Postgres instance immediately.
3. Railway auto-creates the following reference variables in the Postgres service:
   - `DATABASE_URL` (full connection string)
   - `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

**Configuration:**

- Railway Postgres defaults to the latest stable version (currently Postgres 16+). This is fine -- the app was running Postgres 17 on AWS and 15 locally; SQLAlchemy abstracts version differences.
- No manual configuration is needed for connection pooling at the Postgres level. The app's SQLAlchemy pool settings (`pool_size=10`, `max_overflow=20` in `backend/app/database.py`) handle connection management.

**Migration strategy (Alembic):**

The startup script (`backend/scripts/startup.sh`) runs `alembic upgrade head` on every boot, so migrations apply automatically on deploy. For the initial deploy this will create all tables from scratch.

If you need to run a migration manually:
```bash
railway run --service api alembic upgrade head
```

**Checklist:**
- [ ] PostgreSQL service created
- [ ] Confirmed `DATABASE_URL` variable is available in the Postgres service's Variables tab

### 2.2 Redis

**Setup:**

1. Click **"New Service" -> "Database" -> "Redis"**.
2. Railway provisions a managed Redis instance.
3. Railway auto-creates `REDIS_URL` (and `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`).

**Usage in this app:**

- Celery broker (task queue)
- Celery result backend (task results, expire after 1 hour)

No additional Redis configuration is needed. The default Railway Redis settings are sufficient.

**Checklist:**
- [ ] Redis service created
- [ ] Confirmed `REDIS_URL` variable is available in the Redis service's Variables tab

### 2.3 API Service (FastAPI)

**Setup:**

1. Click **"New Service" -> "GitHub Repo"** and select the repository.
2. In the service Settings tab, configure:
   - **Root Directory:** `backend`
   - **Builder:** `Dockerfile`
   - **Dockerfile Path:** `Dockerfile.unified` (relative to root directory)
   - **Watch Paths:** `backend/**` (only redeploy when backend files change)

**Start command override:**

In the service Settings, set the **Custom Start Command**:

```
/app/scripts/startup.sh api
```

This uses the existing startup script which:
1. Waits for the database to be ready
2. Runs `alembic upgrade head` (database migrations)
3. Starts uvicorn on `0.0.0.0:8000`

> **Important:** The startup script currently listens on port 8000 (hardcoded in `startup.sh`). Railway injects a `PORT` environment variable. You have two options:
>
> **Option A (recommended):** Modify `startup.sh` to use `$PORT` if set:
> ```bash
> exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
> ```
>
> **Option B:** Set `PORT=8000` in the Railway environment variables for this service. Railway will route traffic to whatever port you expose.
>
> Option A is the better practice because Railway may change the assigned port.

**Health check:**

In the service Settings, configure the health check:
- **Health Check Path:** `/health`
- **Timeout:** 60 seconds (the app has a 60-second start period due to DB connection + migrations)

The `/health` endpoint is defined in `backend/app/main.py` and returns:
```json
{"status": "healthy", "environment": "production"}
```

**Resource recommendations:**

- **Memory:** 512 MB should be sufficient. The API is lightweight (FastAPI + SQLAlchemy).
- **CPU:** Railway allocates fractional vCPUs. The default is fine to start.
- You can set resource limits in the service Settings if desired, but Railway's pay-per-use model means idle resources do not cost extra.

**Checklist:**
- [ ] API service created and linked to GitHub repo
- [ ] Root directory set to `backend`
- [ ] Builder set to Dockerfile, path set to `Dockerfile.unified`
- [ ] Watch paths set to `backend/**`
- [ ] Start command configured (or startup.sh modified for `$PORT`)
- [ ] Health check configured at `/health`

### 2.4 Worker Service (Celery)

The worker uses the **same Docker image** as the API but runs a different process.

**Setup:**

1. Click **"New Service" -> "GitHub Repo"** and select the **same repository**.
2. In the service Settings tab, configure:
   - **Root Directory:** `backend`
   - **Builder:** `Dockerfile`
   - **Dockerfile Path:** `Dockerfile.unified`
   - **Watch Paths:** `backend/**`

**Start command override:**

Set the **Custom Start Command**:

```
/app/scripts/startup.sh worker
```

This tells the startup script to:
1. Wait for the database to be ready
2. Run `alembic upgrade head` (safe to run from multiple services -- Alembic uses a lock)
3. Start the Celery worker: `celery -A app.tasks.celery_app worker --loglevel=info`

**Concurrency settings (already configured in code):**

From `backend/app/tasks/celery_app.py`:
- `worker_prefetch_multiplier=1` -- processes one task at a time (important for long-running AI analysis tasks)
- `worker_max_tasks_per_child=100` -- restarts the worker process after 100 tasks to prevent memory leaks
- `task_time_limit=7200` -- hard kill after 2 hours
- `task_soft_time_limit=6900` -- graceful timeout at 1 hour 55 minutes

These are appropriate for AI/transcription workloads. No changes needed.

**Resource recommendations:**

- **Memory:** 1 GB recommended. The worker runs AI analysis tasks (LangGraph/Claude) that can be memory-intensive with large transcripts.
- **CPU:** Default is fine. Tasks are I/O-bound (waiting on external APIs), not CPU-bound.

**No health check needed:** Railway does not require a health check for worker services. The Celery worker does not expose an HTTP port.

> **Note:** Both the API and Worker services build the same Docker image. Railway will build it twice (once per service). This is expected. Railway does cache Docker layers, so subsequent builds are fast.

**Checklist:**
- [ ] Worker service created and linked to GitHub repo
- [ ] Root directory set to `backend`
- [ ] Builder set to Dockerfile, path set to `Dockerfile.unified`
- [ ] Watch paths set to `backend/**`
- [ ] Start command set to `/app/scripts/startup.sh worker`

---

## 3. Environment Variables

### 3.1 How Railway Variables Work

Railway has a concept of **shared variables** and **service-specific variables**:

- Variables set on a **database service** (Postgres, Redis) can be **referenced** from other services using the syntax `${{Postgres.DATABASE_URL}}`.
- You can set **shared variables** at the project level, or set them per-service.

For this project, the API and Worker need **identical** environment variables. The easiest approach is to use **Railway's shared variables** feature or to set variables on each service individually.

### 3.2 Variables Railway Auto-Provides

These come from the database plugins. Reference them in the API and Worker services:

| Variable | Source | Reference Syntax |
|----------|--------|------------------|
| `DATABASE_URL` | PostgreSQL service | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | Redis service | `${{Redis.REDIS_URL}}` |
| `PORT` | Railway runtime | Auto-injected (do not set manually) |

> **Important:** Railway's Postgres `DATABASE_URL` uses the format `postgresql://user:pass@host:port/db`. This is compatible with SQLAlchemy. If Railway provides `postgres://` instead of `postgresql://`, you may need to add a variable that performs the replacement. Check the actual value after provisioning.

### 3.3 Variables You Must Set Manually

Set these on **both the API and Worker services** (or use shared variables):

#### Application Settings

| Variable | Value | Notes |
|----------|-------|-------|
| `APP_ENV` | `production` | Switches off debug mode behavior |
| `DEBUG` | `False` | Disables SQL query logging, uses production uvicorn |
| `PROJECT_NAME` | `Qualitative Research Tool` | |
| `API_V1_PREFIX` | `/api` | |

#### CORS

| Variable | Value | Notes |
|----------|-------|-------|
| `ALLOWED_ORIGINS` | `https://your-app.pages.dev,https://your-custom-domain.com` | Comma-separated list. Must include the Cloudflare Pages URL and any custom domain. |

#### AI APIs

| Variable | Value | Notes |
|----------|-------|-------|
| `OPENROUTER_API_KEY` | `your-api-key-here` | **After LLM migration.** Replaces `ANTHROPIC_API_KEY`. |
| `ANTHROPIC_API_KEY` | `your-api-key-here` | **Before LLM migration.** Keep this until the code is updated. |
| `ASSEMBLYAI_API_KEY` | `your-api-key-here` | For video transcription. |

#### Storage (Cloudflare R2)

| Variable | Value | Notes |
|----------|-------|-------|
| `R2_ACCESS_KEY_ID` | `your-key-here` | **After storage migration.** Replaces `AWS_ACCESS_KEY_ID`. |
| `R2_SECRET_ACCESS_KEY` | `your-secret-here` | **After storage migration.** Replaces `AWS_SECRET_ACCESS_KEY`. |
| `R2_BUCKET_NAME` | `your-bucket-name` | **After storage migration.** Replaces `AWS_BUCKET_NAME`. |
| `R2_ENDPOINT_URL` | `https://your-account-id.r2.cloudflarestorage.com` | **After storage migration.** New variable. |
| `AWS_ACCESS_KEY_ID` | `your-key-here` | **Before storage migration.** Keep until code is updated. |
| `AWS_SECRET_ACCESS_KEY` | `your-secret-here` | **Before storage migration.** Keep until code is updated. |
| `AWS_REGION` | `auto` | **Before storage migration.** |
| `AWS_BUCKET_NAME` | `your-bucket-name` | **Before storage migration.** |

#### Authentication (Clerk)

| Variable | Value | Notes |
|----------|-------|-------|
| `CLERK_SECRET_KEY` | `your-clerk-secret-key` | **After auth migration.** |
| `CLERK_PUBLISHABLE_KEY` | `your-clerk-publishable-key` | **After auth migration.** |
| `CLERK_JWT_KEY` | `your-clerk-jwt-key` | **After auth migration.** Public key for JWT verification. |
| `USE_COGNITO_AUTH` | `False` | Set to False after migrating away from Cognito. |

#### Claude Model Settings

| Variable | Value | Notes |
|----------|-------|-------|
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | Or the model string used by OpenRouter after LLM migration. |
| `CLAUDE_MAX_TOKENS` | `4096` | |
| `CLAUDE_TEMPERATURE` | `0.7` | |

#### File Upload Settings

| Variable | Value | Notes |
|----------|-------|-------|
| `MAX_FILE_SIZE_MB` | `500` | |

### 3.4 Setting Variables via CLI

```bash
# Link your local project to Railway first
railway link

# Set a variable on the api service
railway variables set OPENROUTER_API_KEY=your-api-key-here --service api

# Set a variable on the worker service
railway variables set OPENROUTER_API_KEY=your-api-key-here --service worker

# Reference a database variable
railway variables set DATABASE_URL='${{Postgres.DATABASE_URL}}' --service api
railway variables set REDIS_URL='${{Redis.REDIS_URL}}' --service api
railway variables set DATABASE_URL='${{Postgres.DATABASE_URL}}' --service worker
railway variables set REDIS_URL='${{Redis.REDIS_URL}}' --service worker
```

### 3.5 Variable Checklist

For both `api` and `worker` services:

- [ ] `DATABASE_URL` references Postgres service
- [ ] `REDIS_URL` references Redis service
- [ ] `APP_ENV` = `production`
- [ ] `DEBUG` = `False`
- [ ] `ALLOWED_ORIGINS` includes frontend domain(s)
- [ ] AI API key(s) set (ANTHROPIC or OPENROUTER depending on migration status)
- [ ] `ASSEMBLYAI_API_KEY` set
- [ ] Storage credentials set (AWS or R2 depending on migration status)
- [ ] Auth credentials set (Clerk keys)
- [ ] Claude model settings set

---

## 4. Networking

### 4.1 Internal (Private) Networking

Railway services within the same project communicate over a **private network**. Each service gets an internal hostname:

- Postgres: accessible via the connection string in `DATABASE_URL` (Railway handles the internal routing)
- Redis: accessible via the connection string in `REDIS_URL`
- API: accessible internally at `api.railway.internal:PORT`

The API and Worker services do not communicate directly with each other. They coordinate through the shared PostgreSQL database (task status) and Redis (Celery task queue). This means:

- The Worker picks up tasks from Redis (Celery broker)
- The Worker writes results to Redis (Celery result backend) and PostgreSQL (analysis data)
- The API reads results from PostgreSQL

No special networking configuration is needed between the API and Worker.

### 4.2 Public Networking (API Service Only)

Only the API service needs to be publicly accessible.

1. In the API service settings, go to **"Networking"** or **"Public Networking"**.
2. Click **"Generate Domain"** to get a Railway-provided domain (e.g., `your-app-production.up.railway.app`).
3. Alternatively, add a **custom domain**:
   - Click **"Add Custom Domain"**
   - Enter your domain (e.g., `api.your-domain.com`)
   - Railway will provide a CNAME record value
   - Add the CNAME record in your DNS provider (e.g., Cloudflare DNS)
   - Railway handles TLS/HTTPS automatically

> **The Worker service should NOT have a public domain.** It does not serve HTTP traffic.

### 4.3 CORS Configuration

The CORS configuration is handled in `backend/app/main.py` using the `ALLOWED_ORIGINS` environment variable. Set this to include:

- Your Cloudflare Pages domain: `https://your-app.pages.dev`
- Any custom domain pointing to the frontend: `https://your-custom-domain.com`
- For development/testing, you might temporarily add: `http://localhost:5173`

Example value:
```
ALLOWED_ORIGINS=https://your-app.pages.dev,https://your-custom-domain.com
```

The app parses this comma-separated string in `config.py` via the `allowed_origins_list` property.

### 4.4 Networking Checklist

- [ ] API service has a public domain (generated or custom)
- [ ] Worker service does NOT have a public domain
- [ ] CORS `ALLOWED_ORIGINS` includes the frontend domain(s)
- [ ] If using a custom domain, DNS CNAME record is configured
- [ ] Verified that the frontend can reach the API (test with `/health` endpoint)

---

## 5. Dockerfile Changes

The current `backend/Dockerfile.unified` needs modifications for Railway.

### 5.1 Remove Platform Constraint

**Current (line 4 and line 23):**
```dockerfile
FROM --platform=linux/amd64 python:3.11-slim as builder
...
FROM --platform=linux/amd64 python:3.11-slim
```

**Change to:**
```dockerfile
FROM python:3.11-slim as builder
...
FROM python:3.11-slim
```

Railway builds on its own infrastructure and handles platform selection. The `--platform=linux/amd64` constraint was needed for AWS ECS Fargate but is unnecessary (and potentially slower to build) on Railway.

### 5.2 Update Startup Script for Railway PORT

Modify `backend/scripts/startup.sh` to respect the `$PORT` environment variable:

**Current (line 72-76):**
```bash
if [ "$IS_ECS" = true ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
```

**Change to:**
```bash
if [ "$APP_ENV" = "production" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
else
    exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload
fi
```

This change:
- Uses `$PORT` (injected by Railway) with a fallback to 8000 for local development
- Switches the production check from ECS detection to `APP_ENV` (more portable)

### 5.3 Update Dockerfile EXPOSE

**Current:**
```dockerfile
EXPOSE 8000
```

**Change to:**
```dockerfile
EXPOSE ${PORT:-8000}
```

Or simply remove the `EXPOSE` line. Railway does not use `EXPOSE` to determine the port -- it uses the `PORT` environment variable. The `EXPOSE` directive is documentation-only in Docker.

### 5.4 Recommended .dockerignore Updates

The current `.dockerignore` at `backend/.dockerignore` is reasonable. Add these entries if not present:

```dockerignore
# Existing entries are fine, add:
.env.docker-local
.env.*
*.env
alembic/versions/__pycache__/
scripts/__pycache__/
```

> **Important:** The current `.dockerignore` excludes `*.md` and `docs/`. This is good for build size but means documentation is not available inside the container (which is fine).

### 5.5 Multi-Stage Build Considerations

The Dockerfile already uses a multi-stage build (builder stage for pip install, production stage for runtime). This is good practice. No changes needed here.

**Decision point:** The Dockerfile uses `python:3.11-slim`. Consider whether to upgrade to `python:3.12-slim` for performance improvements. The codebase does not use any Python 3.12-specific features, so 3.11 is safe. If you upgrade, test locally first.

### 5.6 Dockerfile Changes Checklist

- [ ] Removed `--platform=linux/amd64` from both `FROM` lines
- [ ] Updated `startup.sh` to use `${PORT:-8000}`
- [ ] Updated `startup.sh` to check `APP_ENV` instead of `ECS_CONTAINER_METADATA_URI`
- [ ] Updated `.dockerignore` to exclude env files
- [ ] Tested Docker build locally: `docker build -t qrt-test -f Dockerfile.unified .`

---

## 6. Railway CLI

### 6.1 Installation

```bash
# macOS
brew install railway

# or via npm (any OS)
npm install -g @railway/cli
```

### 6.2 Authentication

```bash
# Login (opens browser for OAuth)
railway login

# Verify login
railway whoami
```

### 6.3 Link to Project

```bash
# Navigate to your repo root
cd /path/to/qualitative-research-tool

# Link to your Railway project (interactive prompt to select project + environment)
railway link
```

### 6.4 Essential Commands

```bash
# View project status
railway status

# View logs for a service (streams live)
railway logs --service api
railway logs --service worker

# Set environment variables
railway variables set KEY=value --service api

# List environment variables
railway variables --service api

# Deploy manually from local code (without pushing to GitHub)
railway up --service api

# Open the Railway dashboard in browser
railway open

# Run a one-off command inside a service's environment
# (has access to all the service's env vars, including DATABASE_URL)
railway run --service api alembic upgrade head
railway run --service api python -c "from app.database import engine; print(engine.url)"

# Open a shell with the service's environment variables loaded
railway run --service api bash
```

### 6.5 Running Database Migrations Manually

```bash
# Run pending migrations
railway run --service api alembic upgrade head

# Check current migration version
railway run --service api alembic current

# Generate a new migration (after model changes)
railway run --service api alembic revision --autogenerate -m "description of change"

# Rollback one migration
railway run --service api alembic downgrade -1
```

### 6.6 Database Shell Access

```bash
# Connect to PostgreSQL directly
railway run --service postgres psql

# Or use the connection string
railway run --service api psql $DATABASE_URL
```

---

## 7. Deployment Workflow

### 7.1 Automatic Deploys (Recommended)

Once the GitHub repo is connected:

1. Push to the configured branch (typically `main`):
   ```bash
   git push origin main
   ```
2. Railway detects the push and starts building both `api` and `worker` services.
3. Each service builds its Docker image from `backend/Dockerfile.unified`.
4. Railway runs the health check on the API service (`/health`).
5. If the health check passes, Railway swaps traffic to the new deployment.
6. The old deployment is stopped.

**Watch paths** ensure that pushes that only change `frontend/` files do not trigger backend rebuilds.

### 7.2 Manual Deploys via CLI

If you need to deploy without pushing to GitHub:

```bash
# Deploy the api service from local code
railway up --service api

# Deploy the worker service from local code
railway up --service worker
```

This builds and deploys directly from your working directory. Useful for testing changes before committing.

### 7.3 Zero-Downtime Deployments

Railway performs **rolling deployments** by default:

1. The new container starts alongside the old one.
2. The health check runs on the new container.
3. Traffic shifts to the new container only after the health check passes.
4. The old container is drained and stopped.

The 60-second `start_period` in the health check gives time for database migrations to run before Railway starts checking health.

### 7.4 Rollback

If a deploy goes wrong:

**Via Dashboard:**
1. Go to the service in the Railway dashboard.
2. Click on **"Deployments"**.
3. Find the last working deployment.
4. Click **"Rollback"** (or **"Redeploy"** on the working version).

**Via CLI:**
```bash
# List recent deployments
railway deployments --service api

# Rollback to a specific deployment
railway rollback --service api
```

### 7.5 Deploy Checklist (First Deploy)

- [ ] All environment variables set on both `api` and `worker` services
- [ ] Dockerfile changes committed and pushed
- [ ] Push to `main` branch triggers builds
- [ ] API service health check passes (`/health` returns 200)
- [ ] Worker service starts without errors (check logs)
- [ ] Test API endpoint: `curl https://your-app.up.railway.app/health`
- [ ] Test a full workflow (create project, upload video, trigger analysis)

---

## 8. Spending Cap Configuration

Railway bills based on usage (CPU, memory, network, disk). Setting a spending cap prevents surprise bills.

### 8.1 Set the Cap

1. Go to the Railway dashboard.
2. Click on your **project name**, then go to **"Settings"**.
3. Under **"Usage" or "Billing"**, find the **"Spending Cap"** or **"Usage Limit"** setting.
4. Alternatively, manage billing at the account level: **Account Settings -> Billing -> Usage Limits**.

### 8.2 Recommended Cap Amount

| Component | Estimated Monthly Cost |
|-----------|----------------------|
| Pro plan | $5 |
| PostgreSQL (1 GB RAM, 1 GB disk) | ~$5-7 |
| Redis (256 MB RAM) | ~$3-5 |
| API service (512 MB RAM, low traffic) | ~$5-8 |
| Worker service (1 GB RAM, sporadic) | ~$5-10 |
| Network egress | ~$1-2 |
| **Total estimate** | **~$24-37** |

**Recommended spending cap: $50/month**

This provides headroom for:
- Occasional traffic spikes
- Longer-running analysis tasks
- Database growth

> **Note:** Railway charges based on actual usage, not reserved resources. During quiet periods (no active analysis tasks), the worker consumes minimal resources. Cost is primarily driven by how much you use the tool.

### 8.3 What Happens When the Cap is Hit

- Railway **pauses all services** in the project.
- You receive an email notification.
- Services remain paused until you raise the cap or a new billing cycle begins.
- **Data is preserved** -- PostgreSQL and Redis volumes are not deleted.
- To resume: raise the cap or wait for the next billing cycle, then manually restart services.

> **Risk mitigation:** Monitor usage in the Railway dashboard weekly during the first month to calibrate actual costs. Adjust the cap after you have a baseline.

---

## 9. Scaling

### 9.1 When to Scale

Signs you need to scale:

- **API response times increasing:** Users experiencing slow page loads.
- **Worker task queue backing up:** Many tasks pending in Redis, analysis taking unusually long.
- **Out-of-memory errors:** Check logs for OOM kills.

For a research tool used by a small team, the default single-instance setup should be sufficient. Scaling is a future concern.

### 9.2 Vertical Scaling (Scale Up)

Increase resources for a single instance:

1. In the service Settings, adjust **Memory** and/or **CPU** limits.
2. Redeploy the service.

Recommended increments:
- API: 512 MB -> 1 GB memory
- Worker: 1 GB -> 2 GB memory (if processing very long transcripts)

### 9.3 Horizontal Scaling (Scale Out)

Run multiple instances of a service:

1. In the service Settings, increase the **"Replicas"** count.
2. Railway load-balances HTTP traffic across API replicas automatically.

**Considerations for this app:**

- **API:** Safe to run multiple replicas. FastAPI is stateless. Database connections are pooled per-instance, so with 2 replicas you would have up to 20 active connections (2 x `pool_size=10`).
- **Worker:** Safe to run multiple replicas. Celery handles distributed task processing natively. With `worker_prefetch_multiplier=1`, each worker processes one task at a time. Two workers = two concurrent analysis tasks.

### 9.4 Scaling Checklist

- [ ] Monitor resource usage for 1-2 weeks after initial deploy
- [ ] Set up Railway's built-in metrics alerts if available
- [ ] Adjust memory limits if OOM errors occur
- [ ] Consider a second worker replica only if task queue regularly backs up

---

## 10. Hibernate / Resume for Semester Breaks

If the tool will not be used for extended periods (e.g., summer break, winter break), you can hibernate the project to save money.

### 10.1 Hibernate Procedure

**Step 1: Export the database**

```bash
# Dump the database to a local file
railway run --service api pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Verify the dump file is not empty
ls -lh backup-*.sql
wc -l backup-*.sql
```

Store this backup file somewhere safe (local machine, Google Drive, etc.).

**Step 2: Stop all services**

Option A -- Remove the services (most cost-effective):
1. In the Railway dashboard, delete the `api`, `worker`, `postgres`, and `redis` services.
2. This stops all billing immediately.
3. The GitHub connection and project settings remain.

Option B -- Scale to zero (simpler, minimal cost):
1. In each service's Settings, set **Replicas to 0** (if available).
2. Or use the dashboard to **pause** each service.
3. Note: Postgres and Redis may still incur storage costs even when paused.

> **Recommendation:** Option A (delete services) for breaks longer than 1 month. Option B (pause) for breaks shorter than 1 month.

**Step 3: Note your configuration**

Before deleting services, save a record of:
- All environment variables (export from dashboard or `railway variables --service api`)
- Custom domain configuration
- Any resource limit settings

```bash
# Save env vars to a local file (keep this secure, it contains API keys)
railway variables --service api > .railway-env-backup-api.txt
railway variables --service worker > .railway-env-backup-worker.txt
```

**Step 4: Spending cap**

- If you deleted services (Option A): costs drop to $5/month (Pro plan only). Consider downgrading to the free plan if the break is very long, but note you will lose project history.
- If you paused services (Option B): reduce the spending cap to $15 to cover just the Pro plan + idle storage.

### 10.2 Resume Procedure

**Step 1: Verify plan**

Make sure you are on the Railway Pro plan.

**Step 2: Recreate services (if deleted)**

If you deleted services in the hibernate step:

1. Create PostgreSQL service (New Service -> Database -> PostgreSQL).
2. Create Redis service (New Service -> Database -> Redis).
3. Create API service (New Service -> GitHub Repo, configure root directory, Dockerfile, start command as described in Section 2.3).
4. Create Worker service (same as Section 2.4).

**Step 3: Restore environment variables**

Re-enter all environment variables from your backup:
- Set `DATABASE_URL` and `REDIS_URL` references to the new database services.
- Set all API keys and configuration values.

**Step 4: Restore the database**

```bash
# Connect to the new Postgres and restore
railway run --service api psql $DATABASE_URL < backup-YYYYMMDD.sql

# Verify tables exist
railway run --service api psql $DATABASE_URL -c "\dt"

# Run any migrations that happened during the break
railway run --service api alembic upgrade head
```

**Step 5: Deploy and verify**

1. Push any pending code changes to trigger a deploy (or `railway up --service api` and `railway up --service worker`).
2. Verify health check: `curl https://your-app.up.railway.app/health`
3. Verify data is intact: log in and check that projects/videos/analyses are present.

**Step 6: Reset spending cap**

Raise the spending cap back to $50/month (or your preferred amount).

### 10.3 Hibernate/Resume Checklist

**Hibernate:**
- [ ] Database exported with `pg_dump`
- [ ] Backup file stored securely
- [ ] Environment variables saved locally
- [ ] Services deleted or paused
- [ ] Spending cap reduced

**Resume:**
- [ ] Pro plan active
- [ ] Services recreated (if deleted)
- [ ] Environment variables restored
- [ ] Database restored from backup
- [ ] Migrations run (`alembic upgrade head`)
- [ ] Health check passes
- [ ] Data verified in UI
- [ ] Spending cap restored to $50

---

## Appendix A: Quick Reference -- All Services at a Glance

```
Railway Project: qualitative-research-tool
|
|-- postgres (Plugin: PostgreSQL)
|   Provides: DATABASE_URL
|
|-- redis (Plugin: Redis)
|   Provides: REDIS_URL
|
|-- api (Custom: GitHub -> backend/Dockerfile.unified)
|   Start: /app/scripts/startup.sh api
|   Port: $PORT (Railway-assigned)
|   Health: /health
|   Public: yes (custom domain or *.up.railway.app)
|   Consumes: DATABASE_URL, REDIS_URL, all API keys
|
|-- worker (Custom: GitHub -> backend/Dockerfile.unified)
|   Start: /app/scripts/startup.sh worker
|   Port: none (no HTTP)
|   Health: none
|   Public: no
|   Consumes: DATABASE_URL, REDIS_URL, all API keys
```

## Appendix B: Troubleshooting

### Build fails with "platform" errors
Remove `--platform=linux/amd64` from the Dockerfile (Section 5.1).

### API returns 502 Bad Gateway
- Check if the API service is running: `railway logs --service api`
- Verify the health check is passing
- Confirm the PORT variable is being used correctly in `startup.sh`

### Worker not picking up tasks
- Check worker logs: `railway logs --service worker`
- Verify `REDIS_URL` is the same on both `api` and `worker` services
- Verify the worker started successfully (look for "celery@... ready" in logs)

### Database connection errors
- Verify `DATABASE_URL` is correctly referencing the Postgres service
- Check that Postgres service is running
- Railway Postgres may use `postgresql://` or `postgres://` scheme -- SQLAlchemy requires `postgresql://`. If Railway provides `postgres://`, add a startup fix:
  ```python
  # In config.py or database.py
  if database_url.startswith("postgres://"):
      database_url = database_url.replace("postgres://", "postgresql://", 1)
  ```

### Alembic migration errors on deploy
- Run migrations manually: `railway run --service api alembic upgrade head`
- Check migration history: `railway run --service api alembic history`
- If stuck, check current revision: `railway run --service api alembic current`

### CORS errors from frontend
- Verify `ALLOWED_ORIGINS` includes the exact frontend URL (including `https://`)
- Check for trailing slashes -- the origin should not have a trailing slash
- Redeploy the API service after changing `ALLOWED_ORIGINS`

## Appendix C: Cost Optimization Tips

1. **Use Railway's sleep feature:** If available, configure services to sleep after inactivity. The API will cold-start on the next request (adds ~10-30 seconds latency).

2. **Single worker instance:** One Celery worker with `prefetch_multiplier=1` is sufficient for a small team. Add a second only if tasks regularly queue up.

3. **Database size:** Railway Postgres charges for storage. Periodically clean up old analysis data or unused transcripts to keep storage costs low.

4. **Monitor egress:** Video file transfers (if served through the API) consume network bandwidth. Serving videos directly from R2/CDN reduces Railway egress costs.

5. **Review usage weekly** for the first month to establish a baseline, then monthly thereafter.
