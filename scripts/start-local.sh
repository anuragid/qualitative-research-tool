#!/bin/bash

# Start local development environment (mirrors AWS architecture)
# Everything runs in containers exactly like production

set -e

echo "🚀 Starting local environment (AWS-mirror architecture)..."
echo "========================================================="

# Navigate to project root
cd "$(dirname "$0")/.."

# Check if .env.docker-local exists
if [ ! -f backend/.env.docker-local ]; then
    echo "⚠️  backend/.env.docker-local not found!"
    echo "Creating from template..."

    # Copy from main .env if it exists
    if [ -f backend/.env ]; then
        cp backend/.env backend/.env.docker-local

        # Update database and Redis URLs for Docker networking
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' 's|postgresql://postgres:postgres@localhost|postgresql://postgres:postgres@postgres|g' backend/.env.docker-local
            sed -i '' 's|redis://localhost|redis://redis|g' backend/.env.docker-local
        else
            # Linux
            sed -i 's|postgresql://postgres:postgres@localhost|postgresql://postgres:postgres@postgres|g' backend/.env.docker-local
            sed -i 's|redis://localhost|redis://redis|g' backend/.env.docker-local
        fi

        echo "✅ Created and configured backend/.env.docker-local"
    else
        echo "❌ No backend/.env found to copy from!"
        exit 1
    fi
fi

# Stop any existing containers
echo "🛑 Stopping existing containers..."
# SAFETY WARNING: Never use 'docker-compose down -v' as it will DELETE ALL DATA
# The -v flag removes volumes containing your database. Always backup first!
docker-compose down

# Build with the correct platform
echo "🔨 Building containers for linux/amd64 (matching AWS)..."
docker-compose build

# Start the services
echo "🚀 Starting all services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
attempts=0
max_attempts=30

while [ $attempts -lt $max_attempts ]; do
    if curl -f http://localhost:8000/health >/dev/null 2>&1; then
        echo "✅ API is healthy!"
        break
    fi
    attempts=$((attempts + 1))
    echo "   Waiting for API... ($attempts/$max_attempts)"
    sleep 2
done

if [ $attempts -eq $max_attempts ]; then
    echo "⚠️  API health check timed out. Checking logs..."
    docker-compose logs api --tail=50
fi

# Check all services
echo ""
echo "🏥 Service Status:"
docker-compose ps

echo ""
echo "✅ Local environment is running (mirroring AWS)!"
echo "========================================================="
echo ""
echo "📍 Services:"
echo "   - API:         http://localhost:8000"
echo "   - API Health:  http://localhost:8000/health"
echo "   - API Docs:    http://localhost:8000/docs"
echo "   - Database:    localhost:5432 (postgres/postgres)"
echo "   - Redis:       localhost:6379"
echo ""
echo "📍 Frontend:"
echo "   cd frontend && npm run dev"
echo "   Opens at:     http://localhost:5173"
echo ""
echo "📝 Useful commands:"
echo "   ./scripts/backup-db.sh          # Backup database (DO THIS REGULARLY!)"
echo "   ./scripts/restore-db.sh <file>  # Restore database from backup"
echo "   docker-compose logs -f api      # View API logs"
echo "   docker-compose logs -f worker   # View worker logs"
echo "   docker-compose restart api      # Restart API"
echo "   docker-compose ps               # Check status"
echo "   docker-compose stop             # Stop all services"
echo "   docker-compose down             # Stop and remove containers (preserves data)"
echo ""
echo "🚀 To deploy changes to AWS:"
echo "   1. Test everything locally first"
echo "   2. Commit to git"
echo "   3. Run: ./scripts/deploy-to-aws.sh"
echo ""