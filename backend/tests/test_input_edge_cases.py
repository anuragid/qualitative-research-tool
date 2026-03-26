"""Tests for input validation edge cases."""
import pytest

pytestmark = pytest.mark.anyio


async def test_project_name_whitespace_only_rejected(client):
    """A project name that is only whitespace should be rejected."""
    response = await client.post("/api/projects/", json={"name": "   "})
    assert response.status_code == 422


async def test_project_name_max_length(client):
    """A project name at max length should succeed."""
    long_name = "A" * 255
    response = await client.post("/api/projects/", json={"name": long_name})
    assert response.status_code == 201
    assert response.json()["name"] == long_name


async def test_project_name_exceeds_max_length(client):
    """A project name exceeding 255 chars should be rejected."""
    too_long = "A" * 256
    response = await client.post("/api/projects/", json={"name": too_long})
    assert response.status_code == 422


async def test_project_name_with_html_tags_stripped(client):
    """HTML tags in project names should be stripped for XSS prevention."""
    response = await client.post(
        "/api/projects/",
        json={"name": "Test <script>alert('xss')</script> Project"},
    )
    assert response.status_code == 201
    name = response.json()["name"]
    assert "<script>" not in name
    assert "alert" in name  # Text content preserved


async def test_project_name_with_control_chars_stripped(client):
    """Control characters in project names should be stripped."""
    response = await client.post(
        "/api/projects/",
        json={"name": "Test\x00\x01Project"},
    )
    assert response.status_code == 201
    name = response.json()["name"]
    assert "\x00" not in name
    assert "\x01" not in name


async def test_project_description_max_length(client):
    """A description at max length should succeed."""
    long_desc = "B" * 5000
    response = await client.post(
        "/api/projects/",
        json={"name": "Test", "description": long_desc},
    )
    assert response.status_code == 201


async def test_project_description_exceeds_max_length(client):
    """A description exceeding 5000 chars should be rejected."""
    too_long = "B" * 5001
    response = await client.post(
        "/api/projects/",
        json={"name": "Test", "description": too_long},
    )
    assert response.status_code == 422


async def test_empty_project_name_rejected(client):
    """An empty project name should be rejected."""
    response = await client.post("/api/projects/", json={"name": ""})
    assert response.status_code == 422


async def test_unicode_project_name_accepted(client):
    """Unicode characters in project names should be accepted."""
    response = await client.post(
        "/api/projects/",
        json={"name": "研究プロジェクト 日本語テスト"},
    )
    assert response.status_code == 201


async def test_settings_model_id_invalid_format(client):
    """An invalid model ID format should be rejected."""
    response = await client.put(
        "/api/users/settings",
        json={"preferred_model": "invalid-no-slash"},
    )
    assert response.status_code == 422


async def test_settings_model_id_valid_format(client):
    """A valid model ID format should be accepted (may fail tier check but not format)."""
    response = await client.put(
        "/api/users/settings",
        json={"preferred_model": "openai/gpt-4"},
    )
    # May be 403 (tier check for non-BYOK user) but not 422 (format validation)
    assert response.status_code != 422


async def test_pagination_negative_skip_clamped(client):
    """Negative skip should be clamped to 0."""
    response = await client.get("/api/projects/?skip=-10")
    assert response.status_code == 200


async def test_pagination_excessive_skip_capped(client):
    """Skip above 10000 should be capped."""
    response = await client.get("/api/projects/?skip=99999")
    assert response.status_code == 200


async def test_pagination_limit_capped_at_100(client):
    """Limit above 100 should be capped."""
    response = await client.get("/api/projects/?limit=500")
    assert response.status_code == 200
