"""Explore API: run read-only SQL against the DuckDB store."""
import duckdb
from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.schemas.explore import QueryRequest, QueryResult
from app.services import explorer

router = APIRouter(prefix="/api/explore", tags=["explore"])


@router.post("/query", response_model=QueryResult)
async def execute_query(payload: QueryRequest) -> QueryResult:
    try:
        result = await run_in_threadpool(explorer.run_query, payload.sql, payload.max_rows)
    except explorer.QueryRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except duckdb.Error as exc:
        raise HTTPException(status_code=400, detail=f"Query failed: {exc}") from exc
    return QueryResult(**result)
