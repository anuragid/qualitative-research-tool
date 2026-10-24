"""Re-encrypt every stored BYOK OpenRouter key under the primary ENCRYPTION_KEY.

Run this when rotating ENCRYPTION_KEY (e.g. after the 2026-10-21 Railway
incident -- see docs/production-readiness/runbooks/railway-incident-2026-10.md).

Rotation procedure:
  1. Generate a new key:
       python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  2. Set ENCRYPTION_KEY="<new>,<old>" on backend, worker AND beat; redeploy.
  3. Run this script (dry run first, then --apply).
  4. Set ENCRYPTION_KEY="<new>" on all three; redeploy.

Do NOT swap ENCRYPTION_KEY straight to the new key and skip step 3: every
stored key then fails to decrypt, and byok_service.resolve_byok()
wipes a user's key (encrypted_api_key = None) the first time that happens.

SAFETY: the default is a dry run (decrypts and re-encrypts in memory, writes
nothing). Pass ``--apply`` to commit. Plaintext keys are never printed.

Usage (inside the backend container, which already has DATABASE_URL and
ENCRYPTION_KEY set):

  railway ssh --service backend
  python scripts/reencrypt_byok_keys.py              # dry run
  python scripts/reencrypt_byok_keys.py --apply      # commit
  python scripts/reencrypt_byok_keys.py --list-users # BYOK users to notify
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

# Self-contained on purpose: importing app.services.encryption_service runs
# app/services/__init__.py, which builds app.config.Settings and so needs
# every production env var. MultiFernet below is exactly what
# EncryptionService.rotate() wraps.

_SELECT_KEYS = text(
    "SELECT id, encrypted_api_key FROM users WHERE encrypted_api_key IS NOT NULL"
)
_UPDATE_KEY = text("UPDATE users SET encrypted_api_key = :ct WHERE id = :id")
_SELECT_BYOK_USERS = text(
    "SELECT id, email, key_hint, model_tier FROM users "
    "WHERE encrypted_api_key IS NOT NULL ORDER BY email"
)


@dataclass
class RotationResult:
    rotated: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


def parse_keys(key_str: str) -> list[str]:
    """Split ENCRYPTION_KEY the same way EncryptionService does."""
    return [k.strip() for k in key_str.split(",") if k.strip()]


def reencrypt_all(conn: Connection, keys: list[str], apply: bool) -> RotationResult:
    """Re-encrypt every users.encrypted_api_key under keys[0], the primary.

    Rows that no configured key can decrypt are reported in ``failed`` and
    left untouched. Each rotated ciphertext is checked to decrypt under the
    primary key alone before it is written, so dropping the old key in step 4
    cannot strand a row.
    """
    fernets = [Fernet(k.encode()) for k in keys]
    multi, primary = MultiFernet(fernets), fernets[0]
    result = RotationResult()
    rows = conn.execute(_SELECT_KEYS).fetchall()
    for user_id, ciphertext in rows:
        try:
            new_ciphertext = multi.rotate(ciphertext.encode()).decode()
            primary.decrypt(new_ciphertext.encode())
        except InvalidToken:
            result.failed.append(user_id)
            continue
        if apply:
            conn.execute(_UPDATE_KEY, {"ct": new_ciphertext, "id": user_id})
        result.rotated.append(user_id)
    return result


def list_byok_users(conn: Connection) -> list[tuple]:
    """Users with a stored key -- they must revoke it at openrouter.ai."""
    return conn.execute(_SELECT_BYOK_USERS).fetchall()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="commit the re-encrypted keys")
    parser.add_argument(
        "--list-users",
        action="store_true",
        help="print id, email, key hint of every user with a stored key, then exit",
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        return 2
    engine = create_engine(database_url)

    if args.list_users:
        with engine.connect() as conn:
            users = list_byok_users(conn)
        print("id,email,key_hint,model_tier")
        for user_id, email, key_hint, model_tier in users:
            print(f"{user_id},{email},...{key_hint or ''},{model_tier}")
        print(f"# {len(users)} user(s) with a stored OpenRouter key", file=sys.stderr)
        return 0

    keys = parse_keys(os.environ.get("ENCRYPTION_KEY", ""))
    if len(keys) < 2:
        print(
            'ERROR: ENCRYPTION_KEY must be "<new>,<old>" while rotating '
            f"(found {len(keys)} key(s)). See step 2 in this script's docstring.",
            file=sys.stderr,
        )
        return 2

    # One transaction: either every key is re-encrypted or none is.
    with engine.connect() as conn:
        result = reencrypt_all(conn, keys, apply=args.apply)
        if args.apply:
            conn.commit()

    mode = "APPLIED" if args.apply else "DRY RUN (nothing written; pass --apply)"
    print(f"{mode}: {len(result.rotated)} key(s) re-encrypted under the new primary key")
    if result.failed:
        print(
            f"WARNING: {len(result.failed)} key(s) could not be decrypted with any "
            "configured key and were left as-is. These users must re-enter their key:",
            file=sys.stderr,
        )
        for user_id in result.failed:
            print(f"  {user_id}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
