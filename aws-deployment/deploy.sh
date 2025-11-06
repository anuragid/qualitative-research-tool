#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}AWS Deployment Script for Qualitative Research Tool${NC}"
echo "======================================================"
echo ""

# Configuration
REGION="us-east-2"
CLUSTER_NAME="qualitative-research-prod"
AWS_ACCOUNT_ID="723913710517"

# Step 1: Check if ECS cluster exists or create it
echo -e "${YELLOW}Step 1: Creating ECS Cluster${NC}"
aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $REGION 2>/dev/null || echo "Cluster already exists"
echo -e "${GREEN}✓ ECS Cluster ready${NC}"
echo ""

# Step 2: Create IAM roles if needed
echo -e "${YELLOW}Step 2: Checking IAM Roles${NC}"
aws iam get-role --role-name ecsTaskExecutionRole 2>/dev/null || {
    echo "Creating ECS Task Execution Role..."
    aws iam create-role --role-name ecsTaskExecutionRole \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }'

    aws iam attach-role-policy --role-name ecsTaskExecutionRole \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
}
echo -e "${GREEN}✓ IAM Roles ready${NC}"
echo ""

# Step 3: Get ElastiCache endpoint
echo -e "${YELLOW}Step 3: ElastiCache Redis Configuration${NC}"
echo -e "${RED}MANUAL STEP REQUIRED:${NC}"
echo "1. Open AWS Console: https://console.aws.amazon.com/elasticache/"
echo "2. Click 'Get Started' or 'Create'"
echo "3. Choose 'Redis' and 'Cluster Mode Disabled'"
echo "4. Settings:"
echo "   - Name: qualitative-research-redis"
echo "   - Node type: cache.t3.micro"
echo "   - Number of replicas: 0"
echo "   - Multi-AZ: No"
echo "5. Advanced Settings:"
echo "   - Subnet group: default"
echo "   - Security groups: Create new or use existing (allow port 6379)"
echo ""
read -p "Press Enter after creating Redis and paste the endpoint here: " REDIS_ENDPOINT
echo ""

if [ -z "$REDIS_ENDPOINT" ]; then
    echo -e "${RED}Redis endpoint required. Using placeholder for now.${NC}"
    REDIS_ENDPOINT="your-redis.cache.amazonaws.com:6379"
fi

# Step 4: Update task definitions with Redis endpoint
echo -e "${YELLOW}Step 4: Updating task definitions with Redis endpoint${NC}"
sed -i.bak "s|REPLACE_WITH_ELASTICACHE_ENDPOINT|redis://$REDIS_ENDPOINT/0|g" api-task-definition.json
sed -i.bak "s|REPLACE_WITH_ELASTICACHE_ENDPOINT|redis://$REDIS_ENDPOINT/0|g" worker-task-definition.json
echo -e "${GREEN}✓ Task definitions updated${NC}"
echo ""

# Step 5: Register task definitions
echo -e "${YELLOW}Step 5: Registering ECS Task Definitions${NC}"
aws ecs register-task-definition --cli-input-json file://api-task-definition.json --region $REGION
aws ecs register-task-definition --cli-input-json file://worker-task-definition.json --region $REGION
echo -e "${GREEN}✓ Task definitions registered${NC}"
echo ""

# Step 6: Create Application Load Balancer
echo -e "${YELLOW}Step 6: Application Load Balancer Configuration${NC}"
echo -e "${RED}MANUAL STEP REQUIRED:${NC}"
echo "1. Open AWS Console: https://console.aws.amazon.com/ec2/v2/home#LoadBalancers"
echo "2. Click 'Create Load Balancer' > 'Application Load Balancer'"
echo "3. Settings:"
echo "   - Name: qualitative-research-alb"
echo "   - Scheme: Internet-facing"
echo "   - IP address type: IPv4"
echo "4. Network mapping:"
echo "   - VPC: Default VPC"
echo "   - Mappings: Select at least 2 availability zones"
echo "5. Security groups:"
echo "   - Create new: Allow HTTP (80) and HTTPS (443) from 0.0.0.0/0"
echo "6. Target group:"
echo "   - Target type: IP"
echo "   - Protocol: HTTP, Port: 8000"
echo "   - Health check path: /health"
echo "   - Name: qualitative-research-tg"
echo ""
read -p "Press Enter after creating ALB and paste the DNS name here: " ALB_DNS
read -p "Paste the Target Group ARN here: " TARGET_GROUP_ARN
echo ""

# Step 7: Get VPC and subnet info
echo -e "${YELLOW}Step 7: Network Configuration${NC}"
echo -e "${RED}MANUAL STEP REQUIRED:${NC}"
echo "From the AWS Console VPC section, note your:"
read -p "Enter Subnet ID 1 (e.g., subnet-xxxxx): " SUBNET1
read -p "Enter Subnet ID 2 (e.g., subnet-yyyyy): " SUBNET2
read -p "Enter Security Group ID (from ALB or create new, e.g., sg-xxxxx): " SECURITY_GROUP
echo ""

# Step 8: Create API Service
echo -e "${YELLOW}Step 8: Creating API Service${NC}"
aws ecs create-service \
  --cluster $CLUSTER_NAME \
  --service-name api \
  --task-definition qualitative-research-api:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET1,$SUBNET2],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TARGET_GROUP_ARN,containerName=api,containerPort=8000" \
  --region $REGION
echo -e "${GREEN}✓ API Service created${NC}"
echo ""

# Step 9: Create Worker Service
echo -e "${YELLOW}Step 9: Creating Worker Service${NC}"
aws ecs create-service \
  --cluster $CLUSTER_NAME \
  --service-name workers \
  --task-definition qualitative-research-worker:1 \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET1,$SUBNET2],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --region $REGION
echo -e "${GREEN}✓ Worker Service created${NC}"
echo ""

# Step 10: Deploy Frontend
echo -e "${YELLOW}Step 10: Frontend Deployment${NC}"
cd ../frontend

# Create S3 bucket for frontend
FRONTEND_BUCKET="qualitative-research-frontend-$AWS_ACCOUNT_ID"
aws s3 mb s3://$FRONTEND_BUCKET --region $REGION 2>/dev/null || echo "Bucket exists"

# Enable static website hosting
aws s3 website s3://$FRONTEND_BUCKET \
  --index-document index.html \
  --error-document index.html

# Set bucket policy for public access
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$FRONTEND_BUCKET/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy --bucket $FRONTEND_BUCKET --policy file:///tmp/bucket-policy.json

# Update frontend environment
echo "VITE_API_URL=http://$ALB_DNS" > .env.production

# Build and deploy
npm run build
aws s3 sync dist/ s3://$FRONTEND_BUCKET/ --delete

FRONTEND_URL="http://$FRONTEND_BUCKET.s3-website.$REGION.amazonaws.com"
echo -e "${GREEN}✓ Frontend deployed to: $FRONTEND_URL${NC}"
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "API Endpoint: http://$ALB_DNS"
echo "Frontend URL: $FRONTEND_URL"
echo ""
echo "Next steps:"
echo "1. Test the health endpoint: curl http://$ALB_DNS/health"
echo "2. Check ECS services: aws ecs list-services --cluster $CLUSTER_NAME"
echo "3. View logs in CloudWatch: /ecs/qualitative-research-api and /ecs/qualitative-research-worker"
echo "4. Update CORS in API to include: $FRONTEND_URL"
echo ""
echo "To check service status:"
echo "aws ecs describe-services --cluster $CLUSTER_NAME --services api workers --region $REGION"