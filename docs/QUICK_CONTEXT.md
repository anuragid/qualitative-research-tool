# Quick Context for AI Agents

## Start New Session With This:
```
I'm working on a Qualitative Research Tool at:
/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/

Read these 3 files first:
1. STATUS.md - current state
2. README.md - project overview
3. AI_AGENT_GUIDE.md - how to work safely

Key: NEVER use 'docker-compose down -v', ALWAYS check before creating files
```

## Project Summary
- **What**: AI-powered video interview analysis tool
- **Stack**: FastAPI + React + PostgreSQL + Docker + AWS
- **Status**: Fully operational (Local + Production)
- **GitHub**: https://github.com/anuragid/qualitative-research-tool

## Critical Commands
```bash
# SAFE
docker-compose down          ✅
docker-compose stop          ✅
./scripts/backup-db.sh       ✅

# DANGEROUS
docker-compose down -v       ❌ DELETES DATABASE
docker volume prune          ❌ DELETES DATA
```

## Before ANY Change
1. Check if it exists: `grep -r "feature_name"`
2. Test locally first: `./scripts/start-local.sh`
3. Backup if major: `./scripts/backup-db.sh`
4. Never commit .env files

## Current Tasks
See: USABILITY_FIXES_REQUIRED.md

## Help Commands
```bash
# Find files
find . -name "*.py" | grep -v venv
find . -name "*.tsx" | grep -v node_modules

# Check what exists
ls backend/app/routes/
ls frontend/src/components/

# Test changes
cd frontend && npm run build
curl http://localhost:8000/health
```

## Production
- Frontend: http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com
- API: http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com

## Recent Critical Fixes (Nov 21, 2024)
- **Backend Bug**: Fixed NameError in `analyze_activate_step` (backend/app/tasks/analysis_steps.py:337)
- **Error Detection**: Improved logic in `analyze_video_task` to check data presence
- **Cross-Video Analysis**: Added re-run capability with new video detection
- **UX Enhancement**: Better running state visibility with time estimates
- **Status**: Video analysis uses "analyzed" status (not "completed")

Last Updated: Nov 21, 2024