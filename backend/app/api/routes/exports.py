"""Exports API: launch background exports, poll status, download results."""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.export_job import ExportJob
from app.schemas.export import ExportCreate, ExportJobRead
from app.services.export_tasks import run_export

router = APIRouter(prefix="/api/exports", tags=["exports"])

_MEDIA_TYPES = {
    "csv": "text/csv",
    "parquet": "application/octet-stream",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _read(job: ExportJob, dataset_name: str | None = None) -> ExportJobRead:
    view = ExportJobRead.model_validate(job)
    view.dataset_name = dataset_name
    return view


@router.post("", response_model=ExportJobRead, status_code=202)
async def create_export(payload: ExportCreate, db: AsyncSession = Depends(get_db)):
    dataset = await db.get(Dataset, payload.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready" or not dataset.duckdb_table:
        raise HTTPException(status_code=409, detail=f"Dataset is not ready (status={dataset.status})")

    job = ExportJob(dataset_id=dataset.id, format=payload.format, status="queued")
    db.add(job)
    await db.flush()
    task = run_export.delay(job.id)
    job.celery_task_id = task.id
    await db.commit()
    await db.refresh(job)
    return _read(job, dataset.name)


@router.get("", response_model=list[ExportJobRead])
async def list_exports(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ExportJob, Dataset.name)
        .join(Dataset, Dataset.id == ExportJob.dataset_id)
        .order_by(ExportJob.created_at.desc())
        .limit(50)
    )
    return [_read(job, name) for job, name in result.all()]


@router.get("/{job_id}", response_model=ExportJobRead)
async def get_export(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(ExportJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Export job not found")
    dataset = await db.get(Dataset, job.dataset_id)
    return _read(job, dataset.name if dataset else None)


@router.get("/{job_id}/download")
async def download_export(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(ExportJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Export job not found")
    if job.status != "done" or not job.file_path:
        raise HTTPException(status_code=409, detail=f"Export is not ready (status={job.status})")
    path = Path(job.file_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="Export file no longer exists")
    dataset = await db.get(Dataset, job.dataset_id)
    stem = dataset.name if dataset else f"export_{job.id}"
    return FileResponse(
        path,
        media_type=_MEDIA_TYPES.get(job.format, "application/octet-stream"),
        filename=f"{stem}.{job.format}",
    )
