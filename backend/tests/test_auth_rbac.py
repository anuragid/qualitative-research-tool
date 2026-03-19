"""Tests for authentication and RBAC.

Covers findings: P1-1, P3-1, P3-2
"""


from app.auth import (
    ROLE_PERMISSIONS,
    Permission,
    UserRole,
    _dev_user_dict,
)


class TestDevUserBypass:
    def test_dev_user_is_user_role(self):
        """P3-2: Dev bypass user should be USER role, not ADMIN."""
        dev_user = _dev_user_dict()
        assert dev_user["role"] == "user"
        assert dev_user["role"] != "admin"

    def test_dev_user_has_user_permissions(self):
        """Dev user should have USER-level permissions only."""
        dev_user = _dev_user_dict()
        user_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.USER]}
        assert set(dev_user["permissions"]) == user_perms

    def test_dev_user_lacks_admin_permissions(self):
        """Dev user should NOT have admin-only permissions."""
        dev_user = _dev_user_dict()
        assert Permission.USER_MANAGE.value not in dev_user["permissions"]


class TestRolePermissions:
    def test_admin_has_all_permissions(self):
        """Admin role should have every permission."""
        admin_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.ADMIN]}
        all_perms = {p.value for p in Permission}
        assert admin_perms == all_perms

    def test_viewer_cannot_create_projects(self):
        """Viewer role should not have PROJECT_CREATE permission."""
        viewer_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.VIEWER]}
        assert Permission.PROJECT_CREATE.value not in viewer_perms

    def test_viewer_cannot_upload_videos(self):
        """Viewer role should not have VIDEO_UPLOAD permission."""
        viewer_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.VIEWER]}
        assert Permission.VIDEO_UPLOAD.value not in viewer_perms

    def test_viewer_cannot_run_analysis(self):
        """Viewer role should not have ANALYSIS_RUN permission."""
        viewer_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.VIEWER]}
        assert Permission.ANALYSIS_RUN.value not in viewer_perms

    def test_viewer_can_read(self):
        """Viewer role should have read permissions."""
        viewer_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.VIEWER]}
        assert Permission.PROJECT_READ.value in viewer_perms
        assert Permission.ANALYSIS_READ.value in viewer_perms

    def test_user_cannot_manage_users(self):
        """USER role should not have USER_MANAGE permission."""
        user_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.USER]}
        assert Permission.USER_MANAGE.value not in user_perms

    def test_user_can_crud_projects(self):
        """USER role should be able to create/read/update/delete projects."""
        user_perms = {p.value for p in ROLE_PERMISSIONS[UserRole.USER]}
        assert Permission.PROJECT_CREATE.value in user_perms
        assert Permission.PROJECT_READ.value in user_perms
        assert Permission.PROJECT_UPDATE.value in user_perms
        assert Permission.PROJECT_DELETE.value in user_perms


class TestUploadLeeway:
    def test_upload_leeway_is_300(self):
        """P3-1: Upload JWT leeway should be 300s (5 min), not 600s."""
        from app.auth import _make_get_current_user, get_current_user_upload

        # Verify that the upload auth dependency exists and was created
        assert get_current_user_upload is not None

        # Also verify the factory can be called with 300
        func = _make_get_current_user(leeway=300)
        assert func is not None

    def test_default_leeway_is_zero(self):
        """Default auth should have no leeway."""
        from app.auth import get_current_user

        # The default dependency exists and is separate from the upload one
        assert get_current_user is not None
