# AWS Deployment Configuration

This directory contains AWS ECS task definitions and deployment scripts for the Qualitative Research Tool.

## Important Security Note

The task definition JSON files (`api-task-definition.json` and `worker-task-definition.json`) contain sensitive API keys and credentials. These files are:
- **NOT committed to version control** (see .gitignore)
- **Stored locally only** for deployment purposes
- **Should never be shared publicly**

## Files in this directory

- `api-task-definition.json` - ECS task definition for the API service (contains secrets)
- `worker-task-definition.json` - ECS task definition for Celery workers (contains secrets)
- `deploy.sh` - Deployment automation script
- `elasticache-config.json` - Redis cluster configuration

## Deployment

To deploy updates to AWS ECS:

```bash
# Update API service
aws ecs register-task-definition --cli-input-json file://api-task-definition.json --region us-east-2
aws ecs update-service --cluster qualitative-research-prod --service api --force-new-deployment --region us-east-2

# Update Worker service
aws ecs register-task-definition --cli-input-json file://worker-task-definition.json --region us-east-2
aws ecs update-service --cluster qualitative-research-prod --service workers --force-new-deployment --region us-east-2
```

## Security Best Practices

For production deployments, consider:
1. Using AWS Secrets Manager for API keys
2. Using IAM roles instead of access keys
3. Implementing environment-specific configurations
4. Using AWS Systems Manager Parameter Store for configuration values

## Current Deployment Status

As of November 6, 2025:
- ✅ API Service: Running on ECS Fargate with 2 instances
- ✅ Worker Service: Running on ECS Fargate with 1 instance
- ✅ Redis: ElastiCache cluster operational
- ✅ Database: RDS PostgreSQL configured
- ✅ All services fully operational