# Qualitative Research Analysis Tool - Complete Requirements

## 🎯 Project Overview

A **multi-agent qualitative research analysis system** that processes interview videos through transcription, speaker diarization, and a **5-stage design analysis framework**: Chunk → Infer → Relate → Explain → Activate.

**Key Features:**
- Project & file management (non-linear workflow)
- Individual video processing with cross-video synthesis
- LangGraph-based agentic orchestration
- AWS infrastructure

---

## 🏗️ System Architecture

### Tech Stack

```yaml
Frontend:
  - Framework: React 18 + TypeScript
  - Styling: Tailwind CSS + shadcn/ui
  - State: React Query + Zustand
  - Router: React Router v6

Backend:
  - Framework: Python FastAPI
  - Agent Framework: LangGraph (LangChain)
  - Task Queue: Celery + Redis
  - API Client: HTTPX (async)

Database:
  - Primary: AWS RDS PostgreSQL
  - Cache: AWS ElastiCache Redis
  - Vector Store: pgvector (optional)

Storage:
  - Video Files: AWS S3
  - Temporary Files: Local + S3

AI Services:
  - Transcription: AssemblyAI
  - Analysis: Claude API (Sonnet 4)
  - Embeddings: OpenAI Ada-002 (optional)
```

---

## 🔑 Required Accounts & API Keys

### 1. AWS (You Already Have)
**Services Needed:**
- **S3**: Video storage
- **IAM**: Access management

**Setup Steps:**
```bash
# 1. Create S3 Bucket
AWS Console → S3 → Create Bucket
  Name: qualitative-research-videos-[yourname]
  Region: us-east-1
  Block all public access: YES
  Versioning: Enabled

# 2. Create IAM User
AWS Console → IAM → Users → Add User
  User name: qualitative-research-app
  Access type: Programmatic access
  
  Attach Policy: AmazonS3FullAccess (or create custom policy)

# 3. Create Access Keys
  IAM User → Security credentials → Create access key
  → Application running outside AWS
  
  Save these:
  AWS_ACCESS_KEY_ID=AKIA...
  AWS_SECRET_ACCESS_KEY=...
  AWS_REGION=us-east-1
  AWS_BUCKET_NAME=qualitative-research-videos-[yourname]
```

**Custom S3 Policy (More Secure):**
```json
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
```

### 2. AssemblyAI (Transcription + Diarization)
```
Website: https://www.assemblyai.com/
Steps:
  1. Sign up (free tier: 3 hours/month)
  2. Dashboard → API Keys
  3. Copy key
  
Save as: ASSEMBLYAI_API_KEY=...

Pricing: $0.25/hour of audio
Features: Transcription, speaker diarization, timestamps
```

### 3. Anthropic Claude API
```
Website: https://console.anthropic.com/
Steps:
  1. Sign up
  2. Settings → API Keys
  3. Create API Key
  
Save as: ANTHROPIC_API_KEY=sk-ant-...

Model: claude-sonnet-4-20250514
Pricing: Input: $3/MTok, Output: $15/MTok
```

### 4. Supabase (PostgreSQL Database)
```
Website: https://supabase.com/
Steps:
  1. New Project
  2. Settings → Database → Connection string
  3. Use "URI" format
  
Save as: DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

Pricing: Free tier (500MB database, 1GB bandwidth)
```

### 5. Redis (Optional but Recommended - Upstash)
```
Website: https://upstash.com/
Steps:
  1. Create Redis database
  2. Copy connection details
  
Save as: REDIS_URL=redis://...

Purpose: Task queue for Celery, caching
Pricing: Free tier (10,000 commands/day)
```

### 6. OpenAI (Optional - for embeddings)
```
Website: https://platform.openai.com/
Steps:
  1. Sign up
  2. API Keys → Create new secret key
  
Save as: OPENAI_API_KEY=sk-...

Purpose: Text embeddings for similarity search
Model: text-embedding-ada-002
Pricing: $0.10/1M tokens
```

---

## 📊 Data Flow & Architecture

### Non-Linear Workflow

```
USER
  ↓
CREATE PROJECT
  ↓
UPLOAD VIDEOS → [Multiple videos can be uploaded]
  ↓
PROCESS EACH VIDEO INDIVIDUALLY
  ├── Transcription (AssemblyAI)
  ├── Speaker Diarization
  ├── User Labels Speakers
  └── Run Analysis Steps 1-5 (Per Video)
      ├── Step 1: CHUNK (Individual video)
      ├── Step 2: INFER (Individual video)
      ├── Step 3: RELATE (Individual video)
      ├── Step 4: EXPLAIN (Individual video)
      └── Step 5: ACTIVATE (Individual video)
  ↓
CROSS-VIDEO SYNTHESIS (When multiple videos complete)
  ├── Step 3: RELATE (Across all videos in project)
  ├── Step 4: EXPLAIN (Across all videos in project)
  └── Step 5: ACTIVATE (Across all videos in project)
  ↓
FINAL OUTPUT
  ├── Individual video reports
  └── Project-level synthesis report
```

### State Machine (LangGraph)

```mermaid
graph TD
    A[Start] --> B[Transcribe Video]
    B --> C[Diarize Speakers]
    C --> D{User Labels Speakers?}
    D -->|No| E[Wait for User Input]
    E --> D
    D -->|Yes| F[Run Step 1: Chunk]
    F --> G[Run Step 2: Infer]
    G --> H[Run Step 3: Relate Within Video]
    H --> I[Run Step 4: Explain Within Video]
    I --> J[Run Step 5: Activate Within Video]
    J --> K{More Videos in Project?}
    K -->|Yes| L[Wait for Other Videos]
    K -->|No| M[Complete]
    L --> N{All Videos Ready?}
    N -->|No| L
    N -->|Yes| O[Run Step 3: Relate Across Videos]
    O --> P[Run Step 4: Explain Across Videos]
    P --> Q[Run Step 5: Activate Across Videos]
    Q --> M[Complete]
```

