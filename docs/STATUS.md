# Qualitative Research Tool - Project Status

**Last Updated:** March 3, 2026
**Status:** OFFLINE - AWS decommissioned, self-hosted migration pending
**Environments:** Local (Docker) only

---

## Current State

### AWS Decommissioned (March 3, 2026)
All AWS infrastructure has been permanently deleted. The app **cannot run in its current state** because it depends on AWS services (S3 for video storage, Cognito for auth) that no longer exist.

**What was deleted:** ECS, ALB, ElastiCache, RDS, S3 (4 buckets), ECR, Cognito, DynamoDB (6 tables), EC2, VPCs, IAM roles, CloudWatch logs/alarms.

**What was preserved locally:**
- 11 unique research videos (3.2 GB) → `../../videos-backup/`
- v1/v2 analysis JSON data (3.3 MB) → `../../analysis-backup/`
- Full codebase (this repo)

### Production URLs — DEAD
- ~~Frontend: http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com~~
- ~~API: http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com~~

### Local Development
- **Frontend**: http://localhost:5173
- **API**: http://localhost:8000
- **Database**: localhost:5432 (postgres/postgres)
- **Note**: Will NOT fully work until AWS dependencies are replaced (see below)

---

## What Needs to Change Before Running

### Must Replace (app won't start without these)
1. **S3 video storage** → MinIO (S3-compatible) or local filesystem
2. **Cognito authentication** → Self-signed JWT with local user table
3. **Frontend AWS Amplify auth** → Local auth context and login form

### Already Works Locally (no changes needed)
- PostgreSQL (docker-compose)
- Redis (docker-compose)
- FastAPI API server
- Celery workers
- Claude AI analysis pipeline (LangGraph)
- AssemblyAI transcription

### Known Local Setup Issues
- Frontend `.env` points to port 8001, API runs on 8000
- No auth bypass for local development
- Dockerfile forces `linux/amd64` (slow on Apple Silicon)
- Docker-compose uses Postgres 15 (production was 17)

---

## Core Features

- **Project Management** - Full CRUD with state system
- **Video Upload** - Parallel processing (5 concurrent)
- **Transcription** - AssemblyAI integration
- **AI Analysis** - 5-step Claude analysis pipeline (chunk → infer → relate → explain → activate)
- **Cross-Video Analysis** - Pattern detection across videos
- **Speaker Identification** - Label and track speakers
- **Video-Transcript Sync** - Synchronized playback

---

## Architecture

```
Frontend (React/Vite)
    ↓
API (FastAPI)
    ↓
├── PostgreSQL Database
├── Redis Cache/Queue (Celery broker)
├── Video Storage (NEEDS REPLACEMENT - was S3)
└── Auth (NEEDS REPLACEMENT - was Cognito)
    ↑
Celery Workers (AI analysis pipeline)
```

---

## Local Development

```bash
# Start services (Postgres, Redis, API, Worker)
docker compose up --build

# Start frontend separately
cd frontend && npm run dev

# Access at http://localhost:5173
```

---

## Next Steps (TBD)

- [ ] Decide on hosting approach (VPS, home server, etc.)
- [ ] Replace S3 with MinIO or local storage
- [ ] Replace Cognito with local JWT auth
- [ ] Update frontend to remove AWS Amplify dependency
- [ ] Verify full stack runs locally end-to-end
- [ ] Deploy to chosen hosting platform

---

## Project History

| Date | Event |
|------|-------|
| Aug 2025 | v1 (agentic-analysis-synthesis) - Streamlit on EC2 |
| Nov 2025 | v2 (aas-v2) - Brief App Runner attempt |
| Nov 2025 | v3 (qualitative-research-tool) - Full stack on AWS |
| Jan 2026 | RDS database deleted (app broken since then) |
| Mar 2026 | All AWS infrastructure decommissioned |
