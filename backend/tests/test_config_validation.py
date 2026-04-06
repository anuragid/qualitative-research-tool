"""Tests for ``_validate_production_config`` in ``app.main``."""

import pytest


def test_allowed_origins_default_fatal_in_production(monkeypatch):
    """ALLOWED_ORIGINS must be set to a non-default value in production.

    If it's still the hard-coded localhost default, startup must raise a
    ``RuntimeError`` — matching the ``ENCRYPTION_KEY`` check's style.
    """
    import app.auth
    from app import main as main_module
    from app.main import _DEFAULT_LOCALHOST_ORIGINS, _validate_production_config

    # Simulate production config with default ALLOWED_ORIGINS
    monkeypatch.setattr(main_module.settings, "APP_ENV", "production")
    monkeypatch.setattr(main_module.settings, "ENCRYPTION_KEY", "some-valid-key-for-test")
    monkeypatch.setattr(main_module.settings, "CLERK_SECRET_KEY", "sk_live_fake")
    monkeypatch.setattr(
        main_module.settings, "ALLOWED_ORIGINS", _DEFAULT_LOCALHOST_ORIGINS
    )
    # Ensure the dev-bypass check doesn't fire before we reach ALLOWED_ORIGINS
    monkeypatch.setattr(app.auth, "_is_dev", False)

    with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS"):
        _validate_production_config()


def test_allowed_origins_non_default_ok_in_production(monkeypatch):
    """Non-default ALLOWED_ORIGINS in production should not raise."""
    import app.auth
    from app import main as main_module
    from app.main import _validate_production_config

    monkeypatch.setattr(main_module.settings, "APP_ENV", "production")
    monkeypatch.setattr(main_module.settings, "ENCRYPTION_KEY", "some-valid-key-for-test")
    monkeypatch.setattr(main_module.settings, "CLERK_SECRET_KEY", "sk_live_fake")
    monkeypatch.setattr(
        main_module.settings,
        "ALLOWED_ORIGINS",
        "https://methodex.ai,https://www.methodex.ai",
    )
    monkeypatch.setattr(app.auth, "_is_dev", False)

    # Should not raise
    _validate_production_config()
