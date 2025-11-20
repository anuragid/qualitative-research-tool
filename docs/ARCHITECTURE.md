# LangGraph Architecture Guide: Maintaining Your Agentic System

## Why LangGraph for This Project?

LangGraph solves key challenges in multi-agent systems:

1. **State Management**: Maintains conversation context across agent calls
2. **Orchestration**: Manages the flow between agents
3. **Persistence**: Can save and resume workflows
4. **Error Handling**: Built-in retry and fallback mechanisms
5. **Observability**: Track what each agent is doing
6. **Flexibility**: Easy to add/modify agents without rewriting core logic

---

## LangGraph vs. Simple Sequential Calls

### Without LangGraph (Hard to Maintain)

```python
# ❌ Fragile approach - hard to maintain

async def analyze_video(video_id):
    # Step 1: Chunk
    transcript = get_transcript(video_id)
    chunks_response = await claude_api.call(CHUNK_PROMPT, transcript)
    chunks = parse_json(chunks_response)
    
    # Step 2: Infer
    inferences_response = await claude_api.call(INFER_PROMPT, chunks)
    inferences = parse_json(inferences_response)
    
    # Step 3: Relate
    patterns_response = await claude_api.call(RELATE_PROMPT, inferences)
    patterns = parse_json(patterns_response)
    
    # Problems:
    # - No state tracking between steps
    # - Hard to resume if one step fails
    # - Can't easily add conditional logic
    # - No visibility into what's happening
    # - Hard to test individual steps
```

### With LangGraph (Maintainable)

```python
# ✅ Clean, maintainable approach

from langgraph.graph import StateGraph, END

# Define state once
class VideoAnalysisState(TypedDict):
    video_id: str
    transcript: str
    chunks: Optional[List[Dict]]
    inferences: Optional[List[Dict]]
    patterns: Optional[List[Dict]]
    # ... etc

# Each agent is isolated and testable
async def chunk_node(state: VideoAnalysisState):
    response = await call_claude(CHUNK_PROMPT, state["transcript"])
    return {"chunks": parse_json(response)}

async def infer_node(state: VideoAnalysisState):
    response = await call_claude(INFER_PROMPT, state["chunks"])
    return {"inferences": parse_json(response)}

# Create graph
workflow = StateGraph(VideoAnalysisState)
workflow.add_node("chunk", chunk_node)
workflow.add_node("infer", infer_node)
workflow.add_edge("chunk", "infer")
# ...

# Run
graph = workflow.compile()
result = await graph.ainvoke({"video_id": "123", "transcript": "..."})

# Benefits:
# ✅ State automatically passed between nodes
# ✅ Can save/resume at any step
# ✅ Easy to add conditional routing
# ✅ Built-in observability
# ✅ Each node is independently testable
```

---

## How LangGraph Works in Your Project

### 1. State Definition

State is the "memory" that flows through your agents.

```python
# backend/app/agents/states.py

from typing import TypedDict, List, Dict, Optional, Annotated
from langgraph.graph import add_messages

class VideoAnalysisState(TypedDict):
    """
    State flows through all agent nodes.
    Each node can read from and write to this state.
    """
    
    # INPUT (provided at start)
    video_id: str
    transcript: str
    speaker_labels: Dict[str, str]  # {Speaker A: Interviewer, ...}
    
    # STEP 1 OUTPUT
    chunks: Optional[List[Dict]]
    chunks_completed_at: Optional[str]
    
    # STEP 2 OUTPUT
    inferences: Optional[List[Dict]]
    inferences_completed_at: Optional[str]
    
    # STEP 3 OUTPUT
    patterns: Optional[List[Dict]]
    patterns_completed_at: Optional[str]
    
    # STEP 4 OUTPUT
    insights: Optional[List[Dict]]
    insights_completed_at: Optional[str]
    
    # STEP 5 OUTPUT
    design_principles: Optional[List[Dict]]
    principles_completed_at: Optional[str]
    
    # METADATA
    current_step: str
    error: Optional[str]
    messages: Annotated[List, add_messages]  # For debugging
```

**Key Points:**
- State is a TypedDict (typed for safety)
- Optional fields start as None, get filled as agents run
- `add_messages` keeps a log of what happened
- Each node can read ANY field, write ANY field

### 2. Node Functions

Nodes are pure functions that take state, do work, return updates.

