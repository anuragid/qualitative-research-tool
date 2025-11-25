# Production Deployment Guide

## Overview

This guide covers deploying your Qualitative Research Tool to production with Clerk authentication and RBAC.

## Current Status

✅ **Development Mode**: You're currently using Clerk development keys (`pk_test_...`)
⚠️ **Production Ready**: The authentication system is production-ready but needs production Clerk keys

## Production Deployment Steps

### 1. Clerk Production Setup

#### A. Create Production Clerk Application

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Click "New Application" or use existing app
3. Note your **Production** API keys:
   - Secret Key: `sk_live_...`
   - Publishable Key: `pk_live_...`

#### B. Configure Clerk for Production

```bash
# In Clerk Dashboard → Configure → Domains
# Add your production domain(s)
https://api.yourapp.com
https://yourapp.com
```

#### C. Set Up Custom JWT Template (Optional but Recommended)

In Clerk Dashboard → JWT Templates → Create Template:

```json
{
  "sub": "{{user.id}}",
  "email": "{{user.primary_email_address}}",
  "first_name": "{{user.first_name}}",
  "last_name": "{{user.last_name}}",
  "username": "{{user.username}}",
  "role": "{{user.public_metadata.role}}",
  "org_id": "{{org.id}}",
  "org_role": "{{org_membership.role}}"
}
```

This ensures all user data is in the JWT and doesn't require database lookups.

### 2. Update Frontend Configuration

```typescript
// frontend/.env.production
VITE_CLERK_PUBLISHABLE_KEY=pk_live_YOUR_PRODUCTION_KEY
VITE_API_URL=https://api.yourapp.com
```

### 3. Update Backend Configuration

```bash
# backend/.env.production
cp .env.production.example .env.production

# Edit .env.production with:
CLERK_SECRET_KEY=sk_live_YOUR_PRODUCTION_SECRET
CLERK_PUBLISHABLE_KEY=pk_live_YOUR_PRODUCTION_PUBLISHABLE
DATABASE_URL=postgresql://...your-rds-endpoint...
REDIS_URL=redis://...your-elasticache-endpoint...
ALLOWED_ORIGINS=https://yourapp.com
```

### 4. Deploy to AWS

#### Option A: ECS Fargate (Recommended)

```bash
# Build and push Docker image
cd backend
docker buildx build --platform linux/amd64 -t your-registry/qualitative-research-api:latest .
docker push your-registry/qualitative-research-api:latest

# Deploy using ECS task definition
# The app will automatically detect production keys and log:
# "🔒 Running with PRODUCTION Clerk keys"
```

#### Option B: EC2

```bash
# On your EC2 instance
git clone your-repo
cd qualitative-research-tool/backend
cp .env.production .env
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5. Run Database Migrations

```bash
# Connect to production database
alembic upgrade head

# Verify tables exist
psql $DATABASE_URL -c "\dt"
```

### 6. Set Up First Admin User

After first user signs up via Clerk:

1. Go to Clerk Dashboard → Users
2. Select the user
3. Add to Public Metadata:
   ```json
   {
     "role": "admin"
   }
   ```
4. User will have admin permissions on next login

## RBAC (Role-Based Access Control)

### Available Roles

1. **Admin** - Full access to everything
   - All permissions
   - Can manage other users (future feature)
   - Can delete any project/video

2. **User** (Default) - Standard user
   - Create/read/update/delete own projects
   - Upload and manage videos
   - Run analyses
   - Cannot access other users' data

3. **Viewer** - Read-only access
   - View projects
   - View analyses
   - Cannot create, update, or delete

### Setting User Roles

#### Via Clerk Dashboard (Manual)

1. Go to Users → Select User → Public Metadata
2. Add:
   ```json
   {
     "role": "admin"  // or "user" or "viewer"
   }
   ```

#### Via API (Future Enhancement)

```python
# In future, admins can change roles via API
# Currently must be done through Clerk Dashboard
```

### Using RBAC in Code

#### Require Specific Role

```python
from app.auth import require_role, UserRole

