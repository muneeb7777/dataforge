"""Statistics API: correlation, hypothesis tests, regression, forecasting."""
import duckdb
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.models.dataset import Dataset
from app.schemas.stats import (
    Chi2Request,
    Chi2Result,
    CorrelationRequest,
    CorrelationResult,
    ForecastRequest,
    ForecastResult,
    RegressionRequest,
    RegressionResult,
    TTestRequest,
    TTestResult,
)
from app.services import stats

router = APIRouter(prefix="/api/stats", tags=["stats"])


async def _table_for(dataset_id: int, db: AsyncSession) -> str:
    dataset = await db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready" or not dataset.duckdb_table:
        raise HTTPException(status_code=409, detail=f"Dataset is not ready (status={dataset.status})")
    return dataset.duckdb_table


async def _run(fn, *args):
    try:
        return await run_in_threadpool(fn, *args)
    except stats.StatsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except duckdb.Error as exc:
        raise HTTPException(status_code=400, detail=f"Query failed: {exc}") from exc


@router.post("/correlation", response_model=CorrelationResult)
async def correlation(payload: CorrelationRequest, db: AsyncSession = Depends(get_db)):
    table = await _table_for(payload.dataset_id, db)
    return await _run(stats.correlation, table, payload.columns, payload.method)


@router.post("/ttest", response_model=TTestResult)
async def ttest(payload: TTestRequest, db: AsyncSession = Depends(get_db)):
    table = await _table_for(payload.dataset_id, db)
    return await _run(stats.ttest, table, payload.value_column, payload.group_column)


@router.post("/chi2", response_model=Chi2Result)
async def chi2(payload: Chi2Request, db: AsyncSession = Depends(get_db)):
    table = await _table_for(payload.dataset_id, db)
    return await _run(stats.chi2, table, payload.column_a, payload.column_b)


@router.post("/regression", response_model=RegressionResult)
async def regression(payload: RegressionRequest, db: AsyncSession = Depends(get_db)):
    table = await _table_for(payload.dataset_id, db)
    return await _run(stats.regression, table, payload.target, payload.features)


@router.post("/forecast", response_model=ForecastResult)
async def forecast(payload: ForecastRequest, db: AsyncSession = Depends(get_db)):
    table = await _table_for(payload.dataset_id, db)
    return await _run(
        stats.forecast,
        table,
        payload.date_column,
        payload.value_column,
        payload.periods,
        payload.freq,
        payload.agg,
    )