```python
# backend/app/agents/nodes/chunk.py

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from ..states import VideoAnalysisState
from ..prompts import CHUNK_SYSTEM_PROMPT
import json
from datetime import datetime

llm = ChatAnthropic(model="claude-sonnet-4-20250514")

async def chunk_node(state: VideoAnalysisState) -> Dict:
    """
    Step 1: Break transcript into chunks
    
    This function:
    1. Reads transcript and speaker_labels from state
    2. Calls Claude with CHUNK_SYSTEM_PROMPT
    3. Parses JSON response
    4. Returns dict with updated fields
    """
    
    try:
        # 1. Read from state
        transcript = state["transcript"]
        speaker_labels = state["speaker_labels"]
        video_id = state["video_id"]
        
        # 2. Format transcript with real names
        formatted_transcript = format_transcript(transcript, speaker_labels)
        
        # 3. Call Claude
        messages = [
            SystemMessage(content=CHUNK_SYSTEM_PROMPT),
            HumanMessage(content=f"Transcript:\n\n{formatted_transcript}")
        ]
        
        response = await llm.ainvoke(messages)
        
        # 4. Parse JSON response
        chunks = json.loads(response.content)
        
        # 5. Return updates to state
        return {
            "chunks": chunks,
            "chunks_completed_at": datetime.utcnow().isoformat(),
            "current_step": "chunk_completed",
            "messages": [
                {"role": "system", "content": f"Chunked into {len(chunks)} pieces"}
            ]
        }
        
    except Exception as e:
        # Error handling
        return {
            "error": f"Chunk step failed: {str(e)}",
            "current_step": "chunk_failed"
        }


def format_transcript(raw: str, labels: Dict[str, str]) -> str:
    """Helper: Replace 'Speaker A' with 'Interviewer' etc."""
    formatted = raw
    for label, name in labels.items():
        formatted = formatted.replace(label, name)
    return formatted
```

**Node Best Practices:**
- ✅ Always use `async def` for nodes (supports async Claude calls)
- ✅ Return a dict with ONLY the fields you're updating
- ✅ Include error field if something fails
- ✅ Log progress in messages array
- ✅ Keep nodes focused (one responsibility)
- ✅ Make nodes testable (no side effects except DB writes)

### 3. Graph Construction

The graph defines the flow between nodes.

```python
# backend/app/agents/graph.py

from langgraph.graph import StateGraph, END
from .states import VideoAnalysisState
from .nodes import chunk, infer, relate, explain, activate

def create_video_analysis_graph():
    """
    Create the state machine for analyzing individual videos.
    
    Flow: chunk → infer → relate → explain → activate → END
    """
    
    # 1. Initialize graph with state type
    workflow = StateGraph(VideoAnalysisState)
    
    # 2. Add nodes (name → function mapping)
    workflow.add_node("chunk", chunk.chunk_node)
    workflow.add_node("infer", infer.infer_node)
    workflow.add_node("relate", relate.relate_node)
    workflow.add_node("explain", explain.explain_node)
    workflow.add_node("activate", activate.activate_node)
    
    # 3. Define edges (flow)
    workflow.set_entry_point("chunk")  # Start here
    workflow.add_edge("chunk", "infer")  # chunk → infer
    workflow.add_edge("infer", "relate")  # infer → relate
    workflow.add_edge("relate", "explain")  # relate → explain
    workflow.add_edge("explain", "activate")  # explain → activate
    workflow.add_edge("activate", END)  # activate → END
    
    # 4. Compile into runnable graph
    return workflow.compile()


# Usage in your code:
video_graph = create_video_analysis_graph()

# Run the graph
result = await video_graph.ainvoke({
    "video_id": "123",
    "transcript": "...",
    "speaker_labels": {"Speaker A": "Interviewer", "Speaker B": "John"}
})

# Result is the final state with all fields populated
print(result["chunks"])
print(result["design_principles"])
```

### 4. Advanced: Conditional Routing (Future Enhancement)

You can add conditional logic to your graph:

```python
def should_rerun_inference(state: VideoAnalysisState) -> str:
    """
    Decide next step based on state.
    Return the name of the next node.
    """
    inferences = state.get("inferences", [])
    
    # If fewer than 10 inferences, something might be wrong
    if len(inferences) < 10:
        return "rerun_infer"  # Go back to infer
    else:
        return "relate"  # Continue to relate


# In graph construction:
workflow.add_conditional_edges(
    "infer",  # From this node
    should_rerun_inference,  # Call this function
    {
        "rerun_infer": "infer",  # If returns "rerun_infer", go to infer
        "relate": "relate"  # If returns "relate", go to relate
    }
)
```

