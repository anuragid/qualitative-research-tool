# AI Agent Continuity & Best Practices Guide

## 🎯 Purpose
This document ensures any AI agent (Claude, ChatGPT, etc.) can quickly understand the project and work effectively without causing damage or duplicating effort.

---

## 🚀 STARTING A NEW CHAT SESSION

### Copy-Paste This Prompt:
```
I have a Qualitative Research Tool project that analyzes video interviews using AI.

Please read these files first for full context:
1. /qualitative-research-tool/STATUS.md - Current operational status
2. /qualitative-research-tool/README.md - Complete project overview
3. /qualitative-research-tool/AI_AGENT_GUIDE.md - This guide for working safely

Key Info:
- GitHub: https://github.com/anuragid/qualitative-research-tool
- Production: AWS ECS deployment (fully operational)
- Local: Docker-compose setup
- Last Updated: November 2024

IMPORTANT RULES:
- NEVER use `docker-compose down -v` (deletes database)
- ALWAYS check if files/features exist before creating
- NEVER delete without explicit permission
- ALWAYS backup before major changes
```

---

## 📁 PROJECT STRUCTURE & WHERE TO LOOK

### Critical Files to Check First
```
qualitative-research-tool/
├── STATUS.md                    # Current status, URLs, deployment info
├── README.md                     # Features, setup, architecture
├── AI_AGENT_GUIDE.md            # THIS FILE - How to work safely
├── DATA_MANAGEMENT.md           # Backup procedures, safety rules
├── USABILITY_FIXES_REQUIRED.md # Ongoing tasks and improvements
└── .gitignore                   # NEVER commit files listed here
```

### Code Structure
```
├── backend/
│   ├── app/
│   │   ├── models/          # Database models (check before creating)
│   │   ├── routes/          # API endpoints (check before adding)
│   │   ├── services/        # Business logic
│   │   └── langgraph/       # AI agent orchestration
│   ├── alembic/            # Database migrations
│   └── .env                # NEVER commit this file
│
├── frontend/
│   ├── src/
│   │   ├── components/     # React components (check before creating)
│   │   ├── hooks/          # Custom hooks
│   │   ├── pages/          # Page components
│   │   └── services/       # API clients
│   └── .env                # NEVER commit this file
│
├── scripts/
│   ├── backup-db.sh        # Database backup
│   ├── restore-db.sh       # Database restore
│   ├── start-local.sh      # Start local environment
│   └── deploy-to-aws.sh    # Deploy to production
│
└── docs/
    └── archive/            # Old documentation (reference only)
```

---

## 🛡️ SAFETY RULES (NEVER VIOLATE)

### 1. Database Safety
```bash
# NEVER RUN:
docker-compose down -v        # ❌ DELETES ALL DATA
docker volume prune           # ❌ DELETES VOLUMES
docker system prune -a --volumes # ❌ DELETES EVERYTHING

# ALWAYS USE:
docker-compose down           # ✅ Safe shutdown
docker-compose stop           # ✅ Pause containers
./scripts/backup-db.sh        # ✅ Before major changes
```

### 2. Check Before Creating
```bash
# BEFORE creating any file:
find . -name "*similar_name*" -type f

# BEFORE adding a feature:
grep -r "feature_name" --exclude-dir=node_modules --exclude-dir=venv

# BEFORE creating a component:
ls frontend/src/components/
```

### 3. Git Safety
```bash
# NEVER commit:
- .env files
- API keys
- Passwords
- AWS credentials
- Video files (.mp4, .avi, etc.)

# ALWAYS:
git status                    # Check what's being committed
git diff                      # Review changes
cat .gitignore               # Verify sensitive files are excluded
```

---

## 📋 CURRENT PROJECT STATE (November 2024)

### What's Working
- ✅ Project management with 6-state system
- ✅ Parallel video uploads (5 concurrent)
- ✅ Transcription via AssemblyAI
- ✅ 5-step AI analysis (CHUNK → INFER → RELATE → EXPLAIN → ACTIVATE)
- ✅ Cross-video analysis
- ✅ Video-transcript sync
- ✅ Archive/unarchive functionality
- ✅ Production deployment on AWS
- ✅ Local Docker environment

### Recent Changes
- Fixed project card video counts
- Improved UI with reusable components
- Added data backup scripts
- Consolidated documentation
- Applied usability heuristics

### Ongoing Tasks
See: USABILITY_FIXES_REQUIRED.md for current task list

---

## 🔍 HOW TO VERIFY BEFORE MAKING CHANGES

### 1. Check if Feature Exists
```bash
# Search entire codebase
grep -r "feature_name" . --exclude-dir=node_modules --exclude-dir=venv

# Check specific file types
find . -name "*.py" -exec grep -l "feature_name" {} \;
find . -name "*.tsx" -exec grep -l "ComponentName" {} \;

# Check database schema
docker exec qualitative-research-db psql -U postgres -d qualitative_research -c "\dt"
```

### 2. Check Current Implementation
```bash
# View existing routes
grep -r "@router" backend/app/routes/

# View existing components
ls -la frontend/src/components/

# View existing models
ls -la backend/app/models/
```