---

## 📁 Project Structure

```
qualitative-research-tool/
├── backend/
│   ├── app/
│   │   ├── main.py                      # FastAPI entry point
│   │   ├── config.py                    # Configuration management
│   │   ├── database.py                  # Database setup
│   │   │
│   │   ├── agents/                      # LangGraph agent definitions
│   │   │   ├── __init__.py
│   │   │   ├── graph.py                 # Main LangGraph workflow
│   │   │   ├── nodes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── transcription.py    # Transcription node
│   │   │   │   ├── chunk.py            # Step 1: Chunk
│   │   │   │   ├── infer.py            # Step 2: Infer
│   │   │   │   ├── relate.py           # Step 3: Relate (single + cross)
│   │   │   │   ├── explain.py          # Step 4: Explain (single + cross)
│   │   │   │   └── activate.py         # Step 5: Activate (single + cross)
│   │   │   ├── states.py                # State definitions
│   │   │   └── prompts.py               # Agent prompts
│   │   │
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── assemblyai_service.py   # Transcription API
│   │   │   ├── claude_service.py       # Claude API wrapper
│   │   │   ├── s3_service.py           # S3 operations
│   │   │   └── analysis_orchestrator.py # Orchestrates agents
│   │   │
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── database_models.py      # SQLAlchemy models
│   │   │   └── schemas.py              # Pydantic schemas
│   │   │
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── projects.py             # Project CRUD
│   │   │   ├── videos.py               # Video upload/management
│   │   │   ├── transcriptions.py       # Transcription endpoints
│   │   │   ├── analysis.py             # Trigger analysis
│   │   │   └── results.py              # Fetch results
│   │   │
│   │   ├── tasks/                       # Celery tasks
│   │   │   ├── __init__.py
│   │   │   ├── celery_app.py
│   │   │   ├── transcription_tasks.py
│   │   │   └── analysis_tasks.py
│   │   │
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── logging.py
│   │       └── helpers.py
│   │
│   ├── alembic/                         # Database migrations
│   │   └── versions/
│   ├── tests/
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                      # shadcn/ui components
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── VideoUpload.tsx
│   │   │   ├── VideoCard.tsx
│   │   │   ├── TranscriptViewer.tsx
│   │   │   ├── SpeakerLabeling.tsx
│   │   │   ├── AnalysisProgress.tsx    # Shows current step
│   │   │   ├── ChunkViewer.tsx
│   │   │   ├── InferenceViewer.tsx
│   │   │   ├── PatternViewer.tsx
│   │   │   ├── InsightViewer.tsx
│   │   │   └── ResultsExport.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── ProjectsPage.tsx
│   │   │   ├── ProjectDetailPage.tsx
│   │   │   ├── VideoDetailPage.tsx
│   │   │   └── CrossVideoAnalysisPage.tsx
│   │   │
│   │   ├── services/
│   │   │   ├── api.ts                   # Axios setup
│   │   │   ├── projects.ts
│   │   │   ├── videos.ts
│   │   │   └── analysis.ts
│   │   │
│   │   ├── hooks/
│   │   │   ├── useProjects.ts
│   │   │   ├── useVideos.ts
│   │   │   └── useAnalysis.ts
│   │   │
│   │   ├── store/
│   │   │   └── store.ts                 # Zustand store
│   │   │
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🗄️ Database Schema

```sql
-- Projects Table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active' -- active, archived
);

-- Videos Table
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    s3_key TEXT NOT NULL,
    s3_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'uploaded', -- uploaded, transcribing, transcribed, analyzing, completed, error
    error_message TEXT
);

-- Transcripts Table
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    assemblyai_id VARCHAR(255) UNIQUE,
    raw_transcript JSONB, -- Full AssemblyAI response
    processed_transcript JSONB, -- Formatted with speaker labels
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, error
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Speaker Labels Table
CREATE TABLE speaker_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id UUID REFERENCES transcripts(id) ON DELETE CASCADE,
    speaker_label VARCHAR(50) NOT NULL, -- Speaker A, Speaker B, etc.
    assigned_name VARCHAR(255), -- Interviewer, John Doe, etc.
    role VARCHAR(100), -- interviewer, participant, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(transcript_id, speaker_label)
);

-- Video Analysis Table (Steps 1-5 for individual videos)
CREATE TABLE video_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    
    -- Step 1: Chunk
    chunks JSONB, -- Array of chunks with IDs
    chunks_completed_at TIMESTAMP,
    
    -- Step 2: Infer
    inferences JSONB, -- Meanings for each chunk
    inferences_completed_at TIMESTAMP,
    
    -- Step 3: Relate (Within Video)
    patterns JSONB, -- Grouped patterns
    patterns_completed_at TIMESTAMP,
    
    -- Step 4: Explain (Within Video)
    insights JSONB, -- Insights from patterns
    insights_completed_at TIMESTAMP,
    
    -- Step 5: Activate (Within Video)
    design_principles JSONB, -- Actionable principles
    principles_completed_at TIMESTAMP,
    
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Project Analysis Table (Steps 3-5 across all videos)
CREATE TABLE project_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Include all video IDs analyzed
    video_ids UUID[] NOT NULL,
    
    -- Step 3: Relate (Across Videos)
    cross_video_patterns JSONB,
    patterns_completed_at TIMESTAMP,
    
    -- Step 4: Explain (Across Videos)
    cross_video_insights JSONB,
    insights_completed_at TIMESTAMP,
    
    -- Step 5: Activate (Across Videos)
    cross_video_principles JSONB,
    principles_completed_at TIMESTAMP,
    
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Analysis Progress Tracking
CREATE TABLE analysis_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id),
    project_id UUID REFERENCES projects(id),
    task_type VARCHAR(50) NOT NULL, -- transcription, chunk, infer, relate, explain, activate, cross_relate, cross_explain, cross_activate
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
    progress INTEGER DEFAULT 0, -- 0-100
    celery_task_id VARCHAR(255),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Indexes for performance
