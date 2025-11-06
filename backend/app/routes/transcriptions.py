"""Transcription and speaker labeling API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import logging

from app.database import get_db
from app.models.database_models import Transcript, SpeakerLabel, Video
from app.models.schemas import (
    TranscriptResponse,
    SpeakerLabelCreate,
    SpeakerLabelUpdate,
    SpeakerLabelResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{transcript_id}", response_model=TranscriptResponse)
async def get_transcript(
    transcript_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get a specific transcript by ID.

    Args:
        transcript_id: Transcript UUID
        db: Database session

    Returns:
        Transcript details including raw and processed transcript data
    """
    try:
        transcript = db.query(Transcript).filter(Transcript.id == transcript_id).first()

        if not transcript:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transcript {transcript_id} not found"
            )

        logger.info(f"Retrieved transcript: {transcript_id}")
        return transcript

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting transcript: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get transcript: {str(e)}"
        )


@router.get("/{transcript_id}/speakers", response_model=List[SpeakerLabelResponse])
async def get_speaker_labels(
    transcript_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get all speaker labels for a transcript.

    Args:
        transcript_id: Transcript UUID
        db: Database session

    Returns:
        List of speaker labels
    """
    try:
        # Check if transcript exists
        transcript = db.query(Transcript).filter(Transcript.id == transcript_id).first()
        if not transcript:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transcript {transcript_id} not found"
            )

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
            detail=f"Failed to get speaker labels: {str(e)}"
        )


@router.post("/{transcript_id}/speakers", response_model=List[SpeakerLabelResponse], status_code=status.HTTP_201_CREATED)
async def save_speaker_labels(
    transcript_id: UUID,
    speaker_labels: List[SpeakerLabelCreate],
    db: Session = Depends(get_db)
):
    """
    Save or update speaker labels for a transcript.

    This allows users to assign human-readable names and roles to speakers
    identified by AssemblyAI (e.g., "Speaker A" -> "John Doe", role: "Interviewer").

    Args:
        transcript_id: Transcript UUID
        speaker_labels: List of speaker label assignments
        db: Database session

    Returns:
        List of saved speaker labels
    """
    try:
        # Check if transcript exists
        transcript = db.query(Transcript).filter(Transcript.id == transcript_id).first()
        if not transcript:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transcript {transcript_id} not found"
            )

        # Check if transcript is completed
        if transcript.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot assign speaker labels to incomplete transcript"
            )

        saved_labels = []

        for label_data in speaker_labels:
            # Check if speaker label already exists
            existing_label = db.query(SpeakerLabel).filter(
                SpeakerLabel.transcript_id == transcript_id,
                SpeakerLabel.speaker_label == label_data.speaker_label
            ).first()

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
            detail=f"Failed to save speaker labels: {str(e)}"
        )


@router.patch("/{transcript_id}/speakers/{speaker_label_id}", response_model=SpeakerLabelResponse)
async def update_speaker_label(
    transcript_id: UUID,
    speaker_label_id: UUID,
    update_data: SpeakerLabelUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a specific speaker label.

    Args:
        transcript_id: Transcript UUID
        speaker_label_id: Speaker label UUID
        update_data: Updated speaker label data
        db: Database session

    Returns:
        Updated speaker label
    """
    try:
        # Check if transcript exists
        transcript = db.query(Transcript).filter(Transcript.id == transcript_id).first()
        if not transcript:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Transcript {transcript_id} not found"
            )

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
            detail=f"Failed to update speaker label: {str(e)}"
        )


@router.delete("/{transcript_id}/speakers/{speaker_label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_speaker_label(
    transcript_id: UUID,
    speaker_label_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Delete a speaker label.

    Args:
        transcript_id: Transcript UUID
        speaker_label_id: Speaker label UUID
        db: Database session

    Returns:
        No content
    """
    try:
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
            detail=f"Failed to delete speaker label: {str(e)}"
        )
