"""Input sanitization utilities for LLM prompt safety.

Provides functions to sanitize user-controlled content before interpolating
it into LLM prompts. This prevents prompt injection attacks where a user
embeds instructions (e.g. "Ignore all previous instructions...") in fields
like project_description or speaker_name.
"""

import re

# Matches Unicode control characters except tab (\x09), newline (\x0a), carriage return (\x0d)
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")

# XML tags used as prompt delimiters. User content must not contain these
# closing tags, or the delimiter boundary would be broken.
_DELIMITER_TAGS = [
    "research_context",
    "speaker_label",
    "transcript",
    "user_input",
]

# Build a regex that matches any opening or closing variant of the delimiter tags
_DELIMITER_TAG_RE = re.compile(
    r"</?(?:" + "|".join(re.escape(tag) for tag in _DELIMITER_TAGS) + r")\s*/?>",
    re.IGNORECASE,
)


def sanitize_for_prompt(text: str, max_length: int = 0) -> str:
    """Sanitize user-controlled text before inserting into an LLM prompt.

    Steps:
    1. Remove null bytes and control characters (except newlines, tabs, CRs).
    2. Escape/neutralize XML-like tags that match our prompt delimiter names,
       so a user cannot break out of the XML boundary.
    3. Optionally truncate to *max_length* characters (0 = no limit).

    Args:
        text: The raw user input string.
        max_length: Maximum allowed character count. 0 means unlimited.

    Returns:
        Sanitized string safe for prompt interpolation.
    """
    if not text:
        return ""

    # Step 1: Strip control characters (keep \t, \n, \r)
    text = _CONTROL_CHAR_RE.sub("", text)

    # Step 2: Neutralize delimiter tags by replacing angle brackets
    # e.g. "</research_context>" becomes "[/research_context]"
    text = _DELIMITER_TAG_RE.sub(
        lambda m: m.group(0).replace("<", "[").replace(">", "]"),
        text,
    )

    # Step 3: Truncate if requested
    if max_length > 0 and len(text) > max_length:
        text = text[:max_length]

    return text
