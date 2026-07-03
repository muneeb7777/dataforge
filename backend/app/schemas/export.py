"""Pydantic schemas for the exports API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ExportCreate(BaseModel):
    dataset_id: int
    format: Literal["csv", "parquet", "xlsx"]


class ExportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_id: int
    dataset_name: str | None = None  # joined in by the router for list views
    format: str
    status: str
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
