# AWS-Only Setup Guide for Qualitative Research Tool

Since you already have an AWS account with a card linked, we'll use **AWS services only**:
- ✅ **AWS S3** - Video storage
- ✅ **AWS RDS PostgreSQL** - Database
- ✅ **AWS ElastiCache Redis** - Task queue & caching
- ✅ **AWS IAM** - Access management

---

## 🏗️ Complete AWS Infrastructure Setup

### 1. AWS S3 Bucket (Video Storage)

**Step 1: Create Bucket**
```bash
AWS Console → S3 → Create Bucket

Settings:
  Bucket name: qualitative-research-videos-[yourname]
  Region: us-east-1 (or your preferred region)
  Block all public access: ✅ YES (keep private)
  Bucket Versioning: ✅ Enable
  Default encryption: ✅ Enable (SSE-S3)
  
Click: Create bucket
```

**Step 2: Create IAM User for S3 Access**
```bash
AWS Console → IAM → Users → Create user

User name: qualitative-research-app
Access type: Programmatic access (Access key)

Click: Next

Permissions: Attach policies directly
  - Create inline policy (see below)

Policy JSON:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketAccess",
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

Click: Create user

Then: Security credentials → Create access key
  → Use case: Application running outside AWS
  
✅ SAVE THESE:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

---

### 2. AWS RDS PostgreSQL (Database)

**Step 1: Create RDS Instance**
```bash
AWS Console → RDS → Create database

Choose a database creation method:
  ✅ Standard create

Engine options:
  ✅ PostgreSQL
  Version: PostgreSQL 15.x (latest stable)

Templates:
  ✅ Free tier (for testing)
  OR
  ✅ Production (for production use)

Settings:
  DB instance identifier: qualitative-research-db
  Master username: postgres
  Master password: [Create strong password - SAVE THIS!]
  Confirm password: [Same password]

DB instance class:
  Free tier: db.t3.micro (1 vCPU, 1 GB RAM)
  Production: db.t3.small or larger

Storage:
  Storage type: General Purpose SSD (gp3)
  Allocated storage: 20 GB (can increase later)
  ✅ Enable storage autoscaling
  Maximum storage threshold: 100 GB

Connectivity:
  ✅ Don't connect to an EC2 compute resource
  
  Network type: IPv4
  
  Virtual private cloud (VPC): Default VPC
  
  Public access: 
    ✅ YES (for development - easier to connect)
    ❌ NO (for production - more secure, requires VPN/bastion)
  
  VPC security group:
    ✅ Create new
    New VPC security group name: qualitative-research-sg
  
  Availability Zone: No preference

Database authentication:
  ✅ Password authentication

Additional configuration:
  Initial database name: qualitative_research
  
  Backup:
    ✅ Enable automated backups
    Backup retention period: 7 days
    
  Encryption:
    ✅ Enable encryption
    
  Monitoring:
    ✅ Enable Enhanced monitoring (optional)

Click: Create database

⏱️ Wait 5-10 minutes for creation
```

**Step 2: Configure Security Group**
```bash
Once database is created:

RDS → Databases → qualitative-research-db → Connectivity & security

Find: VPC security groups → Click on the security group

Inbound rules → Edit inbound rules → Add rule

Type: PostgreSQL
Protocol: TCP
Port: 5432
Source: 
  - For development: My IP (0.0.0.0/0 - NOT recommended for production)
  - For production: Your specific IP or VPC CIDR

Description: PostgreSQL access

Click: Save rules
```

**Step 3: Get Connection Details**
```bash
RDS → Databases → qualitative-research-db

Copy these:
  Endpoint: qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com
  Port: 5432
  Username: postgres
  Database name: qualitative_research

Your connection string:
DATABASE_URL=postgresql://postgres:[password]@qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com:5432/qualitative_research

✅ SAVE THIS!
```

**Step 4: Test Connection**
```bash
# Install PostgreSQL client
brew install postgresql  # Mac
# OR
sudo apt-get install postgresql-client  # Linux

# Test connection
psql "postgresql://postgres:[password]@qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com:5432/qualitative_research"

# Should see:
# postgres=>

# Type: \q to quit
```

---

### 3. AWS ElastiCache Redis (Task Queue & Caching)

**Step 1: Create Redis Cluster**
```bash
AWS Console → ElastiCache → Get started

Cluster engine:
  ✅ Redis

Location:
  ✅ Amazon cloud (not serverless for free tier)

Cluster mode:
  ✅ Disabled (simpler for this use case)

Cluster info:
  Name: qualitative-research-redis
  Description: Redis for Celery tasks
  
Engine version:
  ✅ 7.x (latest)

Port: 6379 (default)

Parameter group: default.redis7

Node type:
  ✅ cache.t3.micro (free tier eligible)
  OR
  cache.t3.small (for production)

