# Qualitative Research Tool -- Project Status

**Last Updated:** March 12, 2026
**Status:** LIVE -- deployed on Railway + Cloudflare
**Domain:** [methodex.ai](https://methodex.ai)

---

## Production URLs

- **Frontend**: https://methodex.ai (Cloudflare Pages)
- **Backend API**: https://backend-production-e9e2.up.railway.app
- **Health Check**: https://backend-production-e9e2.up.railway.app/health

## Infrastructure

| Service | Provider | Notes |
|---------|----------|-------|
| API + Worker | Railway | FastAPI + Celery in separate Railway services |
| PostgreSQL | Railway | Managed Postgres |
| Redis | Railway | Managed Redis |
| Video Storage | Cloudflare R2 | S3-compatible, zero egress fees |
| Auth | Clerk | Free tier (10K MAU) |
| LLM | OpenRouter | Free default models + student BYOK |
| Transcription | AssemblyAI | Usage-based billing |
| Frontend | Cloudflare Pages | Free tier |
| Domain/DNS | Cloudflare | methodex.ai |

## What's Working

- Clerk authentication with JWT validation
- Project management with 6-state system
- Parallel video uploads (5 concurrent) to Cloudflare R2
- Transcription via AssemblyAI with speaker diarization
- 5-step AI analysis pipeline (CHUNK, INFER, RELATE, EXPLAIN, ACTIVATE)
- Cross-video analysis (3 synthesis nodes)
- Video-transcript synchronization
- Archive/unarchive functionality
- Full production deployment

## Local Development

```bash
# Start backend services (Postgres, Redis, API, Worker)
docker compose up --build

# Start frontend (new terminal)
cd frontend && npm install && npm run dev

# Access at http://localhost:5173
# API at http://localhost:8000
```

## Known Local Issues

- No auth bypass for local dev (need valid Clerk token)
- Free OpenRouter models have strict rate limits (~10-20 req/min)
- ENCRYPTION_KEY not set locally (generates ephemeral key, BYOK won't persist across restarts)

---

## Project History

| Date | Event |
|------|-------|
| Aug 2025 | v1 (agentic-analysis-synthesis) -- Streamlit on EC2 |
| Nov 2025 | v2 (aas-v2) -- Brief App Runner attempt |
| Nov 2025 | v3 (qualitative-research-tool) -- Full stack on AWS |
| Jan 2026 | RDS database deleted (app broken) |
| Mar 3, 2026 | All AWS infrastructure decommissioned |
| Mar 12, 2026 | Migration complete -- live on Railway + Cloudflare |
