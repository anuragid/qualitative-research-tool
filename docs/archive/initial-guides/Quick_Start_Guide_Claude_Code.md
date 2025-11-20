# 🚀 Quick Start Guide for Claude Code

## Copy-Paste This Into Claude Code

```
I need to build a Qualitative Research Analysis Tool with the following specifications:

=== OVERVIEW ===
Multi-agent qualitative research system with:
- Project & file management
- Video upload → AWS S3
- Transcription + speaker diarization (AssemblyAI)
- 5-step design analysis per video (using LangGraph + Claude API):
  1. CHUNK: Break transcript into pieces
  2. INFER: Interpret each chunk
  3. RELATE: Find patterns
  4. EXPLAIN: Generate insights
  5. ACTIVATE: Create design principles
- Cross-video synthesis when multiple videos complete (Steps 3-5 across videos)

=== TECH STACK ===
Backend: Python FastAPI + LangGraph + Celery + AWS RDS PostgreSQL + AWS ElastiCache Redis
Frontend: React + TypeScript + Tailwind + shadcn/ui
Storage: AWS S3
APIs: AssemblyAI (transcription), Claude API (analysis)

=== FIRST, CREATE THIS FILE STRUCTURE ===

qualitative-research-tool/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── graph.py              # LangGraph definitions
│   │   │   ├── states.py             # State TypedDicts
│   │   │   ├── prompts.py            # All agent prompts
│   │   │   └── nodes/
│   │   │       ├── __init__.py
│   │   │       ├── chunk.py
│   │   │       ├── infer.py
│   │   │       ├── relate.py
│   │   │       ├── explain.py
│   │   │       ├── activate.py
│   │   │       ├── cross_relate.py
│   │   │       ├── cross_explain.py
│   │   │       └── cross_activate.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── s3_service.py
│   │   │   ├── assemblyai_service.py
│   │   │   └── claude_service.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── database_models.py
│   │   │   └── schemas.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── projects.py
│   │   │   ├── videos.py
│   │   │   ├── transcriptions.py
│   │   │   └── analysis.py
│   │   └── tasks/
│   │       ├── __init__.py
│   │       ├── celery_app.py
│   │       ├── transcription_tasks.py
│   │       └── analysis_tasks.py
│   ├── requirements.txt
│   ├── .env.example
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── ProjectList.tsx
│   │   │   ├── VideoUpload.tsx
│   │   │   ├── TranscriptViewer.tsx
│   │   │   ├── SpeakerLabeling.tsx
│   │   │   ├── AnalysisProgress.tsx
│   │   │   └── ResultsViewer.tsx
│   │   ├── pages/
│   │   │   ├── ProjectsPage.tsx
│   │   │   ├── ProjectDetailPage.tsx
│   │   │   └── VideoDetailPage.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── tailwind.config.js
├── docker-compose.yml
└── README.md

=== DATABASE SCHEMA ===

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    s3_key TEXT NOT NULL,
    s3_url TEXT NOT NULL,
    duration_seconds INTEGER,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'uploaded'
);

CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    assemblyai_id VARCHAR(255) UNIQUE,
    raw_transcript JSONB,
    processed_transcript JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE speaker_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id UUID REFERENCES transcripts(id) ON DELETE CASCADE,
    speaker_label VARCHAR(50) NOT NULL,
    assigned_name VARCHAR(255),
    role VARCHAR(100),
    UNIQUE(transcript_id, speaker_label)
);

CREATE TABLE video_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    chunks JSONB,
    inferences JSONB,
    patterns JSONB,
    insights JSONB,
    design_principles JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE project_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    video_ids UUID[] NOT NULL,
    cross_video_patterns JSONB,
    cross_video_insights JSONB,
    cross_video_principles JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

=== LANGGRAPH ARCHITECTURE ===

Two state machines:

1. VideoAnalysisState:
   - Input: transcript, speaker_labels
   - Output: chunks, inferences, patterns, insights, design_principles
   - Flow: chunk → infer → relate → explain → activate

2. ProjectAnalysisState:
   - Input: all video patterns + insights
   - Output: cross_patterns, cross_insights, cross_principles
   - Flow: cross_relate → cross_explain → cross_activate

=== AGENT PROMPTS (CRITICAL - USE EXACTLY) ===

CHUNK_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to break down an interview transcript into CHUNKS.

CHUNKING RULES:
1. A chunk is a single, discrete piece of information
2. It could be: A quote, observation, description of context, or single fact
3. Each chunk should contain ONE idea only
4. Be at the right granularity (can't be broken down further without losing meaning)

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "chunk_id": "C001",
    "speaker": "John Doe",
    "timestamp": "00:05:32",
    "text": "The exact quote or observation",
    "type": "quote"
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

INFER_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to INFER meaning from each chunk.

For each chunk, ask:
- What does this mean?
- Why is this important?
- What is this telling us?

INFERENCE RULES:
1. Generate MULTIPLE meanings per chunk if needed
2. Use your own words
3. Focus on meaning, not coding

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "chunk_id": "C001",
    "inferences": [
      {
        "inference_id": "I001",
        "meaning": "Clear statement of what this means",
        "importance": "Why this matters",
        "context": "What this reveals"
      }
    ]
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

RELATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to find PATTERNS across inferences.

PATTERN IDENTIFICATION:
1. Group inferences pointing in the same direction
2. Look for repetition, shared meanings, relationships
3. Each pattern should express a relationship

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "pattern_id": "P001",
    "pattern_name": "Clear, descriptive name",
    "description": "What this pattern represents",
    "related_inferences": ["I001", "I005"],
    "frequency": "high",
    "significance": "Why this matters"
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

EXPLAIN_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to EXPLAIN patterns and generate INSIGHTS.

Ask "WHY?" for each pattern:
- Why is this happening?
- Why does it matter?
- What deeper truth does this reveal?

INSIGHT RULES:
1. Non-consensus: Challenge assumptions
2. First-principles-based: Fundamental truths
3. Write as SHORT, BOLD HEADLINES

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "insight_id": "IN001",
    "headline": "Short, punchy insight headline",
    "explanation": "Detailed explanation",
    "supporting_patterns": ["P001"],
    "evidence": ["Key quote 1", "Key quote 2"],
    "type": "non-consensus",
    "implications": "What this means",
    "confidence": "high"
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

ACTIVATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to turn insights into DESIGN PRINCIPLES.

DESIGN PRINCIPLE RULES:
1. Clear, actionable, directional
2. Start with: "The system should..." or "The experience must..."
3. Spark "How might we...?" questions

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "principle_id": "DP001",
    "insight_id": "IN001",
    "principle": "The system should [action] to [outcome]",
    "rationale": "Why this follows from the insight",
    "how_might_we": [
      "How might we question 1?",
      "How might we question 2?"
    ],
    "priority": "high"
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

CROSS_RELATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to find META-PATTERNS across MULTIPLE videos.

CROSS-VIDEO RULES:
1. Look for patterns appearing in 2+ videos
2. Identify higher-order themes
3. Note variations by context

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "meta_pattern_id": "MP001",
    "pattern_name": "Clear name",
    "description": "What this represents",
    "appears_in_videos": ["video_id_1", "video_id_2"],
    "related_patterns": ["P001_video1", "P003_video2"],
    "consistency": "consistent",
    "significance": "Why this matters"
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

CROSS_EXPLAIN_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to generate CROSS-VIDEO INSIGHTS from meta-patterns.

CROSS-VIDEO INSIGHT RULES:
1. Synthesize findings across contexts
2. Reveal system-level truths
3. Account for variations

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "cross_insight_id": "CIN001",
    "headline": "Insight headline",
    "explanation": "Detailed explanation",
    "supporting_meta_patterns": ["MP001"],
    "consistency_across_videos": "high",
    "evidence": ["Quote from video 1", "Quote from video 2"],
    "implications": "System-level implications",
    "confidence": "high"
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

CROSS_ACTIVATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to create SYSTEM-LEVEL DESIGN PRINCIPLES from cross-video insights.

SYSTEM PRINCIPLE RULES:
1. Apply broadly across contexts
2. Strategic direction (not tactical)
3. Context-aware

OUTPUT FORMAT - Return ONLY this JSON structure:
[
  {
    "system_principle_id": "SP001",
    "cross_insight_id": "CIN001",
    "principle": "The system should [strategic action]",
    "rationale": "Why this is important system-wide",
    "context_considerations": "How to adapt to contexts",
    "how_might_we": ["HMW question 1?"],
    "priority": "critical"
  }
]

CRITICAL: Return ONLY valid JSON, no other text."""

=== IMPLEMENTATION STEPS ===

PHASE 1 - Setup:
1. Create all folders and files
2. Setup FastAPI with CORS
3. Create requirements.txt with:
   - fastapi, uvicorn, sqlalchemy, alembic, psycopg2-binary
   - anthropic, langchain, langchain-anthropic, langgraph
   - assemblyai, boto3, celery, redis
   - pydantic, python-dotenv, httpx, tenacity
4. Create .env.example with all variables
5. Setup docker-compose.yml with PostgreSQL + Redis
6. Initialize Vite React TypeScript project
7. Install frontend deps: react-query, zustand, axios, tailwindcss, shadcn/ui

PHASE 2 - Core Services:
1. S3 Service: upload_video(), download_video(), delete_video()
2. AssemblyAI Service: start_transcription(), get_transcript(), poll_until_complete()
3. Claude Service: call_claude(), parse_json_response(), retry logic
4. Database Models: All 6 tables with relationships

PHASE 3 - LangGraph Agents:
1. Create VideoAnalysisState and ProjectAnalysisState in states.py
2. Add all 8 prompts to prompts.py
3. Implement 8 node functions (chunk, infer, relate, explain, activate, + 3 cross)
4. Each node:
   - Takes state as input
   - Calls Claude with appropriate prompt
   - Parses JSON response with error handling
   - Returns updated state
5. Create graphs in graph.py:
   - create_video_analysis_graph() - linear: chunk→infer→relate→explain→activate
   - create_project_analysis_graph() - linear: cross_relate→cross_explain→cross_activate

PHASE 4 - API Routes:
1. POST /api/projects - Create project
2. GET /api/projects - List projects
3. POST /api/projects/{id}/videos - Upload video to S3
4. GET /api/projects/{id}/videos - List videos
5. POST /api/videos/{id}/transcribe - Start AssemblyAI transcription
6. POST /api/transcripts/{id}/label-speakers - Save speaker labels
7. POST /api/videos/{id}/analyze - Trigger video analysis (Celery task)
8. GET /api/videos/{id}/analysis - Get analysis results
9. POST /api/projects/{id}/analyze - Trigger cross-video (Celery task)
10. GET /api/projects/{id}/analysis - Get cross-video results

PHASE 5 - Celery Tasks:
1. Setup Celery with Redis broker
2. transcribe_video_task(video_id):
   - Upload to AssemblyAI
   - Poll until complete
   - Save to database
3. analyze_video_task(video_id):
   - Load transcript + speaker labels
   - Run video_graph from LangGraph
   - Save results after each step
4. analyze_project_task(project_id):
   - Load all video analyses
   - Run project_graph from LangGraph
   - Save cross-video results

PHASE 6 - Frontend:
1. Setup React Router with pages
2. ProjectsPage: Grid of project cards
3. ProjectDetailPage: Video upload + video grid
4. VideoDetailPage: Tabs for transcript, analysis, export
5. Components:
   - VideoUpload: Drag & drop with progress
   - SpeakerLabeling: Dropdowns to assign names
   - AnalysisProgress: Progress bar through 5 steps
   - ResultsViewer: Accordion showing chunks→inferences→patterns→insights→principles
6. API hooks with React Query
7. Real-time polling for task status

=== CRITICAL REQUIREMENTS ===
1. ALL agent responses MUST be valid JSON only
2. Use async/await everywhere
3. Comprehensive error handling
4. Retry logic on API calls (use tenacity)
5. Log every step
6. Track progress (0-100%)
7. Handle large files (chunked upload if needed)
8. Support MP4, MOV, WebM (max 500MB)

=== ENVIRONMENT VARIABLES I'LL PROVIDE ===
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_BUCKET_NAME
- ANTHROPIC_API_KEY
- ASSEMBLYAI_API_KEY
- DATABASE_URL
- REDIS_URL

Start with Phase 1 and implement each phase completely before moving to the next. Ask if anything is unclear.
```

