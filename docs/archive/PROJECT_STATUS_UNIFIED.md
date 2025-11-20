# Qualitative Research Tool - Unified Project Status
*Last Updated: November 20, 2025*

## 🚀 Current Status: FULLY OPERATIONAL

### Production Environment
- **Frontend:** http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com
- **API:** http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com
- **Status:** ✅ All systems operational
- **Latest Deployment:** November 20, 2025

### Recent Improvements (Nov 20, 2025)
- ✅ Fixed project card video count display
- ✅ Implemented parallel uploads (5 concurrent)
- ✅ Enhanced UI with loading states and error handling
- ✅ Added data backup/restore scripts
- ✅ Applied Nielsen's 10 Usability Heuristics
- ✅ Created reusable UI components library

---

## 📊 Project Features

### Core Functionality
- **Multi-project Management** - Organize research by projects
- **Video Upload & Storage** - AWS S3 integration with parallel uploads
- **Automatic Transcription** - AssemblyAI with speaker diarization
- **5-Step Analysis Pipeline** - CHUNK → INFER → RELATE → EXPLAIN → ACTIVATE
- **Cross-Video Synthesis** - Pattern recognition across multiple videos
- **Project State System** - 6 states with automatic transitions

### Project States
1. **`planning`** - New project, no videos (gray badge)
2. **`ready`** - Has videos, ready for analysis (blue badge)
3. **`processing`** - Analysis running (yellow badge with spinner)
4. **`completed`** - All processing done (green badge)
5. **`archived`** - Stored for reference (muted badge)
6. **`error`** - Processing failed (red badge with message)

---

## 🏗️ Infrastructure

### AWS Services
| Service | Purpose | Details |
|---------|---------|---------|
| **ECS Fargate** | Container hosting | API & Worker services (Revision 8) |
| **RDS PostgreSQL** | Database | qualitative-research-db.czkozcn34eww.us-east-2.rds.amazonaws.com |
| **ElastiCache Redis** | Queue/Cache | qualitative-research-redis.sbafnl.0001.use2.cache.amazonaws.com |
| **S3 Buckets** | Storage | Videos: qualitative-research-videos-ad |
| **CloudFront** | CDN | Frontend distribution |
| **ALB** | Load Balancer | qualitative-research-alb |
| **ECR** | Container Registry | 723913710517.dkr.ecr.us-east-2.amazonaws.com |

### Local Development
```bash
# Start all services
./scripts/start-local.sh

# Access points
Frontend: http://localhost:5173
API: http://localhost:8000
API Docs: http://localhost:8000/docs
Database: localhost:5432
Redis: localhost:6379
```

---

## 📦 Deployment

### Quick Deploy to Production
```bash
# Automated deployment script
./scripts/deploy-to-aws.sh

# Manual steps if needed
1. Build and push Docker image
2. Update ECS service
3. Deploy frontend to S3
```

### Data Safety
```bash
# Backup database (DO THIS REGULARLY!)
./scripts/backup-db.sh

# Restore from backup
./scripts/restore-db.sh <backup-file>

# NEVER run: docker-compose down -v (deletes data!)
```

---

## 🔧 Configuration

### Required Environment Variables
```env
# AWS
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION=us-east-2
S3_BUCKET_NAME=qualitative-research-videos-ad

# APIs
ANTHROPIC_API_KEY
ASSEMBLYAI_API_KEY

# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...
```

### Tech Stack
- **Backend:** Python FastAPI, LangGraph, Celery, SQLAlchemy
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Tanstack Query
- **Infrastructure:** Docker, AWS ECS, PostgreSQL, Redis
- **AI Services:** Anthropic Claude, AssemblyAI

---

## 📈 Monitoring & Troubleshooting

### Health Checks
```bash
# Local
curl http://localhost:8000/health

# Production
curl http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com/health
```

### Logs
```bash
# Local logs
docker-compose logs -f api
docker-compose logs -f worker

# AWS logs
aws logs tail /ecs/qualitative-research-api --follow
aws logs tail /ecs/qualitative-research-worker --follow
```

### Common Issues
1. **"Too many open files"** - Restart Docker Desktop
2. **ECS not updating** - Force new deployment: `aws ecs update-service --force-new-deployment`
3. **Database connection issues** - Check security groups and connection string

---

## 📚 Documentation Structure

### Active Documentation
- `PROJECT_STATUS_UNIFIED.md` - This file (main status and overview)
- `SETUP_GUIDE.md` - Complete setup instructions
- `DEPLOYMENT_GUIDE.md` - Deployment procedures
- `DATA_MANAGEMENT.md` - Backup and recovery procedures
- `USABILITY_FIXES_REQUIRED.md` - UX improvement tracking
- `API_DOCUMENTATION.md` - API endpoint reference

### Feature Documentation
- `docs/features/Video_Transcript_Sync_Feature.md` - Video sync implementation
- `docs/architecture/LangGraph_Architecture_Guide.md` - Multi-agent design

### Historical/Archive
- `archive/` - Deprecated documentation for reference

---

## 🎯 Upcoming Improvements

See `USABILITY_FIXES_REQUIRED.md` for detailed list. Priority items:
1. Add search and filter functionality
2. Implement keyboard shortcuts
3. Add bulk operations
4. Improve mobile responsiveness
5. Add user preferences/settings

---

## 🔒 Security Notes

- All `.env` files are gitignored
- Secrets stored in AWS Systems Manager
- Database passwords rotated regularly
- S3 buckets are private with presigned URLs
- ECS tasks use IAM roles, not keys

---

## 📞 Support & Issues

- **GitHub:** https://github.com/anuragid/qualitative-research-tool
- **Issues:** Report at GitHub Issues
- **Monitoring:** AWS CloudWatch dashboards

---

## Deployment History

### November 20, 2025
- Fixed video count display bug
- Implemented parallel uploads
- Enhanced UI/UX with Nielsen's heuristics
- Added data safety measures

### November 8, 2025
- Deployed project state system
- Fixed ECS task definition (revision 8)
- Added status badges and error handling

### November 6, 2025
- Initial AWS deployment completed
- Unified architecture implemented
- Security fixes applied

### November 5, 2025
- Project initiated
- Infrastructure setup begun