"""Visualization API: plot-ready aggregated data for the chart builder."""
import duckdb
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.models.dataset import Dataset
from app.schemas.viz import VizDataRequest, VizDataResult
from app.services import viz

router = APIRouter(prefix="/api/viz", tags=["viz"])


@router.post("/data", response_model=VizDataResult)
async def viz_data(payload: VizDataRequest, db: AsyncSession = Depends(get_db)) -> VizDataResult:
    dataset = await db.get(Dataset, payload.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready" or not dataset.duckdb_table:
        raise HTTPException(status_code=409, detail=f"Dataset is not ready (status={dataset.status})")
    try:
        result = await run_in_threadpool(
            viz.chart_data,
            dataset.duckdb_table,
            payload.x,
            payload.y,
            payload.agg,
            payload.series,
            payload.limit,
        )
    except viz.VizError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except duckdb.Error as exc:
        raise HTTPException(status_code=400, detail=f"Chart query failed: {exc}") from exc
    return VizDataResult(**result)
