#!/bin/bash

# Deploy to AWS after local testing
# This script validates everything before deployment

set -e

echo "🚀 AWS Deployment Script"
echo "========================"

# Navigate to project root
cd "$(dirname "$0")/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation checks
echo ""
echo "📋 Pre-deployment Validation..."
echo "--------------------------------"

# 1. Check if local environment is running
echo -n "1. Checking local environment... "
if curl -f http://localhost:8000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓ API is running${NC}"
else
    echo -e "${RED}✗ API is not running${NC}"
    echo "   Please run: ./scripts/start-local.sh"
    exit 1
fi

# 2. Check if all tests pass
echo -n "2. Running tests... "
if docker exec qualitative-research-api pytest >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Tests pass${NC}"
else
    echo -e "${YELLOW}⚠ Tests failed or not found${NC}"
    read -p "   Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 3. Check git status
echo -n "3. Checking git status... "
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}✓ Working directory clean${NC}"
else
    echo -e "${YELLOW}⚠ Uncommitted changes${NC}"
    git status --short
    read -p "   Commit changes first? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "   Commit message: " commit_msg
        git add -A
        git commit -m "$commit_msg"
        git push
    fi
fi

# 4. Check AWS credentials
echo -n "4. Checking AWS credentials... "
if aws sts get-caller-identity >/dev/null 2>&1; then
    echo -e "${GREEN}✓ AWS credentials valid${NC}"
else
    echo -e "${RED}✗ AWS credentials invalid${NC}"
    exit 1
fi

echo ""
echo "🏗️  Building and Deploying..."
echo "-----------------------------"

# Backend Deployment
echo ""
echo "📦 BACKEND DEPLOYMENT:"

# 1. Build Docker image
echo "1. Building Docker image (linux/amd64)..."
cd backend
docker buildx build --platform linux/amd64 -t qualitative-research-api -f Dockerfile.unified .

# 2. Tag for ECR
echo "2. Tagging for ECR..."
docker tag qualitative-research-api:latest 723913710517.dkr.ecr.us-east-2.amazonaws.com/qualitative-research-api:latest

# 3. Push to ECR
echo "3. Pushing to ECR..."
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 723913710517.dkr.ecr.us-east-2.amazonaws.com
docker push 723913710517.dkr.ecr.us-east-2.amazonaws.com/qualitative-research-api:latest

# 4. Update ECS services
echo "4. Updating ECS services..."
aws ecs update-service \
    --cluster qualitative-research-prod \
    --service api \
    --force-new-deployment \
    --region us-east-2 \
    --output json >/dev/null

aws ecs update-service \
    --cluster qualitative-research-prod \
    --service workers \
    --force-new-deployment \
    --region us-east-2 \
    --output json >/dev/null

echo -e "${GREEN}✓ Backend deployed${NC}"

# Frontend Deployment
echo ""
echo "🌐 FRONTEND DEPLOYMENT:"
cd ../frontend

# 1. Install dependencies
echo "1. Installing dependencies..."
npm install --silent

# 2. Build for production
echo "2. Building for production..."
npm run build

# 3. Deploy to S3
echo "3. Deploying to S3..."
aws s3 sync dist/ s3://qualitative-research-frontend/ \
    --delete \
    --region us-east-2 \
    --output json >/dev/null

echo -e "${GREEN}✓ Frontend deployed${NC}"

# Wait for deployment to stabilize
echo ""
echo "⏳ Waiting for services to stabilize (30 seconds)..."
sleep 30

# Verify deployment
echo ""
echo "🏥 Verifying Deployment..."
echo "-------------------------"

# Check API health
echo -n "API Health: "
if curl -f http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
    echo "   Check logs: aws logs tail /ecs/qualitative-research-api --region us-east-2"
fi

# Check service status
echo ""
echo "ECS Service Status:"
aws ecs describe-services \
    --cluster qualitative-research-prod \
    --services api workers \
    --region us-east-2 \
    --query 'services[*].[serviceName,runningCount,desiredCount,status]' \
    --output table

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "======================="
echo ""
echo "🌐 URLs:"
echo "   Frontend: http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com"
echo "   API:      http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com"
echo ""
echo "📊 Monitor:"
echo "   Logs:     aws logs tail /ecs/qualitative-research-api --region us-east-2 --follow"
echo "   Status:   aws ecs describe-services --cluster qualitative-research-prod --services api --region us-east-2"
echo ""