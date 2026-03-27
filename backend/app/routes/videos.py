"""Video management and analysis API routes."""

import asyncio
import logging
import re
import uuid as uuid_module
from pathlib import Path
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth_bridge import Permission, require_permissions, require_permissions_upload
from app.config import settings
from app.database import get_db
from app.models.database_models import Project, Transcript, Video, VideoAnalysis
from app.models.schemas import TranscriptResponse, VideoAnalysisResponse, VideoResponse, VideoUploadResponse
from app.services.s3_service import s3_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_video_with_ownership(
    video_id: UUID,
    current_user_id: str,
    db: Session,
) -> Video:
    """
    Fetch a video and verify ownership through the project relationship.

    Raises HTTPException 404 if the video doesn't exist or the user doesn't own it.
    """
    video = (
        db.query(Video)
        .join(Project, Video.project_id == Project.id)
        .filter(Video.id == video_id, Project.user_id == current_user_id)
        .first()
    )
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video {video_id} not found",
        )
    return video


# --- Pydantic models for presigned upload flow ---

class UploadUrlRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=512)
    file_size: int = Field(..., gt=0)
    content_type: str = Field(..., min_length=1, max_length=100)


class UploadUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    video_id: str


# --- Presigned direct-upload endpoints ---
# NOTE: Browser direct uploads to R2 require CORS to be configured on the R2
# bucket (via the Cloudflare dashboard or API). The required CORS rule should
# allow PUT from the frontend origin with the Content-Type header.


@router.post("/{project_id}/upload-url", response_model=UploadUrlResponse, status_code=status.HTTP_200_OK)
async def get_upload_url(
    project_id: UUID,
    request_body: UploadUrlRequest,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.VIDEO_UPLOAD)),
    db: Session = Depends(get_db),
):
    """Generate a presigned URL for direct browser-to-R2 upload."""
    current_user_id = current_user["id"]

    # Validate project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project {project_id} not found")

    # Enforce video quota
    video_count = db.query(Video).filter(Video.project_id == project_id).count()
    if video_count >= 20:
        raise HTTPException(status_code=429, detail="Maximum of 20 videos per project")

    # Validate file extension
    file_extension = Path(request_body.filename).suffix.lower()
    allowed_extensions = settings.ALLOWED_VIDEO_EXTENSIONS + settings.ALLOWED_AUDIO_EXTENSIONS
    if file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}")

    # Validate content type
    _ALLOWED_CONTENT_TYPES = {
        "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
        "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/flac", "audio/aac",
    }
    if request_body.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid content type: {request_body.content_type}")

    # Validate file size
    if request_body.file_size <= 0:
        raise HTTPException(status_code=400, detail="File size must be positive")
    if request_body.file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum: {settings.MAX_FILE_SIZE_MB}MB")

    # Sanitize filename
    safe_filename = Path(request_body.filename).name
    safe_filename = re.sub(r'[^\w\-.]', '_', safe_filename)
    if len(safe_filename) > 255:
        ext = Path(safe_filename).suffix
        safe_filename = safe_filename[:255 - len(ext)] + ext

    # Generate S3 key
    s3_key = f"videos/{project_id}/{uuid_module.uuid4()}/{safe_filename}"

    # Generate presigned URL BEFORE creating the DB record.
    # If URL generation fails, we avoid leaving an orphaned "uploading" record.
    try:
        upload_url = await asyncio.to_thread(
            s3_service.generate_upload_url,
            s3_key=s3_key,
            content_type=request_body.content_type,
        )
    except Exception as e:
        logger.error(f"Failed to generate upload URL for project {project_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate upload URL",
        )

    # Create video record in "uploading" state
    video = Video(
        project_id=project_id,
        filename=safe_filename,
        s3_key=s3_key,
        s3_url=f"https://{settings.R2_BUCKET_NAME}.r2.cloudflarestorage.com/{s3_key}",
        file_size_bytes=request_body.file_size,
        status="uploading",
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    logger.info(f"Generated upload URL for video {video.id} in project {project_id}")
    return UploadUrlResponse(upload_url=upload_url, s3_key=s3_key, video_id=str(video.id))


@router.post("/{video_id}/confirm-upload", response_model=VideoResponse, status_code=status.HTTP_200_OK)
async def confirm_upload(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.VIDEO_UPLOAD)),
    db: Session = Depends(get_db),
):
    """Confirm that a direct upload to R2 completed successfully."""
    current_user_id = current_user["id"]
    video = _get_video_with_ownership(video_id, current_user_id, db)

    if video.status != "uploading":
        raise HTTPException(status_code=400, detail="Video is not in uploading state")

    # Verify the object actually exists in R2 and is not empty
    try:
        head_result = await asyncio.to_thread(s3_service.head_object, video.s3_key)
        content_length = head_result.get("ContentLength", 0)
        if content_length == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes). Please re-upload.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="File not found in storage. Upload may not have completed.")

    video.status = "uploaded"
    db.commit()
    db.refresh(video)

    logger.info(f"Upload confirmed for video {video.id}")
    return video