---

## After Claude Code Creates the Project

### 1. Set Up AWS S3 Bucket

```bash
# AWS Console → S3 → Create Bucket
Name: qualitative-research-videos-[yourname]
Region: us-east-1
Block all public access: YES
Versioning: Enabled

# Create IAM User
AWS Console → IAM → Users → Add User
User name: qualitative-research-app
Access type: Programmatic access

# Attach Policy (create custom):
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::qualitative-research-videos-[yourname]",
        "arn:aws:s3:::qualitative-research-videos-[yourname]/*"
      ]
    }
  ]
}

# Create Access Keys
IAM User → Security credentials → Create access key
Save: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
```

### 2. Get API Keys

```bash
# AssemblyAI
https://www.assemblyai.com/
Sign up → Dashboard → Copy API key

# Anthropic Claude
https://console.anthropic.com/
Sign up → Settings → API Keys → Create key

# Supabase
https://supabase.com/
New Project → Settings → Database → Connection string (URI format)

# Upstash Redis (optional)
https://upstash.com/
Create Redis database → Copy connection string
```

### 3. Create .env File

```bash
cd qualitative-research-tool/backend
cp .env.example .env

# Edit .env with your actual values:
nano .env

# Paste:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=qualitative-research-videos-yourname

ANTHROPIC_API_KEY=sk-ant-...
ASSEMBLYAI_API_KEY=...

DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
REDIS_URL=redis://localhost:6379/0

APP_ENV=development
DEBUG=True
```

