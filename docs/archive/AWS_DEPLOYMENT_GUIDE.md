# AWS Deployment Guide
# 5D Qualitative Research Analysis Tool

This guide will walk you through deploying your application to AWS using:
- **RDS PostgreSQL** for the database
- **AWS App Runner** for the backend API
- **AWS Amplify** for the frontend
- **S3** for video storage (already configured)

**Estimated Time:** 45-60 minutes
**Estimated Monthly Cost:** $40-60

---

## Prerequisites

- AWS Account with billing enabled
- GitHub account (repo must be pushed)
- AWS CLI installed (optional but helpful)
- The following API keys ready:
  - AssemblyAI API key
  - OpenAI API key
  - AWS credentials (Access Key ID, Secret Access Key)

---

## Step 1: Create RDS PostgreSQL Database (15 minutes)

### 1.1 Navigate to RDS

1. Log into AWS Console
2. Search for "RDS" in the top search bar
3. Click "Create database"

### 1.2 Configure Database

**Engine options:**
- Engine type: PostgreSQL
- Version: PostgreSQL 15.x (latest available)

**Templates:**
- Select: **Production** (for best performance)
  - Or **Free tier** if available and testing first

**Settings:**
- DB instance identifier: `qualitative-research-db`
- Master username: `postgres`
- Master password: **Create a strong password and save it**
- Confirm password

**Instance configuration:**
- DB instance class: `db.t3.micro` (1 vCPU, 1 GB RAM) - ~$15/month
- For production: `db.t3.small` (2 vCPU, 2 GB RAM) - ~$30/month

**Storage:**
- Storage type: General Purpose SSD (gp3)
- Allocated storage: 20 GB
- Enable storage autoscaling: Yes
- Maximum storage threshold: 100 GB

**Connectivity:**
- Virtual Private Cloud (VPC): Default VPC
- Public access: **Yes** (required for App Runner)
- VPC security group: Create new
- Security group name: `qualitative-research-sg`

**Database authentication:**
- Password authentication

**Additional configuration:**
- Initial database name: `qualitative_research`
- Backup retention: 7 days
- Enable automatic backups: Yes
- Enable encryption: Yes

### 1.3 Create Database

1. Click "Create database"
2. Wait 5-10 minutes for creation
3. Once available, click on the database name
4. **Copy the Endpoint** (something like: `qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com`)
5. Save this endpoint - you'll need it later

### 1.4 Configure Security Group

1. Click on the security group link under "VPC security groups"
2. Click "Edit inbound rules"
3. Add rule:
   - Type: PostgreSQL
   - Protocol: TCP
   - Port: 5432
   - Source: `0.0.0.0/0` (allows connections from anywhere - App Runner needs this)
4. Click "Save rules"

**Your database connection string will be:**
```
postgresql://postgres:YOUR_PASSWORD@qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com:5432/qualitative_research
```

---

## Step 2: Deploy Backend to AWS App Runner (20 minutes)

### 2.1 Push Code to GitHub

If you haven't already:

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
git add .
git commit -m "Add AWS deployment configuration"
git push origin main
```

### 2.2 Navigate to App Runner

1. Search for "App Runner" in AWS Console
2. Click "Create service"

### 2.3 Configure Source

**Source:**
- Repository type: Source code repository
- Connect to GitHub:
  - Click "Add new"
  - Authorize AWS with GitHub
  - Select your repository
  - Branch: `main`

**Deployment settings:**
- Deployment trigger: Automatic
- Path to Dockerfile: `qualitative-research-tool/backend/Dockerfile`

Click "Next"

### 2.4 Configure Build

**Build settings:**
- Use the Dockerfile in the repository

**Configuration file:**
- Use default (App Runner will detect settings from Dockerfile)

Click "Next"

### 2.5 Configure Service

**Service settings:**
- Service name: `qualitative-research-api`
- Port: `8000`
- Virtual CPU: 1 vCPU
- Memory: 2 GB

**Environment variables:**
Add the following variables (click "Add environment variable" for each):

| Name | Value |
|------|-------|
| `DATABASE_URL` | `postgresql://postgres:YOUR_PASSWORD@qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com:5432/qualitative_research` |
| `ASSEMBLYAI_API_KEY` | Your AssemblyAI API key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |
| `AWS_REGION` | `us-east-1` (or your S3 bucket region) |
| `AWS_BUCKET_NAME` | Your S3 bucket name |
| `REDIS_URL` | `redis://localhost:6379` (placeholder for now) |
| `ENVIRONMENT` | `production` |
| `ALLOWED_ORIGINS` | `*` (will update after Amplify deployment) |

**Health check:**
- Protocol: HTTP
- Path: `/health`
- Interval: 30 seconds
- Timeout: 5 seconds
- Healthy threshold: 1
- Unhealthy threshold: 3

**Auto scaling:**
- Minimum instances: 1
- Maximum instances: 3
- Concurrency: 100

Click "Next"

### 2.6 Review and Create

1. Review all settings
2. Click "Create & deploy"
3. Wait 10-15 minutes for deployment
4. Once deployed, copy the **App Runner URL** (something like: `https://xxxxx.us-east-1.awsapprunner.com`)
5. **Test the API:** Visit `https://xxxxx.us-east-1.awsapprunner.com/docs` to see the API documentation

---

## Step 3: Deploy Frontend to AWS Amplify (10 minutes)

### 3.1 Navigate to AWS Amplify

