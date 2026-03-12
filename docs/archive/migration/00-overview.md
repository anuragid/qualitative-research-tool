# Migration Plan: AWS to Self-Managed Stack

## Overview

This qualitative research tool is being migrated from AWS infrastructure (decommissioned) to a cost-effective, managed stack. The app allows students to upload research videos, get AI-powered transcription and analysis, and explore qualitative insights through a 5-step analytical framework.

**Current state:** The codebase is functional but all AWS dependencies are broken (S3, Cognito, RDS, ElastiCache, ECS — all deleted). The app cannot run.

**Target state:** A fully operational deployment accessible via a custom domain, with student self-registration, video uploads, AI-powered analysis, and minimal ongoing cost.

---

## Target Stack

| Component | Current (Broken) | Target | Service |
|-----------|-----------------|--------|---------|
| **Hosting** | AWS ECS | Managed PaaS | Railway |
| **Database** | AWS RDS (Postgres 17) | Managed Postgres | Railway |
| **Cache/Queue** | AWS ElastiCache (Redis) | Managed Redis | Railway |
| **Video Storage** | AWS S3 | S3-compatible object storage | Cloudflare R2 |
| **Authentication** | AWS Cognito | Managed auth provider | Clerk |
| **LLM / AI** | Anthropic Claude (direct) | LLM router + free models + BYOK | OpenRouter |
| **Transcription** | AssemblyAI | No change | AssemblyAI |
| **Frontend Hosting** | AWS S3 + CloudFront | Static site hosting | Cloudflare Pages |
| **Domain / DNS** | AWS Route53 | DNS + CDN + DDoS | Cloudflare |
| **Monitoring** | None | Error tracking + uptime | Sentry + UptimeRobot |

## Cost Summary

| Period | Monthly Cost | Notes |
|--------|-------------|-------|
| **Active semester** | ~$25-40/mo | Railway + R2 + domain |
| **Semester break** | ~$2/mo | Only R2 storage + domain |
| **Previous AWS** | ~$50-100+/mo | Always running |

---

## Accounts Required

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **Railway** | Backend hosting, Postgres, Redis | railway.app |
| **Cloudflare** | Domain, DNS, R2 storage, Pages hosting | cloudflare.com |
| **Clerk** | User authentication | clerk.com |
| **OpenRouter** | LLM API routing | openrouter.ai |
| **Anthropic** | Already have — students can BYOK | anthropic.com |
| **AssemblyAI** | Already have — transcription | assemblyai.com |
| **Sentry** | Error monitoring (free tier) | sentry.io |
| **UptimeRobot** | Uptime monitoring (free tier) | uptimerobot.com |

---

## Implementation Order

The migration has dependencies between steps. Follow this order:

```
Step 1: Cloudflare Infrastructure (domain + DNS)
   ↓ (Clerk needs the domain)
Step 2: Clerk Auth Migration
   ↓ (can start Railway in parallel with Step 2)
Step 3: Railway Deployment
   ↓ (R2 needs Cloudflare account from Step 1)
Step 4: Cloudflare R2 Storage Migration
   ↓ (can be done in parallel with auth/storage)
Step 5: OpenRouter LLM Migration
   ↓
Step 6: Frontend Deployment (Cloudflare Pages)
   ↓
Step 7: Operations & Security Hardening
   ↓
Step 8: Testing & Launch
```

### What can be parallelized:
- Steps 2 + 3 can run in parallel (auth migration + Railway setup)
- Steps 4 + 5 can run in parallel (storage + LLM migrations)
- Step 6 depends on Steps 1-5 being complete
- Step 7 can start as soon as deployment is live

---

## Implementation Guides

Each guide is self-contained and can be assigned to a different team/agent:

