"""Video management and analysis API routes."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from pathlib import Path
import logging

from app.database import get_db
from app.models.database_models import Project, Video, Transcript, VideoAnalysis
from app.models.schemas import VideoUploadResponse, VideoResponse, VideoAnalysisResponse, TranscriptResponse
from app.services.s3_service import s3_service
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{project_id}/upload", response_model=VideoUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    project_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a video file to S3 and create a video record.

    Args:
        project_id: Project UUID to associate video with
        file: Video file to upload
        db: Database session

    Returns:
        Created video record with S3 details
    """
    try:
        # Check if project exists
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )

        # Validate file extension
        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in settings.ALLOWED_VIDEO_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type. Allowed types: {', '.join(settings.ALLOWED_VIDEO_EXTENSIONS)}"
            )

        # Validate file size (check content length if available)
        if file.size and file.size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB"
            )

        # Get file size
        file_size = file.size if file.size else 0

        # Upload to S3
        logger.info(f"Uploading video: {file.filename} for project {project_id}")
        s3_key, s3_url = s3_service.upload_video(
            file=file.file,
            filename=file.filename,
            project_id=str(project_id)
        )

        # Create video record in database
        video = Video(
            project_id=project_id,
            filename=file.filename,
            s3_key=s3_key,
            s3_url=s3_url,
            file_size_bytes=file_size,
            status="uploaded"
        )

        db.add(video)
        db.commit()
        db.refresh(video)

        logger.info(f"Video uploaded successfully: {video.id}")
        return video

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading video: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload video: {str(e)}"
        )


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get a specific video by ID.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        Video details
    """
    try:
        video = db.query(Video).filter(Video.id == video_id).first()

        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        logger.info(f"Retrieved video: {video_id}")
        return video

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting video: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get video: {str(e)}"
        )


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Delete a video and its S3 file.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        No content
    """
    try:
        video = db.query(Video).filter(Video.id == video_id).first()

        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        # Delete from S3
        try:
            s3_service.delete_video(video.s3_key)
        except Exception as e:
            logger.warning(f"Failed to delete S3 object: {e}")
            # Continue with database deletion even if S3 deletion fails

        # Delete from database (cascade will handle related records)
        db.delete(video)
        db.commit()

        logger.info(f"Deleted video: {video_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting video: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete video: {str(e)}"
        )


@router.get("/{video_id}/playback-url")
async def get_video_playback_url(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Generate a fresh presigned URL for video playback.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        Presigned URL for video playback
    """
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        # Generate fresh presigned URL (valid for 1 hour)
        playback_url = s3_service.get_presigned_url(
            s3_key=video.s3_key,
            expiration=3600
        )

        logger.info(f"Generated playback URL for video {video_id}")
        return {"playback_url": playback_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating playback URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate playback URL: {str(e)}"
        )


@router.get("/{video_id}/transcript", response_model=TranscriptResponse)
async def get_video_transcript(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get the transcript for a specific video.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        Transcript details
    """
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        transcript = db.query(Transcript)\
            .filter(Transcript.video_id == video_id)\
            .first()

        if not transcript:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No transcript found for video {video_id}"
            )

        logger.info(f"Retrieved transcript for video {video_id}")
        return transcript

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting transcript: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get transcript: {str(e)}"
        )


@router.post("/{video_id}/transcribe", status_code=status.HTTP_202_ACCEPTED)
async def start_transcription(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Start transcription process for a video using AssemblyAI.

    This endpoint will be fully implemented in Phase 5 with Celery tasks.
    For now, it creates a transcript record and returns a placeholder.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        Task information
    """
    try:
        # Check if video exists
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        # Check if transcript already exists
        existing_transcript = db.query(Transcript)\
            .filter(Transcript.video_id == video_id)\
            .first()

        if existing_transcript and existing_transcript.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Video already has a completed transcript"
            )

        # Create or update transcript record
        if not existing_transcript:
            transcript = Transcript(
                video_id=video_id,
                status="pending"
            )
            db.add(transcript)
        else:
            existing_transcript.status = "pending"

        # Update video status
        video.status = "transcribing"
        db.commit()

        # Trigger Celery task
        from app.tasks.transcription_tasks import transcribe_video_task
        task = transcribe_video_task.delay(str(video_id))

        logger.info(f"Transcription task started for video {video_id}, task_id: {task.id}")
        return {
            "message": "Transcription task started",
            "video_id": str(video_id),
            "task_id": task.id,
            "status": "processing"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting transcription: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start transcription: {str(e)}"
        )


@router.post("/{video_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
async def trigger_video_analysis(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Trigger the 5-step analysis process for a video.

    This endpoint will be fully implemented in Phase 5 with Celery tasks.
    For now, it creates an analysis record and returns a placeholder.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        Task information
    """
    try:
        # Check if video exists
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        # Check if transcript is completed
        transcript = db.query(Transcript)\
            .filter(Transcript.video_id == video_id)\
            .first()

        if not transcript or transcript.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Video must have a completed transcript before analysis"
            )

        # Create or get existing video analysis
        video_analysis = db.query(VideoAnalysis)\
            .filter(VideoAnalysis.video_id == video_id)\
            .first()

        if not video_analysis:
            video_analysis = VideoAnalysis(
                video_id=video_id,
                status="pending"
            )
            db.add(video_analysis)
        else:
            # Reset status to rerun analysis
            video_analysis.status = "pending"

        # Update video status
        video.status = "analyzing"
        db.commit()
        db.refresh(video_analysis)

        # Trigger Celery task
        from app.tasks.analysis_tasks import analyze_video_task
        task = analyze_video_task.delay(str(video_id))

        logger.info(f"Video analysis task started for video {video_id}, task_id: {task.id}")
        return {
            "message": "Video analysis task started",
            "video_id": str(video_id),
            "analysis_id": str(video_analysis.id),
            "task_id": task.id,
            "status": "processing"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering video analysis: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger video analysis: {str(e)}"
        )


