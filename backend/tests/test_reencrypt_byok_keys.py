"""Tests for scripts/reencrypt_byok_keys.py (ENCRYPTION_KEY rotation)."""

import importlib.util
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import create_engine, text

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "reencrypt_byok_keys.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("reencrypt_byok_keys", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # @dataclass looks its module up here
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def keys():
    return Fernet.generate_key().decode(), Fernet.generate_key().decode()


@pytest.fixture
def conn(tmp_path, keys):
    """users table with two keys under the old ENCRYPTION_KEY, one corrupt, one empty."""
    _, old_key = keys
    old = Fernet(old_key.encode())
    engine = create_engine(f"sqlite:///{tmp_path / 'rotate.db'}")
    with engine.connect() as c:
        c.execute(text(
            "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, "
            "encrypted_api_key TEXT, key_hint TEXT, model_tier TEXT)"
        ))
        rows = [
            ("user_a", "a@example.com", old.encrypt(b"sk-or-v1-aaaa").decode(), "aaaa", "byok"),
            ("user_b", "b@example.com", old.encrypt(b"sk-or-v1-bbbb").decode(), "bbbb", "byok"),
            ("user_bad", "bad@example.com", "not-a-fernet-token", "zzzz", "byok"),
            ("user_none", "none@example.com", None, None, "included"),
        ]
        for row in rows:
            c.execute(
                text("INSERT INTO users VALUES (:id, :email, :ct, :hint, :tier)"),
                dict(zip(["id", "email", "ct", "hint", "tier"], row)),
            )
        c.commit()
        yield c


def _stored(conn, user_id):
    return conn.execute(
        text("SELECT encrypted_api_key FROM users WHERE id = :id"), {"id": user_id}
    ).scalar()


def test_apply_reencrypts_under_new_key_only(conn, keys):
    new_key, old_key = keys
    script = _load_script()
    result = script.reencrypt_all(conn, [new_key, old_key], apply=True)

    assert sorted(result.rotated) == ["user_a", "user_b"]
    assert result.failed == ["user_bad"]
    new = Fernet(new_key.encode())
    assert new.decrypt(_stored(conn, "user_a").encode()) == b"sk-or-v1-aaaa"
    assert new.decrypt(_stored(conn, "user_b").encode()) == b"sk-or-v1-bbbb"
    # Old key alone can no longer read rotated rows, so it is safe to drop.
    with pytest.raises(InvalidToken):
        Fernet(old_key.encode()).decrypt(_stored(conn, "user_a").encode())


def test_app_reads_rotated_keys_after_old_key_is_dropped(conn, keys):
    new_key, old_key = keys
    script = _load_script()
    script.reencrypt_all(conn, [new_key, old_key], apply=True)

    with patch.dict(os.environ, {"ENCRYPTION_KEY": new_key, "APP_ENV": "test"}):
        from app.services.encryption_service import EncryptionService
        service = EncryptionService()
    assert service.decrypt(_stored(conn, "user_a")) == "sk-or-v1-aaaa"


def test_dry_run_writes_nothing(conn, keys):
    new_key, old_key = keys
    before = _stored(conn, "user_a")
    script = _load_script()
    result = script.reencrypt_all(conn, [new_key, old_key], apply=False)

    assert sorted(result.rotated) == ["user_a", "user_b"]
    assert _stored(conn, "user_a") == before


def test_undecryptable_rows_are_left_untouched(conn, keys):
    new_key, old_key = keys
    script = _load_script()
    script.reencrypt_all(conn, [new_key, old_key], apply=True)

    assert _stored(conn, "user_bad") == "not-a-fernet-token"


def test_list_byok_users_excludes_users_without_a_key(conn):
    script = _load_script()
    users = script.list_byok_users(conn)

    assert [u[0] for u in users] == ["user_a", "user_b", "user_bad"]


def test_main_refuses_single_key(keys, capsys):
    new_key, _ = keys
    script = _load_script()
    env = {"ENCRYPTION_KEY": new_key, "DATABASE_URL": "sqlite://"}
    with patch.dict(os.environ, env), patch("sys.argv", ["reencrypt_byok_keys.py"]):
        assert script.main() == 2
    assert "<new>,<old>" in capsys.readouterr().err
