"""Tests for the worker boot-time schema check.

The check protects against the Railway race where the worker deploys
before the backend has run `alembic upgrade head`. Without this check,
the worker would crash on its first task with an opaque
``UndefinedColumn: column users.key_total_credits does not exist``
(or, post-c1a2b3d4e5f6, ``project_analyses.error_message``).

We monkeypatch ``time.sleep`` to keep the test fast.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.tasks import celery_app

_FULL_SCHEMA = {
    "users": [
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
    ],
    "project_analyses": [
        {"name": col} for col in (
            "id",
            "project_id",
            "status",
            "error_message",
        )
    ],
}


def _inspector_for(schema):
    return type("I", (), {"get_columns": lambda self, table: schema.get(table, [])})()


def test_schema_check_passes_when_all_columns_present():
    """When the inspector reports all required columns on every gated
    table, the check returns cleanly."""
    fake_inspector = _inspector_for(_FULL_SCHEMA)
    with patch("app.tasks.celery_app.inspect", return_value=fake_inspector):
        # Should not raise
        celery_app._verify_worker_schema()


def test_schema_check_raises_when_columns_missing(monkeypatch):
    """When columns are missing for the full retry window, check raises RuntimeError."""
    # Make the loop fast: zero out the sleep
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_MAX_ATTEMPTS", 3)

    sparse_schema = {
        "users": [{"name": "id"}, {"name": "email"}],  # missing all balance cols
        "project_analyses": [{"name": "id"}],
    }
    fake_inspector = _inspector_for(sparse_schema)

    with patch("app.tasks.celery_app.inspect", return_value=fake_inspector):
        with pytest.raises(RuntimeError, match="migration"):
            celery_app._verify_worker_schema()


def test_schema_check_raises_when_only_project_analyses_column_missing(monkeypatch):
    """The gate must cover project_analyses.error_message specifically:
    a schema where the BYOK columns exist but the c1a2b3d4e5f6 migration
    hasn't run yet must NOT pass — this is the exact deploy-window crash
    the gate exists to prevent (new worker code writes error_message on
    every ProjectAnalysis commit)."""
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_MAX_ATTEMPTS", 2)

    pre_migration_schema = {
        "users": _FULL_SCHEMA["users"],
        "project_analyses": [
            {"name": "id"},
            {"name": "project_id"},
            {"name": "status"},
            # error_message missing — old schema
        ],
    }
    fake_inspector = _inspector_for(pre_migration_schema)

    with patch("app.tasks.celery_app.inspect", return_value=fake_inspector):
        with pytest.raises(RuntimeError, match="migration"):
            celery_app._verify_worker_schema()


def test_required_columns_include_project_analyses_error_message():
    """Regression guard: the gate's column map must list
    project_analyses.error_message (reviewer finding on PR #45)."""
    required = celery_app._REQUIRED_COLUMNS_BY_TABLE
    assert "project_analyses" in required
    assert "error_message" in required["project_analyses"]


def test_schema_check_recovers_when_columns_appear_mid_loop(monkeypatch):
    """If columns appear after a few retries (typical Railway race recovery),
    the check should succeed without raising."""
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_MAX_ATTEMPTS", 5)

    call_count = {"n": 0}
    sparse_schema = {
        "users": [{"name": "id"}],
        "project_analyses": [{"name": "id"}],
    }

    def get_columns(self, table):
        call_count["n"] += 1
        schema = _FULL_SCHEMA if call_count["n"] >= 5 else sparse_schema
        return schema.get(table, [])

    fake_inspector = type("I", (), {"get_columns": get_columns})()
    with patch("app.tasks.celery_app.inspect", return_value=fake_inspector):
        celery_app._verify_worker_schema()
    assert call_count["n"] >= 5, "expected several polls before success"


def test_schema_check_handles_db_unreachable(monkeypatch):
    """If the inspector itself fails (DB still booting), retry instead of crashing immediately."""
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_INTERVAL_SECONDS", 0)
    monkeypatch.setattr("app.tasks.celery_app._SCHEMA_CHECK_MAX_ATTEMPTS", 2)

    def boom(*args, **kwargs):
        raise ConnectionError("db unreachable")

    with patch("app.tasks.celery_app.inspect", side_effect=boom):
        with pytest.raises(RuntimeError, match="migration"):
            celery_app._verify_worker_schema()


def test_legacy_alias_still_works():
    """Old name `_verify_byok_balance_schema` is aliased for runbooks/tooling."""
    assert celery_app._verify_byok_balance_schema is celery_app._verify_worker_schema
