"""Celery application for background jobs (large exports, etc.). Tasks are
registered incrementally as modules that need background processing are built
(see BUILD ORDER step 10 for the export engine)."""
from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "dataforge",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.services.export_tasks", "app.services.fred"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    beat_schedule={
        # Daily FRED refresh (no-op with a friendly log if no API key is set).
        "fred-daily-sync": {"task": "fred.sync", "schedule": 60 * 60 * 24},
    },
)
