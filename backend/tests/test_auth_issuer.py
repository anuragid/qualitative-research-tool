"""Tests for JWT issuer pinning in Clerk auth.

A token signed by Clerk's JWKS for a *different* context (different
`iss`) must be rejected even though the signature and expiry verify.
These tests mint real RS256 tokens against a throwaway RSA key, inject
the matching public key into a fresh ClerkAuth instance's JWKS cache,
and assert the issuer check is enforced when CLERK_ISSUER is configured.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app.auth import ClerkAuth
from app.config import settings

TEST_KID = "test-issuer-kid"


@pytest.fixture
def rsa_keypair():
    """Generate a throwaway RSA keypair for signing/verifying test JWTs."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return private_pem, private_key.public_key()


def _mint_token(private_pem, *, iss=None, sub="user_123", expires_in=3600):
    claims = {"sub": sub, "exp": int(time.time()) + expires_in}
    if iss is not None:
        claims["iss"] = iss
    return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": TEST_KID})


def _auth_with_cached_key(public_key):
    """Build a ClerkAuth whose JWKS cache already holds our test public key.

    Bypasses the network fetch entirely so verify_token uses the injected key.
    """
    auth = ClerkAuth()
    auth._cached_keys = {TEST_KID: public_key}
    auth._keys_fetched_at = time.monotonic()
    return auth


@pytest.fixture
def clerk_issuer(monkeypatch):
    """Pin CLERK_ISSUER to a known value for the duration of a test."""
    issuer = "https://clerk.example.test"
    monkeypatch.setattr(settings, "CLERK_ISSUER", issuer)
    return issuer


class TestIssuerPinning:
    def test_token_with_wrong_issuer_is_rejected(self, rsa_keypair, clerk_issuer):
        """A validly-signed token with the wrong `iss` must return 401."""
        private_pem, public_key = rsa_keypair
        auth = _auth_with_cached_key(public_key)
        token = _mint_token(private_pem, iss="https://attacker.evil.test")

        with pytest.raises(HTTPException) as exc_info:
            auth.verify_token(token)
        assert exc_info.value.status_code == 401

    def test_token_with_correct_issuer_is_accepted(self, rsa_keypair, clerk_issuer):
        """A token whose `iss` matches CLERK_ISSUER verifies normally."""
        private_pem, public_key = rsa_keypair
        auth = _auth_with_cached_key(public_key)
        token = _mint_token(private_pem, iss=clerk_issuer, sub="user_abc")

        payload = auth.verify_token(token)
        assert payload["sub"] == "user_abc"

    def test_token_missing_issuer_is_rejected_when_pinned(self, rsa_keypair, clerk_issuer):
        """When an issuer is pinned, a token with no `iss` claim is rejected."""
        private_pem, public_key = rsa_keypair
        auth = _auth_with_cached_key(public_key)
        token = _mint_token(private_pem, iss=None)

        with pytest.raises(HTTPException) as exc_info:
            auth.verify_token(token)
        assert exc_info.value.status_code == 401

    def test_issuer_not_enforced_when_unset(self, rsa_keypair, monkeypatch):
        """Backward-compat: with CLERK_ISSUER unset, any `iss` is accepted.

        This keeps local/dev runs working when no issuer is configured.
        """
        monkeypatch.setattr(settings, "CLERK_ISSUER", "")
        private_pem, public_key = rsa_keypair
        auth = _auth_with_cached_key(public_key)
        token = _mint_token(private_pem, iss="https://anything.test", sub="user_xyz")

        payload = auth.verify_token(token)
        assert payload["sub"] == "user_xyz"
