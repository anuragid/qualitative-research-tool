# Qualitative Research Tool - Project Status & Instructions

**Last Updated:** 2025-11-06 03:50 PM CST
**Status:** ✅ FULLY OPERATIONAL - Unified Local-AWS Architecture Implemented

## 🚀 MAJOR UPDATE: Unified Architecture (Nov 6, 2025 - 3:50 PM)

### What Changed:
- **Local now mirrors AWS exactly** - Everything runs in Docker containers
- **Platform consistency** - Using linux/amd64 architecture (matches AWS)
- **Unified configuration** - Auto-detects environment (local vs AWS)
- **One-command deployment** - Validated deployment to AWS
- **All data preserved** - 7 projects intact in local database

### New Setup Benefits:
- ✅ **No more "works on my machine"** - Local = AWS architecture
- ✅ **Seamless deployment** - What works locally WILL work on AWS
- ✅ **Consistent platform** - linux/amd64 everywhere
- ✅ **Smart configuration** - Automatically adjusts based on environment

---

## Current Working Setup (LOCAL - Unified Architecture)

### Architecture (Mirrors AWS Exactly)
```
Frontend (Vite)              → http://localhost:5173
    ↓
Backend API (Docker)         → http://localhost:8000
    ↓
PostgreSQL (Docker)          → postgres:5432 (Container: qualitative-research-db)
Redis (Docker)               → redis:6379 (Container: qualitative-research-redis)
Celery Worker (Docker)       → Container: qualitative-research-worker
AWS S3                       → qualitative-research-videos-ad (video storage)
```

### Running Services (All in Docker Containers)

#### Backend API
- **Container**: `qualitative-research-api`
- **Port**: 8000
- **Image**: `qualitative-research-tool-api` (unified, linux/amd64)
- **Database**: PostgreSQL at `postgres:5432` (Docker networking)
- **Environment**: development (auto-detected)
- **CORS**: Allows `http://localhost:5173` and `http://localhost:3000`
- **Created**: Nov 6, 2025 3:35 PM CST

#### Celery Worker
- **Container**: `qualitative-research-worker`
- **Image**: `qualitative-research-tool-worker` (unified, linux/amd64)
- **Purpose**: Background tasks (transcription, analysis)
- **Created**: Nov 6, 2025 3:35 PM CST

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
- **Dev Server**: Vite (running separately)
- **Config**: Uses `.env.development` for local, `.env.production` for AWS

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
- **Environment Files**:
  - `.env` - Original environment variables
  - `.env.docker-local` - Docker container environment
  - `.env.aws-production` - AWS production template
- **Docker**: `Dockerfile.unified` - Works for both local and AWS
- **Startup Script**: `scripts/startup.sh` - Unified startup with migrations
- **Config**: `app/config_enhanced.py` - Smart configuration with auto-detection
- **Migrations**: `alembic/versions/`

### Frontend
- **Root**: `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/frontend/`
- **Environment Files**:
  - `.env.development` - Local development
  - `.env.production` - AWS production
- **Config**: Auto-switches based on build mode

### Scripts
- **Start Local**: `scripts/start-local.sh` - Start unified environment
- **Deploy to AWS**: `scripts/deploy-to-aws.sh` - Deploy with validation

### Project Root
- **Git Repo**: `/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/`
- **GitHub**: https://github.com/anuragid/qualitative-research-tool
- **Branch**: main
- **Docker Compose**: `docker-compose.yml` - Unified AWS-mirror setup
- **Documentation**: `UNIFIED_SETUP_README.md` - Complete unified setup guide

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

## AWS Deployment (LIVE - SEPARATE FROM LOCAL)

### 🎉 AWS DEPLOYMENT IS FULLY OPERATIONAL!

**Frontend URL**: http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com
**Backend API**: http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com

### All Issues Fixed (Nov 6, 2025 - 3:00 PM CST)
All features working in production:
- ✅ **Video Upload**: Successfully uploading to S3
- ✅ **Transcription**: AssemblyAI integration working perfectly
- ✅ **5-Step Analysis**: Full pipeline operational (CHUNK → INFER → RELATE → EXPLAIN → ACTIVATE)
- ✅ **Cross-Video Analysis**: Project-level analysis working
- ✅ **Frontend Issues**: All 404 errors resolved, null safety added
- ✅ **Worker Tasks**: Celery workers processing all background jobs successfully
- ✅ **Database**: RDS PostgreSQL fully operational