1. Search for "Amplify" in AWS Console
2. Click "Get started" under "Amplify Hosting"
3. Select "GitHub" as the repository provider
4. Click "Continue"

### 3.2 Connect Repository

1. Authorize AWS Amplify with GitHub
2. Select your repository
3. Select branch: `main`
4. Check "Connecting a monorepo? Pick a folder"
5. Folder path: `qualitative-research-tool/frontend`
6. Click "Next"

### 3.3 Configure Build Settings

**App name:** `qualitative-research-frontend`

**Build settings:**
The `amplify.yml` file will be auto-detected from your repository.

**Environment variables:**
Add the following:

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://xxxxx.us-east-1.awsapprunner.com` (your App Runner URL) |

**Advanced settings:**
- Node version: Latest (or specify if needed)

Click "Next"

### 3.4 Review and Deploy

1. Review settings
2. Click "Save and deploy"
3. Wait 5-10 minutes for deployment
4. Once deployed, you'll get an Amplify URL like: `https://main.xxxxx.amplifyapp.com`

---

## Step 4: Update CORS Configuration (5 minutes)

Now that you have the Amplify URL, update the backend CORS settings:

### 4.1 Update App Runner Environment Variables

1. Go back to App Runner console
2. Click on your service: `qualitative-research-api`
3. Click "Configuration" tab
4. Click "Edit" under "Environment variables"
5. Update `ALLOWED_ORIGINS`:
   - Value: `https://main.xxxxx.amplifyapp.com` (your Amplify URL)
6. Click "Save changes"
7. App Runner will automatically redeploy (3-5 minutes)

---

## Step 5: Test Your Application (5 minutes)

### 5.1 Access Frontend

1. Open your Amplify URL: `https://main.xxxxx.amplifyapp.com`
2. You should see the login/home page

### 5.2 Test Full Workflow

1. Create a new project
2. Upload a video
3. Start transcription
4. Label speakers
5. Run analysis

---

## Step 6: Set Up Redis for Background Tasks (Optional but Recommended)

Your app uses Celery for background tasks. For production, you need Redis:

### Option A: ElastiCache Redis (Managed, Recommended)

1. Go to ElastiCache in AWS Console
2. Create Redis cluster
3. Choose: Redis
4. Node type: `cache.t3.micro`
5. Number of replicas: 0
6. Subnet: Same VPC as RDS
7. Security group: Allow port 6379 from App Runner
8. Get the endpoint and update `REDIS_URL` in App Runner

### Option B: Redis Cloud (External, Easier)

1. Sign up at https://redis.com/try-free/
2. Create a free database
3. Get connection URL
4. Update `REDIS_URL` in App Runner environment variables

---

## Environment Variables Reference

### Backend (App Runner)

```env
DATABASE_URL=postgresql://postgres:PASSWORD@endpoint:5432/qualitative_research
ASSEMBLYAI_API_KEY=your_assemblyai_key
OPENAI_API_KEY=your_openai_key
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your_bucket_name
REDIS_URL=redis://your-redis-endpoint:6379
ENVIRONMENT=production
ALLOWED_ORIGINS=https://main.xxxxx.amplifyapp.com
```

### Frontend (Amplify)

```env
VITE_API_URL=https://xxxxx.us-east-1.awsapprunner.com
```

---

## Monitoring & Troubleshooting

### App Runner Logs

1. Go to App Runner → Your service
2. Click "Logs" tab
3. View application logs and deployment logs

### Amplify Logs

1. Go to Amplify → Your app
2. Click on the build
3. View build logs

### RDS Logs

1. Go to RDS → Your database
2. Click "Logs & events"
3. View PostgreSQL logs

### Common Issues

**Backend won't start:**
- Check App Runner logs
- Verify DATABASE_URL is correct
- Ensure RDS security group allows connections

**Frontend can't connect to backend:**
- Check VITE_API_URL is correct
- Verify CORS settings in App Runner
- Check browser console for errors

**Database connection fails:**
- Verify RDS is publicly accessible
- Check security group allows port 5432
- Verify credentials are correct

---

## Cost Breakdown (Estimated Monthly)

| Service | Configuration | Cost |
|---------|--------------|------|
| RDS PostgreSQL | db.t3.micro, 20GB | ~$15 |
| App Runner | 1 vCPU, 2GB RAM | ~$25 |
| Amplify Hosting | Build minutes + hosting | ~$5 |
| S3 Storage | Video files | Variable |
| Data Transfer | Out to internet | Variable |
| **Total** | | **~$45-60/month** |

---

## Next Steps

1. **Custom Domain:**
   - Set up Route53 or use your domain registrar
   - Add custom domain in Amplify
   - Update ALLOWED_ORIGINS

2. **SSL/HTTPS:**
   - Already included with Amplify and App Runner!

3. **Monitoring:**
   - Set up CloudWatch alarms
   - Configure log retention

4. **Backups:**
   - RDS automated backups are enabled
   - Consider S3 versioning for videos

5. **Scaling:**
   - Increase App Runner instances if needed
   - Upgrade RDS instance size

---

## Support

If you encounter issues:
1. Check App Runner and Amplify logs
2. Verify all environment variables are set correctly
3. Test backend API directly: `https://your-app-runner-url.com/docs`
4. Check database connectivity from App Runner logs

---

**Deployment Complete!** 🎉

Your application is now live and accessible at your Amplify URL.
