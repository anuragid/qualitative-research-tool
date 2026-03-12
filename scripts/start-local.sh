#!/bin/bash

# Start local development environment (mirrors Railway architecture)
# Everything runs in containers exactly like production

set -e

echo "Starting local environment (Railway-mirror architecture)..."
echo "========================================================="

# Navigate to project root
cd "$(dirname "$0")/.."

# Check if backend/.env exists
if [ ! -f backend/.env ]; then
    echo "ERROR: No backend/.env found!"
    echo "Copy backend/.env.example to backend/.env and fill in your values first."
    exit 1
fi

# Stop any existing containers
echo "Stopping existing containers..."
# SAFETY WARNING: Never use 'docker-compose down -v' as it will DELETE ALL DATA
# The -v flag removes volumes containing your database. Always backup first!
docker compose down

# Kill any stray Celery workers running on the host (not in Docker)
echo "Cleaning up any stray Celery workers..."
if pgrep -f "celery.*worker" > /dev/null; then
    echo "   Found stray Celery workers, killing them..."
    pkill -9 -f "celery.*worker" 2>/dev/null || true
    echo "   Cleaned up stray workers"
else
    echo "   No stray workers found"
fi

# Build containers
echo "Building containers..."
docker compose build

# Start the services
echo "Starting all services..."
docker compose up -d

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
attempts=0
max_attempts=30

while [ $attempts -lt $max_attempts ]; do
    if curl -f http://localhost:8000/health >/dev/null 2>&1; then
        echo "API is healthy!"
        break
    fi
    attempts=$((attempts + 1))
    echo "   Waiting for API... ($attempts/$max_attempts)"
    sleep 2
done

if [ $attempts -eq $max_attempts ]; then
    echo "WARNING: API health check timed out. Checking logs..."
    docker compose logs api --tail=50
fi

# Check all services
echo ""
echo "Service Status:"
docker compose ps

echo ""
echo "Local environment is running (mirroring Railway)!"
echo "========================================================="
echo ""
echo "Services:"
echo "   - API:         http://localhost:8000"
echo "   - API Health:  http://localhost:8000/health"
echo "   - API Docs:    http://localhost:8000/docs"
echo "   - Database:    localhost:5432 (postgres/postgres)"
echo "   - Redis:       localhost:6379"
echo ""
echo "Frontend:"
echo "   cd frontend && npm run dev"
echo "   Opens at:     http://localhost:5173"
echo ""
echo "Useful commands:"
echo "   ./scripts/backup-db.sh          # Backup database"
echo "   ./scripts/restore-db.sh <file>  # Restore database from backup"
echo "   docker compose logs -f api      # View API logs"
echo "   docker compose logs -f worker   # View worker logs"
echo "   docker compose restart api      # Restart API"
echo "   docker compose ps               # Check status"
echo "   docker compose stop             # Stop all services"
echo "   docker compose down             # Stop and remove containers (preserves data)"
echo ""