| # | Document | Depends On | Scope |
|---|----------|-----------|-------|
| **01** | [Railway Deployment](01-railway-deployment.md) | Cloudflare DNS (for custom domain) | Backend, worker, Postgres, Redis deployment |
| **02** | [Auth: Clerk Migration](02-auth-clerk-migration.md) | Domain setup, Clerk account | Remove Cognito, implement Clerk (backend + frontend) |
| **03** | [Storage: R2 Migration](03-storage-r2-migration.md) | Cloudflare account | Remove S3, implement R2 (video upload, playback, presigned URLs) |
| **04** | [LLM: OpenRouter Migration](04-llm-openrouter-migration.md) | None (code-only) | Replace Anthropic SDK with OpenRouter, add BYOK |
| **05** | [Cloudflare Infrastructure](05-cloudflare-infrastructure.md) | Domain purchase | DNS, Pages, R2 setup, security features |
| **06** | [Operations & Security](06-operations-security.md) | All above | Monitoring, backups, rate limiting, hibernate/resume |

---

## Codebase Structure

```
qualitative-research-tool/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI entry point (CORS config needs updating)
│   │   ├── config.py                  # Environment config (AWS vars → new vars)
│   │   ├── config_enhanced.py         # Enhanced config (may be unused — verify)
│   │   ├── database.py                # SQLAlchemy engine + session
│   │   ├── cognito_auth.py            # DELETE — replacing with Clerk
│   │   ├── auth_bridge.py             # REWRITE — Clerk-only auth
│   │   ├── models/
│   │   │   ├── database_models.py     # SQLAlchemy models (add user preferences)
│   │   │   └── schemas.py             # Pydantic schemas (add settings schemas)
│   │   ├── routes/
│   │   │   ├── users.py               # User routes (add settings endpoints)
│   │   │   ├── projects.py            # Project CRUD + analysis triggers
│   │   │   ├── videos.py              # Video CRUD + analysis step triggers
│   │   │   ├── transcripts.py         # Transcript routes
│   │   │   └── analysis.py            # Placeholder (empty)
│   │   ├── services/
│   │   │   ├── __init__.py            # Exports (update after rename)
│   │   │   ├── claude_service.py      # REWRITE → llm_service.py (OpenRouter)
│   │   │   ├── s3_service.py          # UPDATE — point at R2
│   │   │   ├── assemblyai_service.py  # No change
│   │   │   └── project_state_service.py # No change
│   │   ├── agents/
│   │   │   ├── graph.py               # LangGraph workflow — NO CHANGE
│   │   │   ├── states.py              # State definitions — NO CHANGE
│   │   │   ├── prompts.py             # System prompts — minor strengthening
│   │   │   └── nodes/                 # 8 analysis nodes — import rename only
│   │   │       ├── chunk.py
│   │   │       ├── infer.py
│   │   │       ├── relate.py
│   │   │       ├── explain.py
│   │   │       ├── activate.py
│   │   │       ├── cross_relate.py
│   │   │       ├── cross_explain.py
│   │   │       └── cross_activate.py
│   │   └── tasks/
│   │       ├── celery_app.py          # Celery config — NO CHANGE
│   │       ├── transcription_tasks.py # Uses S3 presigned URLs — auto-fixed by s3_service change
│   │       ├── analysis_tasks.py      # Add user_id propagation
│   │       └── analysis_steps.py      # Add user_id propagation
│   ├── alembic/                       # Database migrations
│   ├── requirements.txt               # Update dependencies
│   ├── Dockerfile.unified             # Remove --platform=linux/amd64
│   └── .env.*                         # Update all environment files
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Wrap with ClerkProvider
│   │   ├── components/
│   │   │   ├── Layout.tsx             # Add settings menu item
│   │   │   ├── auth/
│   │   │   │   └── CognitoSignIn.tsx  # DELETE — Clerk has built-in components
│   │   │   └── settings/
│   │   │       └── ModelSettingsDialog.tsx  # NEW — BYOK + model selection
│   │   ├── contexts/
│   │   │   └── CognitoAuthContext.tsx # DELETE — replaced by Clerk
│   │   ├── config/
│   │   │   └── cognito.ts            # DELETE
│   │   ├── services/
│   │   │   ├── api.ts                # Update auth token retrieval (Clerk)
│   │   │   └── settings.ts           # NEW — settings API service
│   │   ├── hooks/
│   │   │   └── useSettings.ts        # NEW — React Query hook for settings
│   │   └── types/
│   │       └── index.ts              # Add settings types
│   ├── package.json                   # Remove aws-amplify, add @clerk/clerk-react
│   └── .env.*                         # Update environment variables
│
└── docs/
    └── migration/                     # This directory — implementation guides
        ├── 00-overview.md             # This file
        ├── 01-railway-deployment.md
        ├── 02-auth-clerk-migration.md
        ├── 03-storage-r2-migration.md
        ├── 04-llm-openrouter-migration.md
        ├── 05-cloudflare-infrastructure.md
        └── 06-operations-security.md
```

