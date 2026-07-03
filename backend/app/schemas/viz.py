"""Pydantic schemas for the visualization data API."""
from typing import Literal

from pydantic import BaseModel, Field

Agg = Literal["none", "sum", "avg", "min", "max", "count", "count_distinct"]


class VizDataRequest(BaseModel):
    dataset_id: int
    x: str
    y: str | None = None  # not needed for agg == "count"
    agg: Agg = "none"
    series: str | None = None  # optional group-by column (one trace per value)
    limit: int = Field(default=1000, ge=1, le=5000)


class VizDataResult(BaseModel):
    rows: list[dict]  # [{"x": ..., "y": ..., "series": ...?}]
    truncated: bool
    sql: str
