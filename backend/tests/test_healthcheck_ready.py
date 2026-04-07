"""Tests for the /health/live and /health/ready endpoints.

Liveness check is always 200 as long as the process is up. Readiness
verifies the things this replica needs in order to actually serve a
request — DB and Redis. Railway points its healthcheckPath at
/health/ready so broken replicas get pulled from rotation.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_health_live_returns_200(client):
    """Liveness check is always 200 as long as the process is running."""
    resp = client.get("/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "alive"}


def test_health_returns_200_backwards_compat(client):
    """The old /health endpoint must still work for existing monitoring."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "healthy"}


def test_health_ready_returns_200_when_db_and_redis_ok(client):
    """Readiness check returns 200 when both DB and Redis are reachable."""
    with patch("app.main._probe_db", return_value=None), \
         patch("app.main._probe_redis", return_value=None):
        resp = client.get("/health/ready")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ready"}


def test_health_ready_returns_503_when_db_fails(client):
    """Readiness check returns 503 when DB ping fails."""
    with patch("app.main._probe_db", side_effect=Exception("db down")), \
         patch("app.main._probe_redis", return_value=None):
        resp = client.get("/health/ready")
    assert resp.status_code == 503
    assert resp.json()["status"] == "db_down"


def test_health_ready_returns_503_when_redis_fails(client):
    """Readiness check returns 503 when Redis ping fails (but DB is fine)."""
    with patch("app.main._probe_db", return_value=None), \
         patch("app.main._probe_redis", side_effect=Exception("redis down")):
        resp = client.get("/health/ready")
    assert resp.status_code == 503
    assert resp.json()["status"] == "redis_down"


def test_health_ready_db_check_runs_before_redis_check(client):
    """If both DB and Redis are down, the response should report db_down
    (DB is the more fundamental dependency)."""
    with patch("app.main._probe_db", side_effect=Exception("db down")), \
         patch("app.main._probe_redis", side_effect=Exception("redis down")):
        resp = client.get("/health/ready")
    assert resp.status_code == 503
    assert resp.json()["status"] == "db_down"


def test_probe_helpers_are_importable():
    """Both probe helpers must live on app.main so tests can mock them.

    If a refactor moves them to a submodule the test mocks will silently
    no-op — fail loudly here instead.
    """
    import app.main
    assert callable(getattr(app.main, "_probe_db", None))
    assert callable(getattr(app.main, "_probe_redis", None))
