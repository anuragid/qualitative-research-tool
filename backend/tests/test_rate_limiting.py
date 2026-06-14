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
    """P1-2: Upload rate limit should be 20/minute.

    Sized to the per-project video quota (max 20 videos): a full batch makes
    20 upload-url + 20 confirm-upload calls, so 20/minute avoids a false 429
    on a legitimate batch while still capping the confirm-upload R2 fan-out.
    """
    from app.config import settings

    assert settings.RATE_LIMIT_UPLOAD == "20/minute"


def test_rate_limit_auth_setting():
    """P1-2: Auth rate limit should be 20/minute."""
    from app.config import settings

    assert settings.RATE_LIMIT_AUTH == "20/minute"


def test_limiter_uses_custom_key_func():
    """Rate limiter should use the custom key function that extracts user_id from JWT."""
    from app.main import limiter
    from app.rate_limit import _get_rate_limit_key

    assert limiter._key_func is _get_rate_limit_key


def test_rate_limit_key_falls_back_to_ip():
    """Without a JWT, rate limit key should fall back to IP address."""
    from unittest.mock import MagicMock

    from app.rate_limit import _get_rate_limit_key

    request = MagicMock()
    request.headers = {}
    request.client.host = "1.2.3.4"
    # get_remote_address uses request.client.host
    result = _get_rate_limit_key(request)
    assert result == "1.2.3.4"


def test_rate_limit_key_extracts_user_id():
    """With a valid JWT, rate limit key should use user:<sub>."""
    import base64
    import json
    from unittest.mock import MagicMock

    from app.rate_limit import _get_rate_limit_key

    # Build a fake JWT with sub claim
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({"sub": "user_abc123"}).encode()).rstrip(b"=").decode()
    fake_jwt = f"{header}.{payload}.fakesignature"

    request = MagicMock()
    request.headers = {"authorization": f"Bearer {fake_jwt}"}
    request.client.host = "1.2.3.4"

    result = _get_rate_limit_key(request)
    assert result == "user:user_abc123"


def test_rate_limit_key_handles_invalid_jwt():
    """With an invalid JWT, rate limit key should fall back to IP."""
    from unittest.mock import MagicMock

    from app.rate_limit import _get_rate_limit_key

    request = MagicMock()
    request.headers = {"authorization": "Bearer not.a.valid-jwt"}
    request.client.host = "5.6.7.8"

    result = _get_rate_limit_key(request)
    assert result == "5.6.7.8"
