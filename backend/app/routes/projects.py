"""Project management API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import logging

from app.database import get_db
from app.models.database_models import Project, Video, VideoAnalysis, ProjectAnalysis
from app.models.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    VideoResponse,
    ProjectAnalysisResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new research project.

    Args:
        project_data: Project creation data (name, description)
        db: Database session

    Returns:
        Created project
    """
    try:
        # Create new project
        project = Project(
            name=project_data.name,
            description=project_data.description,
        )

        db.add(project)
        db.commit()
        db.refresh(project)

        logger.info(f"Created project: {project.id} - {project.name}")
        return project

    except Exception as e:
        logger.error(f"Error creating project: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create project: {str(e)}"
        )


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List all research projects.

    Args:
        skip: Number of projects to skip (for pagination)
        limit: Maximum number of projects to return
        db: Database session

    Returns:
        List of projects
    """
    try:
        projects = db.query(Project)\
            .order_by(Project.created_at.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()

        logger.info(f"Retrieved {len(projects)} projects")
        return projects

    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list projects: {str(e)}"
        )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get a specific project by ID.

    Args:
        project_id: Project UUID
        db: Database session

    Returns:
        Project details
    """
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

        logger.info(f"Retrieved project: {project_id}")
        return project

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project: {str(e)}"
        )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_data: ProjectUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a project.

    Args:
        project_id: Project UUID
        project_data: Update data
        db: Database session

    Returns:
        Updated project
    """
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

        # Update fields if provided
        if project_data.name is not None:
            project.name = project_data.name
        if project_data.description is not None:
            project.description = project_data.description
        if project_data.status is not None:
            project.status = project_data.status

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
            detail=f"Failed to update project: {str(e)}"
        )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Delete a project and all associated data.

    Args:
        project_id: Project UUID
        db: Database session

    Returns:
        No content
    """
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

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
            detail=f"Failed to delete project: {str(e)}"
        )


@router.get("/{project_id}/videos", response_model=List[VideoResponse])
async def list_project_videos(
    project_id: UUID,
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
    try:
        # Check if project exists
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

        # Get all videos for this project
        videos = db.query(Video)\
            .filter(Video.project_id == project_id)\
            .order_by(Video.uploaded_at.desc())\
            .all()

        logger.info(f"Retrieved {len(videos)} videos for project {project_id}")
        return videos

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing project videos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list project videos: {str(e)}"
        )


@router.post("/{project_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
async def trigger_project_analysis(
    project_id: UUID,
    db: Session = Depends(get_db)
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
    try:
        # Check if project exists
        project = db.query(Project).filter(Project.id == project_id).first()
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

        # Create or get existing project analysis
        project_analysis = db.query(ProjectAnalysis)\
            .filter(ProjectAnalysis.project_id == project_id)\
            .first()

        if not project_analysis:
            project_analysis = ProjectAnalysis(
                project_id=project_id,
                video_ids=video_ids,
                status="pending"
            )
            db.add(project_analysis)
            db.commit()
            db.refresh(project_analysis)

        # Trigger Celery task
        from app.tasks.analysis_tasks import analyze_project_task
        task = analyze_project_task.delay(str(project_id))

        logger.info(f"Project analysis task started for project {project_id}, task_id: {task.id}")
        return {
            "message": "Project analysis task started",
            "project_id": str(project_id),
            "analysis_id": str(project_analysis.id),
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
            detail=f"Failed to trigger project analysis: {str(e)}"
        )


@router.get("/{project_id}/analysis", response_model=ProjectAnalysisResponse)
async def get_project_analysis(
    project_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get cross-video analysis results for a project.

    Args:
        project_id: Project UUID
        db: Database session

    Returns:
        Project analysis results
    """
    try:
        # Check if project exists
        project = db.query(Project).filter(Project.id == project_id).first()
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No analysis found for project {project_id}"
            )

        logger.info(f"Retrieved project analysis for project {project_id}")
        return project_analysis

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project analysis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project analysis: {str(e)}"
        )