Number of replicas: 0 (for development)
  OR 1-2 (for production)

Subnet group:
  ✅ Create new
  Name: qualitative-research-subnet
  VPC: Default VPC
  Subnets: Select 2+ availability zones

Security:
  Security groups:
    ✅ Create new
    Name: qualitative-research-redis-sg
  
  Encryption:
    ✅ Encryption at rest: Enable
    ✅ Encryption in transit: Enable

Logs:
  ✅ Slow logs (optional)
  ✅ Engine logs (optional)

Backup:
  ✅ Enable automatic backups
  Retention: 1 day (for development)

Maintenance:
  ✅ Enable auto minor version upgrade

Click: Create
```

**Step 2: Configure Security Group**
```bash
Once cluster is created:

ElastiCache → Redis clusters → qualitative-research-redis

Click: View details

Security section → Security groups → Click on security group

Inbound rules → Edit inbound rules → Add rule

Type: Custom TCP
Protocol: TCP
Port: 6379
Source:
  - Custom: [Your IP] or VPC CIDR
  - For development: 0.0.0.0/0 (NOT for production)

Description: Redis access

Click: Save rules
```

**Step 3: Get Connection Details**
```bash
ElastiCache → Redis clusters → qualitative-research-redis

Copy:
  Primary endpoint: qualitative-research-redis.xxxxx.cache.amazonaws.com:6379

Your connection string:
REDIS_URL=redis://qualitative-research-redis.xxxxx.cache.amazonaws.com:6379

✅ SAVE THIS!
```

**Step 4: Test Connection**
```bash
# Install Redis CLI
brew install redis  # Mac
# OR
sudo apt-get install redis-tools  # Linux

# Test connection
redis-cli -h qualitative-research-redis.xxxxx.cache.amazonaws.com -p 6379

# Should see:
# qualitative-research-redis.xxxxx.cache.amazonaws.com:6379>

# Test:
# PING
# Should return: PONG

# Type: quit
```

---

### 4. IAM Permissions Summary

Create an IAM user with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::qualitative-research-videos-*",
        "arn:aws:s3:::qualitative-research-videos-*/*"
      ]
    },
    {
      "Sid": "RDSDescribe",
      "Effect": "Allow",
      "Action": [
        "rds:DescribeDBInstances",
        "rds:DescribeDBClusters"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ElastiCacheDescribe",
      "Effect": "Allow",
      "Action": [
        "elasticache:DescribeCacheClusters",
        "elasticache:DescribeReplicationGroups"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 💰 AWS Cost Estimates

### Free Tier (First 12 Months)
```
✅ S3: 5 GB storage + 20,000 GET requests + 2,000 PUT requests/month
✅ RDS: 750 hours of db.t3.micro + 20 GB storage
✅ ElastiCache: 750 hours of cache.t3.micro

Estimated monthly cost: $0 (within free tier limits)
```

### After Free Tier (Approximate)
```
S3:
  - Storage: $0.023/GB/month
  - 100 GB video storage: ~$2.30/month
  - Requests: ~$0.50/month
  
RDS (db.t3.micro):
  - Instance: ~$15/month
  - Storage (20 GB): ~$2.50/month
  
ElastiCache (cache.t3.micro):
  - Instance: ~$12/month

Total: ~$32/month (for minimal usage)

For production with larger instances:
  - db.t3.small: ~$30/month
  - cache.t3.small: ~$25/month
  Total: ~$60-80/month
```

**💡 Cost Saving Tips:**
- Use RDS Reserved Instances (save 30-60%)
- Delete old videos from S3 after processing
- Use S3 Lifecycle policies to move old data to Glacier
- Stop RDS/ElastiCache instances when not in use (dev only)

---

## 🔐 Security Best Practices

### 1. RDS Security
```bash
✅ Use strong master password
✅ Enable encryption at rest
✅ Enable SSL/TLS for connections
✅ Restrict security group to specific IPs
✅ Enable automated backups
✅ Use IAM database authentication (advanced)
```

### 2. ElastiCache Security
```bash
✅ Enable encryption in transit
✅ Enable encryption at rest
✅ Use AUTH token (password)
✅ Restrict security group access
✅ Use VPC with private subnets (production)
```

### 3. S3 Security
```bash
✅ Block all public access
✅ Enable versioning
✅ Enable server-side encryption
✅ Use IAM policies (not bucket ACLs)
✅ Enable access logging (optional)
✅ Use pre-signed URLs for temporary access
```

---

## 📝 Complete Environment Variables

After setup, your `.env` file should have:

```bash
# ===== AWS Configuration =====
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=qualitative-research-videos-yourname

# ===== Database (AWS RDS PostgreSQL) =====
DATABASE_URL=postgresql://postgres:[password]@qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com:5432/qualitative_research

# ===== Redis (AWS ElastiCache) =====
REDIS_URL=redis://qualitative-research-redis.xxxxx.cache.amazonaws.com:6379

