"""AWS S3 service for video upload and management."""

import boto3
from botocore.exceptions import ClientError
from typing import BinaryIO, Optional
import logging
from pathlib import Path
import uuid

from app.config import settings

logger = logging.getLogger(__name__)


class S3Service:
    """Service for interacting with AWS S3."""

    def __init__(self):
        """Initialize S3 client."""
        self.s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        self.bucket_name = settings.AWS_BUCKET_NAME

    def upload_video(
        self,
        file: BinaryIO,
        filename: str,
        project_id: str,
    ) -> tuple[str, str]:
        """
        Upload video file to S3.

        Args:
            file: File object to upload
            filename: Original filename
            project_id: Project ID for organizing files

        Returns:
            Tuple of (s3_key, s3_url)

        Raises:
            Exception: If upload fails
        """
        try:
            # Generate unique S3 key
            file_extension = Path(filename).suffix
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            s3_key = f"projects/{project_id}/videos/{unique_filename}"

            # Upload file
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

            # Generate URL
            s3_url = f"https://{self.bucket_name}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"

            logger.info(f"Uploaded video to S3: {s3_key}")
            return s3_key, s3_url

        except ClientError as e:
            logger.error(f"Error uploading to S3: {e}")
            raise Exception(f"Failed to upload video to S3: {str(e)}")

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

    def download_video(self, s3_key: str, local_path: str) -> str:
        """
        Download video from S3 to local file.

        Args:
            s3_key: S3 object key
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
            logger.info(f"Downloaded video from S3: {s3_key} -> {local_path}")
            return local_path

        except ClientError as e:
            logger.error(f"Error downloading from S3: {e}")
            raise Exception(f"Failed to download video from S3: {str(e)}")

    def delete_video(self, s3_key: str) -> bool:
        """
        Delete video from S3.

        Args:
            s3_key: S3 object key

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
            logger.info(f"Deleted video from S3: {s3_key}")
            return True

        except ClientError as e:
            logger.error(f"Error deleting from S3: {e}")
            raise Exception(f"Failed to delete video from S3: {str(e)}")

    def check_video_exists(self, s3_key: str) -> bool:
        """
        Check if video exists in S3.

        Args:
            s3_key: S3 object key

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
s3_service = S3Service()
