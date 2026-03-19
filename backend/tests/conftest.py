"""Shared test fixtures — sets required env vars before any app import."""

import os

# Set all required env vars BEFORE importing anything from app.*
# pydantic-settings reads these at import time.
# Use APP_ENV=development so the dev auth bypass is active for integration tests.
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_fake")
os.environ.setdefault("CLERK_PUBLISHABLE_KEY", "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk")
os.environ.setdefault("R2_ACCESS_KEY_ID", "test_access_key")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test_secret_key")
os.environ.setdefault("R2_ENDPOINT_URL", "https://fake.r2.cloudflarestorage.com")
os.environ.setdefault("R2_BUCKET_NAME", "test-bucket")
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("ASSEMBLYAI_API_KEY", "test-assemblyai-key")
os.environ.setdefault("ENCRYPTION_KEY", "9px3YGa-Z2bljdtUKpLhqzl9IaGdf2RgrCI-zOTrUug=")

import pytest  # noqa: E402
from unittest.mock import patch  # noqa: E402

from httpx import ASGITransport, AsyncClient  # noqa: E402


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async test client for the FastAPI app.

    Uses APP_ENV=development so the dev auth bypass is active —
    requests without an Authorization header authenticate as dev_user_local
    with USER role permissions.
    """
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_s3():
    """Mock S3 service to avoid real storage calls."""
    with patch("app.services.s3_service.s3_service") as mock:
        mock.upload_video.return_value = ("test-key", "https://test-url")
        mock.delete_video.return_value = None
        mock.get_presigned_url.return_value = "https://test-presigned-url"
        yield mock


def make_auth_header(role="user"):
    """Create mock auth header.

    In development mode the dev bypass is active, so sending no header
    (or 'Bearer dev-bypass') authenticates as the dev user with USER role.
    """
    return {"Authorization": "Bearer dev-bypass"}
