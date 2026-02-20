"""Application configuration using Pydantic Settings."""
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
    
    # Application
    APP_NAME: str = "SDA Platform"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    
    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://sda_user:sda_secret@localhost:5432/sda_db"
    )
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minio_admin"
    MINIO_SECRET_KEY: str = "minio_secret"
    MINIO_SECURE: bool = False
    MINIO_BUCKET_INGESTION: str = "sda-ingestion"
    
    # Regolo AI
    REGOLO_API_KEY: Optional[str] = None
    REGOLO_BASE_URL: str = "https://api.regolo.ai/v1"
    REGOLO_MODEL: str = "gpt-oss-120b"
    REGOLO_MAX_TOKENS: int = 4096
    REGOLO_TEMPERATURE: float = 0.7
    DETOUR_REGOLO_TEMPERATURE: float = 0.2
    DETOUR_REGOLO_MAX_MODEL_LEN: int = 8192
    DETOUR_REGOLO_MAX_TOKENS: Optional[int] = None
    
    # Rate Limiting
    AI_RATE_LIMIT_REQUESTS: int = 100
    AI_RATE_LIMIT_WINDOW: int = 3600  # seconds
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # CelesTrack
    CELESTRACK_BASE_URL: str = "https://celestrak.org/NORAD/elements"
    TLE_CACHE_HOURS: int = 6


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()

