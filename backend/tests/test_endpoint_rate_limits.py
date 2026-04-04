"""Tests that expensive endpoints have rate limiting settings and configuration."""


def test_rate_limit_transcribe_setting():
    """Config should have transcribe rate limit."""
    from app.config import settings
    assert hasattr(settings, "RATE_LIMIT_TRANSCRIBE")
    assert settings.RATE_LIMIT_TRANSCRIBE == "5/minute"


def test_rate_limit_analyze_setting():
    """Config should have analyze rate limit."""
    from app.config import settings
    assert hasattr(settings, "RATE_LIMIT_ANALYZE")
    assert settings.RATE_LIMIT_ANALYZE == "5/minute"


def test_transcribe_route_exists():
    """POST /api/videos/{id}/transcribe route should exist."""
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/videos/{video_id}/transcribe" in paths


def test_analyze_video_route_exists():
    """POST /api/videos/{id}/analyze route should exist."""
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/videos/{video_id}/analyze" in paths


def test_analyze_project_route_exists():
    """POST /api/projects/{id}/analyze route should exist."""
    from app.main import app
    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/api/projects/{project_id}/analyze" in paths
