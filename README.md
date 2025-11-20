# Qualitative Research Analysis Tool

A sophisticated multi-agent AI system for analyzing video interviews, generating insights, and discovering patterns across qualitative research data.

## 🎯 Overview

This tool automates qualitative research analysis using:
- **LangGraph** for multi-agent orchestration
- **Claude AI** for intelligent analysis
- **AssemblyAI** for transcription
- **AWS** for scalable infrastructure

Transform hours of video interviews into structured insights, patterns, and actionable design principles.

## ✨ Features

### Core Capabilities
- **📁 Project Management** - Organize videos by research project
- **⬆️ Parallel Video Upload** - Upload up to 5 videos simultaneously to S3
- **🎯 Automatic Transcription** - Speaker diarization via AssemblyAI
- **🔄 Video-Transcript Sync** - Synchronized playback and navigation
- **🤖 AI Analysis Pipeline** - 5-step structured analysis per video
- **🔍 Cross-Video Synthesis** - Discover patterns across multiple interviews
- **📊 Project State System** - Track progress with 6 intelligent states
- **💾 Archive System** - Archive completed projects for future reference

### 5-Step Analysis Pipeline
Each video undergoes systematic analysis:

1. **CHUNK** - Break transcript into meaningful segments
2. **INFER** - Extract meaning from each chunk
3. **RELATE** - Find patterns across inferences
4. **EXPLAIN** - Generate insights from patterns
5. **ACTIVATE** - Create actionable design principles

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- AWS Account (S3 access)
- API Keys:
  - Anthropic Claude API
  - AssemblyAI API
  - AWS credentials

### Setup (5 minutes)

```bash
# 1. Clone repository
git clone https://github.com/anuragid/qualitative-research-tool.git
cd qualitative-research-tool

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

# 3. Start backend services
./scripts/start-local.sh

# 4. Start frontend (new terminal)
cd frontend
npm install
npm run dev

# 5. Open application
open http://localhost:5173
```

## 🏗️ Architecture

### Unified Docker Architecture
Both local and AWS use identical containerized setup:

```
Frontend (React/Vite)
    ↓
API Gateway (FastAPI)
    ↓
├── PostgreSQL (Database)
├── Redis (Queue/Cache)
└── S3 (Video Storage)
    ↑
Celery Workers (Background Processing)
```

### Tech Stack

**Backend**
- FastAPI (Python 3.11)
- LangGraph (Agent orchestration)
- SQLAlchemy (ORM)
- Celery (Task queue)
- PostgreSQL 15
- Redis 7

**Frontend**
- React 18 + TypeScript
- Vite (Build tool)
- TanStack Query (Data fetching)
- Tailwind CSS
- shadcn/ui components

**Infrastructure**
- Docker Compose (Local)
- AWS ECS Fargate (Production)
- AWS S3 (Video storage)
- AWS RDS (Production database)
- AWS ElastiCache (Production Redis)

## 📝 Usage Guide

### 1. Create a Project
- Click "New Project"
- Enter name and description
- Project starts in `planning` state

### 2. Upload Videos
- Drag & drop or click to upload
- Supports MP4, AVI, MOV, etc.
- Parallel upload (5 concurrent)
- Progress tracking with ETA

### 3. Automatic Processing
- Transcription starts automatically
- Speaker identification
- 5-step analysis pipeline
- Real-time status updates

### 4. View Results
- Interactive transcript viewer
- Video-transcript synchronization
- Analysis results by category
- Export capabilities

### 5. Cross-Video Analysis
- Run after 2+ videos complete
- Discovers meta-patterns
- Generates cross-insights
- Creates system principles

## 🚢 Deployment

### Local Development
```bash
# Start all services
./scripts/start-local.sh
cd frontend && npm run dev

# Stop services
docker-compose stop

# View logs
docker-compose logs -f api
docker-compose logs -f worker
```

### Production Deployment (AWS)
```bash
# Automated deployment with validation
./scripts/deploy-to-aws.sh

# This script:
# - Validates local environment
# - Runs tests
# - Builds Docker images
# - Pushes to ECR
# - Updates ECS services
# - Deploys frontend to S3
# - Verifies deployment
```

### Production URLs
- Frontend: http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com
- API: http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com

## 💾 Data Management

### Database Backup
```bash
# Create backup
./scripts/backup-db.sh

# Restore from backup
./scripts/restore-db.sh <backup-file>
```

### Important
- ⚠️ **NEVER** use `docker-compose down -v` (deletes all data)
- ✅ Regular backups are automatic
- ✅ Data is separated between local and production

## 📊 Project States

Projects automatically transition through states:

| State | Description | Visual |
|-------|-------------|--------|
| `planning` | New project, no videos | Gray |
| `ready` | Has videos, ready to process | Blue |
| `processing` | Analysis running | Yellow |
| `completed` | All processing done | Green |
| `archived` | Stored for reference | Gray |
| `error` | Processing failed | Red |

## 🔧 Configuration

### Environment Variables

**Backend** (`backend/.env`)
```bash
# AWS
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-2
AWS_BUCKET_NAME=your-bucket

# AI Services
ANTHROPIC_API_KEY=sk-ant-...
ASSEMBLYAI_API_KEY=...

# Database (auto-configured for Docker)
DATABASE_URL=postgresql://...

# Redis (auto-configured for Docker)
REDIS_URL=redis://...
```

**Frontend** (`frontend/.env.development`)
```bash
VITE_API_URL=http://localhost:8000
VITE_APP_ENV=development
```

## 📚 Documentation

- [Documentation Index](./docs/README.md) - All documentation
- [Status & Deployment](./docs/STATUS.md) - Current status and deployment info
- [AWS Deployment Guide](./docs/AWS_DEPLOYMENT_GUIDE.md) - Detailed AWS setup
- [Data Management](./docs/DATA_MANAGEMENT.md) - Backup and recovery
- [Architecture](./docs/ARCHITECTURE.md) - System design

## 🐛 Troubleshooting

### Common Issues

**Frontend can't connect to backend**
```bash
# Check backend health
curl http://localhost:8000/health

# Check CORS settings
docker exec qualitative-research-api env | grep CORS

# Restart services
docker-compose restart api
```

**Database connection issues**
```bash
# Check database status
docker exec qualitative-research-db pg_isready

# View connection logs
docker logs qualitative-research-api --tail 50
```

**Upload failures**
```bash
# Check S3 credentials
docker exec qualitative-research-api env | grep AWS

# Check upload logs
docker logs qualitative-research-worker -f
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test locally with Docker
4. Submit a pull request

## 📄 License

Proprietary - All rights reserved

## 🆘 Support

- GitHub Issues: [Report bugs](https://github.com/anuragid/qualitative-research-tool/issues)
- Documentation: Check `/docs` folder
- Logs: Use `docker-compose logs` for debugging

---

**Built with ❤️ for qualitative researchers**