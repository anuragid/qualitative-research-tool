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

# Run migrations
echo "🔄 Running database migrations..."
alembic upgrade head

# Start the application based on SERVICE_TYPE env var or command argument
SERVICE="${SERVICE_TYPE:-$1}"
if [ "$SERVICE" = "worker" ]; then
    echo "🔨 Starting Celery worker..."
    exec celery -A app.tasks.celery_app worker --loglevel=info
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