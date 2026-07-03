"""Pydantic schemas for the statistics / ML API."""
from typing import Literal

from pydantic import BaseModel, Field


class CorrelationRequest(BaseModel):
    dataset_id: int
    columns: list[str] | None = None  # default: all numeric columns
    method: Literal["pearson", "spearman"] = "pearson"


class CorrelationResult(BaseModel):
    columns: list[str]
    matrix: list[list[float | None]]  # None where undefined (constant column)


class TTestRequest(BaseModel):
    dataset_id: int
    value_column: str
    group_column: str  # must have exactly two distinct values


class TTestResult(BaseModel):
    group_a: str
    group_b: str
    n_a: int
    n_b: int
    mean_a: float | None = None
    mean_b: float | None = None
    t_stat: float | None = None
    p_value: float | None = None


class Chi2Request(BaseModel):
    dataset_id: int
    column_a: str
    column_b: str


class Chi2Result(BaseModel):
    chi2: float | None = None
    p_value: float | None = None
    dof: int
    row_labels: list[str]
    col_labels: list[str]
    observed: list[list[int]]


class RegressionRequest(BaseModel):
    dataset_id: int
    target: str
    features: list[str] = Field(min_length=1)


class Coefficient(BaseModel):
    name: str
    coef: float | None = None
    std_err: float | None = None
    t_stat: float | None = None
    p_value: float | None = None


class RegressionResult(BaseModel):
    coefficients: list[Coefficient]
    r2: float | None = None
    adj_r2: float | None = None
    n_obs: int


class ForecastRequest(BaseModel):
    dataset_id: int
    date_column: str
    value_column: str
    periods: int = Field(default=30, ge=1, le=365)
    freq: Literal["D", "W", "MS"] = "D"
    agg: Literal["sum", "mean"] = "sum"  # how duplicate dates are collapsed


class ForecastPoint(BaseModel):
    ds: str
    yhat: float | None = None
    yhat_lower: float | None = None
    yhat_upper: float | None = None


class HistoryPoint(BaseModel):
    ds: str
    y: float | None = None


class ForecastResult(BaseModel):
    history: list[HistoryPoint]
    forecast: list[ForecastPoint]  # full fitted range: history dates + future periods
