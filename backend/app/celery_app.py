"""Celery application configuration."""
from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "sda_platform",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3300,
    worker_prefetch_multiplier=1,
    result_expires=86400,
)

celery_app.conf.beat_schedule = {
    "run-conjunction-analysis": {
        "task": "app.tasks.run_conjunction_analysis",
        "schedule": 3600.0,  # Every hour
    },
    "fetch-space-weather": {
        "task": "app.tasks.fetch_space_weather",
        "schedule": 1800.0,  # Every 30 minutes
    },
}

