"""Application configuration using Pydantic Settings."""

from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    # Application — defaults are safe for production; override in .env for local dev
    APP_ENV: str = "production"
    DEBUG: bool = False
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

    # Cloudflare R2 Storage (S3-compatible)
    R2_ACCESS_KEY_ID: str
    R2_SECRET_ACCESS_KEY: str
    R2_ENDPOINT_URL: str  # e.g. https://<account_id>.r2.cloudflarestorage.com
    R2_BUCKET_NAME: str
    # Timeout budget: botocore standard retry mode ALSO retries on
    # connect/read timeouts, so the worst case for a fully stalled endpoint is
    # max_attempts × (connect + read) = 2 × (10 + 160) = 340 s, which must stay
    # below Celery task_time_limit=360 s. See s3_service.py and the contract
    # test in tests/test_transcription_tasks.py before changing these.
    R2_CONNECT_TIMEOUT_SECONDS: int = 10
    R2_READ_TIMEOUT_SECONDS: int = 160

    # AI APIs - OpenRouter (OpenAI-compatible)
    OPENROUTER_API_KEY: str
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    DEFAULT_MODEL: str = "meta-llama/llama-4-scout"
    ASSEMBLYAI_API_KEY: str

    # Authentication (Clerk)
    CLERK_SECRET_KEY: str = ""
    CLERK_PUBLISHABLE_KEY: str = ""
    CLERK_JWKS_URL: str = ""  # Override JWKS URL; defaults to Clerk Backend API

    # Encryption for BYOK API keys (required in production)
    ENCRYPTION_KEY: str = ""

    # LLM Settings
    LLM_MAX_TOKENS: int = 4096
    LLM_TEMPERATURE: float = 0.7

    # BYOK balance — see backend/app/services/openrouter_balance.py
    LOW_BALANCE_THRESHOLD_USD: float = 0.50  # UI yellow-warning threshold
    BALANCE_CACHE_TTL_SECONDS: int = 60  # How long persisted balance is "fresh"

    # File Upload Settings
    MAX_FILE_SIZE_MB: int = 500
    ALLOWED_VIDEO_EXTENSIONS: List[str] = [".mp4", ".mov", ".webm", ".avi"]
    ALLOWED_AUDIO_EXTENSIONS: List[str] = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]

    # Rate Limiting
    RATE_LIMIT_DEFAULT: str = "60/minute"
    RATE_LIMIT_UPLOAD: str = "10/minute"
    RATE_LIMIT_AUTH: str = "20/minute"
    RATE_LIMIT_TRANSCRIBE: str = "5/minute"
    RATE_LIMIT_ANALYZE: str = "5/minute"
    RATE_LIMIT_ANALYZE_STEP: str = "10/minute"

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