---

## Maintaining Your Agentic System

### 1. Adding a New Agent Step

**Scenario:** You want to add a "Validate" step after "Chunk" to check chunk quality.

```python
# Step 1: Update state
class VideoAnalysisState(TypedDict):
    # ... existing fields
    validation_results: Optional[Dict]  # NEW

# Step 2: Create node
# backend/app/agents/nodes/validate.py
async def validate_node(state: VideoAnalysisState) -> Dict:
    chunks = state["chunks"]
    # Validate chunks...
    return {"validation_results": {...}}

# Step 3: Update graph
workflow.add_node("validate", validate.validate_node)
workflow.add_edge("chunk", "validate")  # chunk → validate
workflow.add_edge("validate", "infer")  # validate → infer
```

**That's it!** The rest of your code doesn't need to change.

### 2. Modifying Agent Behavior

**Scenario:** You want to improve the "Infer" step's prompt.

```python
# Just update the prompt in prompts.py
INFER_SYSTEM_PROMPT = """
[Updated prompt with better instructions]
"""

# No other code changes needed!
# The infer_node reads from this prompt automatically.
```

### 3. Error Handling & Retries

Add retry logic to nodes:

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
async def call_claude_with_retry(prompt: str, context: str):
    """Retry up to 3 times with exponential backoff"""
    response = await llm.ainvoke([
        SystemMessage(content=prompt),
        HumanMessage(content=context)
    ])
    return response

# Use in your node:
async def infer_node(state: VideoAnalysisState) -> Dict:
    try:
        response = await call_claude_with_retry(
            INFER_SYSTEM_PROMPT,
            state["chunks"]
        )
        # ...
    except Exception as e:
        return {"error": f"Failed after retries: {e}"}
```

### 4. Logging & Observability

Add comprehensive logging:

```python
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

async def chunk_node(state: VideoAnalysisState) -> Dict:
    start_time = datetime.utcnow()
    video_id = state["video_id"]
    
    logger.info(
        "Starting chunk step",
        extra={
            "video_id": video_id,
            "transcript_length": len(state["transcript"]),
            "step": "chunk"
        }
    )
    
    try:
        # ... do work
        chunks = [...]
        
        duration = (datetime.utcnow() - start_time).total_seconds()
        
        logger.info(
            "Chunk step completed",
            extra={
                "video_id": video_id,
                "chunks_count": len(chunks),
                "duration_seconds": duration,
                "step": "chunk"
            }
        )
        
        return {"chunks": chunks, ...}
        
    except Exception as e:
        logger.error(
            "Chunk step failed",
            extra={
                "video_id": video_id,
                "error": str(e),
                "step": "chunk"
            },
            exc_info=True
        )
        return {"error": str(e)}
```

### 5. Testing Individual Agents

LangGraph makes testing easy:

```python
# tests/test_chunk_agent.py

import pytest
from app.agents.nodes.chunk import chunk_node

@pytest.mark.asyncio
async def test_chunk_node():
    """Test chunk node in isolation"""
    
    # Arrange: Create mock state
    state = {
        "video_id": "test-123",
        "transcript": "Speaker A: Hello. Speaker B: Hi there.",
        "speaker_labels": {
            "Speaker A": "Interviewer",
            "Speaker B": "John Doe"
        }
    }
    
    # Act: Call the node
    result = await chunk_node(state)
    
    # Assert: Check output
    assert "chunks" in result
    assert len(result["chunks"]) > 0
    assert result["chunks"][0]["speaker"] == "Interviewer"
    assert "error" not in result
```

### 6. Monitoring in Production

Track metrics:

```python
from prometheus_client import Counter, Histogram

# Define metrics
chunk_count = Counter('chunks_created_total', 'Total chunks created')
chunk_duration = Histogram('chunk_duration_seconds', 'Time to chunk')

async def chunk_node(state: VideoAnalysisState) -> Dict:
    with chunk_duration.time():
        # ... do work
        chunks = [...]
        
        chunk_count.inc(len(chunks))
        
        return {"chunks": chunks}
```

---

## Persistence & Resumability

LangGraph supports saving state to resume later:

```python
from langgraph.checkpoint.memory import MemorySaver

