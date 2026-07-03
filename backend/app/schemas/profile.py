"""Pydantic schemas for dataset profiling."""
from typing import Any

from pydantic import BaseModel


class HistogramBin(BaseModel):
    lo: float
    hi: float
    count: int


class TopValue(BaseModel):
    value: Any
    count: int


class ColumnProfile(BaseModel):
    name: str
    dtype: str
    count: int
    null_count: int
    null_pct: float
    approx_distinct: int | None = None
    min: Any = None
    max: Any = None
    mean: float | None = None
    std: float | None = None
    q25: Any = None
    q50: Any = None
    q75: Any = None
    histogram: list[HistogramBin] | None = None
    top_values: list[TopValue] | None = None


class DatasetProfile(BaseModel):
    dataset_id: int
    row_count: int
    columns: list[ColumnProfile]
