#!/bin/bash

# Run local development that mirrors AWS architecture exactly
# This ensures what works locally will work in AWS

set -e

echo "🚀 Starting local environment that mirrors AWS..."
echo "================================================"

# Check if .env.docker-local exists
if [ ! -f backend/.env.docker-local ]; then
    echo "❌ Error: backend/.env.docker-local not found!"
    echo "Please copy backend/.env to backend/.env.docker-local and update as needed"
    exit 1
fi

# Ensure we have the API keys from main .env
if [ -f backend/.env ]; then
    echo "📋 Loading API keys from backend/.env..."
    export $(cat backend/.env | grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ANTHROPIC_API_KEY|ASSEMBLYAI_API_KEY)=' | xargs)
fi

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod-mirror.yml down

# Build with the correct platform
echo "🔨 Building containers for linux/amd64 (matching AWS)..."
docker-compose -f docker-compose.prod-mirror.yml build --no-cache

# Start the services
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod-mirror.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health status
echo "🏥 Checking service health..."
docker-compose -f docker-compose.prod-mirror.yml ps

# Show logs
echo "📜 Showing recent logs..."
docker-compose -f docker-compose.prod-mirror.yml logs --tail=20

echo ""
echo "✅ Local AWS-mirror environment is running!"
echo "================================================"
echo "📍 Services:"
echo "   - API: http://localhost:8000"
echo "   - API Health: http://localhost:8000/health"
echo "   - Database: localhost:5432"
echo "   - Redis: localhost:6379"
echo ""
echo "📝 To view logs:"
echo "   docker-compose -f docker-compose.prod-mirror.yml logs -f [service]"
echo ""
echo "🛑 To stop:"
echo "   docker-compose -f docker-compose.prod-mirror.yml down"
echo ""