CREATE INDEX idx_videos_project ON videos(project_id);
CREATE INDEX idx_transcripts_video ON transcripts(video_id);
CREATE INDEX idx_speaker_labels_transcript ON speaker_labels(transcript_id);
CREATE INDEX idx_video_analyses_video ON video_analyses(video_id);
CREATE INDEX idx_project_analyses_project ON project_analyses(project_id);
CREATE INDEX idx_analysis_tasks_video ON analysis_tasks(video_id);
CREATE INDEX idx_analysis_tasks_project ON analysis_tasks(project_id);
CREATE INDEX idx_analysis_tasks_status ON analysis_tasks(status);
```

---

## 🤖 LangGraph Agent Architecture

### Why LangGraph?

LangGraph provides:
1. **State Management**: Maintain context across agent steps
2. **Conditional Routing**: Non-linear workflows
3. **Error Handling**: Retry logic and fallbacks
4. **Observability**: Track agent execution
5. **Persistence**: Save/resume workflows

### Installation

```bash
pip install langgraph langchain-anthropic langchain-core
```

### State Definition

```python
# agents/states.py
from typing import TypedDict, List, Dict, Optional, Annotated
from langgraph.graph import add_messages

class VideoAnalysisState(TypedDict):
    """State for individual video analysis"""
    # Input
    video_id: str
    transcript: str
    speaker_labels: Dict[str, str]  # {Speaker A: Interviewer, Speaker B: John Doe}
    
    # Step 1: Chunk
    chunks: Optional[List[Dict]]
    
    # Step 2: Infer
    inferences: Optional[List[Dict]]
    
    # Step 3: Relate (Within)
    patterns: Optional[List[Dict]]
    
    # Step 4: Explain (Within)
    insights: Optional[List[Dict]]
    
    # Step 5: Activate (Within)
    design_principles: Optional[List[Dict]]
    
    # Status tracking
    current_step: str
    error: Optional[str]
    messages: Annotated[List, add_messages]


class ProjectAnalysisState(TypedDict):
    """State for cross-video analysis"""
    project_id: str
    video_ids: List[str]
    
    # Aggregated data from all videos
    all_patterns: List[Dict]
    all_insights: List[Dict]
    
    # Step 3: Relate (Across)
    cross_patterns: Optional[List[Dict]]
    
    # Step 4: Explain (Across)
    cross_insights: Optional[List[Dict]]
    
    # Step 5: Activate (Across)
    cross_principles: Optional[List[Dict]]
    
    current_step: str
    error: Optional[str]
    messages: Annotated[List, add_messages]
```

### LangGraph Workflow

```python
# agents/graph.py
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from .states import VideoAnalysisState, ProjectAnalysisState
from .nodes import chunk, infer, relate, explain, activate
from .nodes import cross_relate, cross_explain, cross_activate

# Initialize Claude
llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    temperature=0.7,
    max_tokens=4000
)

# Video Analysis Graph
def create_video_analysis_graph():
    """Create graph for analyzing individual videos"""
    
    workflow = StateGraph(VideoAnalysisState)
    
    # Add nodes
    workflow.add_node("chunk", chunk.chunk_node)
    workflow.add_node("infer", infer.infer_node)
    workflow.add_node("relate", relate.relate_node)
    workflow.add_node("explain", explain.explain_node)
    workflow.add_node("activate", activate.activate_node)
    
    # Define edges (linear for individual videos)
    workflow.set_entry_point("chunk")
    workflow.add_edge("chunk", "infer")
    workflow.add_edge("infer", "relate")
    workflow.add_edge("relate", "explain")
    workflow.add_edge("explain", "activate")
    workflow.add_edge("activate", END)
    
    return workflow.compile()


# Project Analysis Graph (Cross-Video)
def create_project_analysis_graph():
    """Create graph for cross-video synthesis"""
    
    workflow = StateGraph(ProjectAnalysisState)
    
    # Add nodes
    workflow.add_node("cross_relate", cross_relate.cross_relate_node)
    workflow.add_node("cross_explain", cross_explain.cross_explain_node)
    workflow.add_node("cross_activate", cross_activate.cross_activate_node)
    
    # Define edges
    workflow.set_entry_point("cross_relate")
    workflow.add_edge("cross_relate", "cross_explain")
    workflow.add_edge("cross_explain", "cross_activate")
    workflow.add_edge("cross_activate", END)
    
    return workflow.compile()


# Usage
video_graph = create_video_analysis_graph()
project_graph = create_project_analysis_graph()
```

### Agent Node Example

```python
# agents/nodes/chunk.py
from typing import Dict
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from ..states import VideoAnalysisState
from ..prompts import CHUNK_SYSTEM_PROMPT
import json

llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    temperature=0.7
)

