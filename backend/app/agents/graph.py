"""LangGraph workflow definitions for qualitative analysis."""

from langgraph.graph import StateGraph, END
import logging

from app.agents.states import VideoAnalysisState, ProjectAnalysisState
from app.agents.nodes import (
    chunk_node,
    infer_node,
    relate_node,
    explain_node,
    activate_node,
    cross_relate_node,
    cross_explain_node,
    cross_activate_node,
)

logger = logging.getLogger(__name__)


def create_video_analysis_graph() -> StateGraph:
    """
    Create the video analysis workflow graph.

    Flow: START -> chunk -> infer -> relate -> explain -> activate -> END

    Returns:
        Compiled StateGraph for video analysis
    """
    logger.info("Creating video analysis graph")

    # Create graph with VideoAnalysisState
    workflow = StateGraph(VideoAnalysisState)

    # Add nodes
    workflow.add_node("chunk", chunk_node)
    workflow.add_node("infer", infer_node)
    workflow.add_node("relate", relate_node)
    workflow.add_node("explain", explain_node)
    workflow.add_node("activate", activate_node)

    # Define linear flow
    workflow.set_entry_point("chunk")
    workflow.add_edge("chunk", "infer")
    workflow.add_edge("infer", "relate")
    workflow.add_edge("relate", "explain")
    workflow.add_edge("explain", "activate")
    workflow.add_edge("activate", END)

    # Compile graph
    return workflow.compile()


def create_project_analysis_graph() -> StateGraph:
    """
    Create the cross-video analysis workflow graph.

    Flow: START -> cross_relate -> cross_explain -> cross_activate -> END

    Returns:
        Compiled StateGraph for project analysis
    """
    logger.info("Creating project analysis graph")

    # Create graph with ProjectAnalysisState
    workflow = StateGraph(ProjectAnalysisState)

    # Add nodes
    workflow.add_node("cross_relate", cross_relate_node)
    workflow.add_node("cross_explain", cross_explain_node)
    workflow.add_node("cross_activate", cross_activate_node)

    # Define linear flow
    workflow.set_entry_point("cross_relate")
    workflow.add_edge("cross_relate", "cross_explain")
    workflow.add_edge("cross_explain", "cross_activate")
    workflow.add_edge("cross_activate", END)

    # Compile graph
    return workflow.compile()


# Create graph instances (can be reused)
video_analysis_graph = create_video_analysis_graph()
project_analysis_graph = create_project_analysis_graph()
