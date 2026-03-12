#!/bin/bash

# Unified startup script for both local and Railway environments
set -e

echo "🚀 Starting Qualitative Research Tool..."

# Detect environment
if [ -f /.dockerenv ]; then
    echo "📦 Running in Docker container"
    IS_DOCKER=true
else
    echo "💻 Running on host machine"
    IS_DOCKER=false
fi

if [ ! -z "$RAILWAY_ENVIRONMENT" ]; then
    echo "🚂 Running on Railway ($RAILWAY_ENVIRONMENT)"
    IS_PRODUCTION=true
else
    echo "🏠 Running locally"
    IS_PRODUCTION=false
fi

# Determine service type early (needed for migration decision)
SERVICE="${SERVICE_TYPE:-$1}"

# Wait for database to be ready
echo "⏳ Waiting for database..."
max_retries=30
retries=0

# Parse database host from DATABASE_URL
# DATABASE_URL format: postgresql://user:pass@host:port/dbname
if [ ! -z "$DATABASE_URL" ]; then
    # Extract host from DATABASE_URL
    DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:\/]+).*/\1/')
    DB_USER=$(echo $DATABASE_URL | sed -E 's/.*:\/\/([^:]+):.*/\1/')
    echo "   Using database host: $DB_HOST"
else
    # Fallback for local development
    DB_HOST="postgres"
    DB_USER="postgres"
    echo "   Using default database host: $DB_HOST"
fi

while [ $retries -lt $max_retries ]; do
    if pg_isready -h "$DB_HOST" -U "$DB_USER" >/dev/null 2>&1; then
        echo "✅ Database is ready!"
        break
    fi

    retries=$((retries + 1))
    echo "   Retry $retries/$max_retries..."
    sleep 2
done

if [ $retries -eq $max_retries ]; then
    echo "❌ Database connection failed after $max_retries attempts"
    exit 1
fi

# Only run migrations from the API service to avoid race conditions
# When both API and worker start simultaneously, concurrent alembic runs can deadlock
if [ "$SERVICE" != "worker" ]; then
    echo "🔄 Running database migrations..."
    alembic upgrade head
else
    echo "⏭️  Skipping migrations (worker service — API handles migrations)"
fi

# Wait for Redis to be ready (required for Celery broker)
if [ "$SERVICE" = "worker" ]; then
    echo "⏳ Waiting for Redis..."
    REDIS_RETRIES=0
    REDIS_MAX_RETRIES=30

    # Parse Redis host from REDIS_URL
    # Handles: redis://host:port, redis://user:pass@host:port, rediss://...
    if [ ! -z "$REDIS_URL" ]; then
        # Use Python for reliable URL parsing (handles all formats)
        REDIS_PARSED=$(python -c "
from urllib.parse import urlparse
u = urlparse('$REDIS_URL')
print(f'{u.hostname} {u.port or 6379}')
" 2>/dev/null)
        REDIS_HOST=$(echo $REDIS_PARSED | cut -d' ' -f1)
        REDIS_PORT=$(echo $REDIS_PARSED | cut -d' ' -f2)
        echo "   Using Redis host: $REDIS_HOST:$REDIS_PORT"
    else
        REDIS_HOST="redis"
        REDIS_PORT=6379
        echo "   Using default Redis host: $REDIS_HOST:$REDIS_PORT"
    fi

    while [ $REDIS_RETRIES -lt $REDIS_MAX_RETRIES ]; do
        # Use a simple TCP connection test (works without redis-cli)
        if python -c "import socket; s=socket.create_connection(('$REDIS_HOST', $REDIS_PORT), timeout=2); s.close()" 2>/dev/null; then
            echo "✅ Redis is ready!"
            break
        fi

        REDIS_RETRIES=$((REDIS_RETRIES + 1))
        echo "   Retry $REDIS_RETRIES/$REDIS_MAX_RETRIES..."
        sleep 2
    done

    if [ $REDIS_RETRIES -eq $REDIS_MAX_RETRIES ]; then
        echo "❌ Redis connection failed after $REDIS_MAX_RETRIES attempts"
        exit 1
    fi
fi

# Start the application
if [ "$SERVICE" = "worker" ]; then
    echo "🔨 Starting Celery worker..."
    # --pool=solo: Use single-process pool (no fork). Halves memory usage on
    #   Railway's constrained containers. Safe because prefetch_multiplier=1
    #   already limits to one task at a time.
    # --without-heartbeat: Disables worker heartbeat (unnecessary for single worker)
    # --without-mingle: Skip synchronizing with other workers on startup
    # --without-gossip: Disable worker-to-worker communication
    exec celery -A app.tasks.celery_app worker \
        --pool=solo \
        --loglevel=info \
        --without-heartbeat \
        --without-mingle \
        --without-gossip
else
    echo "🌐 Starting API server..."
    if [ "$IS_PRODUCTION" = true ]; then
        # Production: no reload, use PORT env var (Railway sets this)
        # --proxy-headers ensures correct scheme (https) behind Railway's reverse proxy
        exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'
    else
        # Development: with reload
        exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload
    fi
fi