"""
One-time DB recovery script to fix broken production records.

Fixes:
  1. Resets 7 broken videos to 'transcribed' status so users can retry analysis
  2. Fixes stale projects stuck in 'planning' status
  3. Logs Group 3 videos (no action needed)

SAFETY: the default behaviour is dry-run (no database mutations). You must
pass ``--apply`` to actually commit changes to the database. An accidental
``python scripts/fix_broken_records.py`` will show the plan and exit zero
without touching anything.

Alternatively, you can set DRY_RUN=1 (or any truthy value) to force dry-run
mode even with --apply.

Usage:
  # Default: dry run (no changes committed)
  railway run --service backend python scripts/fix_broken_records.py

  # Explicit dry run (same as default)
  railway run --service backend python scripts/fix_broken_records.py --dry-run

  # Actually apply changes to the database
  railway run --service backend python scripts/fix_broken_records.py --apply

  # Force dry-run mode (overrides --apply)
  DRY_RUN=1 railway run --service backend python scripts/fix_broken_records.py --apply
"""

import argparse
import os
import sys

# Add backend/ to Python path so we can import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from uuid import UUID

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# We create the engine directly from DATABASE_URL to avoid requiring every
# env var that app.config.Settings mandates (Redis, R2, etc.).  The ORM
# models only need Base's registry, which is populated at import time.
# Prefer DATABASE_PUBLIC_URL (reachable from outside Railway's private network)
# and fall back to DATABASE_URL (used inside Railway services).
DATABASE_URL = os.environ.get("DATABASE_PUBLIC_URL") or os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set.")
    sys.exit(1)

# Inject a fake app.config module into sys.modules BEFORE anything imports it.
# The real Settings() requires REDIS_URL, R2_*, OPENROUTER_API_KEY, etc., none
# of which are needed for this script.  By pre-seeding sys.modules we prevent
# the real module from ever loading.
import types
from unittest.mock import MagicMock

_fake_config = types.ModuleType("app.config")
_fake_settings = MagicMock()
_fake_settings.DATABASE_URL = DATABASE_URL
_fake_settings.DEBUG = False
_fake_config.settings = _fake_settings
sys.modules.setdefault("app.config", _fake_config)

# Now we can safely import the models — app.database will see our fake settings,
# and the model file will import Base from app.database without issue.
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402
from app.models.database_models import Project, Video, VideoAnalysis  # noqa: E402

# Build our own engine / session — independent of app.database.engine
engine = create_engine(DATABASE_URL, echo=False)
Session = sessionmaker(bind=engine)

# DRY_RUN defaults to True (safe). If environment variable DRY_RUN is set
# (to any truthy value), force dry-run mode regardless of --apply flag.
# This ensures --apply without DRY_RUN=1 actually commits changes.
ENV_DRY_RUN = bool(os.environ.get("DRY_RUN"))

# ---------------------------------------------------------------------------
# Video IDs to fix
# ---------------------------------------------------------------------------

ERROR_VIDEO_IDS = [
    UUID("1cb3cd8b-5791-48f9-8772-8addbfe7335b"),
    UUID("02501953-0ab8-43ee-a03b-6912cfda4395"),
    UUID("dd8404ce-d4b1-4a72-ac3d-12f99872a5b7"),
    UUID("a286e743-ce45-4db3-865d-f9af4e9af0ef"),
    UUID("80a358e8-3b88-41b2-947f-ca447757cdeb"),
]

STUCK_ANALYZING_ID = UUID("c4aa1531-e2db-465f-8dfe-fd5dd4b43cd8")
TRANSCRIBED_WITH_ERRORED_ANALYSIS_ID = UUID("68721cb8-bfb5-4f41-8179-a7154922c4e3")

ALL_FIX_IDS = ERROR_VIDEO_IDS + [STUCK_ANALYZING_ID, TRANSCRIBED_WITH_ERRORED_ANALYSIS_ID]

# Group 3 — log only, no changes
INFO_ONLY_IDS = {
    UUID("1f25a325-57b4-4977-8c26-7100797aef24"): "transcribed, no analysis record (user never clicked analyze)",
    UUID("4f62c700-4814-4ca3-a53a-2ec42019a582"): "uploaded, never transcribed",
}

CLEAN_STEP_STATUS = {
    "chunk": "pending",
    "infer": "pending",
    "relate": "pending",
    "explain": "pending",
    "activate": "pending",
}


def is_broken(video: Video) -> bool:
    """Return True if this video is in a broken state that we should fix."""
    if video.status == "error":
        return True
    if video.status == "analyzing":
        # Only broken if the analysis record is in error state
        va = video.video_analysis
        if va and va.status == "error":
            return True
    if video.status == "transcribed":
        # Only broken if analysis exists and is in error state
        va = video.video_analysis
        if va and va.status == "error":
            return True
    return False


