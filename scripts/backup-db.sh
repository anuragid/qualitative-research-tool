#!/bin/bash

# Database backup script
# Run this regularly to backup your PostgreSQL data

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/postgres_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "Creating database backup..."

# Create backup using pg_dump from the container
docker exec qualitative-research-db pg_dump -U postgres qualitative_research > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "✅ Backup created successfully: $BACKUP_FILE"

    # Keep only the last 10 backups
    ls -t ${BACKUP_DIR}/postgres_backup_*.sql | tail -n +11 | xargs -r rm
    echo "Old backups cleaned up (keeping last 10)"
else
    echo "❌ Backup failed!"
    exit 1
fi