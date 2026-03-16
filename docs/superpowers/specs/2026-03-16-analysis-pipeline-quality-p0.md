# Analysis Pipeline Quality — P0 Fixes

**Date:** 2026-03-16
**Status:** Approved
**Approach:** B — Prompt Rewrites + Lightweight Post-Processing

## Problem

The 8-step analysis pipeline produces low-quality output due to three root causes:

1. **Chunk extraction has no quality gate.** The CHUNK prompt says "a single, discrete piece of information" with no exclusion criteria. Single words, pleasantries, small talk, and filler all get chunked. This cascades — bad chunks produce shallow inferences, weak patterns, vague insights, and generic principles.

2. **RELATE prompt is missing `relationship_type`.** The frontend expects `relationship_type: "convergent" | "divergent" | "tension" | "causal"` but the prompt never mentions this field. The LLM only generates `frequency`.

3. **EXPLAIN prompt doesn't enumerate insight types.** The frontend expects `type: "non-consensus" | "first-principles" | "surprising" | "revealing"` but the prompt example only shows `"non-consensus"` and the spec says `"type" (string)`. The LLM copies the single example literally — so all insights are "non-consensus". Additionally, the `evidence` field sometimes contains chunk IDs ("C006") instead of actual quote text.

**Additionally:** No prompt receives the project's research context, so the LLM cannot judge relevance.

## Solution Overview

8 files modified, zero breaking changes, zero schema migrations.

| Change | Files |
|--------|-------|
| Thread project description into pipeline | `states.py`, `analysis_tasks.py`, `chunk.py`, `relate.py`, `explain.py` |
| Rewrite 3 prompts | `prompts.py` |
| Add post-processing filters | `chunk.py`, `relate.py`, `explain.py` |
| Update placeholder text | `CreateProjectDialog.tsx`, `EditProjectDialog.tsx` |

## Detailed Design

### 1. Thread Project Description Into Pipeline

**`backend/app/agents/states.py`:**
Add `project_description: Optional[str]` to `VideoAnalysisState`.

**`backend/app/tasks/analysis_tasks.py`:**
In `analyze_video_task`, fetch `project.description` via the video's `project_id` and pass it into `initial_state["project_description"]`.

**Each per-video node (`chunk.py`, `relate.py`, `explain.py`):**
Check `state.get("project_description")`. If present, include a `RESEARCH CONTEXT:` block in the user message. If absent, the prompt is identical to today — no regression, no breaking change.

### 2. Chunk Quality — Prompt Rewrite + Post-Processing

**`prompts.py` — `CHUNK_SYSTEM_PROMPT` rewrite:**

Add to CHUNKING RULES:
- Explicit exclusion list: single-word responses, pleasantries, filler/backchannels, meta-conversation, small talk
- Minimum substance rule: each chunk must contain a substantive thought, opinion, experience, or observation
- When research context available: "Focus on content relevant to: {description}"
- Few-shot example: one good chunk (accepted) and one bad chunk (rejected)

**`chunk.py` — post-processing filter:**

After LLM returns chunks, before storing:
1. Drop chunks where `text` is under 5 words
2. Drop chunks where `text.strip().lower()` (with trailing punctuation stripped) **exactly equals** one of the filler phrases: "yeah", "okay", "mm-hmm", "uh-huh", "sure", "right", "yes", "no", "I see", "I agree", "thank you", "thanks", "hello", "hi", "bye", "goodbye". This is full-text exact match, NOT substring matching — a chunk containing "yes" within a longer sentence is kept.
3. Log count of filtered chunks for monitoring

### 3. RELATE Prompt — Add `relationship_type`

**`prompts.py` — `RELATE_SYSTEM_PROMPT` rewrite:**

Add to output format:
- `"relationship_type"` field with enum: `"convergent" | "divergent" | "tension" | "causal"`
- Descriptions for each type:
  - convergent — multiple inferences point to the same conclusion
  - divergent — inferences show different perspectives or approaches
  - tension — inferences contradict or create friction
  - causal — one inference suggests a cause/effect for another
- Research context injection when available

**`relate.py` — post-processing fallback:**

If `relationship_type` is missing from a pattern, default to `"convergent"` and log a warning.

### 4. EXPLAIN Prompt — Enumerate Types + Fix Evidence

**`prompts.py` — `EXPLAIN_SYSTEM_PROMPT` rewrite:**

- Change `"type" (string)` to `"type" (one of: "non-consensus", "first-principles", "surprising", "revealing")`
- Add descriptions for each type:
  - non-consensus — challenges common assumptions or conventional wisdom
  - first-principles — reveals a fundamental truth that other insights build on
  - surprising — unexpected finding that contradicts what you'd predict
  - revealing — exposes a hidden dynamic, motivation, or need
- Add instruction: "Distribute types — don't default all insights to one type."
- Add instruction: "Include 1-3 actual quote texts as evidence, NOT chunk IDs like C006."
- Research context injection when available

**`explain.py` — post-processing:**

1. Evidence resolution: scan each `evidence` array entry. If it matches the **anchored** regex `^C\d{1,4}$` (case-insensitive) — i.e., a chunk ID reference, not a word like "COVID-19" — look it up in `state["chunks"]` by chunk_id and replace with the chunk's `text` field. If the chunk ID is not found, keep the original string as-is (no error).
2. Type fallback: if `type` is missing or not one of the 4 valid values, default to `"non-consensus"` and log a warning.

### 5. Frontend Placeholder Updates

**`CreateProjectDialog.tsx` and `EditProjectDialog.tsx`:**

Update the description textarea placeholder to:
```
What is this research about? e.g., 'Understanding why users abandon onboarding in mobile banking apps.' This guides the AI analysis — be specific about your research question.
```

## What Does NOT Change

- Database schema — no migrations needed
- API contracts — no new endpoints or response shape changes
- Frontend types/display logic — same TypeScript interfaces
- Output JSON structure — same fields, just better populated
- Pipeline behavior without description — runs identically to today
- INFER and ACTIVATE prompts — not in P0 scope
- Cross-video prompts (steps 6-8) — not in P0 scope

## Files Modified

1. `backend/app/agents/prompts.py` — rewrite CHUNK, RELATE, EXPLAIN system prompts
2. `backend/app/agents/states.py` — add `project_description` to VideoAnalysisState
3. `backend/app/agents/nodes/chunk.py` — research context injection + quality filter
4. `backend/app/agents/nodes/relate.py` — research context injection + relationship_type fallback
5. `backend/app/agents/nodes/explain.py` — research context injection + evidence resolution + type fallback
6. `backend/app/tasks/analysis_tasks.py` — fetch project.description, pass into state
7. `frontend/src/components/projects/CreateProjectDialog.tsx` — placeholder text
8. `frontend/src/components/projects/EditProjectDialog.tsx` — placeholder text
