"""Cloudflare R2 storage service for video upload and management.

R2 is S3-compatible, so we use boto3 with a custom endpoint URL.
R2 encrypts all data at rest by default (no SSE-KMS needed).
R2 does not support ACLs or bucket policies via the S3 API.
"""

import logging
import uuid
from pathlib import Path
from typing import BinaryIO

from app.config import settings

logger = logging.getLogger(__name__)


class S3Service:
    """Service for interacting with Cloudflare R2 (S3-compatible)."""

    def __init__(self):
        """Initialize R2-compatible S3 client (boto3 imported lazily on first use)."""
        self._s3_client = None
        self.bucket_name = settings.R2_BUCKET_NAME

    @property
    def s3_client(self):
        """Return a cached boto3 S3 client, creating it on first access."""
        if self._s3_client is None:
            import boto3
            from botocore.config import Config as BotoConfig
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=settings.R2_ENDPOINT_URL,
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                region_name="auto",
                config=BotoConfig(
                    signature_version="s3v4",
                    retries={"max_attempts": 3, "mode": "standard"},
                ),
            )
        return self._s3_client

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
            Tuple of (s3_key, s3_url)

        Raises:
            Exception: If upload fails
        """
        from botocore.exceptions import ClientError
        try:
            # Generate unique S3 key
            file_extension = Path(filename).suffix
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            s3_key = f"projects/{project_id}/videos/{unique_filename}"

            # Upload file (no ACL or SSE params -- R2 doesn't support them)
            self.s3_client.upload_fileobj(
                file,
                self.bucket_name,
                s3_key,
                ExtraArgs={
                    "ContentType": self._get_content_type(file_extension),
                    "Metadata": {
                        "original_filename": filename,
                        "project_id": project_id,
                    }
                }
            )

            # Generate a reference URL (not directly accessible; use presigned URLs)
            s3_url = f"{settings.R2_ENDPOINT_URL}/{self.bucket_name}/{s3_key}"

            logger.info(f"Uploaded video to R2: {s3_key}")
            return s3_key, s3_url

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

        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default 1 hour)

        Returns:
            Presigned URL string

        Raises:
            Exception: If URL generation fails
        """
        from botocore.exceptions import ClientError
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

    def generate_upload_url(self, s3_key: str, content_type: str, expiration: int = 3600) -> str:
        """Generate a presigned PUT URL for direct browser upload to R2."""
        url = self.s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=expiration,
        )
        return url

    def download_file(self, s3_key: str, dest_path: str) -> None:
        """
        Download a file from R2 to a local path.

        Args:
            s3_key: S3 object key
            dest_path: Local file path to write to

        Raises:
            Exception: If download fails
        """
        from botocore.exceptions import ClientError
        try:
            self.s3_client.download_file(
                self.bucket_name,
                s3_key,
                dest_path,
            )
            logger.info(f"Downloaded from R2: {s3_key} -> {dest_path}")
        except ClientError as e:
            logger.error(f"Error downloading from R2: {e}")
            raise Exception(f"Failed to download from R2: {str(e)}")

    def head_object(self, s3_key: str) -> dict:
        """Check if an object exists in R2 and return its metadata."""
        return self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)

    def delete_video(self, s3_key: str) -> bool:
        """
        Delete video from R2.

        Args:
            s3_key: S3 object key

        Returns:
            True if successful

        Raises:
            Exception: If deletion fails
        """
        from botocore.exceptions import ClientError
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

    @staticmethod
    def _get_content_type(file_extension: str) -> str:
        """Get MIME type for video or audio file extension."""
        content_types = {
            # Video
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".avi": "video/x-msvideo",
            # Audio
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".ogg": "audio/ogg",
            ".flac": "audio/flac",
            ".aac": "audio/aac",
        }
        return content_types.get(file_extension.lower(), "application/octet-stream")


# Global service instance
s3_service = S3Service()