# ===== AI APIs (Not AWS) =====
ANTHROPIC_API_KEY=sk-ant-...
ASSEMBLYAI_API_KEY=...

# ===== Application Settings =====
APP_ENV=development
DEBUG=True
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
SECRET_KEY=generate-a-random-string-here

# ===== Celery Configuration =====
CELERY_BROKER_URL=redis://qualitative-research-redis.xxxxx.cache.amazonaws.com:6379/0
CELERY_RESULT_BACKEND=redis://qualitative-research-redis.xxxxx.cache.amazonaws.com:6379/0
```

---

## 🚀 Quick Start After AWS Setup

```bash
# 1. Clone/create your project
cd qualitative-research-tool

# 2. Create .env file
cp backend/.env.example backend/.env
nano backend/.env
# Paste all your AWS connection strings

# 3. Run database migrations
cd backend
alembic upgrade head

# 4. Start backend
uvicorn app.main:app --reload

# 5. Start Celery worker
celery -A app.tasks.celery_app worker --loglevel=info

# 6. Start frontend
cd ../frontend
npm run dev
```

---

## 🧪 Test AWS Connections

### Test S3
```python
import boto3

s3 = boto3.client(
    's3',
    aws_access_key_id='AKIA...',
    aws_secret_access_key='...',
    region_name='us-east-1'
)

# List buckets
buckets = s3.list_buckets()
print(buckets)

# Upload test file
s3.put_object(
    Bucket='qualitative-research-videos-yourname',
    Key='test.txt',
    Body=b'Hello World'
)
print("✅ S3 upload works!")
```

### Test RDS
```python
import psycopg2

conn = psycopg2.connect(
    "postgresql://postgres:[password]@qualitative-research-db.xxxxx.us-east-1.rds.amazonaws.com:5432/qualitative_research"
)
cursor = conn.cursor()
cursor.execute("SELECT version();")
print(cursor.fetchone())
print("✅ RDS connection works!")
conn.close()
```

### Test ElastiCache
```python
import redis

r = redis.Redis(
    host='qualitative-research-redis.xxxxx.cache.amazonaws.com',
    port=6379,
    decode_responses=True
)

# Test connection
r.ping()
print("✅ Redis connection works!")

# Test set/get
r.set('test', 'hello')
value = r.get('test')
print(f"Value: {value}")
```

---

## ⚠️ Common AWS Issues

### Issue: "Can't connect to RDS"
**Solution:**
```bash
1. Check security group allows your IP
2. Check RDS is publicly accessible (for dev)
3. Check endpoint and port are correct
4. Test with: telnet [endpoint] 5432
```

### Issue: "Can't connect to ElastiCache"
**Solution:**
```bash
1. ElastiCache is VPC-only by default
2. Options:
   a) Connect from EC2 instance in same VPC
   b) Use VPN/bastion host
   c) For development: Use Redis locally (docker)
   
# For local development:
docker run -d -p 6379:6379 redis:7
REDIS_URL=redis://localhost:6379
```

### Issue: "S3 upload returns 403"
**Solution:**
```bash
1. Check IAM user has PutObject permission
2. Check bucket policy allows access
3. Check bucket name is correct
4. Test with AWS CLI: aws s3 ls s3://bucket-name
```

### Issue: "RDS is expensive"
**Solution:**
```bash
# For development, use local PostgreSQL:
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=qualitative_research \
  postgres:15

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qualitative_research
```

---

## 🎯 AWS-Only Architecture

```
┌─────────────────────────────────────────────┐
│           AWS Cloud Infrastructure          │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐  ┌──────────────────┐    │
│  │   AWS S3    │  │  AWS RDS         │    │
│  │   Videos    │  │  PostgreSQL      │    │
│  └──────┬──────┘  └────────┬─────────┘    │
│         │                   │               │
│         │                   │               │
│  ┌──────┴───────────────────┴─────────┐   │
│  │    Your FastAPI Backend Server     │   │
│  │    (Can be AWS EC2, Fargate, etc)  │   │
│  └──────────────┬─────────────────────┘   │
│                 │                           │
│         ┌───────┴────────┐                 │
│         │  ElastiCache   │                 │
│         │  Redis         │                 │
│         └────────────────┘                 │
│                                             │
└─────────────────────────────────────────────┘
        │
        ▼
┌────────────────┐
│   React App    │
│   (Frontend)   │
└────────────────┘
```

---

## ✅ You're Ready with AWS!

Everything is now **AWS-native**:
- ✅ S3 for storage
- ✅ RDS for database
- ✅ ElastiCache for Redis
- ✅ IAM for access control

No third-party services except:
- AssemblyAI (transcription)
- Anthropic Claude (AI analysis)

**Next:** Paste the updated prompt into Claude Code and start building! 🚀
