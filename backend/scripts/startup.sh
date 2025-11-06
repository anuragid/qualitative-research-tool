#!/bin/bash

# Unified startup script for both local and AWS environments
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

if [ ! -z "$ECS_CONTAINER_METADATA_URI" ]; then
    echo "☁️  Running in AWS ECS"
    IS_ECS=true
else
    echo "🏠 Running locally"
    IS_ECS=false
fi

# Wait for database to be ready
echo "⏳ Waiting for database..."
max_retries=30
retries=0

while [ $retries -lt $max_retries ]; do
    if pg_isready -h postgres -U postgres >/dev/null 2>&1; then
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

# Start the application based on the command passed
if [ "$1" = "worker" ]; then
    echo "🔨 Starting Celery worker..."
    exec celery -A app.tasks.celery_app worker --loglevel=info
else
    echo "🌐 Starting API server..."
    if [ "$IS_ECS" = true ]; then
        # Production: no reload
        exec uvicorn app.main:app --host 0.0.0.0 --port 8000
    else
        # Development: with reload
        exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    fi
fi