@router.get("/{video_id}/analysis", response_model=VideoAnalysisResponse)
async def get_video_analysis(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get analysis results for a video.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        Video analysis results
    """
    try:
        # Check if video exists
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        # Get video analysis
        video_analysis = db.query(VideoAnalysis)\
            .filter(VideoAnalysis.video_id == video_id)\
            .first()

        if not video_analysis:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No analysis found for video {video_id}"
            )

        logger.info(f"Retrieved video analysis for video {video_id}")
        return video_analysis

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting video analysis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get video analysis: {str(e)}"
        )


@router.get("/{video_id}/transcript/words")
async def get_word_level_transcript(
    video_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Returns word-level transcript with speaker names mapped.

    This endpoint provides word-level timing data for video-transcript synchronization,
    with speaker labels mapped to their assigned names for display.

    Args:
        video_id: Video UUID
        db: Database session

    Returns:
        {
            "words": [
                {
                    "text": "Hello",
                    "start": 250,      # milliseconds
                    "end": 650,
                    "speaker": "John",  # Mapped from speaker_labels
                    "confidence": 0.95
                }
            ],
            "duration": 125000  # total video duration in ms
        }
    """
    try:
        # Get video and transcript
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        transcript = db.query(Transcript)\
            .filter(Transcript.video_id == video_id)\
            .first()

        if not transcript or not transcript.raw_transcript:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No transcript found for video {video_id}"
            )

        # Get speaker labels mapping
        from app.models.database_models import SpeakerLabel
        speaker_labels = db.query(SpeakerLabel)\
            .filter(SpeakerLabel.transcript_id == transcript.id)\
            .all()

        speaker_map = {}
        for label in speaker_labels:
            speaker_map[label.speaker_label] = label.assigned_name or label.speaker_label

        # Get words from raw_transcript JSONB field
        words = transcript.raw_transcript.get("words", [])

        # Map speaker labels to names
        words_with_names = []
        for word in words:
            speaker = word.get("speaker", "Unknown")
            words_with_names.append({
                "text": word.get("text", ""),
                "start": word.get("start", 0),
                "end": word.get("end", 0),
                "speaker": speaker_map.get(speaker, speaker),
                "confidence": word.get("confidence", 1.0)
            })

        # Get duration from raw_transcript
        duration = transcript.raw_transcript.get("audio_duration", 0)

        logger.info(f"Retrieved {len(words_with_names)} words for video {video_id}")
        return {
            "words": words_with_names,
            "duration": duration
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting word-level transcript: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get word-level transcript: {str(e)}"
        )


@router.get("/{video_id}/transcript/search")
async def search_transcript_words(
    video_id: UUID,
    query: str,
    db: Session = Depends(get_db)
):
    """
    Search for specific words using AssemblyAI Word Search API.

    This endpoint allows searching the transcript for specific words and returns
    timestamps where those words appear, enabling quick navigation to relevant sections.

    Example: /api/videos/{id}/transcript/search?query=design,prototype,user

    Args:
        video_id: Video UUID
        query: Comma-separated words to search for
        db: Database session

    Returns:
        {
            "total_count": 42,
            "matches": [
                {
                    "text": "design",
                    "count": 15,
                    "timestamps": [[1200, 1450], [5600, 5890], ...],
                    "indexes": [12, 89, 234, ...]
                }
            ]
        }
    """
    try:
        import httpx

        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Video {video_id} not found"
            )

        transcript = db.query(Transcript)\
            .filter(Transcript.video_id == video_id)\
            .first()

        if not transcript or not transcript.assemblyai_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No transcript found for video {video_id}"
            )

        # Call AssemblyAI Word Search API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.assemblyai.com/v2/transcript/{transcript.assemblyai_id}/word-search",
                params={"words": query},
                headers={"authorization": settings.ASSEMBLYAI_API_KEY}
            )

        if response.status_code != 200:
            logger.error(f"AssemblyAI Word Search API error: {response.text}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to search transcript"
            )

        result = response.json()
        logger.info(f"Word search completed for video {video_id}, query: {query}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching transcript: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search transcript: {str(e)}"
        )