def reset_video(video: Video) -> bool:
    """
    Reset a broken video to transcribed status. Returns True if changes were made.
    """
    if not is_broken(video):
        print(f"  SKIP  {video.id} — not in a broken state (status={video.status})")
        return False

    print(f"  FIX   {video.id}")
    print(f"         filename: {video.filename}")
    print(f"         video.status: {video.status} -> transcribed")
    print(f"         video.error_message: {video.error_message!r} -> None")

    video.status = "transcribed"
    video.error_message = None

    va = video.video_analysis
    if va:
        print(f"         analysis.status: {va.status} -> pending")
        print(f"         analysis.current_step: {va.current_step} -> chunk")
        print(f"         analysis.step_status: {va.step_status} -> {CLEAN_STEP_STATUS}")
        print(f"         analysis.started_at: {va.started_at} -> None")
        print(f"         analysis.completed_at: {va.completed_at} -> None")
        print(f"         clearing: chunks, inferences, patterns, insights, design_principles")
        print(f"         clearing: chunk/infer/relate/explain/activate _completed_at")

        va.status = "pending"
        va.started_at = None
        va.completed_at = None
        va.current_step = "chunk"
        va.step_status = CLEAN_STEP_STATUS
        flag_modified(va, "step_status")

        # Clear partial analysis data
        va.chunks = None
        va.inferences = None
        va.patterns = None
        va.insights = None
        va.design_principles = None

        # Clear step timestamps
        va.chunk_completed_at = None
        va.infer_completed_at = None
        va.relate_completed_at = None
        va.explain_completed_at = None
        va.activate_completed_at = None
    else:
        print("         (no VideoAnalysis record found — nothing to reset)")

    return True


def fix_planning_projects(session) -> int:
    """Fix projects stuck in 'planning' status. Returns count of projects updated."""
    projects = session.query(Project).filter(Project.status == "planning").all()

    if not projects:
        print("\n--- Step 2: Fix stale projects ---")
        print("  No projects found with status='planning'.")
        return 0

    print(f"\n--- Step 2: Fix stale projects ({len(projects)} in 'planning') ---")
    updated = 0

    for project in projects:
        videos = project.videos
        if not videos:
            print(f"  SKIP  project {project.id} ({project.name}) — no videos")
            continue

        all_analyses_completed = True
        any_ready = False

        for v in videos:
            va = v.video_analysis
            if va and va.status == "completed":
                continue  # This video's analysis is done
            else:
                all_analyses_completed = False
            if v.status in ("transcribed", "analyzed"):
                any_ready = True

        if all_analyses_completed:
            new_status = "completed"
        elif any_ready:
            new_status = "ready"
        else:
            print(f"  SKIP  project {project.id} ({project.name}) — no videos ready or completed")
            continue

        print(f"  FIX   project {project.id} ({project.name})")
        print(f"         status: {project.status} -> {new_status}")
        project.status = new_status
        updated += 1

    return updated


def log_info_only(session):
    """Log Group 3 videos — informational only, no changes."""
    print("\n--- Step 3: Informational (no action) ---")
    for vid, reason in INFO_ONLY_IDS.items():
        video = session.query(Video).filter(Video.id == vid).first()
        if video:
            print(f"  INFO  {vid} — {video.filename}")
            print(f"         status: {video.status}, reason: {reason}")
        else:
            print(f"  WARN  {vid} — not found in database (reason: {reason})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--dry-run",
        action="store_true",
        help="Show the plan without committing changes. This is the default.",
    )
    group.add_argument(
        "--apply",
        action="store_true",
        help="Actually apply changes to the database. Without this flag, "
             "the script is read-only.",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # Default to dry-run unless --apply is passed.
    # Also: if DRY_RUN env var is set, force dry-run regardless of --apply.
    apply = args.apply and not ENV_DRY_RUN
    dry_run = not apply

    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"=== fix_broken_records.py ({mode}) ===\n")

    session = Session()

    try:
        # --- Step 1: Reset broken videos ---
        print("--- Step 1: Reset broken videos ---")
        videos_reset = 0
        videos_skipped = 0

        for vid in ALL_FIX_IDS:
            video = session.query(Video).filter(Video.id == vid).first()
            if not video:
                print(f"  ERROR {vid} — video not found in database!")
                videos_skipped += 1
                continue
            if reset_video(video):
                videos_reset += 1
            else:
                videos_skipped += 1

        # --- Step 2: Fix stale projects ---
        projects_updated = fix_planning_projects(session)

        # --- Step 3: Log info-only videos ---
        log_info_only(session)

        # --- Summary ---
        print(f"\n=== Summary ===")
        print(f"  Videos reset:     {videos_reset}")
        print(f"  Videos skipped:   {videos_skipped}")
        print(f"  Projects updated: {projects_updated}")

        if dry_run:
            print(f"\n  DRY-RUN (use --apply to execute) — rolling back all changes.")
            session.rollback()
        else:
            print(f"\n  Committing changes...")
            session.commit()
            print("  Done.")

    except Exception as e:
        print(f"\nERROR: {e}")
        print("Rolling back all changes.")
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
