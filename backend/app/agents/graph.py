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


def _check_video_error(state: VideoAnalysisState) -> str:
    """Route to END if there's an error in state, otherwise continue."""
    if state.get("error"):
        logger.error(f"Pipeline halting due to error: {state['error']}")
        return "end"
    return "continue"


def _check_project_error(state: ProjectAnalysisState) -> str:
    """Route to END if there's an error in state, otherwise continue."""
    if state.get("error"):
        logger.error(f"Pipeline halting due to error: {state['error']}")
        return "end"
    return "continue"


def create_video_analysis_graph() -> StateGraph:
    """
    Create the video analysis workflow graph.

    Flow: START -> chunk -> (error check) -> infer -> (error check) ->
          relate -> (error check) -> explain -> (error check) -> activate -> END

    Each node's output is checked for errors before proceeding.
    If any node sets state["error"], the pipeline halts immediately.

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

    # Define flow with error checking after each node
    workflow.set_entry_point("chunk")

    workflow.add_conditional_edges(
        "chunk",
        _check_video_error,
        {"continue": "infer", "end": END},
    )
    workflow.add_conditional_edges(
        "infer",
        _check_video_error,
        {"continue": "relate", "end": END},
    )
    workflow.add_conditional_edges(
        "relate",
        _check_video_error,
        {"continue": "explain", "end": END},
    )
    workflow.add_conditional_edges(
        "explain",
        _check_video_error,
        {"continue": "activate", "end": END},
    )
    workflow.add_edge("activate", END)

    # Compile graph
    return workflow.compile()


def create_project_analysis_graph() -> StateGraph:
    """
    Create the cross-video analysis workflow graph.

    Flow: START -> cross_relate -> (error check) -> cross_explain ->
          (error check) -> cross_activate -> END

    Each node's output is checked for errors before proceeding.
    If any node sets state["error"], the pipeline halts immediately.

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

    # Define flow with error checking after each node
    workflow.set_entry_point("cross_relate")

    workflow.add_conditional_edges(
        "cross_relate",
        _check_project_error,
        {"continue": "cross_explain", "end": END},
    )
    workflow.add_conditional_edges(
        "cross_explain",
        _check_project_error,
        {"continue": "cross_activate", "end": END},
    )
    workflow.add_edge("cross_activate", END)

    # Compile graph
    return workflow.compile()


# Create graph instances (can be reused)
video_analysis_graph = create_video_analysis_graph()
project_analysis_graph = create_project_analysis_graph()
