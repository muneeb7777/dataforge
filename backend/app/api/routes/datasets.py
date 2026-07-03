"""Datasets API: upload files, list/inspect/preview/delete datasets."""
import re
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.db.session import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetPreview, DatasetRead
from app.schemas.profile import DatasetProfile
from app.services import ingestion, profiling

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

CHUNK_SIZE = 1024 * 1024


def _safe_filename(filename: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", Path(filename).name)


async def _get_dataset_or_404(dataset_id: int, db: AsyncSession) -> Dataset:
    dataset = await db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.post("", response_model=DatasetRead, status_code=201)
async def upload_dataset(
    file: UploadFile,
    name: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
) -> Dataset:
    settings = get_settings()
    if not file.filename:
        raise HTTPException(status_code=422, detail="Uploaded file has no filename")
    try:
        file_type = ingestion.file_type_for(file.filename)
    except ingestion.UnsupportedFileType as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    dataset = Dataset(
        name=name or Path(file.filename).stem,
        original_filename=file.filename,
        file_type=file_type,
        file_path="",
        status="pending",
    )
    db.add(dataset)
    await db.flush()  # assigns dataset.id, used for file + table names

    dest = settings.upload_path / f"{dataset.id}_{_safe_filename(file.filename)}"
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    written = 0
    with dest.open("wb") as out:
        while chunk := await file.read(CHUNK_SIZE):
            written += len(chunk)
            if written > max_bytes:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds {settings.max_upload_size_mb} MB limit",
                )
            out.write(chunk)

    dataset.file_path = str(dest)
    table = f"ds_{dataset.id}"
    try:
        meta = await run_in_threadpool(ingestion.load_file_to_table, dest, table)
    except Exception as exc:
        dataset.status = "error"
        dataset.error_message = str(exc)[:2000]
        await db.commit()
        await db.refresh(dataset)
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {exc}") from exc

    dataset.duckdb_table = table
    dataset.row_count = meta["row_count"]
    dataset.column_count = meta["column_count"]
    dataset.columns = meta["columns"]
    dataset.status = "ready"
    await db.commit()
    await db.refresh(dataset)
    return dataset


@router.get("", response_model=list[DatasetRead])
async def list_datasets(db: AsyncSession = Depends(get_db)) -> list[Dataset]:
    result = await db.execute(select(Dataset).order_by(Dataset.created_at.desc()))
    return list(result.scalars().all())


@router.get("/{dataset_id}", response_model=DatasetRead)
async def get_dataset(dataset_id: int, db: AsyncSession = Depends(get_db)) -> Dataset:
    return await _get_dataset_or_404(dataset_id, db)


@router.get("/{dataset_id}/preview", response_model=DatasetPreview)
async def preview_dataset(
    dataset_id: int,
    limit: int = 50,
    offset: int = 0,
    sort_by: str | None = None,
    sort_dir: Literal["asc", "desc"] = "asc",
    db: AsyncSession = Depends(get_db),
) -> DatasetPreview:
    dataset = await _get_dataset_or_404(dataset_id, db)
    if dataset.status != "ready" or not dataset.duckdb_table:
        raise HTTPException(status_code=409, detail=f"Dataset is not ready (status={dataset.status})")
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    try:
        data = await run_in_threadpool(
            ingestion.preview_table, dataset.duckdb_table, limit, offset, sort_by, sort_dir
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DatasetPreview(dataset_id=dataset.id, limit=limit, offset=offset, **data)


@router.get("/{dataset_id}/profile", response_model=DatasetProfile)
async def profile_dataset(dataset_id: int, db: AsyncSession = Depends(get_db)) -> DatasetProfile:
    dataset = await _get_dataset_or_404(dataset_id, db)
    if dataset.status != "ready" or not dataset.duckdb_table:
        raise HTTPException(status_code=409, detail=f"Dataset is not ready (status={dataset.status})")
    data = await run_in_threadpool(profiling.profile_table, dataset.duckdb_table)
    return DatasetProfile(dataset_id=dataset.id, **data)


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: int, db: AsyncSession = Depends(get_db)) -> None:
    dataset = await _get_dataset_or_404(dataset_id, db)
    if dataset.duckdb_table:
        await run_in_threadpool(ingestion.drop_table, dataset.duckdb_table)
    if dataset.file_path:
        await run_in_threadpool(
            lambda: Path(dataset.file_path).unlink(missing_ok=True)  # type: ignore[arg-type]
        )
    await db.delete(dataset)
    await db.commit()
