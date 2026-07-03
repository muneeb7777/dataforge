"""Read-only SQL exploration over the DuckDB store.

Queries run on a read_only connection (so a concurrent ingest can't be
corrupted) and are additionally gated to read-style statements. This is a
single-user dev tool, not a hardened SQL sandbox.
"""
import time

import duckdb

from app.services.ingestion import _db_file, _duck_lock, _json_safe

MAX_ROWS = 1000

# Statements a query may start with (DuckDB also allows bare FROM / PIVOT).
READ_PREFIXES = (
    "select",
    "with",
    "from",
    "describe",
    "show",
    "summarize",
    "explain",
    "pivot",
    "unpivot",
)


class QueryRejected(ValueError):
    pass


def run_query(sql: str, max_rows: int = 200) -> dict:
    stripped = sql.strip().rstrip(";").strip()
    if not stripped:
        raise QueryRejected("Query is empty")
    if ";" in stripped:
        raise QueryRejected("Only a single statement is allowed")
    if not stripped.lower().startswith(READ_PREFIXES):
        raise QueryRejected(
            "Only read queries are allowed: " + ", ".join(p.upper() for p in READ_PREFIXES)
        )

    max_rows = max(1, min(max_rows, MAX_ROWS))
    start = time.perf_counter()
    with _duck_lock, duckdb.connect(_db_file(), read_only=True) as con:
        cur = con.execute(stripped)
        col_names = [d[0] for d in cur.description] if cur.description else []
        col_types = [str(d[1]) for d in cur.description] if cur.description else []
        raw = cur.fetchmany(max_rows + 1)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)

    truncated = len(raw) > max_rows
    raw = raw[:max_rows]
    rows = [{name: _json_safe(v) for name, v in zip(col_names, row)} for row in raw]
    return {
        "columns": [{"name": n, "dtype": t} for n, t in zip(col_names, col_types)],
        "rows": rows,
        "row_count": len(rows),
        "truncated": truncated,
        "duration_ms": duration_ms,
    }
