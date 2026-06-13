"""Tests for fail-fast config validation.

Two classes of footgun we guard against:

1. APP_ENV typos. APP_ENV is the single switch that controls the dev auth
   bypass. A typo like "Development" silently fails the bypass *and* skips
   the production-config validation in main.py — the worst of both worlds.
   It must be a constrained Literal that errors at settings construction.

2. Production booted without critical secrets. ENCRYPTION_KEY and the JWT
   issuer must be present when APP_ENV=production. This belongs on the
   settings model itself (a model_validator) so it can't be skipped by an
   APP_ENV typo, and so it fires regardless of which entrypoint imports
   settings (api, worker, scripts).
"""

import pytest
from pydantic import ValidationError

from app.config import Settings

# Minimal set of required env-var-backed fields so we can construct Settings
# directly without relying on the process environment.
_BASE_KWARGS = dict(
    DATABASE_URL="sqlite:///test.db",
    REDIS_URL="redis://localhost:6379/0",
    R2_ACCESS_KEY_ID="x",
    R2_SECRET_ACCESS_KEY="x",
    R2_ENDPOINT_URL="https://x.r2.cloudflarestorage.com",
    R2_BUCKET_NAME="x",
    OPENROUTER_API_KEY="x",
    ASSEMBLYAI_API_KEY="x",
)


def _prod_kwargs(**overrides):
    kwargs = dict(
        _BASE_KWARGS,
        APP_ENV="production",
        CLERK_SECRET_KEY="sk_live_x",
        CLERK_PUBLISHABLE_KEY="pk_live_x",
        ENCRYPTION_KEY="9px3YGa-Z2bljdtUKpLhqzl9IaGdf2RgrCI-zOTrUug=",
        CLERK_ISSUER="https://clerk.methodex.ai",
    )
    kwargs.update(overrides)
    return kwargs


class TestAppEnvLiteral:
    def test_typo_app_env_raises(self):
        """APP_ENV='Development' (capital D typo) must fail validation."""
        with pytest.raises(ValidationError):
            Settings(**_BASE_KWARGS, APP_ENV="Development")

    def test_unknown_app_env_raises(self):
        """An arbitrary unknown APP_ENV must fail validation."""
        with pytest.raises(ValidationError):
            Settings(**_BASE_KWARGS, APP_ENV="prod")

    @pytest.mark.parametrize("env", ["development", "test"])
    def test_legitimate_non_prod_values_accepted(self, env):
        """Values actually used by the test suite / docker must be accepted."""
        s = Settings(**_BASE_KWARGS, APP_ENV=env)
        assert s.APP_ENV == env

    def test_production_value_accepted(self):
        s = Settings(**_prod_kwargs())
        assert s.APP_ENV == "production"


class TestProductionSecretsValidation:
    def test_production_without_encryption_key_fails_fast(self):
        """APP_ENV=production with empty ENCRYPTION_KEY must fail at construction."""
        with pytest.raises(ValidationError):
            Settings(**_prod_kwargs(ENCRYPTION_KEY=""))

    def test_production_without_issuer_fails_fast(self):
        """APP_ENV=production with empty CLERK_ISSUER must fail at construction.

        The issuer pin is only effective if production actually sets it, so we
        require it there. This makes setting CLERK_ISSUER a deploy prerequisite.
        """
        with pytest.raises(ValidationError):
            Settings(**_prod_kwargs(CLERK_ISSUER=""))

    def test_dev_without_encryption_key_is_fine(self):
        """Development must NOT require ENCRYPTION_KEY / CLERK_ISSUER.

        Local runs and CI use APP_ENV=development with these unset.
        """
        s = Settings(**_BASE_KWARGS, APP_ENV="development", ENCRYPTION_KEY="", CLERK_ISSUER="")
        assert s.APP_ENV == "development"

    def test_production_fully_configured_constructs(self):
        s = Settings(**_prod_kwargs())
        assert s.ENCRYPTION_KEY
        assert s.CLERK_ISSUER == "https://clerk.methodex.ai"
