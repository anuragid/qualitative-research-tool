# ✅ Getting Started Checklist

Use this checklist to ensure you have everything set up correctly before building with Claude Code.

---

## Phase 1: Account Setup (Do This First!)

### AWS Setup
- [ ] **Log into AWS Console** (you already have account)
- [ ] **Create S3 Bucket**
  - [ ] Go to S3 → Create Bucket
  - [ ] Name: `qualitative-research-videos-[yourname]`
  - [ ] Region: `us-east-1`
  - [ ] Block all public access: ✅ YES
  - [ ] Enable versioning: ✅ YES
  - [ ] Click "Create bucket"

- [ ] **Create IAM User**
  - [ ] Go to IAM → Users → Add User
  - [ ] Name: `qualitative-research-app`
  - [ ] Access type: Programmatic access
  - [ ] Click Next

- [ ] **Attach S3 Policy**
  - [ ] Create custom policy (see below)
  - [ ] OR attach `AmazonS3FullAccess` (easier but less secure)

- [ ] **Create Access Keys**
  - [ ] Go to user → Security credentials
  - [ ] Create access key → "Application running outside AWS"
  - [ ] **SAVE THESE IMMEDIATELY:**
    ```
    AWS_ACCESS_KEY_ID=AKIA...
    AWS_SECRET_ACCESS_KEY=...
    ```

**Custom S3 Policy (Recommended):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::qualitative-research-videos-[yourname]",
        "arn:aws:s3:::qualitative-research-videos-[yourname]/*"
      ]
    }
  ]
}
```

---

### AssemblyAI Setup
- [ ] **Sign up at https://www.assemblyai.com/**
- [ ] **Go to Dashboard**
- [ ] **Copy API key**
- [ ] **Save as:**
  ```
  ASSEMBLYAI_API_KEY=...
  ```
- [ ] Note: Free tier = 3 hours/month

---

### Anthropic Claude Setup
- [ ] **Sign up at https://console.anthropic.com/**
- [ ] **Go to Settings → API Keys**
- [ ] **Create new API key**
- [ ] **Save as:**
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  ```
- [ ] Note: Starts at $5 credit

---

### AWS RDS PostgreSQL Setup (Database)
- [ ] **Go to AWS Console → RDS → Create database**
- [ ] **Configure database:**
  - [ ] Engine: PostgreSQL 15.x
  - [ ] Template: Free tier (for dev) or Production
  - [ ] DB instance identifier: `qualitative-research-db`
  - [ ] Master username: `postgres`
  - [ ] Master password: (create strong password - SAVE THIS!)
  - [ ] DB instance class: db.t3.micro (free tier)
  - [ ] Storage: 20 GB, enable autoscaling
  - [ ] Public access: YES (for development)
  - [ ] Create new VPC security group: `qualitative-research-sg`
  - [ ] Initial database name: `qualitative_research`
  - [ ] Click Create database
  - [ ] Wait 5-10 minutes for creation
- [ ] **Configure Security Group:**
  - [ ] RDS → Select database → Connectivity & security
  - [ ] Click on VPC security group
  - [ ] Inbound rules → Edit → Add rule
  - [ ] Type: PostgreSQL, Port: 5432
  - [ ] Source: My IP (or 0.0.0.0/0 for dev only)
- [ ] **Get connection details:**
  - [ ] Copy Endpoint (e.g., qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com)
  - [ ] Port: 5432
  - [ ] **Save as:**
    ```
    DATABASE_URL=postgresql://postgres:[password]@[endpoint]:5432/qualitative_research
    ```
- [ ] **Test connection:**
  ```bash
  psql "postgresql://postgres:[password]@[endpoint]:5432/qualitative_research"
  # Should connect successfully
  ```

---

### AWS ElastiCache Redis Setup (Task Queue)
- [ ] **Go to AWS Console → ElastiCache → Create**
- [ ] **Configure cluster:**
  - [ ] Cluster engine: Redis
  - [ ] Cluster mode: Disabled
  - [ ] Name: `qualitative-research-redis`
  - [ ] Engine version: 7.x
  - [ ] Port: 6379
  - [ ] Node type: cache.t3.micro (free tier)
  - [ ] Number of replicas: 0 (for dev)
  - [ ] Create new subnet group (select 2+ AZs)
  - [ ] Create new security group: `qualitative-research-redis-sg`
  - [ ] Enable encryption at rest and in transit
  - [ ] Click Create