### Fixed Issues (Nov 6, 2025):
- ✅ **CORS Configuration**: Fixed origin mismatch
- ✅ **Redis Connectivity**: Created security group for Celery workers
- ✅ **AssemblyAI SDK**: Fixed SpeechModel compatibility issue
- ✅ **Docker Platform**: Rebuilt for AMD64 (was ARM)
- ✅ **Frontend API Routing**: Fixed analysis endpoint calls
- ✅ **Null Safety**: Added proper checks for missing data

### AWS Resources Created
- ✅ **ECS Cluster**: `qualitative-research-prod`
  - API Service: 2 Fargate tasks (auto-scaling)
  - Worker Service: 1 Fargate task (can scale to 5)

- ✅ **ECR Repository**: `qualitative-research-api` (us-east-2)
  - Image URI: `723913710517.dkr.ecr.us-east-2.amazonaws.com/qualitative-research-api:latest`
  - Latest push: AMD64 platform image (sha256:1d85d5a5...)

- ✅ **Application Load Balancer**: `qualitative-research-alb`
  - DNS: qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com
  - Target Group: Health checks on `/health`
  - Security Group: sg-0b6a95b18add9287d

- ✅ **ElastiCache Redis**: `qualitative-research-redis`
  - Endpoint: qualitative-research-redis.sa9i40.0001.use2.cache.amazonaws.com:6379
  - Type: cache.t3.micro (no cluster mode)
  - Used for: Celery task queue

- ✅ **RDS Database**: `qualitative-research-db`
  - Endpoint: `qualitative-research-db.cpwycicsibkm.us-east-2.rds.amazonaws.com:5432`
  - Password: `[REDACTED - Store in password manager]`
  - Schema: Migrated with test data
  - **Note**: Contains test data only - real data still in local database

- ✅ **S3 Buckets**:
  - `qualitative-research-videos-ad` - Video storage (shared with local)
  - `qualitative-research-frontend` - Static website hosting

- ✅ **IAM Roles & Permissions**:
  - User: `qualitative-research-app`
  - ECS Task Execution Role: `ecsTaskExecutionRole`
  - Permissions: ECS, ECR, CloudWatch, S3, ElastiCache, EC2, IAM

### AWS Architecture
```
Internet → S3 Static Website (Frontend)
    ↓
Application Load Balancer
    ↓
ECS Fargate API Service (2 tasks)
    ↓
├─ RDS PostgreSQL
├─ ElastiCache Redis
└─ S3 Videos
    ↑
ECS Fargate Worker Service (1 task)
```

### AWS Deployment Files
- `/aws-deployment/api-task-definition.json` - API service configuration
- `/aws-deployment/worker-task-definition.json` - Celery worker configuration
- `/aws-deployment/deploy.sh` - Deployment script
- `/frontend/.env.production` - Frontend production config

### AWS Deployment Status - FULLY FUNCTIONAL ✅
- ✅ **Frontend**: S3 static site with all fixes deployed
- ✅ **Backend API**: 2 healthy instances on ECS Fargate
- ✅ **Celery Workers**: Processing all tasks successfully
- ✅ **Redis**: ElastiCache fully operational
- ✅ **Database**: RDS PostgreSQL with multiple test projects
- ✅ **Load Balancer**: ALB routing traffic correctly
- ✅ **Complete Pipeline Working**:
  - Upload videos → S3 storage ✅
  - Transcription → AssemblyAI ✅
  - 5-Step Analysis → Claude AI ✅
  - Cross-video analysis ✅
  - All results viewable in UI ✅

### Important: AWS vs Local
- **LOCAL**: Contains all real production data (7 projects, 3 videos)
- **AWS**: Contains test data only (1 test project)
- **Both are completely separate** - No data sharing
- **Local is still the primary environment** for demos

