# Quick Context for AI Agents

## Start New Session With This:
```
I'm working on a Qualitative Research Tool at:
/Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool/

Read STATUS.md first - AWS has been decommissioned, app needs migration.
```

## Project Summary
- **What**: AI-powered video interview analysis tool
- **Stack**: FastAPI + React + PostgreSQL + Docker
- **Status**: OFFLINE — AWS decommissioned March 2026, self-hosted migration pending
- **Auth**: NEEDS REPLACEMENT (was AWS Cognito)
- **Video Storage**: NEEDS REPLACEMENT (was S3)

## IMPORTANT: AWS Is Gone
- ALL AWS services have been deleted (S3, Cognito, ECS, RDS, everything)
- The app will NOT work until S3 and Cognito are replaced
- Do NOT reference any AWS URLs, endpoints, or credentials — they no longer exist
- Local Docker setup (Postgres + Redis) still works

## What Was Preserved
- 11 unique research videos (3.2 GB) → `../../videos-backup/`
- v1/v2 analysis data → `../../analysis-backup/`
- Full codebase (this repo)

## Critical Commands
```bash
# SAFE
docker compose down            OK
docker compose stop            OK

# DANGEROUS
docker compose down -v         DELETES DATABASE
docker volume prune            DELETES DATA
```

## Before ANY Change
1. Check if it exists: `grep -r "feature_name"`
2. Test locally first
3. Never commit .env files

## Files That Need AWS Replacement
- `backend/app/services/s3_service.py` → local storage or MinIO
- `backend/app/cognito_auth.py` → local JWT auth
- `frontend/src/contexts/CognitoAuthContext.tsx` → local auth context
- `frontend/src/components/auth/CognitoSignIn.tsx` → local login form
- `frontend/src/services/api.ts` → remove AWS Amplify
- `frontend/package.json` → remove aws-amplify packages

Last Updated: March 3, 2026
