"""File ingestion: parse uploaded files into DuckDB tables and extract metadata.

All functions here are synchronous (duckdb/pandas are blocking); API routes call
them via run_in_threadpool. DuckDB is single-writer, so all access goes through
a process-wide lock — fine for dev; revisit if the worker needs write access.
"""
import math
import threading
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

import duckdb
import pandas as pd

from app.core.config import get_settings

_duck_lock = threading.Lock()

SUPPORTED_EXTENSIONS = {".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"}


class UnsupportedFileType(ValueError):
    pass


def _db_file() -> str:
    return str(get_settings().duckdb_path / "dataforge.duckdb")


def _quote_path(p: Path) -> str:
    """Escape a filesystem path for embedding in a DuckDB string literal."""
    return str(p).replace("'", "''")


def _qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def file_type_for(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFileType(
            f"Unsupported file type {ext!r}; supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )
    return ext.lstrip(".")


def load_file_to_table(path: Path, table: str) -> dict:
    """Load a data file into DuckDB table `table` (created/replaced) and return
    {"row_count", "column_count", "columns": [{"name", "dtype"}]}.

    `table` must be an internally generated name (e.g. "ds_42"), never user input.
    """
    ext = path.suffix.lower()
    src = _quote_path(path)
    with _duck_lock, duckdb.connect(_db_file()) as con:
        if ext in (".csv", ".tsv"):
            con.execute(
                f'CREATE OR REPLACE TABLE "{table}" AS '
                f"SELECT * FROM read_csv_auto('{src}', sample_size=-1)"
            )
        elif ext == ".parquet":
            con.execute(
                f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_parquet(\'{src}\')'
            )
        elif ext == ".json":
            con.execute(
                f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_json_auto(\'{src}\')'
            )
        elif ext in (".xlsx", ".xls"):
            df = pd.read_excel(path)  # noqa: F841 - registered by name below
            con.register("_upload_df", df)
            con.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM _upload_df')
            con.unregister("_upload_df")
        else:
            raise UnsupportedFileType(f"Unsupported file type: {ext!r}")

        row_count = con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        described = con.execute(f'DESCRIBE "{table}"').fetchall()

    columns = [{"name": name, "dtype": dtype} for name, dtype, *_ in described]
    return {"row_count": row_count, "column_count": len(columns), "columns": columns}


def drop_table(table: str) -> None:
    with _duck_lock, duckdb.connect(_db_file()) as con:
        con.execute(f'DROP TABLE IF EXISTS "{table}"')


def _json_safe(value):
    if value is None:
        return None
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else value
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (bytes, bytearray)):
        return value.hex()
    if isinstance(value, (str, int, bool)):
        return value
    return str(value)


def preview_table(
    table: str,
    limit: int = 50,
    offset: int = 0,
    sort_by: str | None = None,
    sort_dir: str = "asc",
) -> dict:
    """Return {"columns", "rows", "total_rows"} for a page of a DuckDB table,
    optionally sorted by one column (validated against the table schema)."""
    with _duck_lock, duckdb.connect(_db_file()) as con:
        described = con.execute(f'DESCRIBE "{table}"').fetchall()
        order = ""
        if sort_by:
            if sort_by not in {d[0] for d in described}:
                raise ValueError(f"Unknown sort column: {sort_by!r}")
            order = f" ORDER BY {_qident(sort_by)} {'DESC' if sort_dir == 'desc' else 'ASC'}"
        total_rows = con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        cur = con.execute(f'SELECT * FROM "{table}"{order} LIMIT ? OFFSET ?', [limit, offset])
        col_names = [d[0] for d in cur.description]
        raw_rows = cur.fetchall()

    columns = [{"name": name, "dtype": dtype} for name, dtype, *_ in described]
    rows = [{name: _json_safe(v) for name, v in zip(col_names, row)} for row in raw_rows]
    return {"columns": columns, "rows": rows, "total_rows": total_rows}
