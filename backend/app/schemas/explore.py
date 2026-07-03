"""Pydantic schemas for the explore (SQL query) API."""
from pydantic import BaseModel, Field

from app.schemas.dataset import ColumnInfo


class QueryRequest(BaseModel):
    sql: str
    max_rows: int = Field(default=200, ge=1, le=1000)


class QueryResult(BaseModel):
    columns: list[ColumnInfo]
    rows: list[dict]
    row_count: int
    truncated: bool
    duration_ms: float
