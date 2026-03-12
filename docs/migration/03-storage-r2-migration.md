# 03 - Video Storage Migration: AWS S3 to Cloudflare R2

**Status:** Not started
**Estimated effort:** 2-4 hours for backend changes, 1 hour for testing
**Dependencies:** Cloudflare account with R2 enabled

---

## Overview

The application currently uses AWS S3 (via boto3) for video storage. Cloudflare R2 is S3-API-compatible, which means nearly all existing boto3 code works unchanged. The migration requires:

1. Creating an R2 bucket and API credentials
2. Updating 1 file significantly (`s3_service.py`)
3. Updating config (`config.py`) with new env vars
4. Minor adjustments to presigned URL handling
5. Optional: renaming `s3_key`/`s3_url` database fields

**Key insight:** boto3 stays in `requirements.txt`. We point it at R2's S3-compatible endpoint instead of AWS. The upload, download, presigned URL, and delete operations all use standard S3 APIs that R2 supports.

---

## Table of Contents

1. [Cloudflare R2 Setup](#1-cloudflare-r2-setup)
2. [Backend Code Changes](#2-backend-code-changes)
3. [Video Upload Flow](#3-video-upload-flow)
4. [Video Playback](#4-video-playback)
5. [Lifecycle Policies](#5-lifecycle-policies)
6. [File Validation and Security](#6-file-validation-and-security)
7. [Video Transcoding (Optional)](#7-video-transcoding-optional-enhancement)
8. [Migration of Existing Videos](#8-migration-of-existing-videos)
9. [Environment Variables](#9-environment-variables)
10. [Testing](#10-testing)
11. [Backup Strategy](#11-backup-strategy)
12. [Cost Monitoring](#12-cost-monitoring)

---

## 1. Cloudflare R2 Setup

### 1.1 Create the R2 Bucket

1. Log into the Cloudflare dashboard at `https://dash.cloudflare.com`
2. Select your account, then navigate to **R2 Object Storage** in the left sidebar
3. Click **Create bucket**
4. Bucket name: `qualitative-research-videos`
   - Must be globally unique, lowercase, no underscores
   - If taken, use `qrt-videos-<your-identifier>` (e.g., `qrt-videos-idstuart`)
5. Location hint: **Automatic** (recommended) or **Eastern North America** if most users are US-based
   - R2 automatically places data close to where it is accessed most
   - The location hint only influences initial placement, not a hard constraint
6. Click **Create bucket**

### 1.2 Create R2 API Tokens (S3 Compatibility)

R2 provides S3-compatible API credentials separate from the general Cloudflare API.

1. In the R2 dashboard, click **Manage R2 API Tokens** (top right, or under Settings)
2. Click **Create API token**
3. Token name: `qualitative-research-backend`
4. Permissions: **Object Read & Write**
5. Specify bucket: Select `qualitative-research-videos` (do NOT use "Apply to all buckets")
6. TTL: Leave as "No expiration" for now (rotate periodically in production)
7. Click **Create API Token**
8. **Save these values immediately** (they are shown only once):
   - **Access Key ID** (looks like a 20-character alphanumeric string)
   - **Secret Access Key** (looks like a 40-character alphanumeric string)
9. Also note your **Account ID** from the R2 dashboard URL or the R2 overview page
   - It is the 32-character hex string in the URL: `https://dash.cloudflare.com/<ACCOUNT_ID>/r2`

### 1.3 CORS Configuration

CORS must be configured on the R2 bucket for two scenarios:
- **Direct browser uploads** (PUT) if using the presigned upload flow
- **Video playback** (GET) from the frontend domain

1. In the R2 dashboard, select your bucket
2. Go to **Settings** tab
3. Under **CORS Policy**, click **Edit CORS policy**
4. Add the following JSON configuration:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://your-production-domain.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length",
      "x-amz-content-sha256",
      "x-amz-date",
      "Authorization"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

**Notes:**
- Replace `https://your-production-domain.com` with the actual frontend URL when deployed
- `x-amz-content-sha256` and `x-amz-date` are needed for presigned PUT uploads from the browser
- `ETag` is exposed so the frontend can confirm upload completion
- The `localhost` origins are for development; remove them in production or keep them if developers test against the real bucket

---

## 2. Backend Code Changes

### 2.1 config.py Changes

**File:** `backend/app/config.py`

Replace the AWS configuration block with R2 equivalents. The old AWS settings had no defaults (except `AWS_REGION`), so the new R2 settings follow the same pattern.

**Current code (lines 37-41):**
```python
# AWS
AWS_ACCESS_KEY_ID: str
AWS_SECRET_ACCESS_KEY: str
AWS_REGION: str = "us-east-1"
AWS_BUCKET_NAME: str
```

**Replace with:**
```python
# Cloudflare R2 (S3-compatible storage)
R2_ACCESS_KEY_ID: str
R2_SECRET_ACCESS_KEY: str
R2_ACCOUNT_ID: str
R2_BUCKET_NAME: str
R2_ENDPOINT_URL: str = ""  # Computed from R2_ACCOUNT_ID if not set

@property
def r2_endpoint(self) -> str:
    """Get R2 S3-compatible endpoint URL."""
    if self.R2_ENDPOINT_URL:
        return self.R2_ENDPOINT_URL
    return f"https://{self.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
```

**Why `R2_ENDPOINT_URL` is separate:** It allows overriding for local testing with MinIO (e.g., `http://localhost:9000`). In production, it is computed automatically from `R2_ACCOUNT_ID`.

### 2.2 s3_service.py Modifications

**File:** `backend/app/services/s3_service.py`

This is the only file with significant changes. R2 is S3-compatible, so boto3 operations (upload, download, presigned URLs, delete, head) all work. The changes are:

1. Point boto3 at the R2 endpoint
2. Update credentials references
3. Force `signature_version='s3v4'` (R2 requires AWS Signature V4)
4. Update URL construction (R2 does not use the `bucket.s3.region.amazonaws.com` URL pattern)

**Full replacement for `s3_service.py`:**

```python
"""Cloudflare R2 storage service for video upload and management (S3-compatible)."""

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from typing import BinaryIO, Optional
import logging
from pathlib import Path
import uuid

from app.config import settings

logger = logging.getLogger(__name__)


class StorageService:
    """Service for interacting with Cloudflare R2 via S3-compatible API."""

    def __init__(self):
        """Initialize S3-compatible client pointed at Cloudflare R2."""
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=BotoConfig(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
            region_name="auto",  # R2 uses "auto" as the region
        )
        self.bucket_name = settings.R2_BUCKET_NAME

    def upload_video(
        self,
        file: BinaryIO,
        filename: str,
        project_id: str,
    ) -> tuple[str, str]:
        """
        Upload video file to R2.

        Args:
            file: File object to upload
            filename: Original filename
            project_id: Project ID for organizing files

        Returns:
            Tuple of (storage_key, storage_url)

        Raises:
            Exception: If upload fails
        """
        try:
            # Generate unique storage key
            file_extension = Path(filename).suffix
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            storage_key = f"projects/{project_id}/videos/{unique_filename}"

            # Upload file
            self.s3_client.upload_fileobj(
                file,
                self.bucket_name,
                storage_key,
                ExtraArgs={
                    "ContentType": self._get_content_type(file_extension),
                    # Note: R2 supports custom metadata via x-amz-meta-* headers
                    "Metadata": {
                        "original_filename": filename,
                        "project_id": project_id,
                    }
                }
            )

            # Construct a reference URL (not publicly accessible without presigned URL)
            storage_url = f"{settings.r2_endpoint}/{self.bucket_name}/{storage_key}"

            logger.info(f"Uploaded video to R2: {storage_key}")
            return storage_key, storage_url

        except ClientError as e:
            logger.error(f"Error uploading to R2: {e}")
            raise Exception(f"Failed to upload video to R2: {str(e)}")

    def get_presigned_url(
        self,
        s3_key: str,
        expiration: int = 3600
    ) -> str:
        """
        Generate a presigned URL for accessing a video.

        Works identically to AWS S3 presigned URLs. R2 supports
        AWS Signature V4 presigned URLs natively.

        Args:
            s3_key: Object key (kept as s3_key for backward compatibility)
            expiration: URL expiration time in seconds (default 1 hour)

        Returns:
            Presigned URL string

        Raises:
            Exception: If URL generation fails
        """
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": s3_key,
                },
                ExpiresIn=expiration
            )
            logger.info(f"Generated presigned URL for: {s3_key}")
            return url

        except ClientError as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise Exception(f"Failed to generate presigned URL: {str(e)}")

    def get_presigned_upload_url(
        self,
        storage_key: str,
        content_type: str = "video/mp4",
        expiration: int = 900,
    ) -> str:
        """
        Generate a presigned URL for direct browser upload to R2.

        This allows the frontend to upload directly to R2 without
        proxying through the backend, saving compute and bandwidth.

        Args:
            storage_key: Object key where the file will be stored
            content_type: MIME type of the file being uploaded
            expiration: URL expiration in seconds (default 15 minutes)

        Returns:
            Presigned PUT URL string
        """
        try:
            url = self.s3_client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": storage_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expiration,
            )
            logger.info(f"Generated presigned upload URL for: {storage_key}")
            return url

        except ClientError as e:
            logger.error(f"Error generating presigned upload URL: {e}")
            raise Exception(f"Failed to generate presigned upload URL: {str(e)}")

    def download_video(self, s3_key: str, local_path: str) -> str:
        """
        Download video from R2 to local file.

        Args:
            s3_key: Object key
            local_path: Local file path to save to

        Returns:
            Local file path

        Raises:
            Exception: If download fails
        """
        try:
            self.s3_client.download_file(
                self.bucket_name,
                s3_key,
                local_path
            )
            logger.info(f"Downloaded video from R2: {s3_key} -> {local_path}")
            return local_path

        except ClientError as e:
            logger.error(f"Error downloading from R2: {e}")
            raise Exception(f"Failed to download video from R2: {str(e)}")

    def delete_video(self, s3_key: str) -> bool:
        """
        Delete video from R2.

        Args:
            s3_key: Object key

        Returns:
            True if successful

        Raises:
            Exception: If deletion fails
        """
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            logger.info(f"Deleted video from R2: {s3_key}")
            return True

        except ClientError as e:
            logger.error(f"Error deleting from R2: {e}")
            raise Exception(f"Failed to delete video from R2: {str(e)}")

    def check_video_exists(self, s3_key: str) -> bool:
        """
        Check if video exists in R2.

        Args:
            s3_key: Object key

        Returns:
            True if exists, False otherwise
        """
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            return True
        except ClientError:
            return False

    @staticmethod
    def _get_content_type(file_extension: str) -> str:
        """Get MIME type for video file extension."""
        content_types = {
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".avi": "video/x-msvideo",
        }
        return content_types.get(file_extension.lower(), "application/octet-stream")


# Global service instance
# Keep the name as s3_service for backward compatibility with imports
s3_service = StorageService()
```

**What changed vs. the original `s3_service.py`:**

| Aspect | Old (S3) | New (R2) |
|--------|----------|----------|
| `__init__` credentials | `settings.AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `settings.R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| `__init__` endpoint | None (defaults to AWS) | `endpoint_url=settings.r2_endpoint` |
| `__init__` region | `settings.AWS_REGION` | `"auto"` (R2 convention) |
| `__init__` config | None | `BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"})` |
| Class name | `S3Service` | `StorageService` (cosmetic, optional) |
| `upload_video` URL | `https://{bucket}.s3.{region}.amazonaws.com/{key}` | `{endpoint}/{bucket}/{key}` |
| New method | N/A | `get_presigned_upload_url()` for direct browser uploads |
| Global instance name | `s3_service` | `s3_service` (kept for import compatibility) |

**Critical detail:** The `config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"})` is required. R2 only supports Signature V4 and path-style addressing (not virtual-hosted-style).

### 2.3 Files That Import s3_service (No Changes Needed)

These files import `from app.services.s3_service import s3_service` and call its methods. Because the global instance name and method signatures are unchanged, **no modifications are required**:

- `backend/app/routes/videos.py` -- calls `s3_service.upload_video()`, `s3_service.get_presigned_url()`, `s3_service.delete_video()`
- `backend/app/tasks/transcription_tasks.py` -- calls `s3_service.get_presigned_url()` with 7200s expiration for AssemblyAI

### 2.4 Video Model: s3_key / s3_url Field Names

**File:** `backend/app/models/database_models.py` (lines 59-60)

The `Video` model has two S3-named fields:

```python
s3_key = Column(Text, nullable=False)
s3_url = Column(Text, nullable=False)
```

**Decision: Keep `s3_key`/`s3_url` as-is (recommended for MVP)**

Renaming to `storage_key`/`storage_url` would require:
- A new Alembic migration to rename columns
- Updating the `Video` model
- Updating `VideoUploadResponse` and `VideoResponse` Pydantic schemas (`backend/app/models/schemas.py`, lines 72-73 and 87-88)
- Updating `frontend/src/types/index.ts` (lines 39-40, `s3_key` and `s3_url`)
- Updating any frontend code that references these field names
- Updating the test file (`backend/test_video_upload.py`, line 78)

**If you do rename later**, here is the Alembic migration:

```python
"""Rename s3 fields to storage fields."""

from alembic import op

def upgrade():
    op.alter_column('videos', 's3_key', new_column_name='storage_key')
    op.alter_column('videos', 's3_url', new_column_name='storage_url')

def downgrade():
    op.alter_column('videos', 'storage_key', new_column_name='s3_key')
    op.alter_column('videos', 'storage_url', new_column_name='s3_url')
```

Then update the model, both Pydantic schemas, the frontend `Video` interface, and all references. This is purely cosmetic and can be done in a follow-up PR.

### 2.5 Presigned URLs

Presigned URLs are the backbone of this application's video access. R2 supports them identically to S3 when using Signature V4.

**Three presigned URL use cases:**

| Use Case | Method | Expiration | Who Uses It |
|----------|--------|------------|-------------|
| Video playback | `get_presigned_url(s3_key, 3600)` | 1 hour | Frontend video player |
| Direct browser upload | `get_presigned_upload_url(key, content_type, 900)` | 15 minutes | Frontend upload form |
| AssemblyAI transcription | `get_presigned_url(s3_key, 7200)` | 2 hours | Celery transcription task |

**How presigned URLs work with R2:**
- Generated by the backend using boto3's `generate_presigned_url()`
- The URL includes the R2 endpoint, object key, and a query string with signature parameters
- The URL is self-contained -- no additional auth headers needed by the consumer
- Example format: `https://<account-id>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Expires=3600&X-Amz-Signature=...`
- R2 validates the signature on each request; expired URLs return 403

**No code changes needed in `transcription_tasks.py`** -- the presigned URL it generates for AssemblyAI will now point at R2 instead of S3, and AssemblyAI does not care where the URL points as long as it can fetch the video.

---

## 3. Video Upload Flow

### 3.1 Current Flow (Upload Through Backend)

```
Frontend                    Backend                     R2
   |                          |                          |
   |--- POST /upload (file)-->|                          |
   |                          |--- upload_fileobj() ---->|
   |                          |<-- success --------------|
   |                          |--- INSERT video record   |
   |<-- 201 {video} ---------|                          |
```

**Current implementation in `videos.py`:**
1. Frontend sends the video file as multipart form data to `POST /api/videos/{project_id}/upload`
2. Backend receives the full file into memory/temp storage
3. Backend calls `s3_service.upload_video()` which streams to R2 via `upload_fileobj()`
4. Backend stores `s3_key` and `s3_url` in the database
5. Backend returns the video record

**Pros:** Simple, single request, all validation happens server-side.
**Cons:** Large files (up to 500 MB) must pass through the backend, consuming Railway compute time and bandwidth. The backend holds the entire upload in memory/connection for the duration.

### 3.2 Recommended Flow: Direct Upload to R2 (Optional Optimization)

```
Frontend                    Backend                     R2
   |                          |                          |
   |--- GET /upload-url ----->|                          |
   |                          | (generate key + presigned PUT URL)
   |<-- {key, upload_url} ----|                          |
   |                          |                          |
   |--- PUT upload_url (file) --------------------------->|
   |<-- 200 OK ------------------------------------------|
   |                          |                          |
   |--- POST /confirm-upload ->|                         |
   |                          |--- head_object() ------->|
   |                          |<-- 200 (exists) ---------|
   |                          |--- INSERT video record   |
   |<-- 201 {video} ---------|                          |
```

**New endpoints needed:**

```python
@router.post("/{project_id}/upload-url")
async def get_upload_url(
    project_id: UUID,
    filename: str,
    content_type: str = "video/mp4",
    db: Session = Depends(get_db),
):
    """Generate a presigned URL for direct upload to R2."""
    # Validate project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file extension
    file_extension = Path(filename).suffix.lower()
    if file_extension not in settings.ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Generate storage key
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    storage_key = f"projects/{project_id}/videos/{unique_filename}"

    # Generate presigned PUT URL (15 minute expiry)
    upload_url = s3_service.get_presigned_upload_url(
        storage_key=storage_key,
        content_type=content_type,
        expiration=900,
    )

    return {
        "storage_key": storage_key,
        "upload_url": upload_url,
        "expires_in": 900,
    }


@router.post("/{project_id}/confirm-upload")
async def confirm_upload(
    project_id: UUID,
    storage_key: str,
    filename: str,
    file_size_bytes: int = 0,
    db: Session = Depends(get_db),
):
    """Confirm that a direct upload to R2 completed, and create the video record."""
    # Verify the object exists in R2
    if not s3_service.check_video_exists(storage_key):
        raise HTTPException(status_code=400, detail="Upload not found in storage")

    storage_url = f"{settings.r2_endpoint}/{settings.R2_BUCKET_NAME}/{storage_key}"

    video = Video(
        project_id=project_id,
        filename=filename,
        s3_key=storage_key,
        s3_url=storage_url,
        file_size_bytes=file_size_bytes,
        status="uploaded",
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    return video
```

**Frontend upload code (conceptual):**

```typescript
async function uploadVideo(projectId: string, file: File) {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Step 1: Get presigned upload URL from backend
  const urlRes = await fetch(
    `${apiUrl}/api/videos/${projectId}/upload-url?filename=${file.name}&content_type=${file.type}`,
    { method: "POST" }
  );
  const { storage_key, upload_url } = await urlRes.json();

  // Step 2: Upload directly to R2
  await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  // Step 3: Confirm upload with backend
  const confirmRes = await fetch(
    `${apiUrl}/api/videos/${projectId}/confirm-upload?storage_key=${storage_key}&filename=${file.name}&file_size_bytes=${file.size}`,
    { method: "POST" }
  );
  return confirmRes.json();
}
```

### 3.3 Which Flow to Choose

| Factor | Through Backend | Direct to R2 |
|--------|----------------|--------------|
| Implementation effort | None (already works) | ~1 hour new endpoints + frontend |
| Railway compute usage | High (streams entire file) | Low (only metadata requests) |
| Railway bandwidth cost | Charged for full file size | Near zero |
| Upload speed | Limited by backend throughput | Direct to CDN edge |
| File size validation | Server-side before upload | Client-side only, verify after |
| CORS configuration | Not needed for upload | Required (see section 1.3) |
| Simplicity | Simpler | More moving parts |

**Recommendation:** Start with the current "through backend" flow for MVP. It works with zero changes to `videos.py`. Switch to direct upload later if Railway costs become a concern (likely when >10 videos per week are uploaded).

---

## 4. Video Playback

Video playback already uses presigned GET URLs. The current flow works unchanged with R2:

1. Frontend calls `GET /api/videos/{video_id}/playback-url`
2. Backend generates a presigned GET URL (`s3_service.get_presigned_url(s3_key, 3600)`)
3. Backend returns `{"playback_url": "https://<account>.r2.cloudflarestorage.com/...?X-Amz-..."}`
4. Frontend sets the `<video>` element `src` to this URL
5. The browser fetches the video directly from R2

**Frontend code already handles this correctly** (`frontend/src/hooks/useVideos.ts`):
- `useVideoPlaybackUrl()` hook fetches the presigned URL from the backend
- `staleTime` is set to 50 minutes, refreshing before the 1-hour URL expires
- No changes needed on the frontend

**Optional future optimization: Cloudflare CDN in front of R2**

R2 buckets can be connected to a Cloudflare custom domain, which puts the Cloudflare CDN in front of the storage. This provides:
- Cached video delivery at Cloudflare edge nodes worldwide
- No egress fees (R2 already has zero egress, but CDN adds caching benefits)
- A cleaner URL (e.g., `https://videos.yourdomain.com/...` instead of presigned URLs)

This is not needed for MVP but worth considering if video playback latency matters.

---

## 5. Lifecycle Policies

Configure lifecycle rules on the R2 bucket to manage storage costs automatically.

### 5.1 Configure via Cloudflare Dashboard

1. Go to R2 > your bucket > **Settings**
2. Under **Object lifecycle rules**, click **Add rule**

### 5.2 Recommended Rules

**Rule 1: Transition to Infrequent Access after 90 days**
- Scope: Apply to all objects (or prefix `projects/`)
- Action: Transition to **Infrequent Access** storage class
- After: 90 days since object creation
- Cost savings: Infrequent Access is ~33% cheaper for storage ($0.01/GB vs $0.015/GB)
- Read cost increases slightly, but research videos are rarely replayed months later

**Rule 2: Abort incomplete multipart uploads after 7 days**
- Scope: All objects
- Action: Abort incomplete multipart uploads
- After: 7 days
- This prevents orphaned partial uploads from accumulating (e.g., if a large upload was interrupted)

**Rule 3 (Optional): Delete old semester data**
- Scope: Prefix `projects/<old-project-id>/`
- Action: Delete objects
- After: 365 days (or a custom period)
- Only enable this after notifying users and confirming data is no longer needed
- Better to handle this manually via the application rather than as an automatic lifecycle rule

### 5.3 Lifecycle Rules via S3 API (Alternative)

If you prefer infrastructure-as-code, lifecycle rules can be set via boto3:

```python
s3_client.put_bucket_lifecycle_configuration(
    Bucket="qualitative-research-videos",
    LifecycleConfiguration={
        "Rules": [
            {
                "ID": "transition-to-ia",
                "Status": "Enabled",
                "Filter": {"Prefix": ""},
                "Transitions": [
                    {
                        "Days": 90,
                        "StorageClass": "STANDARD_IA",
                    }
                ],
            },
            {
                "ID": "abort-incomplete-uploads",
                "Status": "Enabled",
                "Filter": {"Prefix": ""},
                "AbortIncompleteMultipartUpload": {
                    "DaysAfterInitiation": 7,
                },
            },
        ]
    },
)
```

---

## 6. File Validation and Security

### 6.1 Server-Side MIME Type Validation

The current code only checks file extensions. Add content-based validation to prevent disguised files.

**Add `python-magic` to `requirements.txt`:**
```
python-magic==0.4.27
```

**Note for macOS:** `python-magic` requires `libmagic`. Install via `brew install libmagic`. On Linux (Docker), it is typically included or install via `apt-get install libmagic1`.

**Add validation in `videos.py` upload handler (before the S3 upload call):**

```python
import magic

# Validate MIME type from file content (not headers)
file_header = await file.read(8192)  # Read first 8KB for magic number detection
await file.seek(0)  # Reset file pointer

detected_mime = magic.from_buffer(file_header, mime=True)
allowed_mimes = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"}

if detected_mime not in allowed_mimes:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid file content type: {detected_mime}. Expected a video file."
    )
```

### 6.2 File Size Limits

The current limit is 500 MB (`settings.MAX_FILE_SIZE_MB = 500`). This is reasonable for qualitative research videos:
- A 1-hour interview at 720p H.264 is typically 200-400 MB
- 500 MB provides headroom for higher-quality recordings
- If you add transcoding (section 7), file sizes will decrease significantly after processing

No changes needed unless users upload 4K video regularly (in which case, increase to 2 GB and rely on transcoding to reduce storage).

### 6.3 Filename Sanitization

Already handled well. The code generates UUID-based keys:

```python
unique_filename = f"{uuid.uuid4()}{file_extension}"
s3_key = f"projects/{project_id}/videos/{unique_filename}"
```

The original filename is stored only as metadata on the object and in the database `filename` column. The storage key never includes user-supplied path components. No changes needed.

### 6.4 Virus Scanning

Not recommended for this use case. Rationale:
- Only authenticated users (researchers/instructors) can upload
- Video files are not executed on the server
- Scanning 500 MB video files is slow and resource-intensive
- ClamAV or similar would add deployment complexity for negligible security benefit

If required in the future, Cloudflare's enterprise plans offer built-in malware scanning.

---

## 7. Video Transcoding (Optional Enhancement)

**Status:** Optional. Skip this for MVP. The system currently stores videos as-is.

### 7.1 Why Transcode

- Uploaded videos vary wildly in codec, resolution, and bitrate
- A 1-hour 1080p ProRes recording can be 10+ GB; H.264 720p would be ~1 GB
- Consistent H.264 720p output ensures reliable browser playback
- The `-movflags +faststart` flag enables streaming (progressive download)

### 7.2 Implementation

Add a Celery task that runs after upload:

```python
# backend/app/tasks/transcode_tasks.py

import subprocess
import tempfile
import os
from app.tasks.celery_app import celery_app
from app.services.s3_service import s3_service

@celery_app.task(bind=True, name="transcode_video")
def transcode_video_task(self, video_id: str):
    """Download video from R2, transcode to H.264 720p, re-upload."""

    # 1. Download original from R2 to temp file
    with tempfile.NamedTemporaryFile(suffix=".original", delete=False) as tmp_in:
        s3_service.download_video(video.s3_key, tmp_in.name)
        input_path = tmp_in.name

    # 2. Transcode with FFmpeg
    output_path = input_path.replace(".original", ".mp4")
    cmd = [
        "ffmpeg", "-i", input_path,
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "23",
        "-vf", "scale=-2:720",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",  # overwrite output
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    # 3. Upload transcoded version to R2 (same key, overwrites original)
    with open(output_path, "rb") as f:
        s3_service.s3_client.upload_fileobj(
            f, s3_service.bucket_name, video.s3_key,
            ExtraArgs={"ContentType": "video/mp4"}
        )

    # 4. Update file size in database
    new_size = os.path.getsize(output_path)
    # ... update video.file_size_bytes ...

    # 5. Clean up temp files
    os.unlink(input_path)
    os.unlink(output_path)
```

**FFmpeg flag reference:**
- `-c:v libx264` -- H.264 codec, universally supported in browsers
- `-preset slow` -- better compression at the cost of encode time (acceptable for background task)
- `-crf 23` -- constant rate factor; 23 is visually lossless for most content
- `-vf scale=-2:720` -- scale to 720p height, auto-calculate width (keep aspect ratio, ensure even dimensions)
- `-c:a aac -b:a 128k` -- AAC audio at 128kbps (sufficient for speech)
- `-movflags +faststart` -- moves the MP4 moov atom to the beginning of the file, enabling streaming playback before the full file is downloaded

**Docker consideration:** The Docker image must include FFmpeg. Add to Dockerfile:
```dockerfile
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

---

## 8. Migration of Existing Videos

The 11 backup videos (3.2 GB) are stored locally at `5d-analysis/videos-backup/`.

### 8.1 Option A: Upload via rclone (Recommended)

rclone supports Cloudflare R2 natively.

**Install rclone:**
```bash
brew install rclone   # macOS
```

**Configure rclone for R2:**
```bash
rclone config
```
Choose:
- `n` (new remote)
- Name: `r2`
- Type: `5` (Amazon S3 Compliant)
- Provider: `Cloudflare`
- Access Key: (your R2 Access Key ID)
- Secret Key: (your R2 Secret Access Key)
- Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- Leave other options as defaults

**Upload videos:**
```bash
# Dry run first to preview what will be uploaded
rclone copy ./videos-backup/ r2:qualitative-research-videos/migrated/ --dry-run -v

# Actual upload
rclone copy ./videos-backup/ r2:qualitative-research-videos/migrated/ -v --progress
```

### 8.2 Option B: Upload via Python Script

```python
"""Bulk upload backup videos to R2."""

import boto3
from botocore.config import Config as BotoConfig
from pathlib import Path
import os

# Configure -- replace with actual values
R2_ENDPOINT = "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
R2_ACCESS_KEY = "<ACCESS_KEY_ID>"
R2_SECRET_KEY = "<SECRET_ACCESS_KEY>"
R2_BUCKET = "qualitative-research-videos"

s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    region_name="auto",
)

VIDEO_DIR = Path("../videos-backup")

for video_file in VIDEO_DIR.glob("*"):
    if video_file.suffix.lower() in {".mp4", ".mov", ".webm", ".avi"}:
        key = f"migrated/{video_file.name}"
        print(f"Uploading {video_file.name} -> {key}")
        s3.upload_file(
            str(video_file),
            R2_BUCKET,
            key,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        print(f"  Done ({video_file.stat().st_size / 1024 / 1024:.1f} MB)")

print("All uploads complete.")
```

### 8.3 Update Database Records

After uploading, the database video records need their `s3_key` and `s3_url` fields updated to point to the new R2 locations. Since the database was not preserved and will be regenerated, this step applies only if you have existing records.

If rebuilding from scratch, new uploads will automatically use R2 keys. If migrating existing records:

```sql
-- Update all video records to point to R2
-- Adjust the key mapping based on how you organized the migration
UPDATE videos
SET s3_key = 'migrated/' || filename,
    s3_url = 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com/qualitative-research-videos/migrated/' || filename
WHERE s3_key LIKE 'projects/%';
```

---

## 9. Environment Variables

### 9.1 Required Environment Variables

```bash
# Cloudflare R2 Storage
R2_ACCESS_KEY_ID=<your-r2-access-key-id>
R2_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
R2_ACCOUNT_ID=<your-32-char-account-id>
R2_BUCKET_NAME=qualitative-research-videos

# Optional: override endpoint (for local MinIO testing)
# R2_ENDPOINT_URL=http://localhost:9000
```

### 9.2 Where to Set Them

| Environment | Where | Notes |
|-------------|-------|-------|
| Local development | `backend/.env` file | Loaded by pydantic-settings |
| Railway (backend) | Railway dashboard > Service > Variables | Set all 4 R2 vars |
| Docker Compose | `docker-compose.yml` environment section | Or reference `.env` file |
| CI/CD | GitHub Actions secrets | If running integration tests |

### 9.3 Remove Old AWS Variables

These AWS-specific variables are no longer needed:

```bash
# REMOVE these from all environments:
# AWS_ACCESS_KEY_ID (replaced by R2_ACCESS_KEY_ID)
# AWS_SECRET_ACCESS_KEY (replaced by R2_SECRET_ACCESS_KEY)
# AWS_REGION (R2 uses "auto")
# AWS_BUCKET_NAME (replaced by R2_BUCKET_NAME)
```

### 9.4 Updated .env Template

```bash
# backend/.env

# Application
APP_ENV=development
DEBUG=true

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qualitative_research

# Redis
REDIS_URL=redis://localhost:6379/0

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ACCOUNT_ID=
R2_BUCKET_NAME=qualitative-research-videos

# AI APIs
ANTHROPIC_API_KEY=
ASSEMBLYAI_API_KEY=
```

---

## 10. Testing

### 10.1 Option A: Test Against Real R2 Bucket (Recommended)

This is the simplest approach and validates the actual integration.

1. Create a separate test bucket: `qualitative-research-videos-dev`
2. Use the same R2 API token (scoped to both buckets) or create a separate one
3. Set `R2_BUCKET_NAME=qualitative-research-videos-dev` in your local `.env`
4. Run the test workflow:

```bash
# Start local services
docker compose up -d postgres redis

# Run backend
cd backend
uvicorn app.main:app --reload --port 8000

# Test upload (use the existing test script as a starting point)
python test_video_upload.py
```

### 10.2 Option B: Test with MinIO Locally

MinIO is an S3-compatible server that runs locally.

```bash
# Add MinIO to docker-compose.yml
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"

# Create bucket via MinIO console at http://localhost:9001
# Or via mc CLI:
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/qualitative-research-videos
```

Set in `.env`:
```bash
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_ACCOUNT_ID=unused
R2_ENDPOINT_URL=http://localhost:9000
R2_BUCKET_NAME=qualitative-research-videos
```

### 10.3 Test Checklist

Run through each of these to verify the migration is complete:

- [ ] **Upload test:** Upload a small video (< 10 MB) via `POST /api/videos/{project_id}/upload`
  - Verify it appears in R2 bucket (check via Cloudflare dashboard or `mc ls`)
  - Verify the database record has correct `s3_key` and `s3_url`
- [ ] **Presigned URL test:** Call `GET /api/videos/{video_id}/playback-url`
  - Open the returned URL in a browser -- video should play
  - Wait for expiration (or set a short 60-second expiry for testing) and verify URL stops working
- [ ] **CORS test:** Load the frontend and play a video
  - Open browser DevTools Network tab
  - Verify no CORS errors on the video request
  - If using direct upload flow, verify PUT request succeeds
- [ ] **Download test:** Trigger transcription and verify AssemblyAI can access the presigned URL
  - The transcription task generates a 2-hour presigned URL
  - AssemblyAI fetches the video from R2 via this URL
  - If transcription completes, R2 access is working
- [ ] **Delete test:** Delete a video via `DELETE /api/videos/{video_id}`
  - Verify the object is removed from R2
  - Verify the database record is removed
- [ ] **Large file test:** Upload a video close to the 500 MB limit
  - Verify the upload completes without timeout
  - Verify playback works for the large file

---

## 11. Backup Strategy

### 11.1 R2 Durability

R2 provides 99.999999999% (eleven 9s) annual durability. Data loss from R2 is statistically negligible. For context, S3's durability guarantee is the same number.

### 11.2 Metadata Backup

The database contains the mapping between videos and their analysis. Back it up regularly:

```bash
# Periodic pg_dump of video metadata (run weekly or before major changes)
pg_dump -h localhost -U postgres -d qualitative_research \
  --table=videos --table=transcripts --table=video_analyses \
  -F c -f backup-$(date +%Y%m%d).dump
```

### 11.3 Video Source of Truth

The uploaded videos are research recordings. In most cases:
- Students/researchers have the original recordings on their devices
- The videos can be re-uploaded if somehow lost
- The analysis data (in PostgreSQL) is more valuable than the video files themselves

### 11.4 Optional: Secondary Backup to Backblaze B2

If an additional copy is desired for peace of mind:

```bash
# Configure rclone for Backblaze B2
rclone config
# Name: b2, Type: Backblaze B2, Application Key ID: ..., Application Key: ...

# Sync R2 to B2 (run weekly or on-demand)
rclone sync r2:qualitative-research-videos b2:qualitative-research-backup -v
```

Backblaze B2 costs $0.005/GB/month for storage. For 3.2 GB that is $0.016/month. For 50 GB that is $0.25/month.

---

## 12. Cost Monitoring

### 12.1 R2 Pricing Summary

| Resource | Free Tier | Paid Rate |
|----------|-----------|-----------|
| Storage | 10 GB/month | $0.015/GB/month |
| Class A ops (write, list) | 1M/month | $4.50/M |
| Class B ops (read, head) | 10M/month | $0.36/M |
| Egress | Unlimited | $0 (always free) |
| Infrequent Access storage | -- | $0.01/GB/month |
| IA retrieval | -- | $0.01/GB retrieved |

**Zero egress fees** is the key R2 advantage over S3. Every presigned URL video playback incurs zero bandwidth charges.

### 12.2 Projected Costs

| Scale | Storage | Monthly Ops | Monthly Cost |
|-------|---------|-------------|--------------|
| 11 videos (3.2 GB) | 3.2 GB | ~500 | $0 (free tier) |
| 50 videos (15 GB) | 15 GB | ~5,000 | ~$0.08 |
| 200 videos (60 GB) | 60 GB | ~20,000 | ~$0.75 |
| 500 videos (150 GB) | 150 GB | ~50,000 | ~$2.10 |

These projections assume ~300 MB average per video and moderate read traffic.

### 12.3 Monitoring in Cloudflare Dashboard

1. Go to R2 > your bucket > **Metrics**
2. View storage usage, request counts, and bandwidth over time
3. Cloudflare does not currently support fine-grained billing alerts for R2, but you can:
   - Check the R2 metrics page weekly
   - Monitor the overall Cloudflare invoice at **Account** > **Billing**
   - Set up a Cloudflare notification policy (Account > Notifications) for billing thresholds

### 12.4 Cost Optimization Tips

- Enable Infrequent Access lifecycle rules (section 5) for videos older than 90 days
- If transcoding is enabled (section 7), storage drops by ~5x
- Clean up failed/orphaned uploads via lifecycle rules
- Consider deleting videos from completed/archived semesters after exporting analysis data

---

## Quick Reference: Files to Modify

| File | Change | Effort |
|------|--------|--------|
| `backend/app/config.py` | Replace AWS vars with R2 vars, add `r2_endpoint` property | 5 min |
| `backend/app/services/s3_service.py` | New boto3 init with R2 endpoint + signature config | 15 min |
| `backend/.env` | Replace AWS env vars with R2 env vars | 2 min |
| `backend/requirements.txt` | No change (boto3 stays) | 0 min |
| `backend/app/routes/videos.py` | No change (imports and method calls unchanged) | 0 min |
| `backend/app/tasks/transcription_tasks.py` | No change (presigned URL method unchanged) | 0 min |
| `backend/app/models/database_models.py` | No change for MVP (optional rename later) | 0 min |
| `backend/app/models/schemas.py` | No change for MVP (optional rename later) | 0 min |
| `frontend/src/types/index.ts` | No change for MVP (optional rename later) | 0 min |
| `frontend/src/hooks/useVideos.ts` | No change (playback URL flow unchanged) | 0 min |

**Total estimated effort: ~30 minutes of code changes + Cloudflare setup time**
