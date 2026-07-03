"""Pydantic schemas for the data studio (transform pipeline) API.

A pipeline is an ordered list of declarative steps applied to a source dataset.
`filter.condition` and `derive.expression` are raw DuckDB SQL fragments (same
trust posture as the explore module: single-user dev tool, not a SQL sandbox),
but statement-breaking tokens are rejected.
"""
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator

from app.schemas.dataset import ColumnInfo

FORBIDDEN_FRAGMENT_TOKENS = (";", "--", "/*")


def _check_fragment(value: str) -> str:
    for token in FORBIDDEN_FRAGMENT_TOKENS:
        if token in value:
            raise ValueError(f"SQL fragment may not contain {token!r}")
    if not value.strip():
        raise ValueError("SQL fragment is empty")
    return value


class FilterStep(BaseModel):
    type: Literal["filter"]
    condition: str  # e.g. "quantity > 5 AND region = 'North'"

    _validate_condition = field_validator("condition")(_check_fragment)


class SelectStep(BaseModel):
    type: Literal["select"]
    columns: list[str] = Field(min_length=1)


class RenameStep(BaseModel):
    type: Literal["rename"]
    mapping: dict[str, str] = Field(min_length=1)  # {old_name: new_name}


class DeriveStep(BaseModel):
    type: Literal["derive"]
    column: str
    expression: str  # e.g. "quantity * unit_price"

    _validate_expression = field_validator("expression")(_check_fragment)


class SortKey(BaseModel):
    column: str
    desc: bool = False


class SortStep(BaseModel):
    type: Literal["sort"]
    by: list[SortKey] = Field(min_length=1)


class JoinKey(BaseModel):
    left: str
    right: str


class JoinStep(BaseModel):
    type: Literal["join"]
    dataset_id: int  # the right-hand dataset to join against
    how: Literal["inner", "left", "right", "full"] = "inner"
    on: list[JoinKey] = Field(min_length=1)


Step = Annotated[
    Union[FilterStep, SelectStep, RenameStep, DeriveStep, SortStep, JoinStep],
    Field(discriminator="type"),
]


class PipelinePreviewRequest(BaseModel):
    source_dataset_id: int
    steps: list[Step] = []
    limit: int = Field(default=100, ge=1, le=1000)


class PipelinePreviewResult(BaseModel):
    columns: list[ColumnInfo]
    rows: list[dict]
    row_count: int
    truncated: bool
    duration_ms: float
    sql: str  # compiled SQL, shown in the UI for transparency


class PipelineMaterializeRequest(BaseModel):
    source_dataset_id: int
    steps: list[Step] = Field(min_length=1)
    name: str = Field(min_length=1, max_length=255)
