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
| LLM | OpenRouter (free defaults + student BYOK) |
| Transcription | AssemblyAI |
| Frontend Hosting | Cloudflare Pages |

## Codebase Location

```
/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/
```

## Key Directories

- `backend/app/agents/nodes/` -- 8 LangGraph analysis nodes (5 per-video + 3 cross-video)
- `backend/app/services/llm_service.py` -- OpenRouter LLM integration (LiteLLM-based)
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

- No auth bypass for local dev (need valid Clerk token for authenticated endpoints)
- Docker Compose uses Postgres 15
- Free OpenRouter models have strict rate limits (~10-20 req/min) -- may get 429s during testing

Last Updated: March 12, 2026