### 4. Run the Project

```bash
# Start database & Redis
docker-compose up -d

# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head  # Run migrations
uvicorn app.main:app --reload

# In another terminal: Celery worker
celery -A app.tasks.celery_app worker --loglevel=info

# Frontend
cd frontend
npm install
npm run dev
```

### 5. Test the Flow

1. Open http://localhost:5173
2. Create a project
3. Upload a video
4. Wait for transcription
5. Label speakers
6. Run analysis
7. View results!

---

## Troubleshooting

**Issue: "Module langgraph not found"**
```bash
pip install langgraph langchain-anthropic
```

**Issue: "Cannot connect to database"**
```bash
# Check docker is running
docker-compose ps

# Check database URL is correct
echo $DATABASE_URL
```

**Issue: "S3 upload fails"**
```bash
# Verify AWS credentials
aws s3 ls s3://your-bucket-name --profile qualitative-research-app

# Check IAM policy is attached
```

**Issue: "Claude returns non-JSON"**
- Check prompts end with "CRITICAL: Return ONLY valid JSON, no other text."
- Add JSON parsing with fallback in claude_service.py
- Log the raw response for debugging

---

## Next Steps After MVP

1. **Add Authentication**: Clerk, Auth0, or Supabase Auth
2. **Team Collaboration**: Share projects with team members
3. **Advanced Export**: Custom branded PDF reports
4. **Email Notifications**: When analysis completes
5. **Bulk Upload**: Process multiple videos at once
6. **Search**: Full-text search across insights
7. **Tags**: Categorize videos and insights
8. **Webhooks**: Integrate with other tools

---

You're ready to go! 🚀
