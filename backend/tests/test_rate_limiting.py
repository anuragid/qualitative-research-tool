"""Tests for rate limiting configuration.

Covers finding: P1-2
"""



def test_rate_limiter_configured():
    """P1-2: Rate limiter should be configured on the app."""
    from app.main import app, limiter

    assert app.state.limiter is limiter
    assert limiter is not None


def test_rate_limit_default_setting():
    """P1-2: Default rate limit should be 60/minute."""
    from app.config import settings

    assert settings.RATE_LIMIT_DEFAULT == "60/minute"


def test_rate_limit_upload_setting():
    """P1-2: Upload rate limit should be 10/minute."""
    from app.config import settings

    assert settings.RATE_LIMIT_UPLOAD == "10/minute"


def test_rate_limit_auth_setting():
    """P1-2: Auth rate limit should be 20/minute."""
    from app.config import settings

    assert settings.RATE_LIMIT_AUTH == "20/minute"


def test_limiter_uses_remote_address():
    """Rate limiter should key on remote address."""
    from slowapi.util import get_remote_address

    from app.main import limiter

    assert limiter._key_func is get_remote_address
