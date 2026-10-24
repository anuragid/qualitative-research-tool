# Quick Context for AI Agents

## Project Summary

- **What**: AI-powered qualitative research tool -- analyzes video interviews using a 5D LLM pipeline (CHUNK, INFER, RELATE, EXPLAIN, ACTIVATE) plus 3 cross-video synthesis nodes
- **Status**: LIVE -- deployed and operational
- **Domain**: [methodex.ai](https://methodex.ai)
- **Backend**: https://api.methodex.ai
- **Frontend**: Cloudflare Pages

## Current Stack

| Component | Service |
|-----------|---------|
| Backend + Worker | Railway (FastAPI + Celery) |
| Database | Railway (PostgreSQL) |
| Cache/Queue | Railway (Redis) |
| Video Storage | Cloudflare R2 |
| Auth | Clerk |
| LLM | OpenRouter (included models + BYOK) |
| Transcription | AssemblyAI |
| Frontend Hosting | Cloudflare Pages |

## Codebase Location

```
~/code-projects/5d-analysis/qualitative-research-tool/
```

## Key Directories

- `backend/app/agents/nodes/` -- 8 analysis step nodes (5 per-video + 3 cross-video), each run as its own Celery task
- `backend/app/services/llm_service.py` -- OpenRouter LLM integration (OpenAI SDK pointed at OpenRouter)
- `backend/app/services/s3_service.py` -- R2 storage (S3-compatible via boto3)
- `frontend/src/contexts/` -- Clerk auth context

## Critical Commands

```bash
# SAFE
docker compose down            # OK -- preserves data
docker compose stop            # OK -- pauses containers

# DANGEROUS
docker compose down -v         # DELETES DATABASE
docker volume prune            # DELETES DATA
```

## Before Any Change

1. Check if it already exists: `grep -r "feature_name" --exclude-dir=node_modules --exclude-dir=venv`
2. Test locally first
3. Never commit .env files

## Known Local Issues

- Local dev auth bypass: with `APP_ENV=development` the backend treats requests with no token (or `Bearer dev-bypass`) as `dev_user_local`; set `VITE_DEV_AUTH_BYPASS=true` in the frontend
- Docker Compose uses Postgres 15

Last Updated: March 12, 2026
