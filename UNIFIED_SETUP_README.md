# Unified Local-AWS Development Setup

## 🎯 Philosophy: "What Works Locally Works on AWS"

This setup ensures your local development environment **exactly mirrors** AWS architecture, eliminating deployment surprises.

## 🚀 Quick Start

### First Time Setup
```bash
# 1. Clone the repo
git clone https://github.com/anuragid/qualitative-research-tool.git
cd qualitative-research-tool

# 2. Ensure you have your API keys in backend/.env
# Copy from backend/.env.example if needed

# 3. Start everything (auto-configures on first run)
./scripts/start-local.sh

# 4. Start frontend in another terminal
cd frontend
npm install
npm run dev

# 5. Open http://localhost:5173
```

### Daily Development
```bash
# Start backend services (API, Worker, DB, Redis)
./scripts/start-local.sh

# Start frontend
cd frontend && npm run dev

# When ready to deploy
./scripts/deploy-to-aws.sh
```

## 📁 New Unified Structure

```
qualitative-research-tool/
├── docker-compose.yml           # THE ONLY docker-compose (mirrors AWS)
├── backend/
│   ├── .env                    # Your API keys (git-ignored)
│   ├── .env.docker-local       # Auto-created for Docker containers
│   ├── .env.aws-production     # Template for AWS (reference only)
│   ├── Dockerfile.unified      # Works for both local and AWS
│   └── scripts/
│       └── startup.sh          # Unified startup script
├── frontend/
│   ├── .env.development        # Local API endpoint
│   └── .env.production         # AWS API endpoint
└── scripts/
    ├── start-local.sh          # Start local (mirrors AWS)
    └── deploy-to-aws.sh        # Deploy to AWS with validation
```

## 🔄 How It Works

### Local Development (Mirrors AWS)
```
Your Code → Docker Containers (linux/amd64) → Same as AWS ECS
    ↓
PostgreSQL Container (like RDS)
Redis Container (like ElastiCache)
API Container (like ECS API Service)
Worker Container (like ECS Worker Service)
```

### Key Differences from Old Setup
| Old Setup | New Unified Setup |
|-----------|------------------|
| Backend ran on Mac directly | Backend runs in Docker container |
| Different architecture (ARM) | Same architecture as AWS (AMD64) |
| Used localhost networking | Uses Docker networking (like AWS) |
| Different file paths | Same containerized paths |
| Manual config changes for deploy | Same config works everywhere |

## 🔧 Configuration

### Environment Variables
The system automatically detects where it's running:

```python
# In your code (config_enhanced.py)
if settings.is_docker_local:
    # Running in local Docker
elif settings.is_ecs:
    # Running in AWS ECS
else:
    # Running directly on host (not recommended)
```

### Database & Redis URLs
- **Local Docker**: `postgres:5432` and `redis:6379` (container names)
- **AWS**: RDS and ElastiCache endpoints
- **Auto-adjusted**: The config automatically uses the right URLs

## 📝 Development Workflow

### 1. Make Changes
```bash
# Edit your code
# Changes auto-reload in containers (volume mounted)
```

### 2. Test Locally
```bash
# View logs
docker-compose logs -f api

# Check health
curl http://localhost:8000/health

# Run tests
docker exec qualitative-research-api pytest
```

### 3. Deploy to AWS
```bash
# This script:
# - Validates local environment is running
# - Runs tests
# - Checks git status
# - Builds and pushes to ECR
# - Updates ECS services
# - Deploys frontend to S3
# - Verifies deployment

./scripts/deploy-to-aws.sh
```

## 🐛 Troubleshooting

### Issue: "Can't connect to database"
```bash
# Check if postgres container is running
docker-compose ps

# Check logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### Issue: "Port 8000 already in use"
```bash
# Find what's using it
lsof -i :8000

# Kill the old backend if running
kill <PID>

# Or just restart everything
docker-compose down
./scripts/start-local.sh
```

### Issue: "Changes not reflecting"
```bash
# Backend changes should auto-reload
# If not, restart the API container
docker-compose restart api

# Frontend changes need rebuild for production
cd frontend && npm run build
```

### Issue: "AWS deployment fails"
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check ECR login
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 723913710517.dkr.ecr.us-east-2.amazonaws.com

# Check ECS service logs
aws logs tail /ecs/qualitative-research-api --region us-east-2
```

## 🎯 Key Benefits

1. **No Surprises**: What works locally WILL work on AWS
2. **Same Architecture**: linux/amd64 everywhere
3. **Same Networking**: Container networking mimics AWS VPC
4. **Same Configuration**: Environment variables work identically
5. **Easy Deployment**: One script validates and deploys everything

## 📊 Service Endpoints

### Local
- Frontend: http://localhost:5173
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Database: localhost:5432 (postgres/postgres)
- Redis: localhost:6379

### AWS Production
- Frontend: http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com
- API: http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com
- Database: RDS (private)
- Redis: ElastiCache (private)

## 🔒 Security Notes

- `.env` files are git-ignored
- API keys are never committed
- Docker containers run with minimal privileges
- AWS uses VPC and security groups for isolation

## 🚀 Next Steps

1. **Add HTTPS**: Use AWS Certificate Manager + CloudFront
2. **Add Domain**: Route53 for custom domain
3. **Add Monitoring**: CloudWatch dashboards
4. **Add CI/CD**: GitHub Actions for automatic deployment
5. **Add Staging**: Separate staging environment

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)

---

**Remember**: Always test locally first, then deploy. The unified setup ensures consistency!