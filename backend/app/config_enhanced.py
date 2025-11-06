"""Enhanced configuration that works seamlessly between local and AWS."""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings that adapt to environment."""

    # Determine which .env file to use based on environment
    @classmethod
    def _get_env_file(cls) -> str:
        """Determine which env file to use based on environment."""
        # Check if we're in Docker
        if os.path.exists("/.dockerenv"):
            return ".env.docker-local"
        # Check if we're in ECS (AWS sets this)
        elif os.getenv("ECS_CONTAINER_METADATA_URI"):
            return ".env.aws-production"
        # Default to regular .env for local development
        else:
            return ".env"

    model_config = SettingsConfigDict(
        env_file=_get_env_file.__func__(None),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    # Application
    APP_ENV: str = "development"
    DEBUG: bool = True
    PROJECT_NAME: str = "Qualitative Research Tool"
    API_V1_PREFIX: str = "/api"

    # CORS - dynamically adjusted based on environment
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse ALLOWED_ORIGINS string into list."""
        origins = [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

        # In production, ensure AWS frontend is allowed
        if self.is_production:
            aws_frontend = "http://qualitative-research-frontend.s3-website.us-east-2.amazonaws.com"
            if aws_frontend not in origins:
                origins.append(aws_frontend)

        return origins

    # Database
    DATABASE_URL: str

    @property
    def database_url_adjusted(self) -> str:
        """Adjust database URL based on environment."""
        # If running in Docker locally, ensure we use the right hostname
        if self.is_docker_local:
            # Replace localhost with postgres (container name)
            return self.DATABASE_URL.replace("localhost", "postgres")
        return self.DATABASE_URL

    # Redis
    REDIS_URL: str

    @property
    def redis_url_adjusted(self) -> str:
        """Adjust Redis URL based on environment."""
        # If running in Docker locally, ensure we use the right hostname
        if self.is_docker_local:
            # Replace localhost with redis (container name)
            return self.REDIS_URL.replace("localhost", "redis")
        return self.REDIS_URL

    # AWS
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str = "us-east-2"
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

    # Environment detection properties
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.APP_ENV == "development"

    @property
    def is_docker(self) -> bool:
        """Check if running inside Docker."""
        return os.path.exists("/.dockerenv") or bool(os.getenv("ECS_CONTAINER_METADATA_URI"))

    @property
    def is_docker_local(self) -> bool:
        """Check if running in local Docker (not ECS)."""
        return os.path.exists("/.dockerenv") and not os.getenv("ECS_CONTAINER_METADATA_URI")

    @property
    def is_ecs(self) -> bool:
        """Check if running in AWS ECS."""
        return bool(os.getenv("ECS_CONTAINER_METADATA_URI"))

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # Use Redis URL for Celery if not explicitly set
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = self.redis_url_adjusted
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = self.redis_url_adjusted

        # Log environment info for debugging
        if self.DEBUG:
            print(f"🔧 Configuration loaded:")
            print(f"  - Environment: {self.APP_ENV}")
            print(f"  - Is Docker: {self.is_docker}")
            print(f"  - Is ECS: {self.is_ecs}")
            print(f"  - Is Production: {self.is_production}")
            print(f"  - Database: {self.database_url_adjusted.split('@')[1] if '@' in self.database_url_adjusted else 'local'}")
            print(f"  - Redis: {self.redis_url_adjusted.split('@')[1] if '@' in self.redis_url_adjusted else 'local'}")


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()