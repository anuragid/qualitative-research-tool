"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    # Application
    APP_ENV: str = "development"
    DEBUG: bool = True
    PROJECT_NAME: str = "Qualitative Research Tool"
    API_V1_PREFIX: str = "/api"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse ALLOWED_ORIGINS string into list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str

    # AWS
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str = "us-east-1"
    AWS_BUCKET_NAME: str

    # AI APIs
    ANTHROPIC_API_KEY: str
    ASSEMBLYAI_API_KEY: str

    # Claude Settings
    CLAUDE_MODEL: str = "claude-sonnet-4-20250514"
    CLAUDE_MAX_TOKENS: int = 4096
    CLAUDE_TEMPERATURE: float = 0.7

    # File Upload Settings
    MAX_FILE_SIZE_MB: int = 500
    ALLOWED_VIDEO_EXTENSIONS: List[str] = [".mp4", ".mov", ".webm", ".avi"]

    # Celery Settings
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Use Redis URL for Celery if not explicitly set
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = self.REDIS_URL
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = self.REDIS_URL


# Global settings instance
settings = Settings()
