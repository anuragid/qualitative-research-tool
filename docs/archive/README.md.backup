# Qualitative Research Analysis Tool

A multi-agent qualitative research system for analyzing video interviews using LangGraph and Claude AI.

## Features

- **Project & File Management**: Organize research videos by project
- **Video Upload**: Upload to AWS S3
- **Transcription**: Automatic transcription with speaker diarization (AssemblyAI)
- **5-Step Analysis Pipeline** (per video):
  1. **CHUNK**: Break transcript into discrete pieces
  2. **INFER**: Interpret meaning from each chunk
  3. **RELATE**: Find patterns across inferences
  4. **EXPLAIN**: Generate insights from patterns
  5. **ACTIVATE**: Create actionable design principles
- **Cross-Video Synthesis**: When multiple videos complete, synthesize findings across videos

## Tech Stack

**Backend:**
- Python FastAPI
- LangGraph (multi-agent orchestration)
- Celery (background tasks)
- PostgreSQL (database)
- Redis (task queue)

**Frontend:**
- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components
- React Query (data fetching)

**External Services:**
- AWS S3 (video storage)
- AssemblyAI (transcription + speaker diarization)
- Anthropic Claude API (analysis)

## Setup

### 1. Prerequisites

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- AWS Account with S3 access
- AssemblyAI API key
- Anthropic Claude API key

### 2. Clone and Install

```bash
# Clone repository
git clone <your-repo>
cd qualitative-research-tool

# Install backend dependencies
cd backend
pip install -r requirements.txt

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configure Environment Variables

```bash
# Copy example env file
cd backend
cp .env.example .env

# Edit .env with your actual keys
# Add your AWS credentials, API keys, etc.
```

### 4. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Run database migrations
cd backend
alembic upgrade head
```

### 5. Run the Application

**Terminal 1 - Backend API:**
```bash
cd backend
uvicorn app.main:app --reload
```

**Terminal 2 - Celery Worker:**
```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

1. **Create a Project**: Click "New Project" and enter details
2. **Upload Video**: Drag and drop video file (MP4, MOV, WebM up to 500MB)
3. **Wait for Transcription**: Automatic transcription with speaker diarization
4. **Label Speakers**: Assign names/roles to detected speakers
5. **Run Analysis**: Trigger the 5-step analysis pipeline
6. **View Results**: Explore chunks, inferences, patterns, insights, and design principles
7. **Cross-Video Analysis**: After multiple videos, run cross-video synthesis

## Architecture

### LangGraph State Machines

**VideoAnalysisState:**
- Input: transcript + speaker_labels
- Output: chunks → inferences → patterns → insights → design_principles
- Flow: Linear pipeline through 5 agent nodes

**ProjectAnalysisState:**
- Input: All video patterns + insights
- Output: cross_patterns → cross_insights → cross_principles
- Flow: 3-step synthesis across videos

### Database Schema

- `projects`: Research projects
- `videos`: Uploaded video files
- `transcripts`: Transcription data with speaker diarization
- `speaker_labels`: User-assigned speaker names
- `video_analyses`: Per-video analysis results
- `project_analyses`: Cross-video synthesis results

## Development

### Running Tests

```bash
cd backend
pytest
```

### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Deployment

See deployment guides for:
- AWS (RDS + ElastiCache + ECS)
- Railway
- Fly.io

## License

MIT