@router.delete("/admin/projects/{project_id}")
async def admin_delete_project(
    project_id: str,
    current_user: Dict = Depends(require_role(UserRole.ADMIN))
):
    # Only admins can access
    pass
```

#### Require Specific Permission

```python
from app.auth import require_permission, Permission

@router.post("/videos/upload")
async def upload_video(
    file: UploadFile,
    current_user: Dict = Depends(require_permission(Permission.VIDEO_UPLOAD))
):
    # Only users with video:upload permission
    pass
```

#### Require Any of Multiple Permissions

```python
from app.auth import require_any_permission, Permission

@router.get("/projects/{id}")
async def get_project(
    id: str,
    current_user: Dict = Depends(require_any_permission(
        Permission.PROJECT_READ,
        Permission.PROJECT_UPDATE
    ))
):
    # User needs either permission
    pass
```

### Available Permissions

- `project:create` - Create new projects
- `project:read` - View projects
- `project:update` - Edit projects
- `project:delete` - Delete projects
- `video:upload` - Upload videos
- `video:delete` - Delete videos
- `analysis:run` - Run analyses
- `analysis:read` - View analysis results
- `user:manage` - Manage other users (admin only)

## Security Checklist

### Before Going Live

- [ ] Replace all Clerk test keys with production `sk_live_` and `pk_live_` keys
- [ ] Update ALLOWED_ORIGINS to only include production domains
- [ ] Set DEBUG=False
- [ ] Enable HTTPS for all endpoints
- [ ] Set up AWS Secrets Manager for credentials
- [ ] Configure rate limiting on API Gateway/load balancer
- [ ] Set up CloudWatch alarms for errors
- [ ] Enable automated database backups
- [ ] Test authentication flow end-to-end
- [ ] Verify RBAC permissions work correctly
- [ ] Set up error tracking (Sentry, etc.)

### After Deployment

- [ ] Verify logs show "🔒 Running with PRODUCTION Clerk keys"
- [ ] Test user signup and login
- [ ] Test creating projects with different roles
- [ ] Verify viewers cannot create/edit
- [ ] Verify users can only see their own data
- [ ] Test JWT token expiration and refresh
- [ ] Monitor error rates in first 24 hours

## Monitoring

### Health Check

```bash
curl https://api.yourapp.com/health
# Should return: {"status": "healthy", "environment": "production"}
```

### Check Clerk Status

```bash
# Look for this in logs:
"🔒 Running with PRODUCTION Clerk keys"

# If you see this, you're still on dev keys:
"⚠️  Running with DEVELOPMENT Clerk keys - not for production use!"
```

### View Auth Logs

```bash
# CloudWatch Logs
aws logs tail /aws/ecs/qualitative-research-api --follow --filter-pattern "app.auth"
```

## Troubleshooting

### "401 Unauthorized" Errors

1. Check Clerk keys are production keys (`pk_live_`, not `pk_test_`)
2. Verify JWT template includes required claims
3. Check JWKS URL is accessible
4. Verify frontend is sending token in Authorization header

### "403 Forbidden" Errors

1. Check user role in Clerk Dashboard → Users → Public Metadata
2. Verify role is one of: "admin", "user", "viewer"
3. Check endpoint's required permission matches user role

### Users Can't Sign Up

1. Verify Clerk production application has correct domain
2. Check CORS configuration includes frontend domain
3. Verify API is accessible from frontend

## Support

For issues:
1. Check logs in CloudWatch
2. Verify Clerk configuration
3. Test with curl to isolate frontend/backend issues

## Additional Resources

- [Clerk Production Checklist](https://clerk.com/docs/deployments/production-checklist)
- [Clerk Custom JWT Templates](https://clerk.com/docs/backend-requests/making/jwt-templates)
- [FastAPI Security Best Practices](https://fastapi.tiangolo.com/tutorial/security/)
