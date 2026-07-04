"""Application configuration, loaded from environment variables / .env."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    # Comma-separated allowed origins for production CORS,
    # e.g. "https://dataforge.vercel.app"
    cors_origins: str = ""
    # Optional regex for origins (e.g. Vercel per-deployment URLs):
    # "https://dataforge-.*\.vercel\.app"
    cors_origin_regex: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://dataforge:dataforge@localhost:5432/dataforge"
    sync_database_url: str = "postgresql+psycopg://dataforge:dataforge@localhost:5432/dataforge"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "change-me-in-production-please"
    jwt_lifetime_seconds: int = 86400

    # External APIs
    fred_api_key: str = ""
    fred_series: str = "GDP,CPIAUCSL,UNRATE"  # series synced by the scheduled flow

    # Storage
    upload_dir: str = "./uploads"
    duckdb_dir: str = "./duckdb_data"
    max_upload_size_mb: int = 500

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def duckdb_path(self) -> Path:
        p = Path(self.duckdb_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()
