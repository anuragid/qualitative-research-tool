"""LangGraph state definitions for analysis pipelines."""

from typing import TypedDict, List, Dict, Any, Optional


class VideoAnalysisState(TypedDict):
    """
    State for single video analysis (5-step pipeline).

    Flow: CHUNK -> INFER -> RELATE -> EXPLAIN -> ACTIVATE
    """
    # Input data
    video_id: str
    transcript: Dict[str, Any]  # Processed transcript with speaker labels
    speaker_labels: Dict[str, str]  # Mapping of speaker IDs to names

    # Step 1: CHUNK - Break transcript into discrete pieces
    chunks: Optional[List[Dict[str, Any]]]

    # Step 2: INFER - Interpret meaning from each chunk
    inferences: Optional[List[Dict[str, Any]]]

    # Step 3: RELATE - Find patterns across inferences
    patterns: Optional[List[Dict[str, Any]]]

    # Step 4: EXPLAIN - Generate insights from patterns
    insights: Optional[List[Dict[str, Any]]]

    # Step 5: ACTIVATE - Create design principles from insights
    design_principles: Optional[List[Dict[str, Any]]]

    # Metadata
    current_step: str  # Track progress: "chunk", "infer", "relate", "explain", "activate"
    error: Optional[str]  # Store any errors that occur


class ProjectAnalysisState(TypedDict):
    """
    State for cross-video synthesis (3-step pipeline).

    Flow: CROSS_RELATE -> CROSS_EXPLAIN -> CROSS_ACTIVATE
    """
    # Input data
    project_id: str
    video_ids: List[str]

    # All video analysis results
    video_patterns: List[Dict[str, Any]]  # Patterns from all videos
    video_insights: List[Dict[str, Any]]  # Insights from all videos
    video_principles: List[Dict[str, Any]]  # Principles from all videos

    # Step 6: CROSS_RELATE - Find meta-patterns across videos
    cross_video_patterns: Optional[List[Dict[str, Any]]]

    # Step 7: CROSS_EXPLAIN - Generate cross-video insights
    cross_video_insights: Optional[List[Dict[str, Any]]]

    # Step 8: CROSS_ACTIVATE - Create system-level design principles
    cross_video_principles: Optional[List[Dict[str, Any]]]

    # Metadata
    current_step: str  # Track progress: "cross_relate", "cross_explain", "cross_activate"
    error: Optional[str]  # Store any errors that occur
