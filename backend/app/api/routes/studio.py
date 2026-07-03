"""Studio API: preview and materialize declarative transform pipelines."""
import duckdb
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetRead
from app.schemas.studio import (
    JoinStep,
    PipelineMaterializeRequest,
    PipelinePreviewRequest,
    PipelinePreviewResult,
    Step,
)
from app.services import studio

router = APIRouter(prefix="/api/studio", tags=["studio"])


async def _ready_dataset(dataset_id: int, db: AsyncSession) -> Dataset:
    dataset = await db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")
    if dataset.status != "ready" or not dataset.duckdb_table:
        raise HTTPException(
            status_code=409, detail=f"Dataset {dataset_id} is not ready (status={dataset.status})"
        )
    return dataset


async def _compile(source_dataset_id: int, steps: list[Step], db: AsyncSession) -> str:
    source = await _ready_dataset(source_dataset_id, db)
    join_tables: dict[int, str] = {}
    for step in steps:
        if isinstance(step, JoinStep):
            join_tables[step.dataset_id] = (await _ready_dataset(step.dataset_id, db)).duckdb_table
    try:
        return studio.compile_pipeline(source.duckdb_table, steps, join_tables)
    except studio.PipelineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/preview", response_model=PipelinePreviewResult)
async def preview(payload: PipelinePreviewRequest, db: AsyncSession = Depends(get_db)):
    sql = await _compile(payload.source_dataset_id, payload.steps, db)
    try:
        result = await run_in_threadpool(studio.preview_pipeline, sql, payload.limit)
    except duckdb.Error as exc:
        raise HTTPException(status_code=400, detail=f"Pipeline failed: {exc}") from exc
    return PipelinePreviewResult(sql=sql, **result)


@router.post("/materialize", response_model=DatasetRead, status_code=201)
async def materialize(payload: PipelineMaterializeRequest, db: AsyncSession = Depends(get_db)):
    sql = await _compile(payload.source_dataset_id, payload.steps, db)

    dataset = Dataset(
        name=payload.name,
        original_filename="(derived)",
        file_type="derived",
        file_path="",
        status="pending",
        source_dataset_id=payload.source_dataset_id,
        pipeline=[step.model_dump() for step in payload.steps],
    )
    db.add(dataset)
    await db.flush()

    table = f"ds_{dataset.id}"
    try:
        meta = await run_in_threadpool(studio.materialize_pipeline, sql, table)
    except duckdb.Error as exc:
        dataset.status = "error"
        dataset.error_message = str(exc)[:2000]
        await db.commit()
        raise HTTPException(status_code=400, detail=f"Pipeline failed: {exc}") from exc

    dataset.duckdb_table = table
    dataset.row_count = meta["row_count"]
    dataset.column_count = meta["column_count"]
    dataset.columns = meta["columns"]
    dataset.status = "ready"
    await db.commit()
    await db.refresh(dataset)
    return dataset