async def chunk_node(state: VideoAnalysisState) -> Dict:
    """
    Step 1: Break transcript into chunks
    """
    try:
        transcript = state["transcript"]
        speaker_labels = state["speaker_labels"]
        
        # Format transcript with speaker names
        formatted_transcript = format_transcript(transcript, speaker_labels)
        
        # Prepare prompt
        messages = [
            SystemMessage(content=CHUNK_SYSTEM_PROMPT),
            HumanMessage(content=f"""
Here is the interview transcript:

{formatted_transcript}

Break this down into chunks following the guidelines. Return a JSON array of chunks.
""")
        ]
        
        # Call Claude
        response = await llm.ainvoke(messages)
        
        # Parse response
        chunks = json.loads(response.content)
        
        return {
            "chunks": chunks,
            "current_step": "chunk_completed",
            "messages": state.get("messages", []) + [
                {"role": "assistant", "content": f"Created {len(chunks)} chunks"}
            ]
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "current_step": "chunk_failed"
        }


def format_transcript(raw_transcript: str, speaker_labels: Dict[str, str]) -> str:
    """Replace speaker labels with actual names"""
    formatted = raw_transcript
    for label, name in speaker_labels.items():
        formatted = formatted.replace(label, name)
    return formatted
```

---

## 📝 Agent Prompts

### Step 1: Chunk

```python
# agents/prompts.py

CHUNK_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to break down an interview transcript into CHUNKS.

CHUNKING RULES:
1. A chunk is a single, discrete piece of information
2. It could be:
   - A quote from the participant
   - An observation about behavior
   - A description of context
   - A single fact or data point

