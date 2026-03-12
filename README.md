# Qualitative Research Analysis Tool

A multi-agent AI system for analyzing video interviews using the 5D analysis framework. Upload research videos, get automatic transcriptions, and run a structured LLM pipeline that produces insights and design principles from qualitative data.

**Live at:** [methodex.ai](https://methodex.ai)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy, Celery, LangGraph |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL 15 |
| Queue/Cache | Redis 7 |
| LLM | OpenRouter (free default models + student BYOK) |
| Transcription | AssemblyAI |
| Auth | Clerk |
| Video Storage | Cloudflare R2 (S3-compatible) |
| Hosting | Railway (API + Worker + Postgres + Redis) |
| Frontend Hosting | Cloudflare Pages |

## Features

- **Project Management** -- Organize videos by research project with a 6-state system
- **Parallel Video Upload** -- Upload up to 5 videos simultaneously to R2
- **Automatic Transcription** -- Speaker diarization via AssemblyAI
- **Video-Transcript Sync** -- Synchronized playback and navigation
- **5-Step AI Analysis Pipeline** -- CHUNK, INFER, RELATE, EXPLAIN, ACTIVATE (per video)
- **Cross-Video Synthesis** -- Discover patterns across multiple interviews (3 additional nodes)
- **Archive System** -- Archive completed projects for future reference

## Local Development

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- API keys: OpenRouter (or BYOK), AssemblyAI, Clerk, Cloudflare R2

### Setup

```bash
# 1. Clone and enter the project
git clone https://github.com/anuragid/qualitative-research-tool.git
cd qualitative-research-tool

# 2. Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

# 3. Start backend services (Postgres, Redis, API, Celery worker)
docker compose up --build

# 4. Start frontend (in a new terminal)
cd frontend
npm install
npm run dev

# 5. Open the app
open http://localhost:5173
```

### Useful Commands

```bash
docker compose up --build     # Start all backend services
docker compose stop           # Pause containers (preserves data)
docker compose down           # Stop containers (preserves data)
docker compose logs -f api    # Tail API logs
docker compose logs -f worker # Tail worker logs
```

**Warning:** Never run `docker compose down -v` -- this deletes the database volume.

## Project Structure

```
qualitative-research-tool/
├── backend/
│   ├── app/
│   │   ├── agents/          # LangGraph pipeline (nodes/, states, graph)
│   │   ├── models/          # SQLAlchemy models + Pydantic schemas
│   │   ├── routes/          # FastAPI route handlers
│   │   ├── services/        # Business logic (s3_service, llm_service, etc.)
│   │   └── tasks/           # Celery tasks (analysis, transcription)
│   ├── alembic/             # Database migrations
│   ├── Dockerfile.railway   # Production Dockerfile
│   └── .env.example         # Environment template
├── frontend/
│   ├── src/
│   │   ├── components/      # React components (shadcn/ui based)
│   │   ├── contexts/        # Auth context (Clerk)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Page-level components
│   │   ├── services/        # API client
│   │   └── types/           # TypeScript type definitions
│   └── .env.example         # Frontend env template
├── docs/                    # Active documentation
├── scripts/                 # Utility scripts
└── docker-compose.yml       # Local development services
```

## Documentation

- [Project Status](./docs/STATUS.md) -- Current deployment status
- [Quick Context](./docs/QUICK_CONTEXT.md) -- Rapid context for AI agents
- [Architecture](./docs/ARCHITECTURE.md) -- LangGraph system design
- [Data Management](./docs/DATA_MANAGEMENT.md) -- Backup and recovery

## License

Proprietary -- All rights reserved
