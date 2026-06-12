#!/usr/bin/env python3
"""Alembic migration-vs-model drift gate.

Runs two checks:
  1. Single-head assertion  — the migration chain must have exactly one head.
  2. Drift-is-empty check   — ``alembic check`` must report no upgrade operations
     *beyond* the items listed in known_schema_drift.txt.

Usage (run from the backend/ directory with DATABASE_URL set):
    python3 ../scripts/ci/check_migration_drift.py

Exit codes:
    0 — no unexpected drift, single head confirmed.
    1 — unexpected drift found OR multiple heads detected.

IMPORTANT: known_schema_drift.txt lists items that are currently tolerated
because the corresponding migration has not been written yet.  Each entry
must be removed from that file when the fixing migration is merged.  The
Wave-2 PR W2-A must clear this file entirely.
"""

from __future__ import annotations

import re
import subprocess
import sys
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
# Drift key normalisation
# ---------------------------------------------------------------------------

def _normalise_drift_lines(check_stderr: str) -> list[str]:
    """Extract canonical drift keys from ``alembic check`` stderr.

    alembic check writes one INFO line per detected change, e.g.:
      INFO  [alembic.autogenerate.compare] Detected added index 'ix_foo' on ...
      INFO  [alembic.autogenerate.compare] Detected NULL on column 'table.col'
      INFO  [alembic.autogenerate.compare] Detected type change from ... on 'table.col'
      INFO  [alembic.autogenerate.compare] Detected removed unique constraint 'name' on ...

    We map each INFO line to a stable canonical key used in known_schema_drift.txt.
    """
    keys: list[str] = []

    for line in check_stderr.splitlines():
        # Only look at autogenerate.compare INFO lines
        if "[alembic.autogenerate.compare]" not in line:
            continue
        msg = line.split("] ", 1)[-1].strip()

        # --- added index ---
        # alembic renders index names with double single-quotes: ''ix_name''
        m = re.search(r"Detected added index ''([^']+)''", msg)
        if m:
            keys.append(f"add_index:{m.group(1)}")
            continue

        # --- nullable mismatch ("Detected NULL on column 'table.col'") ---
        m = re.search(r"Detected NULL on column '([^.]+)\.([^']+)'", msg)
        if m:
            keys.append(f"modify_nullable:{m.group(1)}:{m.group(2)}")
            continue

        # --- removed unique constraint ---
        m = re.search(r"Detected removed unique constraint '([^']+)' on '([^']+)'", msg)
        if m:
            keys.append(f"remove_constraint:{m.group(2)}:{m.group(1)}")
            continue

        # --- type change ---
        m = re.search(r"Detected type change from .+ on '([^.]+)\.([^']+)'", msg)
        if m:
            keys.append(f"modify_type:{m.group(1)}:{m.group(2)}")
            continue

        # --- catch-all: any other autogenerate compare line is unknown drift ---
        # Strip the common prefix verbiage to produce a short key.
        short = re.sub(r"^Detected\s+", "", msg)
        keys.append(f"unknown:{short[:120]}")

    return keys


# ---------------------------------------------------------------------------
# Subprocess helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )


# ---------------------------------------------------------------------------
# Check 1: single-head assertion
# ---------------------------------------------------------------------------

def check_single_head() -> bool:
    """Return True iff the migration chain has exactly one head."""
    result = _run(["alembic", "heads"])
    heads_output = result.stdout + result.stderr
    # Each head is reported on its own line; non-empty lines ending with (head)
    head_lines = [
        ln for ln in heads_output.splitlines()
        if ln.strip() and not ln.strip().startswith("INFO")
    ]
    # alembic heads prints one line per head like:
    #   f5a6b7c8d9e0 (head)
    head_revisions = [ln for ln in head_lines if "(head)" in ln]

    if len(head_revisions) == 1:
        print(f"[PASS] Single migration head: {head_revisions[0].strip()}")
        return True
    else:
        print(
            f"[FAIL] Expected exactly 1 migration head, found {len(head_revisions)}:",
            file=sys.stderr,
        )
        for h in head_revisions:
            print(f"  {h.strip()}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# Check 2: drift-is-empty (minus allowlist)
# ---------------------------------------------------------------------------

def check_no_new_drift(allowlist: set[str]) -> bool:
    """Run ``alembic check`` and fail on any drift NOT in the allowlist."""
    result = _run(["alembic", "check"])
    combined = result.stdout + result.stderr

    if result.returncode == 0:
        print("[PASS] alembic check: no schema drift detected.")
        return True

    # Parse drift items from stderr INFO lines
    detected = _normalise_drift_lines(combined)

    new_drift = [k for k in detected if k not in allowlist]
    tolerated = [k for k in detected if k in allowlist]

    if tolerated:
        print(
            f"[INFO] {len(tolerated)} known-drift item(s) tolerated "
            f"(listed in known_schema_drift.txt — clear when W2-A merges):"
        )
        for k in sorted(tolerated):
            print(f"  (known)  {k}")

    if new_drift:
        print(
            f"\n[FAIL] {len(new_drift)} NEW schema drift item(s) detected "
            f"— add a migration or update known_schema_drift.txt with a "
            f"justification comment:",
            file=sys.stderr,
        )
        for k in sorted(new_drift):
            print(f"  (NEW)    {k}", file=sys.stderr)
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
    allowlist = load_allowlist(ALLOWLIST_FILE)

    head_ok = check_single_head()
    drift_ok = check_no_new_drift(allowlist)

    if head_ok and drift_ok:
        print("\n[PASS] Migration drift gate: all checks passed.")
        return 0
    else:
        print("\n[FAIL] Migration drift gate: one or more checks failed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
