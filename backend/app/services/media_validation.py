"""Shared media-file content validation (magic-byte sniffing).

Both upload paths validate that the *bytes* of an uploaded file actually
look like an allowed media container, not just that the filename extension
or declared Content-Type claims so:

  * the legacy multipart ``POST /{project_id}/upload`` path reads the first
    bytes off the in-memory ``UploadFile`` and checks them here;
  * the presigned-PUT ``POST /{video_id}/confirm-upload`` path does a ranged
    GET of the first bytes from R2 (the client PUT goes straight to R2,
    bypassing the app server) and checks them here.

Keeping the signature table in one place means the two paths can never
drift — a format accepted by one is accepted by the other. This module is
import-light (no boto3 / FastAPI) so it can be unit-tested in isolation.
"""

from __future__ import annotations

# Number of leading bytes the confirm-upload path should fetch from R2 and
# the multipart path should read off the UploadFile. 12 bytes is enough for
# every signature below (the longest probe is the ftyp box at offset 4..8).
MAGIC_BYTE_PROBE_LEN = 12


def is_valid_media_header(header: bytes) -> bool:
    """Return ``True`` iff ``header`` starts with a known media signature.

    Recognised containers (matching ``ALLOWED_VIDEO_EXTENSIONS`` /
    ``ALLOWED_AUDIO_EXTENSIONS`` and the allowed Content-Type set):

      * MP4 / MOV / M4A — ISO base-media ``ftyp`` box at offset 4
      * WebM / MKV — EBML header ``1A 45 DF A3``
      * AVI (video) / WAV (audio) — RIFF container ``RIFF``
      * MP3 with ID3v2 tag — ``ID3``
      * MP3 frame sync / AAC ADTS — ``FF Ex`` (11-bit sync)
      * OGG (Vorbis/Opus) — ``OggS``
      * FLAC — ``fLaC``

    A header shorter than 2 bytes (empty / truncated) is rejected.
    """
    if len(header) < 2:
        return False

    # Video: MP4 / MOV / M4A (ISO BMFF ``ftyp`` box at offset 4).
    if len(header) >= 8 and header[4:8] == b"ftyp":
        return True
    # Video: WebM / MKV (EBML).
    if header[:4] == b"\x1a\x45\xdf\xa3":
        return True
    # Video: AVI / Audio: WAV (both RIFF-based).
    if header[:4] == b"RIFF":
        return True
    # Audio: MP3 with an ID3v2 tag.
    if header[:3] == b"ID3":
        return True
    # Audio: MP3 frame sync / AAC ADTS (0xFF followed by 0xE0-set top bits).
    if header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:
        return True
    # Audio: OGG Vorbis / Opus.
    if header[:4] == b"OggS":
        return True
    # Audio: FLAC.
    if header[:4] == b"fLaC":
        return True

    return False