@router.post("/{project_id}/upload", response_model=VideoUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    project_id: UUID,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_permissions_upload(Permission.VIDEO_UPLOAD)),
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

        # Enforce per-project video quota
        video_count = db.query(Video).filter(Video.project_id == project_id).count()
        if video_count >= 20:
            raise HTTPException(status_code=429, detail="Maximum of 20 videos per project")

        # Validate file extension (video or audio)
        file_extension = Path(file.filename).suffix.lower()
        allowed_extensions = settings.ALLOWED_VIDEO_EXTENSIONS + settings.ALLOWED_AUDIO_EXTENSIONS
        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type. Allowed types: {', '.join(allowed_extensions)}"
            )

        # Validate MIME content type matches extension
        _ALLOWED_CONTENT_TYPES = {
            # Video
            "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
            # Audio
            "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/flac", "audio/aac",
        }
        if file.content_type and file.content_type not in _ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid content type: {file.content_type}"
            )

        # Reject zero-byte files
        if file.size is not None and file.size == 0:
            raise HTTPException(status_code=400, detail="Empty files are not allowed")

        # Validate file size (check content length if available)
        if file.size is not None and file.size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB"
            )

        # Validate file content by magic bytes
        header = await file.read(12)
        await file.seek(0)  # Reset file position
        if len(header) < 2:
            raise HTTPException(status_code=400, detail="File too small to be a valid media file")

        # Check for known video/audio file signatures
        is_valid_magic = False
        # Video: MP4/MOV/M4A (ftyp box)
        if len(header) >= 8 and header[4:8] == b'ftyp':
            is_valid_magic = True
        # Video: WebM/MKV (EBML)
        elif header[:4] == b'\x1a\x45\xdf\xa3':
            is_valid_magic = True
        # Video: AVI / Audio: WAV (both RIFF-based)
        elif header[:4] == b'RIFF':
            is_valid_magic = True
        # Audio: MP3 with ID3v2 tag
        elif header[:3] == b'ID3':
            is_valid_magic = True
        # Audio: MP3 frame sync / AAC ADTS (0xFFE0+)
        elif len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:
            is_valid_magic = True
        # Audio: OGG Vorbis/Opus
        elif header[:4] == b'OggS':
            is_valid_magic = True
        # Audio: FLAC
        elif header[:4] == b'fLaC':
            is_valid_magic = True
        if not is_valid_magic:
            raise HTTPException(status_code=400, detail="File does not appear to be a valid media file")

        # Get file size
        file_size = file.size if file.size else 0

        # Sanitize filename - strip path components to prevent path traversal
        safe_filename = Path(file.filename).name
        safe_filename = re.sub(r'[^\w\-.]', '_', safe_filename)
        if len(safe_filename) > 255:
            ext = Path(safe_filename).suffix
            safe_filename = safe_filename[:255 - len(ext)] + ext

        # Upload to S3 (offloaded to thread to avoid blocking the event loop)
        logger.info(f"Uploading video for project {project_id}")
        s3_key, s3_url = await asyncio.to_thread(
            s3_service.upload_video,
            file=file.file,
            filename=safe_filename,
            project_id=str(project_id),
        )

        # Create video record in database
        video = Video(
            project_id=project_id,
            filename=safe_filename,
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
            detail="Failed to upload video"
        )


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_READ)),
    db: Session = Depends(get_db)
):
    """
    Get a specific video by ID (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)
        logger.info(f"Retrieved video: {video_id}")
        return video

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting video: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get video"
        )


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.VIDEO_DELETE)),
    db: Session = Depends(get_db)
):
    """
    Delete a video and its S3 file (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Block delete during processing
        if video.status in ("transcribing", "analyzing"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete video while it is being processed",
            )

        # Delete from S3 - fail hard on error (offloaded to thread)
        try:
            await asyncio.to_thread(s3_service.delete_video, video.s3_key)
        except Exception as e:
            logger.error(f"Failed to delete S3 object for video {video_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete video file from storage",
            )

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
            detail="Failed to delete video"
        )


