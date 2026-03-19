"""Tests for MultiFernet encryption service.

Covers finding: P2-1
"""

import os
from unittest.mock import patch

from cryptography.fernet import Fernet


class TestEncryptionService:
    """Tests for the EncryptionService with key rotation support."""

    def _make_service(self, key_str: str):
        """Create a fresh EncryptionService with the given ENCRYPTION_KEY."""
        with patch.dict(os.environ, {"ENCRYPTION_KEY": key_str, "APP_ENV": "test"}):
            # Import inside to pick up patched env
            from app.services.encryption_service import EncryptionService
            return EncryptionService()

    def test_encrypt_decrypt_roundtrip(self):
        """Basic encrypt/decrypt should produce the original plaintext."""
        key = Fernet.generate_key().decode()
        service = self._make_service(key)
        ciphertext = service.encrypt("my-secret-key")
        plaintext = service.decrypt(ciphertext)
        assert plaintext == "my-secret-key"

    def test_encrypt_produces_different_ciphertext(self):
        """Two encryptions of the same plaintext should differ (Fernet uses random IV)."""
        key = Fernet.generate_key().decode()
        service = self._make_service(key)
        ct1 = service.encrypt("same-value")
        ct2 = service.encrypt("same-value")
        assert ct1 != ct2  # Different IVs

    def test_old_key_still_decrypts(self):
        """P2-1: After key rotation, old ciphertext should still decrypt."""
        old_key = Fernet.generate_key().decode()
        new_key = Fernet.generate_key().decode()

        # Encrypt with old key
        old_service = self._make_service(old_key)
        ciphertext = old_service.encrypt("my-secret")

        # Decrypt with new primary + old secondary
        new_service = self._make_service(f"{new_key},{old_key}")
        plaintext = new_service.decrypt(ciphertext)
        assert plaintext == "my-secret"

    def test_new_key_alone_cannot_decrypt_old(self):
        """New key alone should NOT decrypt ciphertext from old key."""
        old_key = Fernet.generate_key().decode()
        new_key = Fernet.generate_key().decode()

        old_service = self._make_service(old_key)
        ciphertext = old_service.encrypt("my-secret")

        new_only_service = self._make_service(new_key)
        result = new_only_service.decrypt(ciphertext)
        assert result is None

    def test_rotate_reencrypts_with_primary(self):
        """P2-1: rotate() should re-encrypt with the primary (new) key."""
        old_key = Fernet.generate_key().decode()
        new_key = Fernet.generate_key().decode()

        # Encrypt with old key
        old_service = self._make_service(old_key)
        ciphertext = old_service.encrypt("my-secret")

        # Rotate with new primary + old secondary
        multi_service = self._make_service(f"{new_key},{old_key}")
        rotated = multi_service.rotate(ciphertext)
        assert rotated is not None
        assert rotated != ciphertext  # Should be different (re-encrypted)

        # Rotated ciphertext should be decryptable with just the new key
        new_only_service = self._make_service(new_key)
        plaintext = new_only_service.decrypt(rotated)
        assert plaintext == "my-secret"

    def test_invalid_ciphertext_returns_none(self):
        """Decrypting invalid data should return None, not raise."""
        key = Fernet.generate_key().decode()
        service = self._make_service(key)
        result = service.decrypt("not-valid-ciphertext")
        assert result is None

    def test_rotate_invalid_returns_none(self):
        """Rotating invalid ciphertext should return None."""
        key = Fernet.generate_key().decode()
        service = self._make_service(key)
        result = service.rotate("not-valid-ciphertext")
        assert result is None

    def test_empty_plaintext(self):
        """Encrypting an empty string should work."""
        key = Fernet.generate_key().decode()
        service = self._make_service(key)
        ciphertext = service.encrypt("")
        plaintext = service.decrypt(ciphertext)
        assert plaintext == ""

    def test_unicode_plaintext(self):
        """Unicode plaintext should survive encrypt/decrypt roundtrip."""
        key = Fernet.generate_key().decode()
        service = self._make_service(key)
        ciphertext = service.encrypt("sk-or-v1-key-with-unicode")
        plaintext = service.decrypt(ciphertext)
        assert plaintext == "sk-or-v1-key-with-unicode"