3. Each chunk should:
   - Contain ONE idea only
   - Be roughly similar in size to other chunks
   - Be at the right granularity (can't be broken down further without losing meaning)
   - Include speaker attribution
   - Include timestamp if available

4. Do NOT over-chunk: if breaking it down further would lose meaning, stop

OUTPUT FORMAT:
Return a JSON array of chunks:

[
  {
    "chunk_id": "C001",
    "speaker": "John Doe",
    "timestamp": "00:05:32",
    "text": "The exact quote or observation",
    "type": "quote" | "observation" | "context" | "fact"
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""


INFER_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to INFER meaning from each chunk.

For each chunk, ask:
- What does this mean?
- Why is this important?
- What is this telling us about the problem, topic, or context?

INFERENCE RULES:
1. You can generate MULTIPLE meanings per chunk
2. Interpretations should be thoughtful and logical
3. Use your own words - don't just rephrase the chunk
4. It's okay if meanings overlap at this stage
5. Focus on meaning, not coding or categorization

OUTPUT FORMAT:
Return a JSON array:

[
  {
    "chunk_id": "C001",
    "inferences": [
      {
        "inference_id": "I001",
        "meaning": "Clear statement of what this chunk means",
        "importance": "Why this matters",
        "context": "What this reveals about the problem/topic"
      }
    ]
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""


RELATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to find PATTERNS across the inferences.

PATTERN IDENTIFICATION RULES:
1. Group inferences that point in the same direction
2. Look for:
   - Repetition of themes
   - Shared underlying meanings
   - Relationships between concepts
   - Tensions or contradictions

3. Each pattern should:
   - Have a clear, meaningful name
   - Express a relationship (not just a category)
   - Be supported by multiple inferences
   - Reveal structure in the data

OUTPUT FORMAT:
Return a JSON array:

[
  {
    "pattern_id": "P001",
    "pattern_name": "Clear, descriptive name",
    "description": "What this pattern represents",
    "related_inferences": ["I001", "I005", "I012"],
    "relationship_type": "convergent" | "divergent" | "tension" | "causal",
    "frequency": "high" | "medium" | "low",
    "significance": "Why this pattern matters"
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""


EXPLAIN_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to EXPLAIN why patterns matter and generate INSIGHTS.

For each pattern, ask "WHY?":
- Why is this happening?
- Why does it matter?
- What deeper truth does this reveal?

INSIGHT RULES:
1. Insights should be:
   - NON-CONSENSUS: Challenge common assumptions
   - FIRST-PRINCIPLES-BASED: Reflect fundamental truths
   - SURPRISING: Reveal something unexpected
   - ACTIONABLE: Suggest clear implications

2. Write insights as SHORT, BOLD HEADLINES
3. Capture uniqueness and significance

OUTPUT FORMAT:
Return a JSON array:

[
  {
    "insight_id": "IN001",
    "headline": "Short, punchy insight headline",
    "explanation": "Detailed explanation of why this matters",
    "supporting_patterns": ["P001", "P003"],
    "evidence": [
      "Key quote or data point supporting this",
      "Another piece of evidence"
    ],
    "type": "non-consensus" | "first-principles" | "surprising" | "revealing",
    "implications": "What this means for design/users/systems",
    "confidence": "high" | "medium" | "low"
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""


ACTIVATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to turn insights into DESIGN PRINCIPLES.

DESIGN PRINCIPLE RULES:
1. Each insight should generate 1-3 design principles
2. Principles are:
   - CLEAR: Easy to understand
   - ACTIONABLE: Can be acted upon
   - DIRECTIONAL: Point toward solutions (not final solutions)
   - GENERATIVE: Spark "How might we...?" questions

3. Common formats:
   - "The system should..."
   - "The experience must..."
   - "Design should..."

4. Useful verbs:
   - provide, match, reduce, enable
   - avoid, combine, simplify, clarify
   - support, facilitate, encourage

OUTPUT FORMAT:
Return a JSON array:

[
  {
    "principle_id": "DP001",
    "insight_id": "IN001",
    "principle": "The system should [action] to [outcome]",
    "rationale": "Why this principle follows from the insight",
    "how_might_we": [
      "How might we question 1?",
      "How might we question 2?"
    ],
    "priority": "high" | "medium" | "low"
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""


# Cross-Video Prompts

CROSS_RELATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to find META-PATTERNS across MULTIPLE videos in this project.

You will receive patterns from each individual video. Now:
1. Look for patterns that appear across multiple videos
2. Identify tensions or contradictions between videos
3. Find higher-level patterns that emerge from the collection
4. Note differences in context that explain variations

CROSS-VIDEO PATTERN RULES:
1. Meta-patterns should:
   - Appear in 2+ videos
   - Represent higher-order themes
   - Show how context affects patterns
   - Reveal system-level insights

OUTPUT FORMAT:
Return a JSON array:

[
  {
    "meta_pattern_id": "MP001",
    "pattern_name": "Clear, descriptive name",
    "description": "What this meta-pattern represents",
    "appears_in_videos": ["video_id_1", "video_id_2"],
    "related_patterns": ["P001_video1", "P003_video2"],
    "consistency": "consistent" | "varying" | "contradictory",
    "context_sensitivity": "Description of how context affects this pattern",
    "significance": "Why this meta-pattern matters"
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""


CROSS_EXPLAIN_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to generate CROSS-VIDEO INSIGHTS from meta-patterns.

These insights should:
1. Synthesize findings across multiple participants/contexts
2. Reveal system-level truths
3. Account for variations and contradictions
4. Be more robust than single-video insights

CROSS-VIDEO INSIGHT RULES:
1. More weight on consistency across videos
2. Explain variations with context
3. Identify universal vs. context-specific findings
4. Generate actionable, high-level insights

OUTPUT FORMAT:
Return a JSON array:

[
  {
    "cross_insight_id": "CIN001",
    "headline": "Short, punchy insight headline",
    "explanation": "Detailed explanation",
    "supporting_meta_patterns": ["MP001", "MP002"],
    "consistency_across_videos": "high" | "medium" | "low",
    "contextual_factors": "Factors that influence this insight",
    "evidence": [
      "Quote or finding from video 1",
      "Quote or finding from video 2"
    ],
    "scope": "universal" | "context-dependent",
    "implications": "What this means at a system level",
    "confidence": "high" | "medium" | "low"
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""


CROSS_ACTIVATE_SYSTEM_PROMPT = """You are a qualitative research expert specializing in design analysis.

Your task is to create SYSTEM-LEVEL DESIGN PRINCIPLES from cross-video insights.

These principles should:
1. Apply broadly across contexts
2. Account for variations
3. Be strategic (not tactical)
4. Guide overall design direction

CROSS-VIDEO PRINCIPLE RULES:
1. Principles should be:
   - HIGH-LEVEL: Strategic direction
   - CONTEXT-AWARE: Acknowledge variations
   - FLEXIBLE: Allow adaptation
   - EVIDENCE-BASED: Supported by multiple videos

OUTPUT FORMAT:
Return a JSON array:

[
  {
    "system_principle_id": "SP001",
    "cross_insight_id": "CIN001",
    "principle": "The system should [strategic action] while [acknowledging context]",
    "rationale": "Why this principle is important system-wide",
    "context_considerations": "How to adapt this principle to different contexts",
    "how_might_we": [
      "Strategic HMW question 1?",
      "Strategic HMW question 2?"
    ],
    "scope": "universal" | "segmented",
    "priority": "critical" | "high" | "medium"
  }
]

IMPORTANT: Return ONLY valid JSON, no other text."""
```

---

## 🔌 API Endpoints

### Projects

```
POST   /api/projects                 # Create project
GET    /api/projects                 # List all projects
GET    /api/projects/{id}            # Get project details
PUT    /api/projects/{id}            # Update project
DELETE /api/projects/{id}            # Delete project
```

### Videos

```
POST   /api/projects/{id}/videos     # Upload video
GET    /api/projects/{id}/videos     # List videos in project
GET    /api/videos/{id}              # Get video details
DELETE /api/videos/{id}              # Delete video
GET    /api/videos/{id}/download     # Download video from S3
```

### Transcriptions

```
POST   /api/videos/{id}/transcribe   # Start transcription
GET    /api/videos/{id}/transcript   # Get transcript
POST   /api/transcripts/{id}/label-speakers  # Label speakers
GET    /api/transcripts/{id}/speakers        # Get speaker labels
```

### Analysis (Individual Video)

```
POST   /api/videos/{id}/analyze      # Start video analysis
GET    /api/videos/{id}/analysis     # Get analysis results
GET    /api/videos/{id}/analysis/chunks
GET    /api/videos/{id}/analysis/inferences
GET    /api/videos/{id}/analysis/patterns
GET    /api/videos/{id}/analysis/insights
GET    /api/videos/{id}/analysis/principles
```

### Analysis (Cross-Video)

```
POST   /api/projects/{id}/analyze    # Start cross-video analysis
GET    /api/projects/{id}/analysis   # Get cross-video results
GET    /api/projects/{id}/analysis/meta-patterns
GET    /api/projects/{id}/analysis/cross-insights
GET    /api/projects/{id}/analysis/system-principles
```

### Task Monitoring

```
GET    /api/tasks/{task_id}/status   # Get task status
POST   /api/tasks/{task_id}/cancel   # Cancel task
```

---

## 📦 Dependencies

### Backend (requirements.txt)

```txt
# Web Framework
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6

# Database
sqlalchemy==2.0.25
alembic==1.13.1
psycopg2-binary==2.9.9

# Redis & Celery
redis==5.0.1
celery==5.3.6

# AI & ML
anthropic==0.18.1
langchain==0.1.7
langchain-anthropic==0.1.4
langchain-core==0.1.23
langgraph==0.0.20
assemblyai==0.17.0

# AWS
boto3==1.34.34
botocore==1.34.34

# Utilities
pydantic==2.5.3
pydantic-settings==2.1.0
python-dotenv==1.0.1
httpx==0.26.0
tenacity==8.2.3  # For retries

# Optional - Embeddings
openai==1.10.0

# Development
pytest==7.4.4
pytest-asyncio==0.23.3
black==24.1.1
ruff==0.1.14
```

### Frontend (package.json)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.3",
    "@tanstack/react-query": "^5.17.19",
    "zustand": "^4.5.0",
    "axios": "^1.6.5",
    
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-progress": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-tooltip": "^1.0.7",
    
    "lucide-react": "^0.316.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    
    "react-dropzone": "^14.2.3",
    "date-fns": "^3.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.11",
    "tailwindcss": "^3.4.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33"
  }
}
```

---

## ⚙️ Environment Variables

```bash
# .env.example

# ===== AWS =====
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=qualitative-research-videos-yourname

# ===== Database =====
DATABASE_URL=postgresql://postgres:password@host:5432/postgres
REDIS_URL=redis://localhost:6379/0

# ===== AI APIs =====
ANTHROPIC_API_KEY=sk-ant-...
ASSEMBLYAI_API_KEY=...
OPENAI_API_KEY=sk-...  # Optional, for embeddings

# ===== Application =====
APP_ENV=development  # development, staging, production
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ===== Celery =====
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# ===== Feature Flags =====
ENABLE_CROSS_VIDEO_ANALYSIS=True
MAX_VIDEO_SIZE_MB=500
MAX_VIDEOS_PER_PROJECT=50
```

---

## 🚀 Implementation Plan for Claude Code

### Phase 1: Setup & Infrastructure (Day 1)

```bash
# Create the project structure
mkdir qualitative-research-tool
cd qualitative-research-tool

# Initialize backend
mkdir -p backend/app/{agents/{nodes,},models,routes,services,tasks,utils}
touch backend/app/__init__.py
touch backend/.env

# Initialize frontend
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

**Prompt for Claude Code:**

```
Initialize a qualitative research analysis tool with:

1. Backend (Python FastAPI):
   - Project structure as specified
   - Database setup with SQLAlchemy + Alembic
   - AWS S3 integration
   - AssemblyAI service wrapper
   - Claude API service wrapper
   - Basic health check endpoint

2. Frontend (React + TypeScript):
   - Vite setup with TypeScript
   - Install dependencies: react-query, zustand, axios, radix-ui, lucide-react
   - Setup Tailwind CSS
   - Create basic routing structure
   - Setup API client with axios

3. Configuration:
   - Create .env.example files
   - Setup environment variable loading
   - Create docker-compose.yml for local development (PostgreSQL + Redis)

Environment variables needed:
AWS_ACCESS_KEY_ID=[will provide]
AWS_SECRET_ACCESS_KEY=[will provide]
AWS_BUCKET_NAME=[will provide]
ANTHROPIC_API_KEY=[will provide]
ASSEMBLYAI_API_KEY=[will provide]
DATABASE_URL=[will provide]
```

### Phase 2: Core Services (Day 2-3)

**Prompt for Claude Code:**

```
Implement core services:

1. S3 Service (backend/app/services/s3_service.py):
   - upload_video(file, project_id) -> s3_key, url
   - download_video(s3_key) -> file_stream
   - delete_video(s3_key)
   - generate_presigned_url(s3_key) -> url

2. AssemblyAI Service (backend/app/services/assemblyai_service.py):
   - upload_audio(file_url) -> upload_url
   - start_transcription(audio_url, enable_diarization=True) -> transcript_id
   - get_transcript(transcript_id) -> transcript_object
   - poll_until_complete(transcript_id) -> transcript_object
   - format_transcript_with_speakers(transcript) -> formatted_dict

3. Claude Service (backend/app/services/claude_service.py):
   - call_claude(system_prompt, user_prompt, temperature=0.7) -> response
   - parse_json_response(response) -> dict
   - call_with_retry(prompt, max_retries=3) -> response

4. Database Models (backend/app/models/database_models.py):
   - Implement all tables from schema
   - Add relationships
   - Add helper methods

Use async/await where applicable.
Include comprehensive error handling.
Add logging for debugging.
```

### Phase 3: LangGraph Agents (Day 4-5)

**Prompt for Claude Code:**

```
Implement LangGraph-based analysis agents:

1. States (backend/app/agents/states.py):
   - VideoAnalysisState
   - ProjectAnalysisState

2. Prompts (backend/app/agents/prompts.py):
   - All 8 prompts (CHUNK, INFER, RELATE, EXPLAIN, ACTIVATE + cross-video versions)

3. Agent Nodes:
   - backend/app/agents/nodes/chunk.py
   - backend/app/agents/nodes/infer.py
   - backend/app/agents/nodes/relate.py
   - backend/app/agents/nodes/explain.py
   - backend/app/agents/nodes/activate.py
   - backend/app/agents/nodes/cross_relate.py
   - backend/app/agents/nodes/cross_explain.py
   - backend/app/agents/nodes/cross_activate.py

4. Graphs (backend/app/agents/graph.py):
   - create_video_analysis_graph()
   - create_project_analysis_graph()

Each node should:
- Accept state as input
- Call Claude with appropriate prompt
- Parse JSON response
- Update state
- Handle errors gracefully
- Log progress

Use the prompts I provided earlier.
```

### Phase 4: API Routes (Day 6)

**Prompt for Claude Code:**

```
Implement FastAPI routes:

1. Projects (backend/app/routes/projects.py):
   - POST /api/projects - Create project
   - GET /api/projects - List projects
   - GET /api/projects/{id} - Get project
   - PUT /api/projects/{id} - Update project
   - DELETE /api/projects/{id} - Delete project

2. Videos (backend/app/routes/videos.py):
   - POST /api/projects/{id}/videos - Upload video
   - GET /api/projects/{id}/videos - List videos
   - GET /api/videos/{id} - Get video
   - DELETE /api/videos/{id} - Delete video

3. Transcriptions (backend/app/routes/transcriptions.py):
   - POST /api/videos/{id}/transcribe - Start transcription
   - GET /api/videos/{id}/transcript - Get transcript
   - POST /api/transcripts/{id}/label-speakers - Label speakers

4. Analysis (backend/app/routes/analysis.py):
   - POST /api/videos/{id}/analyze - Start video analysis
   - GET /api/videos/{id}/analysis - Get results
   - POST /api/projects/{id}/analyze - Start cross-video
   - GET /api/projects/{id}/analysis - Get cross-video results

All routes should:
- Use Pydantic schemas for validation
- Handle database operations
- Return appropriate status codes
- Include error handling
```

### Phase 5: Celery Tasks (Day 7)

**Prompt for Claude Code:**

```
Implement background tasks with Celery:

1. Setup (backend/app/tasks/celery_app.py):
   - Configure Celery with Redis
   - Set up task routing

2. Transcription Tasks (backend/app/tasks/transcription_tasks.py):
   - transcribe_video_task(video_id) - Async task
   - Update database with progress
   - Handle AssemblyAI polling

3. Analysis Tasks (backend/app/tasks/analysis_tasks.py):
   - analyze_video_task(video_id) - Run LangGraph
   - analyze_project_task(project_id) - Cross-video analysis
   - Update database after each step
   - Send progress updates

Each task should:
- Update task status in database
- Log progress
- Handle failures gracefully
- Allow cancellation
```

### Phase 6: Frontend Components (Day 8-9)

**Prompt for Claude Code:**

```
Implement React frontend:

1. Project Management:
   - ProjectList.tsx - Grid of projects
   - ProjectDetail.tsx - Single project view with videos
   - CreateProjectModal.tsx

2. Video Management:
   - VideoUpload.tsx - Drag & drop upload
   - VideoCard.tsx - Video thumbnail + status
   - VideoDetail.tsx - Single video view

3. Analysis Views:
   - TranscriptViewer.tsx - Show transcript with timestamps
   - SpeakerLabeling.tsx - Assign names to speakers
   - AnalysisProgress.tsx - Progress bar for each step
   - ChunkViewer.tsx - Display chunks
   - InferenceViewer.tsx - Display inferences
   - PatternViewer.tsx - Display patterns
   - InsightViewer.tsx - Display insights with evidence
   - PrincipleViewer.tsx - Display design principles
   - CrossVideoAnalysis.tsx - Show cross-video results

4. API Hooks:
   - useProjects.ts - CRUD operations
   - useVideos.ts - Upload & management
   - useAnalysis.ts - Trigger & fetch results

Use Tailwind CSS for styling.
Use shadcn/ui components.
Implement loading states and error handling.
Add polling for task status updates.
```

### Phase 7: Integration & Testing (Day 10)

**Prompt for Claude Code:**

```
Final integration:

1. Connect all components
2. Test end-to-end flow:
   - Create project
   - Upload video
   - Transcribe
   - Label speakers
   - Run analysis
   - View results
   - Upload second video
   - Run cross-video analysis

3. Add:
   - Export functionality (PDF, DOCX, JSON)
   - Error boundaries
   - Loading skeletons
   - Toast notifications

4. Polish UI/UX
5. Add documentation
6. Create deployment scripts
```

---

## 🎯 Complete Claude Code Prompt

**Use this comprehensive prompt:**

```
I need to build a Qualitative Research Analysis Tool. Here are the complete specifications:

=== PROJECT OVERVIEW ===
A multi-agent system that:
1. Allows users to create projects
2. Upload multiple videos per project
3. Transcribes & diarizes each video (AssemblyAI)
4. User labels speakers (Interviewer, Participant names)
5. Runs 5-step analysis on EACH video individually:
   Step 1: CHUNK - Break transcript into discrete pieces
   Step 2: INFER - Interpret meaning of each chunk
   Step 3: RELATE - Find patterns across inferences
   Step 4: EXPLAIN - Generate insights from patterns
   Step 5: ACTIVATE - Create design principles from insights
6. When multiple videos complete, runs cross-video analysis:
   Step 3 (Cross): Find meta-patterns across videos
   Step 4 (Cross): Generate system-level insights
   Step 5 (Cross): Create strategic design principles

=== TECH STACK ===
Backend:
- Python FastAPI
- LangGraph for agent orchestration
- SQLAlchemy + Alembic (PostgreSQL via Supabase)
- Celery + Redis for background tasks
- AWS S3 for video storage

Frontend:
- React 18 + TypeScript + Vite
- TanStack Query (React Query)
- Zustand for state
- Tailwind CSS + shadcn/ui
- React Router

APIs:
- AssemblyAI: Transcription + speaker diarization
- Anthropic Claude API (claude-sonnet-4-20250514): Analysis agents

=== FILE STRUCTURE ===
[Paste the complete file structure from above]

=== DATABASE SCHEMA ===
[Paste the complete SQL schema from above]

=== LANGGRAPH ARCHITECTURE ===
Use LangGraph to orchestrate agents. Two graphs:

1. Video Analysis Graph (linear):
   chunk → infer → relate → explain → activate

2. Project Analysis Graph (linear):
   cross_relate → cross_explain → cross_activate

=== AGENT PROMPTS ===
[Paste all 8 prompts: CHUNK, INFER, RELATE, EXPLAIN, ACTIVATE, CROSS_RELATE, CROSS_EXPLAIN, CROSS_ACTIVATE from above]

=== API ENDPOINTS ===
[Paste the API endpoints list from above]

=== IMPLEMENTATION REQUIREMENTS ===
1. Use async/await throughout
2. Comprehensive error handling
3. Logging at each step
4. Task progress tracking (0-100%)
5. Allow task cancellation
6. Retry logic for API calls (use tenacity)
7. Export results as JSON, PDF, DOCX
8. Real-time progress updates via polling
9. File size limit: 500MB per video
10. Support MP4, MOV, WebM formats

=== ENVIRONMENT VARIABLES ===
[Paste the .env.example from above]

=== DEPENDENCIES ===
[Paste requirements.txt and package.json from above]

=== PHASE-BY-PHASE IMPLEMENTATION ===
Please implement in this order:

Phase 1: Setup & Infrastructure
- Project structure
- Database setup
- S3 configuration
- Environment loading
- Docker compose for local dev

Phase 2: Core Services
- S3 service (upload, download, delete)
- AssemblyAI service (transcribe, poll, format)
- Claude service (call API, parse JSON, retry logic)
- Database models with relationships

Phase 3: LangGraph Agents
- Define states
- Implement all 8 agent nodes
- Create both graphs (video + project)
- Add comprehensive logging

Phase 4: API Routes
- Projects CRUD
- Video upload & management
- Transcription endpoints
- Analysis endpoints (single + cross-video)

Phase 5: Celery Tasks
- Background transcription
- Background analysis (with LangGraph)
- Progress tracking
- Error handling

Phase 6: Frontend
- Project management UI
- Video upload with progress
- Speaker labeling interface
- Analysis progress viewer
- Results viewer (chunks, inferences, patterns, insights, principles)
- Cross-video results viewer
- Export functionality

Phase 7: Integration & Polish
- End-to-end testing
- Error boundaries
- Loading states
- Export to PDF/DOCX/JSON
- Documentation

Start with Phase 1 and implement each component thoroughly before moving to the next phase. Ask clarifying questions if anything is unclear.
```

---

## 📚 Additional Resources

### LangGraph Documentation
- Official Docs: https://langchain-ai.github.io/langgraph/
- Tutorials: https://github.com/langchain-ai/langgraph/tree/main/examples

### AssemblyAI Documentation
- API Docs: https://www.assemblyai.com/docs
- Speaker Diarization: https://www.assemblyai.com/docs/audio-intelligence#speaker-diarization

### AWS S3 Python SDK
- Boto3 Docs: https://boto3.amazonaws.com/v1/documentation/api/latest/guide/s3.html

### Celery Best Practices
- Celery Docs: https://docs.celeryq.dev/
- Task Workflows: https://docs.celeryq.dev/en/stable/userguide/canvas.html

---

## 🎨 UI/UX Considerations

### Key User Flows

**Flow 1: New Project**
```
1. Click "New Project"
2. Enter project name & description
3. Click "Create"
4. → Redirected to project detail page
```

**Flow 2: Upload & Analyze Video**
```
1. Drag video file or click upload
2. Video uploads to S3 (progress bar)
3. Transcription starts automatically
4. Wait for transcription (progress indicator)
5. Label speakers (dropdown per speaker)
6. Click "Run Analysis"
7. Watch progress through 5 steps
8. View results (tabs for each step)
```

**Flow 3: Cross-Video Analysis**
```
1. Wait for 2+ videos to complete individual analysis
2. Banner appears: "Cross-video analysis available"
3. Click "Run Cross-Video Analysis"
4. Watch progress through 3 steps
5. View synthesis results in new tab
```

### Visual Hierarchy

```
Projects Page:
  └─ Grid of project cards
      ├─ Project name
      ├─ Video count
      ├─ Last updated
      └─ Status badge

Project Detail Page:
  ├─ Header (name, description, actions)
  ├─ Upload zone
  └─ Video grid
      └─ Video cards
          ├─ Thumbnail
          ├─ Status badge
          ├─ Duration
          └─ Actions (view, delete)

Video Detail Page:
  ├─ Tabs:
  │   ├─ Transcript
  │   ├─ Analysis
  │   └─ Export
  └─ Analysis Tab:
      ├─ Progress indicator
      └─ Results (accordion for each step)
          ├─ Chunks
          ├─ Inferences
          ├─ Patterns
          ├─ Insights
          └─ Principles
```

---

## 🔒 Security Considerations

1. **API Keys**: Never commit to Git
2. **S3 Buckets**: Private only, use signed URLs
3. **File Uploads**: Validate file types and sizes
4. **Database**: Use prepared statements (SQLAlchemy handles this)
5. **CORS**: Restrict to known origins
6. **Rate Limiting**: Implement on API routes
7. **Authentication**: Add user auth in future (Auth0, Clerk, etc.)

---

## 📈 Monitoring & Observability

Add logging for:
- Video uploads
- Transcription start/complete
- Each agent step start/complete
- Errors at each stage
- Task durations

Use structured logging:
```python
logger.info(
    "Analysis step completed",
    extra={
        "video_id": video_id,
        "step": "chunk",
        "chunks_count": len(chunks),
        "duration_seconds": duration
    }
)
```

---

## 🚀 Deployment (Future)

### Backend
- Deploy to: Fly.io, Railway, or AWS ECS
- Use: Gunicorn + Uvicorn workers
- Workers: Celery deployed separately

### Frontend
- Deploy to: Vercel, Netlify, or AWS S3 + CloudFront

### Database
- Supabase (already hosted)

### Redis
- Upstash (already hosted)

---

## ✅ Success Metrics

Your tool is successful when:
- ✅ Videos upload reliably to S3
- ✅ Transcriptions complete accurately
- ✅ All 5 analysis steps produce valid JSON
- ✅ Cross-video analysis synthesizes insights
- ✅ UI shows real-time progress
- ✅ Results export correctly
- ✅ Error states are handled gracefully

---

This comprehensive requirements document should give Claude Code everything it needs to build your qualitative research analysis tool. Start by providing your API keys, and you're ready to go! 🎉
