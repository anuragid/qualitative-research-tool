"""Database connection and session management."""

import os
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Build connect_args based on database backend
_connect_args: dict = {}
if "postgresql" in settings.DATABASE_URL:
    _connect_args["options"] = "-c statement_timeout=30000"  # 30s query timeout

# Service-type-aware pool sizing. Picked so total connection count
# across all replicas stays comfortably under Postgres max_connections=100.
#
# backend: 5 + 5 overflow per uvicorn worker x 2 workers x 2 replicas = 40 max
# worker:  4 + 4 overflow per replica x 2 replicas               = 16 max
# beat:    1 + 1 overflow x 1 replica                            =  2 max
# Total worst case: ~58 connections. Plenty of headroom under 100.
#
# Unknown SERVICE_TYPE values fall back to the api sizing — safer to
# over-provision than to under-provision and crash on burst traffic.
_POOL_CONFIG: dict[str, dict[str, int]] = {
    "api":    {"pool_size": 5, "max_overflow": 5},
    "worker": {"pool_size": 4, "max_overflow": 4},
    "beat":   {"pool_size": 1, "max_overflow": 1},
}


def _pool_config_for(service_type: str | None) -> dict[str, int]:
    """Return the pool sizing dict for the given SERVICE_TYPE.

    Falls back to the api sizing for unknown or unset values — over-provisioning
    is safer than under-provisioning here.

    Exposed as a pure function so tests can verify the mapping without
    importlib.reload, which would invalidate the module-level engine and
    contaminate other tests' dependency-injection wiring.
    """
    if not service_type:
        return _POOL_CONFIG["api"]
    return _POOL_CONFIG.get(service_type, _POOL_CONFIG["api"])


_SERVICE_TYPE = os.environ.get("SERVICE_TYPE", "api")
_pool = _pool_config_for(_SERVICE_TYPE)

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,  # Verify connections before using them
    pool_size=_pool["pool_size"],
    max_overflow=_pool["max_overflow"],
    pool_recycle=1800,  # Recycle connections after 30 minutes to avoid stale connections
    echo=settings.DEBUG,  # Log SQL queries in debug mode
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Base class for ORM models (modern SQLAlchemy 2.0 style)
class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """
    Dependency for FastAPI routes to get database session.

    Usage:
        @app.get("/items/")
        def read_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
