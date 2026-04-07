"""Tests for service-type-aware database pool sizing.

The backend, worker, and beat services share the same code base but need
different pool sizes to avoid exhausting Postgres' max_connections=100
budget once we scale to multi-replica topology.

Sizing rationale (see backend/app/database.py for the math):
  - api    -> pool_size=5,  max_overflow=5  (per uvicorn worker)
  - worker -> pool_size=4,  max_overflow=4  (per replica)
  - beat   -> pool_size=1,  max_overflow=1  (single replica, very low DB use)

These tests intentionally exercise the pure ``_pool_config_for`` helper
rather than reloading the database module — reloading would swap the
module-level ``engine`` and ``SessionLocal`` references and break the
FastAPI dependency-override wiring used by other test fixtures.
"""

import pytest

from app.database import _POOL_CONFIG, _pool_config_for


@pytest.mark.parametrize(
    "service_type,expected_pool_size,expected_overflow",
    [
        ("api", 5, 5),
        ("worker", 4, 4),
        ("beat", 1, 1),
    ],
)
def test_pool_size_by_service_type(
    service_type, expected_pool_size, expected_overflow
):
    """Pool size should vary by SERVICE_TYPE to avoid Postgres connection exhaustion."""
    cfg = _pool_config_for(service_type)
    assert cfg["pool_size"] == expected_pool_size
    assert cfg["max_overflow"] == expected_overflow


def test_unknown_service_type_falls_back_to_api_pool():
    """Unknown SERVICE_TYPE should not crash; fall back to api pool sizing."""
    cfg = _pool_config_for("something-weird")
    assert cfg["pool_size"] == 5
    assert cfg["max_overflow"] == 5


def test_none_service_type_falls_back_to_api_pool():
    """None / unset SERVICE_TYPE should fall back to api pool sizing."""
    cfg = _pool_config_for(None)
    assert cfg["pool_size"] == 5
    assert cfg["max_overflow"] == 5


def test_empty_service_type_falls_back_to_api_pool():
    """Empty string SERVICE_TYPE should fall back to api pool sizing."""
    cfg = _pool_config_for("")
    assert cfg["pool_size"] == 5
    assert cfg["max_overflow"] == 5


def test_pool_config_keys_match_known_service_types():
    """The known service types are exactly api, worker, beat. Adding another
    one without updating the worst-case math in the module docstring would
    risk Postgres connection exhaustion."""
    assert set(_POOL_CONFIG.keys()) == {"api", "worker", "beat"}


def test_total_worst_case_connection_count_fits_under_100():
    """Sanity check the connection budget. The 5 / 4 / 1 sizing assumes a
    target topology of:
      - 2 backend replicas x 2 uvicorn workers per replica = 4 api processes
      - 2 worker replicas
      - 1 beat replica

    Each api process uses up to pool_size + max_overflow = 10 conns.
    Each worker process uses up to 8 conns.
    Each beat process uses up to 2 conns.

    Total: 4*10 + 2*8 + 1*2 = 58. Well under Postgres max_connections=100.
    If anyone bumps these numbers without re-doing the math, this test fails.
    """
    api_total = 4 * (_POOL_CONFIG["api"]["pool_size"] + _POOL_CONFIG["api"]["max_overflow"])
    worker_total = 2 * (_POOL_CONFIG["worker"]["pool_size"] + _POOL_CONFIG["worker"]["max_overflow"])
    beat_total = 1 * (_POOL_CONFIG["beat"]["pool_size"] + _POOL_CONFIG["beat"]["max_overflow"])
    assert api_total + worker_total + beat_total < 100