@router.get("/{video_id}/playback-url")
async def get_video_playback_url(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_READ)),
    db: Session = Depends(get_db)
):
    """
    Generate a fresh presigned URL for video playback (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Generate fresh presigned URL (valid for 1 hour, offloaded to thread)
        playback_url = await asyncio.to_thread(
            s3_service.get_presigned_url,
            s3_key=video.s3_key,
            expiration=3600,
        )

        logger.info(f"Generated playback URL for video {video_id}")
        return {"playback_url": playback_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating playback URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate playback URL"
        )


@router.get("/{video_id}/transcript", response_model=TranscriptResponse)
async def get_video_transcript(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db)
):
    """
    Get the transcript for a specific video (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        _get_video_with_ownership(video_id, current_user_id, db)

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
            detail="Failed to get transcript"
        )


@router.post("/{video_id}/transcribe", status_code=status.HTTP_202_ACCEPTED)
async def start_transcription(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db)
):
    """
    Start transcription process for a video (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Race condition: reject if already transcribing
        if video.status in ("transcribing",):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Transcription is already in progress",
            )

        # Enforce concurrent task limit
        active_tasks = db.query(Video).join(Project).filter(
            Project.user_id == current_user_id,
            Video.status.in_(["transcribing", "analyzing"])
        ).count()
        if active_tasks >= 3:
            raise HTTPException(status_code=429, detail="Maximum of 3 concurrent tasks per user")

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

        # Update video status (clear previous error if retrying)
        video.status = "transcribing"
        video.error_message = None
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
            detail="Failed to start transcription"
        )


@router.post("/{video_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
async def trigger_video_analysis(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db)
):
    """
    Trigger the 5-step analysis process for a video (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Race condition: reject if already analyzing
        if video.status in ("analyzing",):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis is already in progress",
            )

        # Enforce concurrent task limit
        active_tasks = db.query(Video).join(Project).filter(
            Project.user_id == current_user_id,
            Video.status.in_(["transcribing", "analyzing"])
        ).count()
        if active_tasks >= 3:
            raise HTTPException(status_code=429, detail="Maximum of 3 concurrent tasks per user")

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
            video_analysis.status = "pending"

        # Update video status (clear previous error if retrying)
        video.status = "analyzing"
        video.error_message = None
        db.commit()
        db.refresh(video_analysis)

        # Trigger Celery task (pass user_id so BYOK key can be looked up)
        from app.tasks.analysis_tasks import analyze_video_task
        task = analyze_video_task.delay(str(video_id), current_user_id)

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
            detail="Failed to trigger video analysis"
        )


@router.get("/{video_id}/analysis/status")
async def get_video_analysis_status(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db),
):
    """Lightweight status check for polling (returns ~200 bytes instead of 50+ KB)."""
    current_user_id = current_user["id"]
    _get_video_with_ownership(video_id, current_user_id, db)

    video_analysis = db.query(VideoAnalysis)\
        .filter(VideoAnalysis.video_id == video_id)\
        .first()

    if not video_analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No analysis found for video {video_id}",
        )

    return {
        "status": video_analysis.status,
        "current_step": video_analysis.current_step,
        "step_status": video_analysis.step_status,
        "started_at": video_analysis.started_at,
        "completed_at": video_analysis.completed_at,
    }


@router.get("/{video_id}/analysis", response_model=VideoAnalysisResponse)
async def get_video_analysis(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db)
):
    """
    Get analysis results for a video (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        _get_video_with_ownership(video_id, current_user_id, db)

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
            detail="Failed to get video analysis"
        )


@router.get("/{video_id}/transcript/words")
async def get_word_level_transcript(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db)
):
    """
    Returns word-level transcript with speaker names mapped (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        _get_video_with_ownership(video_id, current_user_id, db)

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
            detail="Failed to get word-level transcript"
        )


