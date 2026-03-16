"""BYOK key resolution for analysis pipelines.

Shared by both analysis_tasks.py and analysis_steps.py so there is
a single source of truth for the decryption + re-validation logic.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.database_models import User
from app.services.encryption_service import encryption_service
from app.services.openrouter_validation import validate_openrouter_key_sync

logger = logging.getLogger(__name__)

_REVALIDATION_HOURS = 24


def resolve_byok(db: Session, user_id: str | None) -> tuple[str | None, str | None]:
    """Look up and decrypt a user's BYOK API key and preferred model.

    Returns (api_key, model) -- both None when no BYOK is configured.
    Raises Exception if a BYOK key exists but cannot be decrypted or
    fails re-validation, so we never silently fall back to the Methodex key.
    """
    if not user_id:
        return None, None
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None, None

    if not user.encrypted_api_key:
        return None, user.preferred_model

    api_key = encryption_service.decrypt(user.encrypted_api_key)
    if not api_key:
        # Corrupted ciphertext -- clear the key and error out
        user.encrypted_api_key = None
        user.key_hint = None
        user.key_validated_at = None
        db.commit()
        raise Exception(
            "Your stored API key could not be decrypted (encryption key may have been rotated). "
            "Please re-enter your OpenRouter API key in Settings."
        )

    # Re-validate if key_validated_at is stale (>24h)
    if user.key_validated_at:
        age = datetime.now(timezone.utc) - user.key_validated_at
        if age.total_seconds() > _REVALIDATION_HOURS * 3600:
            if not validate_openrouter_key_sync(api_key):
                raise Exception(
                    "Your OpenRouter API key failed re-validation. "
                    "Please check that your account has credits."
                )
            user.key_validated_at = datetime.now(timezone.utc)
            db.commit()
    else:
        # Never validated -- validate now
        if not validate_openrouter_key_sync(api_key):
            raise Exception(
                "Your OpenRouter API key is invalid or has no credits. "
                "Please check your key in Settings."
            )
        user.key_validated_at = datetime.now(timezone.utc)
        db.commit()

    logger.info(f"Using BYOK API key for user {user_id}")
    return api_key, user.preferred_model
