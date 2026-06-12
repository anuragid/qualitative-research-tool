#!/usr/bin/env python3
"""Alembic migration-vs-model drift gate.

Runs two checks:
  1. Single-head assertion  — the migration chain must have exactly one head.
  2. Drift-is-empty check   — alembic autogenerate comparison must report no
     operations *beyond* the items listed in known_schema_drift.txt.

Usage (run from the backend/ directory, AFTER ``alembic upgrade head``, with
DATABASE_URL set):
    python3 ../scripts/ci/check_migration_drift.py

Exit codes:
    0 — no unexpected drift, single head confirmed, DB at head.
    1 — unexpected drift, multiple heads, DB not at head, or ANY error
        (connection failure, import failure, etc. — the gate fails CLOSED).

Implementation notes:
- We call ``alembic.autogenerate.compare_metadata()`` programmatically and
  classify the RAW diff tuples, instead of shelling out to ``alembic check``
  and regex-parsing its prose log lines.  The tuple structure is a stable,
  documented API and is direction-symmetric (e.g. ``modify_nullable`` covers
  both NULL→NOT NULL and NOT NULL→NULL drift with the same canonical key).
- Any exception (bad DATABASE_URL, DB not reachable, model import error)
  propagates to a non-zero exit with the raw traceback printed: fail CLOSED,
  never silently pass.

IMPORTANT: known_schema_drift.txt lists items that are currently tolerated
because the corresponding fix has not been made yet.  Each entry must be
removed when its fix is merged.  The Wave-2 PR W2-A must clear this file
entirely.  NOTE: not every entry is fixed by writing a migration — for some,
the DATABASE is right and the MODEL must change (see the per-entry comments
in known_schema_drift.txt before touching anything).
"""

from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
ALLOWLIST_FILE = SCRIPT_DIR / "known_schema_drift.txt"


# ---------------------------------------------------------------------------
# Allowlist loading
# ---------------------------------------------------------------------------

def load_allowlist(path: Path) -> set[str]:
    """Return the set of canonical drift keys that are tolerated."""
    if not path.exists():
        return set()
    keys: set[str] = set()
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        keys.add(line)
    return keys


# ---------------------------------------------------------------------------
# Canonical keys from raw autogenerate diff tuples
# ---------------------------------------------------------------------------

def canonical_key(diff: tuple) -> str:
    """Map one alembic autogenerate diff tuple to a stable canonical key.

    Tuple shapes (see alembic.autogenerate.compare_metadata docs):
      ('add_table', Table) / ('remove_table', Table)
      ('add_column', schema, table_name, Column) / ('remove_column', ...)
      ('add_index', Index) / ('remove_index', Index)
      ('add_constraint', Constraint) / ('remove_constraint', Constraint)
      ('add_fk', ForeignKeyConstraint) / ('remove_fk', ...)
      ('modify_nullable', schema, table, column, kwargs, old, new)
      ('modify_type',     schema, table, column, kwargs, old, new)
      ('modify_default',  schema, table, column, kwargs, old, new)

    Note: modify_* keys are intentionally direction-agnostic — the same key
    matches NULL→NOT NULL and NOT NULL→NULL drift.
    """
    op = diff[0]

    if op in ("add_index", "remove_index"):
        return f"{op}:{diff[1].name}"

    if op in ("add_table", "remove_table"):
        return f"{op}:{diff[1].name}"

    if op in ("add_column", "remove_column"):
        # (op, schema, table_name, Column)
        return f"{op}:{diff[2]}:{diff[3].name}"

    if op in ("add_constraint", "remove_constraint", "add_fk", "remove_fk"):
        constraint = diff[1]
        table = getattr(constraint, "table", None)
        table_name = table.name if table is not None else "?"
        return f"{op}:{table_name}:{constraint.name}"

    if op.startswith("modify_"):
        # (op, schema, table_name, column_name, kwargs, old, new)
        return f"{op}:{diff[2]}:{diff[3]}"

    # Unknown op type — emit a repr-based key.  This will never match an
    # allowlist entry, so unknown ops always fail the gate (fail closed).
    return f"unknown:{repr(diff)[:160]}"


def flatten_diffs(diffs: list) -> list[tuple]:
    """compare_metadata() groups modify_* ops in nested lists — flatten them."""
    flat: list[tuple] = []
    for entry in diffs:
        if isinstance(entry, list):
            flat.extend(entry)
        else:
            flat.append(entry)
    return flat


