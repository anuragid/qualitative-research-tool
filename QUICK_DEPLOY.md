# Quick Deploy Checklist

Follow these steps in order for a smooth deployment to AWS.

## ✅ Pre-Deployment Checklist

- [ ] GitHub account with repository access
- [ ] AWS account with billing enabled
- [ ] AssemblyAI API key
- [ ] OpenAI API key
- [ ] AWS credentials (Access Key ID, Secret Access Key)
- [ ] S3 bucket already created and configured

## 📋 Deployment Order (45-60 minutes total)

### Step 1: Database (15 min)
- [ ] Create RDS PostgreSQL database
- [ ] Save endpoint and password
- [ ] Configure security group for public access
- [ ] Test connectivity (optional)

### Step 2: Backend (20 min)
- [ ] Push code to GitHub (if not already)
- [ ] Create App Runner service
- [ ] Connect to GitHub repository
- [ ] Set all environment variables (see template)
- [ ] Wait for deployment
- [ ] Test API at `/docs` endpoint

### Step 3: Frontend (10 min)
- [ ] Create Amplify app
- [ ] Connect to GitHub repository
- [ ] Set `VITE_API_URL` environment variable
- [ ] Wait for deployment
- [ ] Copy Amplify URL

### Step 4: Update CORS (5 min)
- [ ] Update App Runner `ALLOWED_ORIGINS` with Amplify URL
- [ ] Wait for redeployment
- [ ] Test full application

## 🔑 Environment Variables Quick Reference

### App Runner (Backend)
```
DATABASE_URL
ASSEMBLYAI_API_KEY
OPENAI_API_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_BUCKET_NAME
REDIS_URL
ENVIRONMENT
ALLOWED_ORIGINS
```

### Amplify (Frontend)
```
VITE_API_URL
```

## 🧪 Testing

After deployment, test:
1. Backend API: `https://your-apprunner-url.com/docs`
2. Frontend: `https://your-amplify-url.com`
3. Full workflow: Upload video → Transcribe → Label speakers → Analyze

## 📊 Estimated Costs

- **RDS PostgreSQL**: ~$15/month (db.t3.micro)
- **App Runner**: ~$25/month (1 vCPU, 2GB)
- **Amplify**: ~$5/month
- **Total**: ~$45-60/month

## 🆘 Common Issues

**Backend won't start?**
- Check App Runner logs
- Verify DATABASE_URL format
- Ensure RDS allows public access

**Frontend can't reach backend?**
- Verify VITE_API_URL is correct
- Check ALLOWED_ORIGINS in backend
- Check browser console for CORS errors

**Database connection fails?**
- Check RDS security group (port 5432)
- Verify RDS is publicly accessible
- Test credentials

## 📚 Full Documentation

See [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md) for detailed step-by-step instructions.

## 🚀 Ready to Deploy?

Start with Step 1 in the full deployment guide!
