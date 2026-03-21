"""Logging utilities for safe redaction of sensitive data."""

import re


def mask_key(key: str) -> str:
    """Mask an API key for safe logging, showing only the last 4 characters.

    Examples:
        >>> mask_key("sk-or-v1-abc123xyz")
        '****xyz'
        >>> mask_key("short")
        '****'
        >>> mask_key("")
        '****'
    """
    if len(key) > 4:
        return "****" + key[-4:]
    return "****"


# Pattern that matches common file path fragments in error messages.
# Used by error response hardening to redact internal paths before
# sending error details to clients.
_PATH_PATTERN = re.compile(
    r"(/app/|/Users/|/home/|/var/|/tmp/|/opt/|/usr/)"
    r"[^\s'\",;)}\]]*",
)


def redact_paths(message: str) -> str:
    """Replace file system paths in an error message with '[redacted path]'.

    This prevents accidental disclosure of internal directory structures
    in error responses sent to clients.

    The original message is returned unchanged if no path patterns are found.
    """
    return _PATH_PATTERN.sub("[redacted path]", message)