# ---------------------------------------------------------------------------
# Check 1: single-head assertion
# ---------------------------------------------------------------------------

def check_single_head(script_directory) -> tuple[bool, list[str]]:
    """Return (ok, heads). Fails unless the chain has exactly one head."""
    heads = list(script_directory.get_heads())
    if len(heads) == 1:
        print(f"[PASS] Single migration head: {heads[0]}")
        return True, heads
    print(
        f"[FAIL] Expected exactly 1 alembic head, found {len(heads)}: {heads}",
        file=sys.stderr,
    )
    return False, heads


# ---------------------------------------------------------------------------
# Check 2: drift-is-empty (minus allowlist)
# ---------------------------------------------------------------------------

def check_no_new_drift(diffs: list, allowlist: set[str]) -> bool:
    """Classify raw diff tuples; fail on any key NOT in the allowlist."""
    flat = flatten_diffs(diffs)

    if not flat:
        print("[PASS] No schema drift detected (autogenerate diff is empty).")
        return True

    detected = [canonical_key(d) for d in flat]
    new_drift = [k for k in detected if k not in allowlist]
    tolerated = [k for k in detected if k in allowlist]

    if tolerated:
        print(
            f"[INFO] {len(tolerated)} known-drift item(s) tolerated "
            f"(listed in known_schema_drift.txt — must be cleared by W2-A):"
        )
        for k in sorted(tolerated):
            print(f"  (known)  {k}")

    if new_drift:
        print(
            f"\n[FAIL] {len(new_drift)} NEW schema drift item(s) detected "
            f"— write the missing migration (or fix the model) rather than "
            f"extending known_schema_drift.txt:",
            file=sys.stderr,
        )
        for k in sorted(new_drift):
            print(f"  (NEW)    {k}", file=sys.stderr)
        # Also dump the raw tuples for the new items to aid debugging.
        print("\nRaw diff tuples for NEW items:", file=sys.stderr)
        for d in flat:
            if canonical_key(d) in new_drift:
                print(f"  {d!r}", file=sys.stderr)
        return False

    print(
        f"[PASS] All {len(detected)} detected drift item(s) are in the "
        "known allowlist — no NEW drift."
    )
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    try:
        # Import alembic/sqlalchemy BEFORE adding cwd to sys.path: the
        # backend/ working directory contains an `alembic/` migrations folder
        # that would shadow the installed alembic package otherwise.
        from alembic.autogenerate import compare_metadata
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory
        from sqlalchemy import create_engine

        # The script is invoked from backend/ — make `app` importable.
        sys.path.insert(0, os.getcwd())
        from app.config import settings
        from app.database import Base
        from app.models import database_models  # noqa: F401 — registers models on Base
    except Exception:
        print(
            "[FAIL] Could not import alembic/app modules — gate fails CLOSED.\n"
            "Run this script from the backend/ directory with dependencies "
            "installed and required env vars set.",
            file=sys.stderr,
        )
        traceback.print_exc()
        return 1

    allowlist = load_allowlist(ALLOWLIST_FILE)

    try:
        cfg = Config("alembic.ini")
        script_directory = ScriptDirectory.from_config(cfg)
        head_ok, heads = check_single_head(script_directory)

        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as connection:
            # Match env.py's effective autogenerate comparison options.
            migration_ctx = MigrationContext.configure(
                connection,
                opts={"compare_type": True, "compare_server_default": False},
            )

            # Sanity: the DB must already be migrated to head, otherwise the
            # comparison below would report the entire schema as drift.
            current = migration_ctx.get_current_revision()
            if current is None or current not in heads:
                print(
                    f"[FAIL] Database revision is {current!r}, expected head(s) "
                    f"{heads} — run `alembic upgrade head` before this gate.",
                    file=sys.stderr,
                )
                return 1

            diffs = compare_metadata(migration_ctx, Base.metadata)
    except SystemExit:
        raise
    except Exception:
        # Fail CLOSED: any error (bad DATABASE_URL, connection refused,
        # reflection error, alembic API change) must fail the gate loudly,
        # never silently pass.
        print(
            "[FAIL] Error while running the drift comparison — gate fails "
            "CLOSED. Raw error follows:",
            file=sys.stderr,
        )
        traceback.print_exc()
        return 1

    drift_ok = check_no_new_drift(diffs, allowlist)

    if head_ok and drift_ok:
        print("\n[PASS] Migration drift gate: all checks passed.")
        return 0
    print("\n[FAIL] Migration drift gate: one or more checks failed.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
