# Qualitative Research Tool - Project Status & Instructions

**Last Updated:** 2025-11-06

## 🚨 CRITICAL RULES - READ THIS FIRST

### Rule #1: NEVER Touch the Working Local Setup
- The local development environment is SACRED
- All user work (transcriptions, analysis, speaker identification) is in the local database
- Never modify, stop, or reconfigure the local setup without explicit user permission
- If deploying to AWS, create separate infrastructure - NEVER migrate until tested and approved

### Rule #2: Local Setup is the Source of Truth
- Local PostgreSQL database contains all real data
- Local Redis handles background tasks
- Docker backend on port 8000 connects to LOCAL database
- Frontend on port 5173 connects to backend on port 8000

---

## Current Working Setup (LOCAL)

### Architecture
```
Frontend (Vite)          → http://localhost:5173
    ↓
Backend API (Docker)     → http://localhost:8000
    ↓
Local PostgreSQL         → localhost:5432 (Docker: qualitative-research-db)
Local Redis              → localhost:6379 (Docker: qualitative-research-redis)
AWS S3                   → qualitative-research-videos-ad (video storage)
```

### Running Services

#### Backend API
- **Container**: `qualitative-research-api`
- **Port**: 8000
- **Image**: `723913710517.dkr.ecr.us-east-2.amazonaws.com/qualitative-research-api:latest`
- **Database**: PostgreSQL at `host.docker.internal:5432` (LOCAL)
- **Environment**: development
- **CORS**: Allows `http://localhost:5173` and `http://localhost:3000`

#### Database (PostgreSQL)
- **Container**: `qualitative-research-db`
- **Image**: `postgres:15-alpine`
- **Port**: 5432
- **Credentials**:
  - Username: `postgres`
  - Password: `postgres`
  - Database: `qualitative_research`
- **Data**: Contains 7 projects, 3 videos, 3 transcripts with full analysis

#### Redis
- **Container**: `qualitative-research-redis`
- **Image**: `redis:7-alpine`
- **Port**: 6379

#### Frontend
- **Port**: 5173
- **Dev Server**: Vite (running in background)
- **Config**: `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/frontend/.env`
  ```
  VITE_API_URL=http://localhost:8000
  ```

### Background Workers
- **Celery workers** running for async transcription and analysis tasks
- Multiple worker processes active (check with `ps aux | grep celery`)

---

## Project Data (Current State)

### Projects in Database
- 7 total projects
- Located in local PostgreSQL database
- Examples:
  - "ad-test-449"
  - "Test API Project"
  - "Test Research Project"

### Videos
- 3 videos uploaded
- Stored in AWS S3: `qualitative-research-videos-ad`
- Metadata in local PostgreSQL
- States:
  - 1 video with error
  - 1 video transcribed
  - 1 video fully analyzed

### Features Working
✅ Video upload to S3
✅ Transcription via AssemblyAI
✅ Speaker identification
✅ Video-transcript sync
✅ 5-step analysis process
✅ Cross-video analysis
✅ Project management

---

## Important File Locations

### Backend
- **Root**: `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/backend/`
- **Environment**: `.env` (local development config)
- **Production Env**: `.env.production` (AWS RDS config - NOT USED LOCALLY)
- **Migrations**: `alembic/versions/`
- **Main App**: `app/main.py`

### Frontend
- **Root**: `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/frontend/`
- **Environment**: `.env`
- **Config**: Points to `http://localhost:8000`

### Project Root
- **Git Repo**: `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/`
- **GitHub**: https://github.com/anuragid/qualitative-research-tool
- **Branch**: main

---

## Environment Variables (LOCAL SETUP)

### Backend Local Config
```bash
# Database - LOCAL PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qualitative_research

# AWS (for S3 storage only)
AWS_ACCESS_KEY_ID=<see .env file>
AWS_SECRET_ACCESS_KEY=<see .env file>
AWS_REGION=us-east-2
AWS_BUCKET_NAME=qualitative-research-videos-ad

# AI APIs
ANTHROPIC_API_KEY=<see .env file>
ASSEMBLYAI_API_KEY=<see .env file>

# Redis - LOCAL
REDIS_URL=redis://localhost:6379/0

# App Settings
APP_ENV=development
DEBUG=True
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Note**: Actual API keys and secrets are stored in `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/backend/.env` (NOT committed to git)

---

## Quick Status Checks

### Check All Services
```bash
# Check Docker containers
docker ps

# Should see:
# - qualitative-research-api (port 8000)
# - qualitative-research-db (port 5432)
# - qualitative-research-redis (port 6379)

# Check frontend
lsof -i :5173

# Check Celery workers
ps aux | grep celery
```

### Check Database
```bash
# Connect to database
docker exec -it qualitative-research-db psql -U postgres -d qualitative_research

# Check data
docker exec qualitative-research-db psql -U postgres -d qualitative_research -c "
SELECT COUNT(*) as projects FROM projects;
SELECT COUNT(*) as videos FROM videos;
SELECT COUNT(*) as transcripts FROM transcripts;
"
```

### Test Backend API
```bash
# Health check
curl http://localhost:8000/health

# List projects
curl http://localhost:8000/api/projects/