# Create graph with checkpointing
checkpointer = MemorySaver()
workflow = create_video_analysis_graph()
graph = workflow.compile(checkpointer=checkpointer)

# Run with a thread_id
result = await graph.ainvoke(
    {"video_id": "123", "transcript": "..."},
    config={"configurable": {"thread_id": "video-123"}}
)

# If it fails at step 3, you can resume:
# (State is saved after each step)
result = await graph.ainvoke(
    {},  # Empty input (uses saved state)
    config={"configurable": {"thread_id": "video-123"}}
)
```

For production, use PostgreSQL checkpointer:

```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver(database_url="postgresql://...")
```

---

## Scaling Your Agentic System

### Horizontal Scaling

Run multiple Celery workers:

```bash
# Worker 1
celery -A app.tasks.celery_app worker --hostname=worker1@%h

# Worker 2
celery -A app.tasks.celery_app worker --hostname=worker2@%h

# Worker 3
celery -A app.tasks.celery_app worker --hostname=worker3@%h
```

Each worker can process a different video simultaneously.

### Queue Management

Use different queues for different priorities:

```python
# High priority: Single-video analysis
@celery_app.task(queue='high_priority')
def analyze_video_task(video_id):
    # ...

# Low priority: Cross-video synthesis
@celery_app.task(queue='low_priority')
def analyze_project_task(project_id):
    # ...

# Start workers for specific queues:
# celery -A app.tasks.celery_app worker -Q high_priority
# celery -A app.tasks.celery_app worker -Q low_priority
```

---

## Common Patterns

### Pattern 1: Agent Chaining

```python
# Each agent produces input for the next
chunk → infer → relate → explain → activate
```

### Pattern 2: Fan-Out / Fan-In

```python
# Future enhancement: Analyze multiple aspects in parallel
                    ┌─→ emotional_analysis ─┐
transcript ─→ chunk ├─→ behavioral_analysis ├─→ synthesize
                    └─→ contextual_analysis ─┘
```

### Pattern 3: Human-in-the-Loop

```python
def should_wait_for_approval(state):
    if state["insights_require_review"]:
        return "wait_for_human"
    return "activate"

workflow.add_conditional_edges(
    "explain",
    should_wait_for_approval,
    {
        "wait_for_human": "human_review",
        "activate": "activate"
    }
)
```

---

## Debugging Tips

### 1. Print State at Each Step

```python
async def chunk_node(state: VideoAnalysisState) -> Dict:
    print(f"=== CHUNK NODE ===")
    print(f"Input state keys: {state.keys()}")
    print(f"Transcript length: {len(state['transcript'])}")
    
    # ... do work
    
    print(f"Output: {len(chunks)} chunks")
    return {"chunks": chunks}
```

### 2. Use LangSmith (Optional)

LangSmith provides visual tracing:

```python
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "your-key"

# Now all LangGraph runs are traced in LangSmith UI
```

### 3. Validate State Between Steps

```python
def validate_state(state: VideoAnalysisState):
    """Check state is valid before each step"""
    assert "transcript" in state, "Missing transcript"
    assert state["transcript"], "Empty transcript"
    if state.get("chunks"):
        assert isinstance(state["chunks"], list), "Chunks must be list"
```

---

## When to Use LangGraph vs. Simple Functions

**Use LangGraph when:**
- ✅ You have 3+ sequential steps
- ✅ You need state management
- ✅ You want to add conditional logic
- ✅ You need persistence/resumability
- ✅ You want easy testing of individual steps

**Use simple functions when:**
- ❌ You have 1-2 simple steps
- ❌ No state needed between calls
- ❌ Linear, always-the-same flow

For your project, **LangGraph is the right choice** because:
1. You have 5 steps (8 including cross-video)
2. State needs to flow between all steps
3. You might add conditional logic later
4. Each step needs to be independently testable
5. You want observability into what's happening

---

## Summary

**LangGraph gives you:**
1. **Clean code**: Each agent is isolated
2. **Maintainability**: Easy to add/modify agents
3. **Reliability**: Built-in error handling
4. **Testability**: Test each node independently
5. **Observability**: See what's happening
6. **Flexibility**: Add conditional routing easily

**To maintain your system:**
1. Keep nodes focused (one responsibility)
2. Update prompts in one place
3. Add comprehensive logging
4. Test nodes in isolation
5. Monitor metrics in production
6. Use checkpointing for long-running workflows

**You're building a robust, maintainable system! 🚀**
