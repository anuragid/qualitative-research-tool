"""Project management API routes."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, contains_eager, selectinload

from app.auth_bridge import Permission, require_permissions
from app.config import settings
from app.database import get_db
from app.dependencies.byok_gate import require_byok_credits
from app.models.database_models import Project, ProjectAnalysis, Video, VideoAnalysis
from app.models.schemas import (
    ProjectAnalysisResponse,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
    VideoListItemResponse,
)
from app.rate_limit import limiter
from app.services.openrouter_balance import BalanceInfo
from app.services.s3_service import s3_service
from app.state import (
    ProjectAnalysisEvent,
    ProjectAnalysisStateMachine,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Columns to load for lightweight list/poll payloads. Excludes the 5 JSONB
# blobs (chunks, inferences, patterns, insights, design_principles) that can
# be 50–500 KB per video. The full blobs are only needed on the detail/analysis
# endpoint which is NOT polled.
_ANALYSIS_STATUS_COLS = [
    VideoAnalysis.id,
    VideoAnalysis.video_id,
    VideoAnalysis.status,
    VideoAnalysis.started_at,
    VideoAnalysis.completed_at,
    VideoAnalysis.current_step,
    VideoAnalysis.step_status,
    VideoAnalysis.chunk_completed_at,
    VideoAnalysis.infer_completed_at,
    VideoAnalysis.relate_completed_at,
    VideoAnalysis.explain_completed_at,
    VideoAnalysis.activate_completed_at,
]


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_CREATE)),
    db: Session = Depends(get_db)
):
    """
    Create a new research project.

    Args:
        project_data: Project creation data (name, description)
        current_user: Authenticated user dict
        db: Database session

    Returns:
        Created project
    """
    current_user_id = current_user["id"]
    try:
        # Enforce per-user project quota
        project_count = db.query(Project).filter(Project.user_id == current_user_id).count()
        if project_count >= 20:
            raise HTTPException(status_code=429, detail="Maximum of 20 projects per user")

        # Create new project with user_id
        project = Project(
            user_id=current_user_id,
            name=project_data.name,
            description=project_data.description,
        )

        db.add(project)
        db.commit()
        db.refresh(project)

        logger.info(f"Created project: {project.id} - {project.name}")
        return project

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating project: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project"
        )


@router.get("/", response_model=List[ProjectListResponse])
async def list_projects(
    skip: int = 0,
    limit: int = 50,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_READ)),
    db: Session = Depends(get_db)
):
    """
    List all research projects for the authenticated user.

    Args:
        skip: Number of projects to skip (for pagination)
        limit: Maximum number of projects to return
        current_user: Authenticated user dict
        db: Database session

    Returns:
        List of projects for the current user
    """
    current_user_id = current_user["id"]
    try:
        # Cap limit to prevent excessive data retrieval
        limit = min(limit, 100)
        skip = max(skip, 0)
        skip = min(skip, 10000)

        # Single LEFT OUTER JOIN: projects + videos (id/status/uploaded_at only).
        # No join to video_analyses — the projects-list UI only needs:
        #   - video.id          (React key + thumbnail slot)
        #   - video.status      (FolderStatusIcon + polling gate)
        #   - video.uploaded_at (sort key for "3 most-recent" thumbnails)
        #
        # contains_eager(Project.videos) tells SQLAlchemy to populate the
        # Project.videos relationship from the outerjoin columns instead of
        # issuing a second SELECT.  load_only() restricts the Video columns
        # fetched to the three we need, so the query never touches the
        # video_analyses table at all.
        #
        # Query count: 1 (vs. 2 with the previous selectinload approach, and
        # vs. N+1 without eager-loading at all).
        projects = (
            db.query(Project)
            .outerjoin(Project.videos)
            .options(
                contains_eager(Project.videos).load_only(
                    Video.id,
                    Video.status,
                    Video.uploaded_at,
                )
            )
            .filter(Project.user_id == current_user_id)
            .order_by(Project.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

        logger.info(f"Retrieved {len(projects)} projects")
        return [ProjectListResponse.model_validate(p) for p in projects]

    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list projects"
        )


@router.get("/{project_id}", response_model=ProjectListResponse)
async def get_project(
    project_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_READ)),
    db: Session = Depends(get_db)
):
    """
    Get a specific project by ID (must be owned by the current user).

    Args:
        project_id: Project UUID
        current_user: Authenticated user dict
        db: Database session

    Returns:
        Project details
    """
    current_user_id = current_user["id"]
    try:
        # Same optimised pattern as list_projects: single outerjoin to videos
        # (id/status/uploaded_at only), no touch of video_analyses.
        project = (
            db.query(Project)
            .outerjoin(Project.videos)
            .options(
                contains_eager(Project.videos).load_only(
                    Video.id,
                    Video.status,
                    Video.uploaded_at,
                )
            )
            .filter(Project.id == project_id)
            .filter(Project.user_id == current_user_id)
            .first()
        )

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found or you don't have access to it"
            )

        logger.info(f"Retrieved project: {project_id}")
        return ProjectListResponse.model_validate(project)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get project"
        )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_data: ProjectUpdate,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_UPDATE)),
    db: Session = Depends(get_db)
):
    """
    Update a project (must be owned by the current user).

    Args:
        project_id: Project UUID
        project_data: Update data
        current_user: Authenticated user dict
        db: Database session

    Returns:
        Updated project
    """
    current_user_id = current_user["id"]
    try:
        project = db.query(Project)\
            .filter(Project.id == project_id)\
            .filter(Project.user_id == current_user_id)\
            .first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found or you don't have access to it"
            )

        # Update fields if provided (status is not user-updatable)
        if project_data.name is not None:
            project.name = project_data.name
        if project_data.description is not None:
            project.description = project_data.description

        db.commit()
        db.refresh(project)

        logger.info(f"Updated project: {project_id}")
        return project

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating project: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update project"
        )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_DELETE)),
    db: Session = Depends(get_db)
):
    """
    Delete a project and all associated data (must be owned by the current user).

    Args:
        project_id: Project UUID
        current_user: Authenticated user dict
        db: Database session

    Returns:
        No content
    """
    current_user_id = current_user["id"]
    try:
        project = db.query(Project)\
            .options(selectinload(Project.videos))\
            .filter(Project.id == project_id)\
            .filter(Project.user_id == current_user_id)\
            .first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found or you don't have access to it"
            )

        # Block delete if any video is currently processing
        for video in project.videos:
            if video.status in ("transcribing", "analyzing"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot delete project while videos are being processed",
                )

        # Delete S3 objects for all videos (offloaded to thread)
        for video in project.videos:
            try:
                await asyncio.to_thread(s3_service.delete_video, video.s3_key)
            except Exception as e:
                logger.warning(f"Failed to delete S3 object for video {video.id}: {e}")

        db.delete(project)
        db.commit()

        logger.info(f"Deleted project: {project_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete project"
        )


@router.get("/{project_id}/videos", response_model=List[VideoListItemResponse])
async def list_project_videos(
    project_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_READ)),
    db: Session = Depends(get_db)
):
    """
    List all videos for a specific project.

    Args:
        project_id: Project UUID
        db: Database session

    Returns:
        List of videos
    """
    current_user_id = current_user["id"]
    try:
        # Check if project exists and is owned by current user
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user_id,
        ).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

        # Get all videos for this project — load only analysis status fields,
        # not the JSONB blobs, since this endpoint is polled every 4-20s.
        videos = db.query(Video)\
            .options(
                selectinload(Video.video_analysis).load_only(*_ANALYSIS_STATUS_COLS)
            )\
            .filter(Video.project_id == project_id)\
            .order_by(Video.uploaded_at.desc())\
            .all()

        logger.info(f"Retrieved {len(videos)} videos for project {project_id}")
        return [VideoListItemResponse.model_validate(v) for v in videos]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing project videos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list project videos"
        )


@router.post("/{project_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(settings.RATE_LIMIT_ANALYZE)
async def trigger_project_analysis(
    project_id: UUID,
    request: Request,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db),
    balance: BalanceInfo | None = Depends(require_byok_credits),
):
    """
    Trigger cross-video analysis for a project.

    This endpoint will be implemented in Phase 5 with Celery tasks.
    For now, it returns a placeholder response.

    Args:
        project_id: Project UUID
        db: Database session

    Returns:
        Task information
    """
    current_user_id = current_user["id"]
    try:
        # Check if project exists and is owned by current user
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user_id,
        ).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

        # Get all analyzed videos for this project
        analyzed_videos = db.query(Video)\
            .join(VideoAnalysis)\
            .filter(
                Video.project_id == project_id,
                VideoAnalysis.status == "completed"
            )\
            .all()

        if len(analyzed_videos) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one video must be analyzed before running project analysis"
            )

        video_ids = [video.id for video in analyzed_videos]

        # Look up any existing ProjectAnalysis row so we can guard against a
        # double-dispatch and reset a stale errored row before redispatching.
        existing_analysis = db.query(ProjectAnalysis)\
            .filter(ProjectAnalysis.project_id == project_id)\
            .first()

        # Race condition / double-click guard: reject if a cross-video
        # analysis is already in flight. Mirrors the video route's
        # `video.status in ("analyzing",)` 409 (videos.py ~647-651). Two
        # back-to-back retry clicks both reach here, but the first one's
        # reset-to-processing commit makes the second see status ==
        # "processing" and bail, so the chain is dispatched exactly once.
        if existing_analysis is not None and existing_analysis.status == "processing":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project analysis is already in progress",
            )

        # Retry path: if the ProjectAnalysis row is in "error" state, reset
        # it BEFORE dispatching the chain. Otherwise the first chain link
        # (analyze_cross_relate_step) sees status == "error" in its precheck,
        # returns {"status": "skipped"}, the later steps skip via
        # _check_project_cancellation, the chain "succeeds", and the row
        # stays error forever — the retry is a silent no-op and the user
        # can't recover without a DB edit. Mirrors the video retry path
        # (videos.py ~691-712 + PR #19.5).
        #
        # RETRY_RESET (error -> processing) goes through the state machine so
        # we never write status directly (project invariant #3). Like the
        # video route, this block only fires for error rows: a deliberate
        # re-trigger of a COMPLETED analysis is left untouched here and the
        # idempotent chain simply recomputes it.
        if existing_analysis is not None and existing_analysis.status == "error":
            ProjectAnalysisStateMachine.transition(
                existing_analysis, ProjectAnalysisEvent.RETRY_RESET, db=db
            )
            existing_analysis.started_at = datetime.now(timezone.utc)
            existing_analysis.completed_at = None
            # Clear stale partial cross-video results so the new run doesn't
            # mix old blobs in. The chain steps repopulate these.
            existing_analysis.cross_video_patterns = None
            existing_analysis.cross_video_insights = None
            existing_analysis.cross_video_principles = None
            db.commit()

        # Dispatch the cross-video analysis chain. When no row exists yet the
        # first chain link (analyze_cross_relate_step) creates it; on retry
        # the reset above has already flipped it to a runnable state.
        from celery import chain

        from app.tasks.pipeline_errors import handle_project_pipeline_error
        from app.tasks.project_analysis_steps import (
            analyze_cross_activate_step,
            analyze_cross_explain_step,
            analyze_cross_relate_step,
        )

        project_id_str = str(project_id)
        pipeline = chain(
            analyze_cross_relate_step.si(project_id_str, current_user_id),
            analyze_cross_explain_step.si(project_id_str, current_user_id),
            analyze_cross_activate_step.si(project_id_str, current_user_id),
        ).on_error(handle_project_pipeline_error.s(project_id=project_id_str))

        task = pipeline.apply_async()

        # Fetch (or None) the ProjectAnalysis id for the response shape.
        project_analysis = db.query(ProjectAnalysis)\
            .filter(ProjectAnalysis.project_id == project_id)\
            .first()
        analysis_id = str(project_analysis.id) if project_analysis else None

        logger.info(f"Project analysis chain started for project {project_id}, task_id: {task.id}")
        return {
            "message": "Project analysis task started",
            "project_id": project_id_str,
            "analysis_id": analysis_id,
            "video_count": len(video_ids),
            "task_id": task.id,
            "status": "processing"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering project analysis: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to trigger project analysis"
        )


@router.get("/{project_id}/analysis", response_model=ProjectAnalysisResponse)
async def get_project_analysis(
    project_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db)
):
    """
    Get cross-video analysis results for a project.

    When the project exists but no ``project_analyses`` row has been
    created yet, this returns a 200 with ``status="not_started"`` and
    empty list fields so the frontend can render an empty/CTA state
    without crashing on ``Array.map`` over undefined.  The 404 is still
    returned when the project itself doesn't exist or isn't owned by
    the caller.  See Sentry JAVASCRIPT-REACT-6 for the crash this
    prevents.

    Args:
        project_id: Project UUID
        db: Database session

    Returns:
        Project analysis results (possibly a "not_started" sentinel)
    """
    current_user_id = current_user["id"]
    try:
        # Check if project exists and is owned by current user
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user_id,
        ).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

        # Get project analysis
        project_analysis = db.query(ProjectAnalysis)\
            .filter(ProjectAnalysis.project_id == project_id)\
            .order_by(ProjectAnalysis.started_at.desc())\
            .first()

        if not project_analysis:
            logger.info(
                "No project_analyses row for project %s — returning not_started sentinel",
                project_id,
            )
            return ProjectAnalysisResponse(
                id=None,
                project_id=project_id,
                video_ids=[],
                cross_video_patterns=[],
                cross_video_insights=[],
                cross_video_principles=[],
                status="not_started",
                started_at=None,
                completed_at=None,
            )

        logger.info(f"Retrieved project analysis for project {project_id}")
        return project_analysis

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project analysis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get project analysis"
        )
