"""Tests for the worker boot-time schema check.

The check protects against the Railway race where the worker deploys
before the backend has run `alembic upgrade head`. Without this check,
the worker would crash on its first task with an opaque
``UndefinedColumn: column users.key_total_credits does not exist``.

We monkeypatch ``time.sleep`` to keep the test fast.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.tasks import celery_app


def test_schema_check_passes_when_all_columns_present():
    """When the inspector reports all 7 columns, the check returns cleanly."""
    fake_columns = [
        {"name": col} for col in (
            "id",
            "key_total_credits",
            "key_total_usage",
            "key_limit",
            "key_limit_remaining",
            "key_is_free_tier",
            "key_balance_checked_at",
            "key_balance_error",
        )
    ]

    fake_inspector = type("I", (), {"get_columns": lambda self, table: fake_columns})()
    with patch("app.tasks.celery_app.inspect", return_value=fake_inspector):
        # Should not raise
        celery_app._verify_byok_balance_schema()


def test_schema_check_raises_when_columns_missing(monkeypatch):
    """When columns are missing for the full retry window, check raises RuntimeError."""
    # Make the loop fast: zero out the sleep
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_MAX_ATTEMPTS", 3)

    fake_columns = [{"name": "id"}, {"name": "email"}]  # missing all balance cols
    fake_inspector = type("I", (), {"get_columns": lambda self, table: fake_columns})()

    with patch("app.tasks.celery_app.inspect", return_value=fake_inspector):
        with pytest.raises(RuntimeError, match="balance migration"):
            celery_app._verify_byok_balance_schema()


def test_schema_check_recovers_when_columns_appear_mid_loop(monkeypatch):
    """If columns appear after a few retries (typical Railway race recovery),
    the check should succeed without raising."""
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_MAX_ATTEMPTS", 5)

    call_count = {"n": 0}
    full_columns = [
        {"name": col} for col in (
            "id",
            "key_total_credits",
            "key_total_usage",
            "key_limit",
            "key_limit_remaining",
            "key_is_free_tier",
            "key_balance_checked_at",
            "key_balance_error",
        )
    ]
    sparse_columns = [{"name": "id"}]

    def get_columns(self, table):
        call_count["n"] += 1
        return full_columns if call_count["n"] >= 3 else sparse_columns

    fake_inspector = type("I", (), {"get_columns": get_columns})()
    with patch("app.tasks.celery_app.inspect", return_value=fake_inspector):
        celery_app._verify_byok_balance_schema()
    assert call_count["n"] >= 3, "expected at least 3 polls before success"


def test_schema_check_handles_db_unreachable(monkeypatch):
    """If the inspector itself fails (DB still booting), retry instead of crashing immediately."""
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_MAX_ATTEMPTS", 2)

    def boom(*args, **kwargs):
        raise ConnectionError("db unreachable")

    with patch("app.tasks.celery_app.inspect", side_effect=boom):
        with pytest.raises(RuntimeError, match="balance migration"):
            celery_app._verify_byok_balance_schema()
