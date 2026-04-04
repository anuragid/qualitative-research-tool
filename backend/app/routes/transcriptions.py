"""Transcription and speaker labeling API routes."""

import logging
from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth_bridge import Permission, require_permissions
from app.database import get_db
from app.models.database_models import Project, SpeakerLabel, Transcript, Video
from app.models.schemas import SpeakerLabelCreate, SpeakerLabelResponse, SpeakerLabelUpdate, TranscriptResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_transcript_with_ownership(
    transcript_id: UUID,
    current_user_id: str,
    db: Session,
) -> Transcript:
    """
    Fetch a transcript and verify ownership through Video -> Project relationship.

    Raises HTTPException 404 if the transcript doesn't exist or the user doesn't own it.
    """
    transcript = (
        db.query(Transcript)
        .join(Video, Transcript.video_id == Video.id)
        .join(Project, Video.project_id == Project.id)
        .filter(Transcript.id == transcript_id, Project.user_id == current_user_id)
        .first()
    )
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transcript {transcript_id} not found",
        )
    return transcript


@router.get("/{transcript_id}", response_model=TranscriptResponse)
async def get_transcript(
    transcript_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db)
):
    """
    Get a specific transcript by ID (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        transcript = _get_transcript_with_ownership(transcript_id, current_user_id, db)
        logger.info(f"Retrieved transcript: {transcript_id}")
        return transcript

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting transcript: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get transcript"
        )


@router.get("/{transcript_id}/speakers", response_model=List[SpeakerLabelResponse])
async def get_speaker_labels(
    transcript_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.ANALYSIS_READ)),
    db: Session = Depends(get_db)
):
    """
    Get all speaker labels for a transcript (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        _get_transcript_with_ownership(transcript_id, current_user_id, db)

        # Get all speaker labels
        speaker_labels = db.query(SpeakerLabel)\
            .filter(SpeakerLabel.transcript_id == transcript_id)\
            .order_by(SpeakerLabel.speaker_label)\
            .all()

        logger.info(f"Retrieved {len(speaker_labels)} speaker labels for transcript {transcript_id}")
        return speaker_labels

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting speaker labels: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get speaker labels"
        )


@router.post("/{transcript_id}/speakers", response_model=List[SpeakerLabelResponse], status_code=status.HTTP_201_CREATED)
async def save_speaker_labels(
    transcript_id: UUID,
    speaker_labels: List[SpeakerLabelCreate],
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_UPDATE)),
    db: Session = Depends(get_db)
):
    """
    Save or update speaker labels for a transcript (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        transcript = _get_transcript_with_ownership(transcript_id, current_user_id, db)

        # Check if transcript is completed
        if transcript.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot assign speaker labels to incomplete transcript"
            )

        # Validate that speaker_labels reference actual speakers in the transcript
        if transcript.raw_transcript:
            valid_speakers = set()
            for utterance in transcript.raw_transcript.get("utterances", []):
                valid_speakers.add(utterance.get("speaker", ""))
            for label_data in speaker_labels:
                if valid_speakers and label_data.speaker_label not in valid_speakers:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Speaker '{label_data.speaker_label}' not found in transcript"
                    )

        # Enforce speaker label limit (reasonable max: 20 speakers per transcript)
        if len(speaker_labels) > 20:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum of 20 speaker labels per transcript"
            )

        # Bulk-fetch all existing speaker labels for this transcript (single query)
        existing_labels_list = db.query(SpeakerLabel).filter(
            SpeakerLabel.transcript_id == transcript_id
        ).all()
        existing_labels_map = {
            label.speaker_label: label for label in existing_labels_list
        }

        new_labels = [
            label for label in speaker_labels
            if label.speaker_label not in existing_labels_map
        ]
        if len(existing_labels_list) + len(new_labels) > 20:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum of 20 speaker labels per transcript"
            )

        saved_labels = []

        for label_data in speaker_labels:
            existing_label = existing_labels_map.get(label_data.speaker_label)

            if existing_label:
                # Update existing label
                if label_data.assigned_name is not None:
                    existing_label.assigned_name = label_data.assigned_name
                if label_data.role is not None:
                    existing_label.role = label_data.role
                saved_labels.append(existing_label)
            else:
                # Create new label
                new_label = SpeakerLabel(
                    transcript_id=transcript_id,
                    speaker_label=label_data.speaker_label,
                    assigned_name=label_data.assigned_name,
                    role=label_data.role
                )
                db.add(new_label)
                saved_labels.append(new_label)

        db.commit()

        # Refresh all labels to get updated data
        for label in saved_labels:
            db.refresh(label)

        logger.info(f"Saved {len(saved_labels)} speaker labels for transcript {transcript_id}")
        return saved_labels

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving speaker labels: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save speaker labels"
        )


@router.patch("/{transcript_id}/speakers/{speaker_label_id}", response_model=SpeakerLabelResponse)
async def update_speaker_label(
    transcript_id: UUID,
    speaker_label_id: UUID,
    update_data: SpeakerLabelUpdate,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_UPDATE)),
    db: Session = Depends(get_db)
):
    """
    Update a specific speaker label (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        _get_transcript_with_ownership(transcript_id, current_user_id, db)

        # Get speaker label
        speaker_label = db.query(SpeakerLabel).filter(
            SpeakerLabel.id == speaker_label_id,
            SpeakerLabel.transcript_id == transcript_id
        ).first()

        if not speaker_label:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Speaker label {speaker_label_id} not found"
            )

        # Update fields if provided
        if update_data.assigned_name is not None:
            speaker_label.assigned_name = update_data.assigned_name
        if update_data.role is not None:
            speaker_label.role = update_data.role

        db.commit()
        db.refresh(speaker_label)

        logger.info(f"Updated speaker label: {speaker_label_id}")
        return speaker_label

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating speaker label: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update speaker label"
        )


@router.delete("/{transcript_id}/speakers/{speaker_label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_speaker_label(
    transcript_id: UUID,
    speaker_label_id: UUID,
    current_user: Dict[str, Any] = Depends(require_permissions(Permission.PROJECT_UPDATE)),
    db: Session = Depends(get_db)
):
    """
    Delete a speaker label (must be owned by the current user).
    """
    current_user_id = current_user["id"]
    try:
        _get_transcript_with_ownership(transcript_id, current_user_id, db)

        # Get speaker label
        speaker_label = db.query(SpeakerLabel).filter(
            SpeakerLabel.id == speaker_label_id,
            SpeakerLabel.transcript_id == transcript_id
        ).first()

        if not speaker_label:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Speaker label {speaker_label_id} not found"
            )

        db.delete(speaker_label)
        db.commit()

        logger.info(f"Deleted speaker label: {speaker_label_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting speaker label: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete speaker label"
        )
