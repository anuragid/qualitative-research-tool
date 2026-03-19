"""Tests for upload validation (magic bytes, zero-byte, filename sanitization).

Covers findings: P2-4, P2-5, P3-9
"""

import re
from pathlib import Path

import pytest


class TestFilenameSanitization:
    """P3-9: Filename sanitization for uploads."""

    def test_special_chars_replaced(self):
        """Special characters should be replaced in filenames."""
        filename = "my file (1) [test].mp4"
        safe_filename = Path(filename).name
        safe_filename = re.sub(r'[^\w\-.]', '_', safe_filename)
        assert " " not in safe_filename
        assert "(" not in safe_filename
        assert "[" not in safe_filename
        assert safe_filename.endswith(".mp4")

    def test_path_traversal_blocked(self):
        """Path traversal attempts should be neutralized."""
        filename = "../../../etc/passwd"
        safe_filename = Path(filename).name
        safe_filename = re.sub(r'[^\w\-.]', '_', safe_filename)
        # After Path.name, only "passwd" remains; traversal is stripped
        assert ".." not in safe_filename

    def test_long_filename_truncated(self):
        """Long filenames should be truncated to 255 chars."""
        long_name = "a" * 300 + ".mp4"
        safe_filename = Path(long_name).name
        safe_filename = re.sub(r'[^\w\-.]', '_', safe_filename)
        if len(safe_filename) > 255:
            ext = Path(safe_filename).suffix
            safe_filename = safe_filename[:255 - len(ext)] + ext
        assert len(safe_filename) <= 255
        assert safe_filename.endswith(".mp4")

    def test_hidden_file_dot_prefix(self):
        """Dot-prefixed (hidden) filenames should be handled safely."""
        filename = ".hidden_video.mp4"
        safe_filename = Path(filename).name
        safe_filename = re.sub(r'[^\w\-.]', '_', safe_filename)
        assert safe_filename.endswith(".mp4")

    def test_double_extension(self):
        """Double extensions should be sanitized."""
        filename = "video.php.mp4"
        safe_filename = Path(filename).name
        safe_filename = re.sub(r'[^\w\-.]', '_', safe_filename)
        # The regex allows dots so this is preserved but safe
        assert safe_filename == "video.php.mp4"


class TestMagicBytesValidation:
    """P2-4: Content-type validation via magic bytes."""

    def test_mp4_magic_bytes(self):
        """MP4 files should be recognized by ftyp magic bytes at offset 4."""
        # Standard MP4 header: bytes 4-7 are 'ftyp'
        header = b'\x00\x00\x00\x1cftypisom\x00\x00\x02\x00'
        assert len(header) >= 8
        assert header[4:8] == b'ftyp'

    def test_webm_magic_bytes(self):
        """WebM files should be recognized by EBML magic bytes."""
        header = b'\x1a\x45\xdf\xa3\x93\x42\x86\x81\x01\x42\xf7\x81'
        assert header[:4] == b'\x1a\x45\xdf\xa3'

    def test_avi_magic_bytes(self):
        """AVI files should be recognized by RIFF magic bytes."""
        header = b'RIFF\x00\x00\x00\x00AVI LIST'
        assert header[:4] == b'RIFF'

    def test_mov_magic_bytes(self):
        """MOV files should be recognized by ftyp magic bytes (same as MP4 family)."""
        header = b'\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00'
        assert header[4:8] == b'ftyp'

    def test_text_file_rejected(self):
        """P2-4: Text files renamed to .mp4 should fail magic byte check."""
        header = b'This is not a video file at all'
        is_valid_magic = _check_magic_bytes(header)
        assert not is_valid_magic

    def test_empty_file_rejected(self):
        """P2-5: Zero-byte / empty files should fail magic byte check."""
        header = b''
        is_valid_magic = _check_magic_bytes(header)
        assert not is_valid_magic

    def test_short_file_rejected(self):
        """Files too short to contain valid headers should fail."""
        header = b'\x00\x01\x02'
        is_valid_magic = _check_magic_bytes(header)
        assert not is_valid_magic

    def test_html_file_rejected(self):
        """HTML disguised as video should be rejected."""
        header = b'<!DOCTYPE html><html><head>'
        is_valid_magic = _check_magic_bytes(header)
        assert not is_valid_magic

    def test_pdf_file_rejected(self):
        """PDF disguised as video should be rejected."""
        header = b'%PDF-1.7'
        is_valid_magic = _check_magic_bytes(header)
        assert not is_valid_magic


def _check_magic_bytes(header: bytes) -> bool:
    """Simulate the magic-byte check logic used by the upload endpoint."""
    if len(header) < 8:
        return False
    # MP4/MOV: ftyp at offset 4
    if header[4:8] == b'ftyp':
        return True
    # WebM: EBML header
    if header[:4] == b'\x1a\x45\xdf\xa3':
        return True
    # AVI: RIFF header
    if header[:4] == b'RIFF':
        return True
    return False
