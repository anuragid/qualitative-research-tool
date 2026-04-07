"""Encryption service for BYOK API keys using MultiFernet symmetric encryption."""

import logging
import os

logger = logging.getLogger(__name__)


class EncryptionService:
    def __init__(self):
        from cryptography.fernet import Fernet, MultiFernet
        key_str = os.getenv("ENCRYPTION_KEY")
        if not key_str:
            app_env = os.getenv("APP_ENV", "development")
            if app_env != "development":
                raise RuntimeError(
                    "ENCRYPTION_KEY must be set in production. "
                    "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
                )
            logger.warning("ENCRYPTION_KEY not set - generating ephemeral key. BYOK keys will not survive restarts!")
            key_str = Fernet.generate_key().decode()

        # Support comma-separated keys for rotation (first = primary)
        keys = [k.strip() for k in key_str.split(",") if k.strip()]
        if not keys:
            raise RuntimeError("ENCRYPTION_KEY contains no valid keys")

        fernets = []
        for k in keys:
            fernets.append(Fernet(k.encode() if isinstance(k, str) else k))

        self._multi_fernet = MultiFernet(fernets)
        self._primary_fernet = fernets[0]
        logger.info(f"EncryptionService initialized with {len(fernets)} key(s)")

    def encrypt(self, plaintext: str) -> str:
        """Encrypt using the primary (first) key."""
        return self._multi_fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str | None:
        """Decrypt using any known key."""
        from cryptography.fernet import InvalidToken
        try:
            return self._multi_fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            logger.error("Failed to decrypt API key - key may have been rotated or is invalid")
            return None

    def rotate(self, ciphertext: str) -> str:
        """Re-encrypt ciphertext with the primary key.

        Useful when rotating keys: decrypt with old key, re-encrypt with new primary.
        Raises ValueError if decryption fails.
        """
        from cryptography.fernet import InvalidToken
        try:
            return self._multi_fernet.rotate(ciphertext.encode()).decode()
        except InvalidToken:
            logger.error("Failed to rotate - ciphertext cannot be decrypted with any known key")
            raise ValueError("Key rotation failed: ciphertext cannot be decrypted with any known key")


encryption_service = EncryptionService()