@router.get("/{video_id}/transcript/search")
async def search_transcript_words(
    video_id: UUID,
    query: str = Query(..., min_length=1, max_length=500),
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db)
):
    """
    Search for specific words using AssemblyAI Word Search API (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        import httpx

        # Validate query parameter
        if not query or not query.strip():
            raise HTTPException(status_code=400, detail="Search query cannot be empty")
        if len(query) > 500:
            raise HTTPException(status_code=400, detail="Search query too long (max 500 characters)")

        _get_video_with_ownership(video_id, current_user_id, db)

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
            logger.error(f"AssemblyAI Word Search API error (HTTP {response.status_code}): {response.text[:200]}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to search transcript"
            )

        result = response.json()
        logger.info(f"Word search completed for video {video_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching transcript: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to search transcript"
        )


# Step-by-step analysis endpoints
@router.post("/{video_id}/analyze/chunk", status_code=status.HTTP_202_ACCEPTED)
async def trigger_chunk_step(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db)
):
    """
    Trigger CHUNK step (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Block if already analyzing
        if video.status in ("analyzing",):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis is already in progress",
            )

        transcript = db.query(Transcript).filter(Transcript.video_id == video_id).first()
        if not transcript or transcript.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Video must have a completed transcript"
            )

        # Set video status to "analyzing" before dispatching task to prevent
        # concurrent requests from passing the status check
        video.status = "analyzing"
        video.error_message = None
        db.commit()

        from app.tasks.analysis_steps import analyze_chunk_step
        task = analyze_chunk_step.delay(str(video_id), current_user_id)
        logger.info(f"CHUNK step started for video {video_id}, task_id: {task.id}")

        return {
            "task_id": task.id,
            "video_id": str(video_id),
            "step": "chunk",
            "status": "started"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting CHUNK step: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start CHUNK step"
        )


@router.post("/{video_id}/analyze/infer", status_code=status.HTTP_202_ACCEPTED)
async def trigger_infer_step(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db)
):
    """
    Trigger INFER step (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Block if already analyzing
        if video.status in ("analyzing",):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis is already in progress",
            )

        analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
        if not analysis or not analysis.chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CHUNK step must be completed first"
            )

        video.status = "analyzing"
        video.error_message = None
        db.commit()

        from app.tasks.analysis_steps import analyze_infer_step
        task = analyze_infer_step.delay(str(video_id), current_user_id)
        logger.info(f"INFER step started for video {video_id}, task_id: {task.id}")

        return {
            "task_id": task.id,
            "video_id": str(video_id),
            "step": "infer",
            "status": "started"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting INFER step: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start INFER step"
        )


@router.post("/{video_id}/analyze/relate", status_code=status.HTTP_202_ACCEPTED)
async def trigger_relate_step(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db)
):
    """
    Trigger RELATE step (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Block if already analyzing
        if video.status in ("analyzing",):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis is already in progress",
            )

        analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
        if not analysis or not analysis.inferences:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="INFER step must be completed first"
            )

        video.status = "analyzing"
        video.error_message = None
        db.commit()

        from app.tasks.analysis_steps import analyze_relate_step
        task = analyze_relate_step.delay(str(video_id), current_user_id)
        logger.info(f"RELATE step started for video {video_id}, task_id: {task.id}")

        return {
            "task_id": task.id,
            "video_id": str(video_id),
            "step": "relate",
            "status": "started"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting RELATE step: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start RELATE step"
        )


@router.post("/{video_id}/analyze/explain", status_code=status.HTTP_202_ACCEPTED)
async def trigger_explain_step(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db)
):
    """
    Trigger EXPLAIN step (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Block if already analyzing
        if video.status in ("analyzing",):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis is already in progress",
            )

        analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
        if not analysis or not analysis.patterns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="RELATE step must be completed first"
            )

        video.status = "analyzing"
        video.error_message = None
        db.commit()

        from app.tasks.analysis_steps import analyze_explain_step
        task = analyze_explain_step.delay(str(video_id), current_user_id)
        logger.info(f"EXPLAIN step started for video {video_id}, task_id: {task.id}")

        return {
            "task_id": task.id,
            "video_id": str(video_id),
            "step": "explain",
            "status": "started"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting EXPLAIN step: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start EXPLAIN step"
        )


@router.post("/{video_id}/analyze/activate", status_code=status.HTTP_202_ACCEPTED)
async def trigger_activate_step(
    video_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_RUN)),
    db: Session = Depends(get_db)
):
    """
    Trigger ACTIVATE step (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        video = _get_video_with_ownership(video_id, current_user_id, db)

        # Block if already analyzing
        if video.status in ("analyzing",):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis is already in progress",
            )

        analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
        if not analysis or not analysis.insights:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="EXPLAIN step must be completed first"
            )

        video.status = "analyzing"
        video.error_message = None
        db.commit()

        from app.tasks.analysis_steps import analyze_activate_step
        task = analyze_activate_step.delay(str(video_id), current_user_id)
        logger.info(f"ACTIVATE step started for video {video_id}, task_id: {task.id}")

        return {
            "task_id": task.id,
            "video_id": str(video_id),
            "step": "activate",
            "status": "started"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting ACTIVATE step: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start ACTIVATE step"
        )
