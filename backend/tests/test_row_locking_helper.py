"""Unit tests for the ``app.utils.row_locking.lock_rows`` helper.

These prove the *dialect gating* — that the helper emits ``FOR UPDATE``
on PostgreSQL and is a no-op on SQLite — by inspecting the compiled SQL.
They do NOT prove real lock blocking (impossible on SQLite); that is the
job of ``test_row_locking_postgres.py``.
"""

from __future__ import annotations

import os

os.environ.setdefault("APP_ENV", "development")
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
from sqlalchemy import ARRAY, create_engine, create_mock_engine  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB, UUID  # noqa: E402
from sqlalchemy.dialects.postgresql import dialect as pg_dialect  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"


from app.database import Base  # noqa: E402
from app.models.database_models import VideoAnalysis  # noqa: E402
from app.utils.row_locking import lock_rows  # noqa: E402


@pytest.fixture
def sqlite_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'lock_helper.db'}")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


def test_lock_rows_is_noop_on_sqlite(sqlite_session):
    """On SQLite the helper must NOT add a FOR UPDATE clause (the dialect
    cannot honour it) — the compiled SQL stays a plain SELECT."""
    q = sqlite_session.query(VideoAnalysis).filter(VideoAnalysis.status == "processing")
    locked = lock_rows(q)
    sql = str(locked.statement.compile(sqlite_session.get_bind()))
    assert "FOR UPDATE" not in sql.upper(), (
        "SQLite must not emit FOR UPDATE — got:\n" + sql
    )


def test_lock_rows_emits_for_update_on_postgres():
    """Compiling the same query against the PostgreSQL dialect must emit
    ``FOR UPDATE`` — proving the helper's gating is keyed on dialect, not
    silently dropped everywhere."""
    pg_engine = create_mock_engine("postgresql://", lambda *a, **k: None)
    Session = sessionmaker(bind=pg_engine)
    s = Session()
    try:
        q = s.query(VideoAnalysis).filter(VideoAnalysis.status == "processing")
        locked = lock_rows(q)
        sql = str(locked.statement.compile(dialect=pg_dialect()))
        assert "FOR UPDATE" in sql.upper(), (
            "Postgres must emit FOR UPDATE — got:\n" + sql
        )
        assert "SKIP LOCKED" not in sql.upper()
    finally:
        s.close()


def test_lock_rows_skip_locked_on_postgres():
    """``skip_locked=True`` must compile to ``FOR UPDATE SKIP LOCKED`` on
    Postgres — that's how the watchdog sweep avoids blocking behind a live
    task's row lock."""
    pg_engine = create_mock_engine("postgresql://", lambda *a, **k: None)
    Session = sessionmaker(bind=pg_engine)
    s = Session()
    try:
        q = s.query(VideoAnalysis).filter(VideoAnalysis.status == "processing")
        locked = lock_rows(q, skip_locked=True)
        sql = str(locked.statement.compile(dialect=pg_dialect())).upper()
        assert "FOR UPDATE" in sql
        assert "SKIP LOCKED" in sql
    finally:
        s.close()
