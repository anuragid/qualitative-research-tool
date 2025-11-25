# Simple Clerk Setup for AWS (No Custom Domain)

## 1. Create Production Instance in Clerk

1. Go to https://dashboard.clerk.com
2. Click your development instance dropdown at the top
3. Select "Create production instance"
4. Choose "Clone from development" to copy your settings

## 2. Configure Allowed Origins (IMPORTANT!)

In your Clerk production instance:

1. Go to **Settings** → **Domains**
2. Under **Allowed origins**, add these URLs:
   ```
   http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com
   http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com
   ```
3. Save the changes

## 3. Get Your Production Keys

1. Go to **API Keys** in Clerk Dashboard
2. Copy these keys:
   - **Publishable key**: `pk_live_...`
   - **Secret key**: `sk_live_...`

## 4. Update Frontend Production Config

Edit `frontend/.env.production`:
```bash
VITE_CLERK_PUBLISHABLE_KEY=VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsucXVhbGl0YXRpdmUtcmVzZWFyY2gtZnJvbnRlbmQuczMtd2Vic2l0ZS51cy1lYXN0LTIuYW1hem9uYXdzLmNvbSQ
```

## 5. Update Backend (AWS ECS)

### Option A: Via AWS Console (Easier)
1. Go to AWS ECS Console
2. Navigate to: Task Definitions → qualitative-research-api
3. Create new revision
4. Add Environment Variables:
   - `CLERK_SECRET_KEY`: Your sk_live_... key
   - `CLERK_PUBLISHABLE_KEY`: Your pk_live_... key
5. Update both `api` and `workers` services to use new task definition

### Option B: Via AWS CLI
```bash
# You'll need to update the task definition JSON with the env vars
# Then register new task definition and update services
```

## 6. Redeploy Frontend

```bash
cd frontend
npm run build  # or npx vite build
aws s3 sync dist/ s3://qualitative-research-frontend/ --delete --region us-east-2
```

## That's it! No DNS, No Custom Domain Needed

The free Clerk tier gives you:
- Unlimited MAUs (Monthly Active Users) for development
- 10,000 MAUs for production (more than enough)
- All authentication features
- No credit card required

## Notes:
- You DON'T need to set up DNS records
- You DON'T need a custom domain
- You DON'T need Clerk Pro
- The AWS URLs work perfectly fine with Clerk