# Check CORS
curl -v -X OPTIONS http://localhost:8000/api/projects/ \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
```

---

## AWS Deployment (SEPARATE - NOT AFFECTING LOCAL)

### AWS Resources Created
- ✅ **ECR Repository**: `qualitative-research-api` (us-east-2)
  - Image URI: `723913710517.dkr.ecr.us-east-2.amazonaws.com/qualitative-research-api:latest`
  - Latest push: Image digest `sha256:d3192fcc...`

- ✅ **RDS Database**: `qualitative-research-db`
  - Endpoint: `qualitative-research-db.cpwycicsibkm.us-east-2.rds.amazonaws.com:5432`
  - Password: `08185991`
  - Schema: Created and migrated
  - **Note**: This is EMPTY - real data is in local database

- ✅ **S3 Bucket**: `qualitative-research-videos-ad`
  - Region: us-east-2
  - Contains all uploaded video files

- ✅ **IAM User**: `qualitative-research-app`
  - Has ECR, CloudWatch, App Runner, IAM permissions

### AWS Deployment Status
- ❌ **App Runner**: Previous attempts failed on health checks
- ⏳ **Next Step**: Need to deploy backend to AWS (ECS/Fargate recommended over App Runner)
- ⏳ **Frontend**: Not yet deployed (Amplify planned)

### Important: AWS Deployment Strategy
When ready to deploy to AWS:
1. Keep local setup running
2. Deploy to AWS completely separately
3. Test AWS deployment thoroughly
4. Create data migration script
5. Execute migration only when AWS is proven stable
6. Keep local as backup/fallback

---

## Database Schema

### Latest Migration
- **Version**: `7990cd686e18`
- **Description**: Add file_size_bytes and error_message to videos
- **Applied**: Both local and AWS RDS databases

### Tables
- `projects` - Research projects
- `videos` - Uploaded videos with S3 references
- `transcripts` - AssemblyAI transcriptions
- `speaker_labels` - User-assigned speaker names/roles
- `video_analyses` - Individual video analysis (5 steps)
- `project_analyses` - Cross-video analysis

---

## Common Tasks

### Start Local Development
```bash
# 1. Ensure Docker containers are running
docker start qualitative-research-db qualitative-research-redis qualitative-research-api

# 2. Start frontend (if not running)
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/frontend
npm run dev

# 3. Access app
open http://localhost:5173
```

### Stop Everything (Use with Caution!)
```bash
# Stop backend
docker stop qualitative-research-api

# Stop database (⚠️ Data persists in volume)
docker stop qualitative-research-db

# Stop Redis
docker stop qualitative-research-redis

# Kill frontend
# Find process: lsof -i :5173
# Kill it: kill <PID>
```

### Restart Backend Only
```bash
docker restart qualitative-research-api

# Wait a few seconds
sleep 5

# Test
curl http://localhost:8000/health
```

### Run Database Migrations (LOCAL)
```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/backend

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/qualitative_research"

./venv/bin/alembic upgrade head
```

### Check Backend Logs
```bash
docker logs qualitative-research-api --tail 50
docker logs qualitative-research-api -f  # Follow logs
```

---

## Git Repository

### Status
- **Repo**: https://github.com/anuragid/qualitative-research-tool
- **Branch**: main
- **Status**: Clean (all committed and pushed)
- **Last Changes**:
  - Removed test files (view_transcript.py)
  - Added migration for video columns

### Key Files
- `backend/Dockerfile` - Production Docker build
- `backend/requirements.txt` - Python dependencies (cleaned for AWS)
- `backend/alembic/` - Database migrations
- `.gitignore` - Excludes .mp4, .env, etc.

---

## Troubleshooting

### Frontend Can't Connect to Backend
1. Check backend is running: `curl http://localhost:8000/health`
2. Check CORS: Container must have `ALLOWED_ORIGINS=http://localhost:5173`
3. Check frontend .env: `VITE_API_URL=http://localhost:8000`
4. Hard refresh browser: Cmd+Shift+R

### Database Connection Issues
1. Check container: `docker ps | grep qualitative-research-db`
2. Test connection: `docker exec qualitative-research-db pg_isready`
3. Check backend DATABASE_URL points to `host.docker.internal:5432`

### Missing Data
1. **FIRST**: Verify you're connected to LOCAL database, not AWS RDS
2. Check: `docker exec qualitative-research-db psql -U postgres -d qualitative_research -c "SELECT COUNT(*) FROM projects;"`
3. If 0, backend is pointing to wrong database

### Video Upload Fails
1. Check S3 credentials in backend container
2. Check backend logs: `docker logs qualitative-research-api --tail 50`
3. Verify AWS_BUCKET_NAME is correct

---

## Next Steps (When Ready)

### For Local Development
- Continue building features
- All data automatically saved to local database
- Videos stored in AWS S3

### For AWS Deployment (Future)
1. Create comprehensive data migration plan
2. Set up AWS infrastructure (ECS/Fargate + RDS + ElastiCache)
3. Deploy and test backend thoroughly
4. Deploy frontend to Amplify
5. Test complete flow on AWS
6. Create migration script
7. Execute migration with user approval
8. Keep local as backup

---

## Contact & Support

### AWS Account
- Account ID: 723913710517
- Region: us-east-2 (Ohio)
- IAM User: qualitative-research-app

### Important Links
- GitHub: https://github.com/anuragid/qualitative-research-tool
- AWS Console: https://console.aws.amazon.com/

---

**Remember: The local setup is production. Treat it with respect. Never modify without explicit permission.**
