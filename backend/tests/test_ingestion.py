"""Ingestion service tests against a temp DuckDB store."""
import math
from datetime import date, datetime
from decimal import Decimal

import pytest

from app.services import ingestion


def _write_csv(tmp_path, name="data.csv", body="a,b\n1,x\n2,y\n3,\n"):
    path = tmp_path / name
    path.write_text(body)
    return path


def test_load_csv_reports_metadata(duck_env):
    meta = ingestion.load_file_to_table(_write_csv(duck_env), "t1")
    assert meta["row_count"] == 3
    assert meta["column_count"] == 2
    assert [c["name"] for c in meta["columns"]] == ["a", "b"]


def test_load_json_and_parquet(duck_env):
    json_path = duck_env / "data.json"
    json_path.write_text('[{"a": 1, "b": "x"}, {"a": 2, "b": "y"}]')
    assert ingestion.load_file_to_table(json_path, "tj")["row_count"] == 2

    # Round-trip: build a parquet file from the JSON table, then ingest it.
    import duckdb

    with duckdb.connect(ingestion._db_file()) as con:
        con.execute(f"COPY tj TO '{duck_env / 'data.parquet'}' (FORMAT PARQUET)")
    assert ingestion.load_file_to_table(duck_env / "data.parquet", "tp")["row_count"] == 2


def test_preview_pagination_and_sort(duck_env):
    ingestion.load_file_to_table(_write_csv(duck_env), "t1")
    page = ingestion.preview_table("t1", limit=2, offset=1, sort_by="a", sort_dir="desc")
    assert page["total_rows"] == 3
    assert [r["a"] for r in page["rows"]] == [2, 1]


def test_preview_rejects_unknown_sort_column(duck_env):
    ingestion.load_file_to_table(_write_csv(duck_env), "t1")
    with pytest.raises(ValueError, match="Unknown sort column"):
        ingestion.preview_table("t1", sort_by="nope")


def test_drop_table_is_idempotent(duck_env):
    ingestion.load_file_to_table(_write_csv(duck_env), "t1")
    ingestion.drop_table("t1")
    ingestion.drop_table("t1")  # no error on second drop


def test_file_type_for():
    assert ingestion.file_type_for("Report.XLSX") == "xlsx"
    with pytest.raises(ingestion.UnsupportedFileType):
        ingestion.file_type_for("archive.zip")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (float("nan"), None),
        (float("inf"), None),
        (Decimal("1.5"), 1.5),
        (date(2026, 1, 2), "2026-01-02"),
        (datetime(2026, 1, 2, 3, 4), "2026-01-02T03:04:00"),
        (b"\x01\xff", "01ff"),
        ("s", "s"),
        (None, None),
        (True, True),
    ],
)
def test_json_safe(value, expected):
    assert ingestion._json_safe(value) == expected
    assert not isinstance(ingestion._json_safe(value), float) or not math.isnan(
        ingestion._json_safe(value)
    )
