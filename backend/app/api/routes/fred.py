"""FRED API: manual trigger for the scheduled sync flow."""
from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.services.fred import api_key_configured, sync_all

router = APIRouter(prefix="/api/fred", tags=["fred"])


@router.post("/sync", status_code=202)
async def trigger_sync() -> dict:
    if not api_key_configured():
        raise HTTPException(
            status_code=409,
            detail="FRED_API_KEY is not configured — set it in .env and restart",
        )
    task = sync_all.delay()
    return {"task_id": task.id, "series": get_settings().fred_series}