---

## Key Technical Decisions

These decisions have been made and should be followed:

1. **OpenRouter as LLM router** — free models by default, students can BYOK their own API key for premium models (Claude, GPT-4, etc.)
2. **Cloudflare R2 for video storage** — zero egress fees, S3-compatible API (boto3 works with endpoint change)
3. **Clerk for authentication** — pre-built UI components, free tier (10K MAU), handles email verification + password reset
4. **Railway for hosting** — best DX, spending cap, built-in Postgres + Redis, git-push deploys
5. **Cloudflare Pages for frontend** — free, global CDN, auto-deploy from GitHub
6. **Semester break hibernate** — dump DB, stop Railway services, keep R2 + Clerk + Pages (~$2/mo)

## Decisions Left to the Implementer

These are intentionally left open for the implementing team to decide based on current best practices:

1. **Free model default** — which OpenRouter free model to use (they change over time)
2. **Direct upload vs proxy upload** — should videos go browser → R2 directly, or browser → backend → R2?
3. **Video transcoding** — optional: re-encode uploads to H.264 720p for storage savings
4. **Subdomain vs path routing** — `api.domain.com` vs `domain.com/api`
5. **Social login providers** — whether to enable Google/GitHub login via Clerk
6. **Session duration** — how long before students need to re-authenticate
7. **Video model field naming** — rename `s3_key`/`s3_url` to `storage_key`/`storage_url` or keep as-is

---

## Environment Variables (Complete Reference)

### Railway Backend + Worker

```env
# Database (auto-provided by Railway Postgres)
DATABASE_URL=postgresql://...

# Redis (auto-provided by Railway Redis)
REDIS_URL=redis://...
CELERY_BROKER_URL=${REDIS_URL}
CELERY_RESULT_BACKEND=${REDIS_URL}

# Cloudflare R2 (replaces AWS S3)
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_BUCKET_NAME=your-bucket-name
R2_ENDPOINT_URL=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com

# Clerk Auth (replaces Cognito)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# OpenRouter LLM (replaces Anthropic direct)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM_MODEL=qwen/qwen3-235b-a22b:free
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.7

# BYOK Encryption
FERNET_ENCRYPTION_KEY=your-generated-fernet-key

# AssemblyAI (unchanged)
ASSEMBLYAI_API_KEY=your-assemblyai-key

# Application
APP_ENV=production
DEBUG=false
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Sentry (optional)
SENTRY_DSN=https://...@sentry.io/...
```

### Cloudflare Pages Frontend

```env
VITE_API_URL=https://api.yourdomain.com
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

---

## Verification Checklist (Post-Migration)

After all migration steps are complete, verify:

- [ ] Students can register and log in via Clerk
- [ ] Admin can access user management in Clerk dashboard
- [ ] Video upload works (file goes to R2)
- [ ] Video playback works (presigned URL from R2)
- [ ] Transcription works (AssemblyAI can access video via presigned URL)
- [ ] Speaker labeling works
- [ ] Analysis pipeline runs (all 5 steps complete with OpenRouter free model)
- [ ] Analysis results display correctly in the frontend
- [ ] Cross-video analysis works
- [ ] BYOK: student can set their own API key and analysis uses it
- [ ] BYOK: student can remove their key and falls back to free model
- [ ] Rate limiting is active on login + upload + analysis endpoints
- [ ] CORS only allows the production domain
- [ ] HTTPS works on all endpoints
- [ ] Sentry captures errors
- [ ] Uptime monitoring is active
- [ ] Railway spending cap is set
- [ ] Backup script runs and dumps to R2