- [ ] **Configure Security Group:**
  - [ ] ElastiCache → Select cluster → Security
  - [ ] Click on security group
  - [ ] Inbound rules → Edit → Add rule
  - [ ] Type: Custom TCP, Port: 6379
  - [ ] Source: My IP (or 0.0.0.0/0 for dev only)
- [ ] **Get connection details:**
  - [ ] Copy Primary endpoint (e.g., qualitative-research-redis.xxxxx.cache.amazonaws.com:6379)
  - [ ] **Save as:**
    ```
    REDIS_URL=redis://[endpoint]:6379
    ```
- [ ] **Test connection:**
  ```bash
  redis-cli -h [endpoint] -p 6379
  # Type: PING
  # Should return: PONG
  ```

**💡 For Local Development (Alternative):**
```bash
# Use Docker for local Redis (easier for testing)
docker run -d -p 6379:6379 redis:7
REDIS_URL=redis://localhost:6379/0
```

---

## Phase 2: Prepare Your Environment Variables

Create a file called `api-keys.txt` and paste all your keys:

```bash
# AWS
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=qualitative-research-videos-yourname

# AI APIs
ANTHROPIC_API_KEY=sk-ant-...
ASSEMBLYAI_API_KEY=...

# Database (AWS RDS PostgreSQL)
DATABASE_URL=postgresql://postgres:[password]@qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com:5432/qualitative_research

# Redis (AWS ElastiCache)
REDIS_URL=redis://qualitative-research-redis.xxxxx.cache.amazonaws.com:6379

# OR (if using local Docker Redis for development)
REDIS_URL=redis://localhost:6379/0

# App Settings
APP_ENV=development
DEBUG=True
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Keep this file safe! You'll paste it into .env later.**

---

## Phase 3: Verify Your Setup

### Test AWS Access
```bash
# Install AWS CLI (if not already)
brew install awscli  # Mac
# OR
sudo apt-get install awscli  # Linux

# Configure
aws configure
# Paste your AWS_ACCESS_KEY_ID
# Paste your AWS_SECRET_ACCESS_KEY
# Region: us-east-1
# Output format: json

# Test S3 access
aws s3 ls s3://qualitative-research-videos-yourname

# Should return empty list (no error)
```

### Test AssemblyAI
```bash
curl --request GET \
  --url https://api.assemblyai.com/v2/transcript \
  --header "authorization: YOUR_ASSEMBLYAI_API_KEY"

# Should return: {"error":"API key is missing or invalid"}
# (This means your key format is correct)
```

### Test Claude API
```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: YOUR_ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }'

# Should return a response with content
```

---

## Phase 4: Ready for Claude Code

Now you're ready! You have:
- ✅ AWS S3 bucket created
- ✅ IAM user with access keys
- ✅ AWS RDS PostgreSQL database
- ✅ AWS ElastiCache Redis cluster
- ✅ AssemblyAI API key
- ✅ Anthropic Claude API key
- ✅ All keys saved in `api-keys.txt`

---

## Phase 5: Build with Claude Code

### Option 1: Use the Quick Start Prompt

Open Claude Code and paste the entire prompt from:
`Quick_Start_Guide_Claude_Code.md`

It starts with:
```
I need to build a Qualitative Research Analysis Tool with the following specifications:
...
```

### Option 2: Build Phase by Phase

Or use Claude Code step-by-step:

**Step 1: Setup**
```
Create project structure for qualitative research tool:
- Backend: Python FastAPI
- Frontend: React TypeScript
- Database: PostgreSQL
- Use the file structure from my requirements doc

Include:
- Docker compose for local development
- requirements.txt with all dependencies
- .env.example file
```

**Step 2: After project is created**
```bash
cd qualitative-research-tool/backend
cp .env.example .env
nano .env

