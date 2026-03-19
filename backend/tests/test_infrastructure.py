"""Tests for infrastructure security (env, celery, docker).

Covers findings: P0-1, P1-5, P3-10, P4-1
"""

import os

import pytest


class TestEnvSecurity:
    def test_env_has_no_unused_secrets(self):
        """P0-1: .env should not contain unused/leftover API keys."""
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if not os.path.exists(env_path):
            pytest.skip(".env file not found")

        with open(env_path) as f:
            content = f.read()

        # These keys should have been removed during the security hardening
        assert "ANTHROPIC_API_KEY" not in content, "Unused ANTHROPIC_API_KEY found in .env"
        assert "GITHUB_TOKEN" not in content, "Unused GITHUB_TOKEN found in .env"
        assert "RAILWAY_TOKEN" not in content, "RAILWAY_TOKEN should not be in .env"
        assert "CLOUDFLARE_API_TOKEN" not in content, "CLOUDFLARE_API_TOKEN should not be in .env"

    def test_env_has_no_hardcoded_production_keys(self):
        """Production keys should not be checked into .env."""
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if not os.path.exists(env_path):
            pytest.skip(".env file not found")

        with open(env_path) as f:
            content = f.read()

        # Live Clerk keys should never be in the committed .env
        assert "sk_live_" not in content, "Production Clerk secret key found in .env"
        assert "pk_live_" not in content, "Production Clerk publishable key found in .env"


class TestCeleryConfig:
    def test_celery_result_expires_is_short(self):
        """P3-10: Celery results should expire quickly (600s) to limit data exposure."""
        from app.tasks.celery_app import celery_app

        assert celery_app.conf.result_expires == 600

    def test_celery_serializer_is_json(self):
        """Celery should use JSON serializer (not pickle, which is unsafe)."""
        from app.tasks.celery_app import celery_app

        assert celery_app.conf.task_serializer == "json"
        assert celery_app.conf.result_serializer == "json"
        assert "json" in celery_app.conf.accept_content

    def test_celery_acks_late(self):
        """Tasks should be acked after execution for crash resilience."""
        from app.tasks.celery_app import celery_app

        assert celery_app.conf.task_acks_late is True

    def test_celery_reject_on_worker_lost(self):
        """Tasks should be re-queued if worker dies mid-execution."""
        from app.tasks.celery_app import celery_app

        assert celery_app.conf.task_reject_on_worker_lost is True


class TestFrontendHeaders:
    def test_frontend_headers_file_exists(self):
        """P1-5: Frontend security headers file should exist."""
        headers_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "public", "_headers"
        )
        assert os.path.exists(headers_path), f"_headers file not found at {headers_path}"

    def test_frontend_headers_contain_hsts(self):
        """P1-5: Frontend should set Strict-Transport-Security."""
        headers_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "public", "_headers"
        )
        if not os.path.exists(headers_path):
            pytest.skip("_headers file not found")

        with open(headers_path) as f:
            content = f.read()

        assert "Strict-Transport-Security" in content

    def test_frontend_headers_contain_csp(self):
        """P1-5: Frontend should set Content-Security-Policy."""
        headers_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "public", "_headers"
        )
        if not os.path.exists(headers_path):
            pytest.skip("_headers file not found")

        with open(headers_path) as f:
            content = f.read()

        assert "Content-Security-Policy" in content

    def test_frontend_headers_contain_x_frame_options(self):
        """P1-5: Frontend should set X-Frame-Options."""
        headers_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "public", "_headers"
        )
        if not os.path.exists(headers_path):
            pytest.skip("_headers file not found")

        with open(headers_path) as f:
            content = f.read()

        assert "X-Frame-Options" in content

    def test_frontend_headers_contain_all_security_headers(self):
        """P1-5: Frontend should have the complete set of security headers."""
        headers_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "public", "_headers"
        )
        if not os.path.exists(headers_path):
            pytest.skip("_headers file not found")

        with open(headers_path) as f:
            content = f.read()

        required_headers = [
            "Strict-Transport-Security",
            "Content-Security-Policy",
            "X-Frame-Options",
            "X-Content-Type-Options",
            "Referrer-Policy",
            "Permissions-Policy",
            "X-XSS-Protection",
        ]
        for header in required_headers:
            assert header in content, f"Missing security header: {header}"


class TestDocsDisabledInProduction:
    def test_docs_disabled_when_not_debug(self):
        """P4-1: OpenAPI docs should be disabled when DEBUG=false."""
        from app.config import settings

        # In our test env, DEBUG is false
        if not settings.DEBUG:
            from app.main import app
            assert app.docs_url is None
            assert app.redoc_url is None
            assert app.openapi_url is None
