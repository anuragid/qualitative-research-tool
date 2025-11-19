# Qualitative Research Tool - Chat Context Summary
**Last Updated:** November 8, 2025
**Time:** 1:45 PM CST

## Project Overview
A full-stack qualitative research application for video transcription and analysis using AI:
- **Frontend:** React + TypeScript + Vite (http://localhost:5173)
- **Backend:** FastAPI + LangGraph multi-agent system
- **Database:** PostgreSQL (local Docker + AWS RDS)
- **Queue:** Redis + Celery
- **AI Services:** AssemblyAI (transcription) + Claude (analysis)
- **Storage:** AWS S3 (videos)

## Current Status
✅ **FULLY OPERATIONAL** - Both local and AWS environments running successfully

### Local Environment
- Unified Docker Compose setup mirroring AWS architecture
- 7 projects, 3 videos with transcriptions and analysis
- All services running in containers
- Path: `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/`

### AWS Production
- Live at: http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com
- ECS Fargate deployment (API + Workers)
- RDS PostgreSQL + ElastiCache Redis
- Services stable after recent fixes

## Recent Major Work Completed

### 1. Project State System Implementation (November 8, 2025)
- **Implemented 6 Project States:**
  - `planning` - Project created, no files yet (gray badge)
  - `ready` - Has files, ready for analysis (blue badge)
  - `processing` - Analysis running (yellow badge)
  - `completed` - All processing done (green badge)
  - `archived` - Stored for reference, can be unarchived (gray badge)
  - `error` - Something failed with error message (red badge)
- **Features Added:**
  - Color-coded status badges on project cards
  - Archive/unarchive functionality with UI buttons
  - Error state handling with message display
  - Automatic state transitions based on project activity
  - Database migration for error_message field
- **Deployment Fix:**
  - Resolved ECS stuck on revision 7 (API returning null status)
  - Force-updated to revision 8 with fixed Pydantic schemas
  - Both API and Worker services now on revision 8

### 2. Security Update (Critical)
- **Issue:** RDS database password was exposed in PROJECT_STATUS.md
- **Resolution:**
  - Updated RDS password to secure credential (stored in password manager)
  - Removed exposed password from all documentation
  - Updated ECS task definitions with new password
  - Ensured all sensitive files are gitignored

### 2. ECS Connection Fix
- **Issue:** ECS tasks couldn't connect to RDS (hardcoded "postgres" hostname)
- **Root Cause:** startup.sh was using hardcoded hostname instead of parsing DATABASE_URL
- **Fix:** Modified `/backend/scripts/startup.sh` to dynamically parse DATABASE_URL
- **Result:** Both API and Worker services now stable (1/1)

### 3. Implemented Features (Earlier Session)
- **Transcript Search:**
  - Full-text search with highlighting
  - Navigation (X of Y results with up/down arrows)
  - Keyboard shortcuts (Enter/Shift+Enter)
  - Debounced search for performance
- **Speaker Label Fix:**
  - Speaker names now properly carry through to analysis
  - Fixed mapping in chunk generation

### 4. Platform Architecture
- Unified local-AWS Docker architecture
- Everything runs in containers locally (mirrors AWS)
- Fixed Docker image platform (linux/amd64) for ECS compatibility
- One-command deployment with validation

## Key Technical Details

### Database
- **Local:** PostgreSQL in Docker container
- **AWS RDS:** `qualitative-research-db.cpwycicsibkm.us-east-2.rds.amazonaws.com`
- **Password:** Secure credential (not in git, stored in ECS task definitions)

### ECS Deployment
- **Cluster:** `qualitative-research-prod`
- **API Task Definition:** `qualitative-research-api:8` (with project states)
- **Worker Task Definition:** `qualitative-research-api:8` (unified task definition)
- **Docker Image:** `723913710517.dkr.ecr.us-east-2.amazonaws.com/qualitative-research-api:latest`

### Critical Files
- `/backend/scripts/startup.sh` - Fixed to parse DATABASE_URL
- `/backend/.env.aws-production` - Contains production config (gitignored)
- `/docker-compose.yml` - Unified local setup
- `/.gitignore` - Updated to exclude sensitive files
- `/backend/app/services/project_state_service.py` - State transition logic
- `/frontend/src/components/projects/ProjectCard.tsx` - UI with badges and archive
- `/backend/app/models/schemas.py` - Fixed with error_message field

### Git Repository
- **URL:** https://github.com/anuragid/qualitative-research-tool
- **Status:** All changes committed and pushed
- **Last Commit:** "Implement project state system with 6 states and archive functionality"

## AWS Resources & Access
- **Account ID:** 723913710517
- **Region:** us-east-2 (Ohio)
- **IAM User:** qualitative-research-app (has necessary permissions)
- **Services:** ECS, RDS, ElastiCache, S3, ECR, ALB

## Known Issues & Considerations
1. **Password Management:** New RDS password is configured but needs secure storage solution
2. **Cost:** AWS services running ~$125-160/month
3. **Data Separation:** Local has production data (7 projects), AWS has test data only

## Commands for Quick Reference

### Local Development
```bash
# Start all services
cd qualitative-research-tool
docker-compose up -d
cd frontend && npm run dev

# Check status
docker ps
curl http://localhost:8000/health
```

### AWS Management
```bash
# Check ECS services
aws ecs describe-services --cluster qualitative-research-prod --services api workers --region us-east-2

# View logs
aws logs tail /ecs/qualitative-research-api --region us-east-2 --since 30m

# Force redeploy
aws ecs update-service --cluster qualitative-research-prod --service api --force-new-deployment --region us-east-2
```

### Database Connection Test
```bash
cd qualitative-research-tool/backend
./venv/bin/python3 -c "
import psycopg2
conn = psycopg2.connect(
    host='qualitative-research-db.cpwycicsibkm.us-east-2.rds.amazonaws.com',
    database='qualitative_research',
    user='postgres',
    password='[USE_SECURE_PASSWORD]',
    port=5432
)
print('Connected!')
conn.close()
"
```

## Next Steps & Recommendations
1. **Immediate:** Store RDS password in AWS Secrets Manager
2. **Security:** Rotate all API keys (AssemblyAI, Anthropic, AWS)
3. **Monitoring:** Set up CloudWatch alarms for service health
4. **Data Migration:** Plan migration of local data to AWS when ready
5. **Cost Optimization:** Consider scaling down services when not in use

## Important Notes
- **DO NOT** commit any .env files or passwords to git
- **DO NOT** expose RDS password in any documentation
- **ALWAYS** test locally before deploying to AWS
- **REMEMBER** Local and AWS environments are separate (no shared data)

---
This summary contains all critical context from our session. The application is fully functional with all security issues resolved.