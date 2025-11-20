# Data Management and Backup Guide

## ⚠️ IMPORTANT: Preventing Data Loss

### Never Run These Commands:
- `docker-compose down -v` - **This DELETES all database data!**
- `docker volume prune` - **This removes unused volumes that might contain data!**
- `docker system prune -a --volumes` - **This removes everything including data!**

### Safe Commands:
- `docker-compose down` - Stops containers but preserves data
- `docker-compose stop` - Pauses containers
- `docker-compose restart` - Restarts containers

## 📦 Backup Strategy

### Automatic Backups
Set up a cron job to backup daily:
```bash
# Add to crontab (crontab -e)
0 2 * * * cd /path/to/project && ./scripts/backup-db.sh
```

### Manual Backup
Before any major changes or deployments:
```bash
./scripts/backup-db.sh
```

### Restore from Backup
If you need to restore data:
```bash
# List available backups
ls -la ./backups/

# Restore specific backup
./scripts/restore-db.sh ./backups/postgres_backup_20251120_143022.sql
```

## 🗄️ Where is Data Stored?

### Database (PostgreSQL)
- **Docker Volume**: `qualitative-research-tool_postgres_data`
- **Container Path**: `/var/lib/postgresql/data`
- **Contains**: All projects, videos metadata, transcripts, analysis

### Cache (Redis)
- **Docker Volume**: `qualitative-research-tool_redis_data`
- **Container Path**: `/data`
- **Contains**: Temporary cache, job queues

### Video Files
- **Local Path**: `/tmp/qualitative-research-videos/`
- **S3 Bucket**: (if configured in production)
- **Contains**: Actual video files

## 🔍 Check Data Status

### View database size:
```bash
docker exec qualitative-research-db psql -U postgres -c "\l+"
```

### Check volume status:
```bash
docker volume ls | grep qualitative
docker volume inspect qualitative-research-tool_postgres_data
```

### Count records:
```bash
docker exec qualitative-research-db psql -U postgres qualitative_research -c "
  SELECT
    (SELECT COUNT(*) FROM projects) as projects,
    (SELECT COUNT(*) FROM videos) as videos,
    (SELECT COUNT(*) FROM transcripts) as transcripts;"
```

## 🚨 Emergency Recovery

If you accidentally deleted data:

1. **Stop everything immediately**:
   ```bash
   docker-compose stop
   ```

2. **Check for dangling volumes**:
   ```bash
   docker volume ls -f dangling=true
   ```

3. **Try to recover from backups**:
   ```bash
   ls -la ./backups/
   ./scripts/restore-db.sh [latest_backup]
   ```

4. **Check S3/cloud storage** for video files (if configured)

## 📋 Best Practices

1. **Always backup before**:
   - Major code changes
   - Docker/container updates
   - Database migrations
   - Deployments

2. **Test backups regularly**:
   - Restore to a test environment
   - Verify data integrity

3. **Monitor disk space**:
   ```bash
   df -h /var/lib/docker
   docker system df
   ```

4. **Keep multiple backup copies**:
   - Local backups in `./backups/`
   - Cloud backups (S3, Google Drive, etc.)
   - Off-site backups

## 🔧 Maintenance Commands

### Clean up old Docker resources (SAFE):
```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove unused networks
docker network prune

# NEVER add --volumes flag!
```

### Export entire database:
```bash
docker exec qualitative-research-db pg_dumpall -U postgres > full_backup.sql
```

### Import database:
```bash
docker exec -i qualitative-research-db psql -U postgres < full_backup.sql
```

## 📝 Data Loss Prevention Checklist

- [ ] Regular backups configured
- [ ] Backup script tested
- [ ] Team aware of dangerous commands
- [ ] Recovery procedure documented
- [ ] Backups stored in multiple locations
- [ ] Monitoring alerts configured
- [ ] Disk space monitored