### 3. Test Before Deploying
```bash
# Local testing
./scripts/start-local.sh
curl http://localhost:8000/health

# Run any tests
cd backend && python -m pytest
cd frontend && npm test

# Check for TypeScript errors
cd frontend && npm run build
```

---

## 🚀 DEPLOYMENT WORKFLOW

### Safe Deployment Process
```bash
# 1. Backup current state
./scripts/backup-db.sh

# 2. Test locally
./scripts/start-local.sh
# Make changes and test thoroughly

# 3. Commit to Git
git add -A
git status  # VERIFY no sensitive files
git commit -m "Clear description"
git push

# 4. Deploy to AWS
./scripts/deploy-to-aws.sh
```

---

## 🐛 COMMON ISSUES & SOLUTIONS

### Issue: "File already exists"
**Solution:** Check if feature is already implemented
```bash
find . -name "filename*"
grep -r "feature_name"
```

### Issue: "Docker container won't start"
**Solution:** Check logs and ports
```bash
docker-compose logs api
docker ps
lsof -i :8000  # Check if port is in use
```

### Issue: "Database connection failed"
**Solution:** Verify database is running
```bash
docker ps | grep postgres
docker exec qualitative-research-db pg_isready
```

---

## 📊 QUALITY CHECKLIST

Before ANY change:
- [ ] Checked if feature/file already exists
- [ ] Reviewed similar implementations
- [ ] Tested locally first
- [ ] No hardcoded credentials
- [ ] No sensitive data in code
- [ ] Followed existing patterns
- [ ] Added error handling
- [ ] Updated relevant documentation
- [ ] Committed with clear message
- [ ] Verified production still works

---

## 🔒 SECURITY CHECKLIST

- [ ] No API keys in code
- [ ] No passwords in commits
- [ ] Environment variables used for secrets
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (use ORM)
- [ ] XSS prevention (React handles this)
- [ ] CORS properly configured
- [ ] File upload size limits
- [ ] Authentication where needed
- [ ] .gitignore properly configured

---

## 📈 CONTINUOUS IMPROVEMENT

### How to Add Features Gracefully
1. **Research First**
   - Check USABILITY_FIXES_REQUIRED.md
   - Search for existing implementations
   - Review similar features

2. **Plan Before Coding**
   - Write down the approach
   - Identify affected files
   - Consider side effects

3. **Implement Incrementally**
   - Small, testable changes
   - Commit frequently
   - Test each step

4. **Document Changes**
   - Update STATUS.md with new features
   - Add comments for complex logic
   - Update README if needed

---

## 🎯 AGENT CAPABILITIES & LIMITATIONS

### What AI Agents CAN Do Well
- Read and understand existing code
- Follow patterns already established
- Implement features similar to existing ones
- Fix bugs with clear error messages
- Update documentation
- Write tests

### What to AVOID Asking Agents
- Major architectural changes without discussion
- Database schema changes without backup
- Deletion of multiple files
- Production deployments without testing
- Security-critical features without review

---

## 📞 WHEN TO SEEK CLARIFICATION

Always ask before:
- Deleting files or features
- Making database schema changes
- Changing deployment configuration
- Modifying security settings
- Upgrading major dependencies
- Changing core business logic

---

## 🚨 EMERGENCY PROCEDURES

### If Data is Lost
```bash
# Check for backups
ls -la ./backups/

# Restore from backup
./scripts/restore-db.sh ./backups/[latest_backup]

# Check Docker volumes
docker volume ls
```

### If Production is Down
```bash
# Check service status
aws ecs describe-services --cluster qualitative-research-prod --services api workers --region us-east-2

# View logs
aws logs tail /ecs/qualitative-research-api --region us-east-2 --since 1h

# Restart services
aws ecs update-service --cluster qualitative-research-prod --service api --force-new-deployment --region us-east-2
```

### If Local Won't Start
```bash
# Clean restart
docker-compose down  # NOT down -v!
docker-compose up -d
docker-compose logs -f

# Check for port conflicts
lsof -i :8000
lsof -i :5432
lsof -i :6379
```

---

## 📚 REFERENCE DOCUMENTS

Priority reading order for new agents:
1. **STATUS.md** - Current state
2. **README.md** - Project overview
3. **AI_AGENT_GUIDE.md** - This guide
4. **DATA_MANAGEMENT.md** - Safety procedures
5. **USABILITY_FIXES_REQUIRED.md** - Current tasks
6. **AWS_DEPLOYMENT_GUIDE.md** - Deployment details

---

## ✅ SUMMARY

To ensure safe, efficient, and high-quality development:

1. **Always read core docs first** (STATUS.md, README.md, this guide)
2. **Check before creating** (files, features, components)
3. **Never delete without permission**
4. **Test locally before deploying**
5. **Backup before major changes**
6. **Follow existing patterns**
7. **Document all changes**
8. **Commit frequently with clear messages**
9. **Ask when uncertain**
10. **Prioritize security and data safety**

---

**Last Updated:** November 20, 2024
**Maintained By:** Project Team
**For Questions:** Check GitHub Issues