# Paste your keys from api-keys.txt
```

**Step 3: Continue with Claude Code**
```
Now implement:
1. S3 service for video upload/download
2. AssemblyAI service for transcription
3. Claude API service wrapper
4. Database models for all tables
```

... and so on following the phases.

---

## Phase 6: First Run Checklist

- [ ] **Start Docker services**
  ```bash
  docker-compose up -d
  # Check they're running
  docker-compose ps
  ```

- [ ] **Run database migrations**
  ```bash
  cd backend
  alembic upgrade head
  ```

- [ ] **Start backend**
  ```bash
  uvicorn app.main:app --reload
  ```
  - [ ] Open http://localhost:8000/docs
  - [ ] Should see API docs

- [ ] **Start Celery worker** (in another terminal)
  ```bash
  celery -A app.tasks.celery_app worker --loglevel=info
  ```
  - [ ] Should see "celery@hostname ready"

- [ ] **Start frontend** (in another terminal)
  ```bash
  cd frontend
  npm run dev
  ```
  - [ ] Open http://localhost:5173
  - [ ] Should see UI

---

## Phase 7: Test the Full Flow

### Create a Test Video
Download a short interview video from YouTube:
```bash
# Install yt-dlp
pip install yt-dlp

# Download a 2-minute interview
yt-dlp -f "best[height<=720]" --output "test-interview.mp4" "YOUTUBE_URL_HERE"
```

Or use any MP4/MOV file under 500MB.

### Test Steps
- [ ] **Create project**
  - [ ] Click "New Project"
  - [ ] Enter name: "Test Project"
  - [ ] See project in list

- [ ] **Upload video**
  - [ ] Drag video file to upload zone
  - [ ] See progress bar
  - [ ] Video appears in project

- [ ] **Wait for transcription**
  - [ ] Status changes to "Transcribing"
  - [ ] Wait 1-2 minutes
  - [ ] Status changes to "Transcribed"
  - [ ] Click video to view transcript

- [ ] **Label speakers**
  - [ ] See "Speaker A", "Speaker B", etc.
  - [ ] Assign names (Interviewer, John Doe, etc.)
  - [ ] Click "Save Labels"

- [ ] **Run analysis**
  - [ ] Click "Run Analysis"
  - [ ] See progress through 5 steps:
    - [ ] Chunk (1/5)
    - [ ] Infer (2/5)
    - [ ] Relate (3/5)
    - [ ] Explain (4/5)
    - [ ] Activate (5/5)
  - [ ] Status changes to "Complete"

- [ ] **View results**
  - [ ] Click "View Results"
  - [ ] See all tabs:
    - [ ] Chunks
    - [ ] Inferences
    - [ ] Patterns
    - [ ] Insights
    - [ ] Design Principles

- [ ] **Export results**
  - [ ] Click "Export"
  - [ ] Download JSON / PDF / DOCX

---

## Common Issues & Solutions

### Issue: "Cannot connect to database"
```bash
# Check AWS RDS connection string is correct
psql "DATABASE_URL"

# Should connect without error

# Also check security group allows your IP:
# RDS → Database → Security groups → Inbound rules
```

### Issue: "S3 upload fails"
```bash
# Test S3 access
aws s3 ls s3://your-bucket-name

# Check IAM policy is attached to user
```

### Issue: "Redis connection refused"
```bash
# If using local Redis, start it:
docker-compose up redis -d

# If using Upstash, check URL is correct
```

### Issue: "AssemblyAI returns 401"
```bash
# Check API key is correct
echo $ASSEMBLYAI_API_KEY

# Should not be empty
```

### Issue: "Claude API returns 401"
```bash
# Check API key format
echo $ANTHROPIC_API_KEY | cut -c 1-10

# Should start with: sk-ant-api
```

### Issue: "LangGraph module not found"
```bash
pip install langgraph langchain-anthropic langchain-core
```

### Issue: "Frontend can't connect to backend"
```bash
# Check CORS is configured in backend
# backend/app/main.py should have:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Next Steps After MVP Works

- [ ] Add user authentication (Clerk, Auth0, or AWS Cognito)
- [ ] Deploy to production (Fly.io, Railway, or Vercel)
- [ ] Set up monitoring (Sentry for errors)
- [ ] Add email notifications
- [ ] Create onboarding tutorial
- [ ] Add team collaboration features

---

## 🎉 You're Ready!

You now have:
1. ✅ All accounts created
2. ✅ All API keys collected
3. ✅ Environment verified
4. ✅ Clear path forward with Claude Code

**Start building with Claude Code using the Quick Start prompt!**

Questions? Issues? 
- Check the main requirements doc for details
- Check the LangGraph guide for agent architecture
- Check AWS/RDS/ElastiCache docs for infrastructure

**Good luck! 🚀**
