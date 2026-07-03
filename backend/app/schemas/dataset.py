"""Pydantic schemas for the datasets API."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ColumnInfo(BaseModel):
    name: str
    dtype: str


class DatasetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    original_filename: str
    file_type: str
    duckdb_table: str | None = None
    status: str
    error_message: str | None = None
    row_count: int | None = None
    column_count: int | None = None
    columns: list[ColumnInfo] | None = None
    source_dataset_id: int | None = None
    pipeline: list[dict] | None = None
    created_at: datetime
    updated_at: datetime


class DatasetPreview(BaseModel):
    dataset_id: int
    columns: list[ColumnInfo]
    rows: list[dict]
    total_rows: int
    limit: int
    offset: int
