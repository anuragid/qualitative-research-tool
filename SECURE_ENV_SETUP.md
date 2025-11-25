# Secure Environment Setup (NO KEYS HERE)

## ⚠️ SECURITY NOTICE
**NEVER put actual keys in markdown files or commit them to git!**

## Secure Files Created (All GITIGNORED)

### Frontend Production
- **File**: `frontend/.env.production.local`
- **Status**: ✅ Created with your production keys
- **Git**: 🔒 GITIGNORED - Will not be committed

### Backend Production
- **File**: `backend/.env.production`
- **Status**: ✅ Created with your production keys
- **Git**: 🔒 GITIGNORED - Will not be committed

## Now Let's Deploy with Production Keys

### 1. Build Frontend with Production Keys
```bash
cd frontend
# Vite will automatically use .env.production.local
npm run build
```

### 2. Deploy Frontend to S3
```bash
aws s3 sync dist/ s3://qualitative-research-frontend/ --delete --region us-east-2
```

### 3. Update Backend in AWS ECS
We need to set environment variables in ECS task definitions.

## AWS ECS Update Commands

```bash
# First, let's get the current task definition
aws ecs describe-task-definition \
  --task-definition qualitative-research-api \
  --region us-east-2 \
  --query 'taskDefinition' > task-def-api.json

# Then update for workers
aws ecs describe-task-definition \
  --task-definition qualitative-research-workers \
  --region us-east-2 \
  --query 'taskDefinition' > task-def-workers.json
```

Then manually edit these JSON files to add the Clerk keys to environment variables,
or use the AWS Console which is easier.

## Verify Your Keys Are Working

After deployment, check:
1. Frontend loads and shows Clerk sign-in
2. Backend accepts authenticated requests
3. No rate limiting errors

## Security Best Practices Applied

✅ Production keys stored in `.env.production.local` (gitignored)
✅ Backend keys in `.env.production` (gitignored)
✅ No keys in markdown files
✅ No keys in git history
✅ Separate dev and production keys