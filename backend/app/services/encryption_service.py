"""Encryption service for BYOK API keys using Fernet symmetric encryption."""

import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


class EncryptionService:
    def __init__(self):
        key = os.getenv("ENCRYPTION_KEY")
        if not key:
            app_env = os.getenv("APP_ENV", "development")
            if app_env != "development":
                raise RuntimeError(
                    "ENCRYPTION_KEY must be set in production. "
                    "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
                )
            logger.warning("ENCRYPTION_KEY not set - generating ephemeral key. BYOK keys will not survive restarts!")
            key = Fernet.generate_key().decode()
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str | None:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            logger.error("Failed to decrypt API key - key may have been rotated")
            return None


encryption_service = EncryptionService()