### Data Migration Strategy (When Ready)
1. Export local database: `pg_dump`
2. Upload backup to S3
3. Restore to AWS RDS
4. Verify all data transferred
5. Update DNS/domains
6. Keep local as backup

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

### Start Local Development (NEW UNIFIED WAY)
```bash
# 1. Start all backend services with one command
./scripts/start-local.sh

# 2. Start frontend in another terminal
cd frontend
npm run dev

# 3. Access app
open http://localhost:5173
```

### Stop Everything
```bash
# Stop all Docker services
docker-compose stop

# Kill frontend if running
# Find process: lsof -i :5173
# Kill it: kill <PID>
```

### Restart Services
```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart api
docker-compose restart worker

# Test health
curl http://localhost:8000/health
```

### View Logs
```bash
# View all logs
docker-compose logs

# Follow specific service logs
docker-compose logs -f api
docker-compose logs -f worker
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

### AWS Management Tasks

#### Check Service Status
```bash
# View running services
aws ecs describe-services --cluster qualitative-research-prod --services api workers --region us-east-2

# Check task health
aws ecs list-tasks --cluster qualitative-research-prod --region us-east-2

# View CloudWatch logs
aws logs tail /ecs/qualitative-research-api --region us-east-2 --since 30m
aws logs tail /ecs/qualitative-research-worker --region us-east-2 --since 30m
```

#### Update Services
```bash
# Force new deployment (pulls latest image)
aws ecs update-service --cluster qualitative-research-prod --service api --force-new-deployment --region us-east-2
aws ecs update-service --cluster qualitative-research-prod --service workers --force-new-deployment --region us-east-2

# Scale services
aws ecs update-service --cluster qualitative-research-prod --service api --desired-count 3 --region us-east-2
aws ecs update-service --cluster qualitative-research-prod --service workers --desired-count 2 --region us-east-2
```

#### Update Frontend
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://qualitative-research-frontend/ --delete --region us-east-2
```

#### Monitor Costs
```bash
# View current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region us-east-2
```

### Monthly AWS Costs (Estimated)
- ECS Fargate (API + Workers): ~$65-90
- ElastiCache Redis: ~$12
- RDS PostgreSQL: ~$15
- Application Load Balancer: ~$21
- S3 Storage: ~$5
- Data Transfer: ~$5-10
- **Total: ~$125-160/month**

### To Reduce Costs
1. Stop services when not needed:
   ```bash
   aws ecs update-service --cluster qualitative-research-prod --service api --desired-count 0 --region us-east-2
   aws ecs update-service --cluster qualitative-research-prod --service workers --desired-count 0 --region us-east-2
   ```
2. Use Fargate Spot for workers (70% discount)
3. Consider Reserved Instances for RDS
4. Use S3 Intelligent Tiering for old videos

---

## 🔄 DEVELOPMENT WORKFLOW (Best Practices)

### The Golden Rule: Develop Locally, Deploy to Production

```
LOCAL (develop) → TEST (verify) → COMMIT (git) → DEPLOY (AWS)
```

### Daily Workflow:
1. **Start Local Development**
   ```bash
   # Start local services
   docker start qualitative-research-db qualitative-research-redis qualitative-research-api
   cd frontend && npm run dev
   ```

2. **Make Changes Locally**
   - Edit code on localhost
   - Test features thoroughly
   - Verify everything works

3. **Commit to Git**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```

4. **Deploy to AWS** (NEW AUTOMATED WAY)
   ```bash
   # One command that validates and deploys everything
   ./scripts/deploy-to-aws.sh

   # This script:
   # - Validates local environment is running
   # - Runs tests (if available)
   # - Checks git status
   # - Builds Docker image (linux/amd64)
   # - Pushes to ECR
   # - Updates ECS services
   # - Builds and deploys frontend
   # - Verifies deployment health
   ```

### DO's and DON'Ts:
- ✅ DO: Always test on localhost first
- ✅ DO: Keep local and production data separate
- ✅ DO: Commit all changes to Git
- ❌ DON'T: Edit code directly on AWS
- ❌ DON'T: Deploy untested code
- ❌ DON'T: Mix development and production data

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
