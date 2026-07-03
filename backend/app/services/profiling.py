"""Per-column dataset profiling, computed in DuckDB.

Base stats come from DuckDB's SUMMARIZE (min/max/approx_unique/avg/std/quartiles/
null%); numeric columns get a 10-bin equi-width histogram and non-numeric
columns get top-5 value counts.
"""
import duckdb

from app.services.ingestion import _db_file, _duck_lock, _json_safe, _qident

HISTOGRAM_BINS = 10
TOP_VALUES = 5

_NUMERIC_PREFIXES = (
    "TINYINT",
    "SMALLINT",
    "INTEGER",
    "BIGINT",
    "HUGEINT",
    "UTINYINT",
    "USMALLINT",
    "UINTEGER",
    "UBIGINT",
    "FLOAT",
    "DOUBLE",
    "REAL",
    "DECIMAL",
)


def _is_numeric(dtype: str) -> bool:
    return dtype.upper().startswith(_NUMERIC_PREFIXES)


def _as_float(value) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _histogram(con, table: str, column: str, lo: float, hi: float) -> list[dict]:
    if hi <= lo:  # constant column: one bin holds every non-null value
        count = con.execute(
            f"SELECT COUNT({_qident(column)}) FROM {_qident(table)}"
        ).fetchone()[0]
        return [{"lo": lo, "hi": hi, "count": count}]

    width = (hi - lo) / HISTOGRAM_BINS
    rows = con.execute(
        f"""
        SELECT CAST(LEAST(FLOOR(({_qident(column)} - ?) / ?), ?) AS INT) AS bin,
               COUNT(*) AS n
        FROM {_qident(table)}
        WHERE {_qident(column)} IS NOT NULL
        GROUP BY bin ORDER BY bin
        """,
        [lo, width, HISTOGRAM_BINS - 1],
    ).fetchall()
    counts = {bin_idx: n for bin_idx, n in rows}
    return [
        {"lo": lo + i * width, "hi": lo + (i + 1) * width, "count": counts.get(i, 0)}
        for i in range(HISTOGRAM_BINS)
    ]


def _top_values(con, table: str, column: str) -> list[dict]:
    rows = con.execute(
        f"""
        SELECT {_qident(column)} AS value, COUNT(*) AS n
        FROM {_qident(table)}
        WHERE {_qident(column)} IS NOT NULL
        GROUP BY value ORDER BY n DESC, value
        LIMIT {TOP_VALUES}
        """
    ).fetchall()
    return [{"value": _json_safe(v), "count": n} for v, n in rows]


def profile_table(table: str) -> dict:
    with _duck_lock, duckdb.connect(_db_file(), read_only=True) as con:
        row_count = con.execute(f"SELECT COUNT(*) FROM {_qident(table)}").fetchone()[0]

        cur = con.execute(f"SUMMARIZE {_qident(table)}")
        names = [d[0] for d in cur.description]
        summary = [dict(zip(names, row)) for row in cur.fetchall()]

        columns = []
        for s in summary:
            dtype = s["column_type"]
            null_pct = _as_float(s.get("null_percentage")) or 0.0
            null_count = round(row_count * null_pct / 100)
            profile = {
                "name": s["column_name"],
                "dtype": dtype,
                "count": row_count - null_count,
                "null_count": null_count,
                "null_pct": round(null_pct, 2),
                "approx_distinct": s.get("approx_unique"),
                "min": _json_safe(s.get("min")),
                "max": _json_safe(s.get("max")),
                "mean": _as_float(s.get("avg")),
                "std": _as_float(s.get("std")),
                "q25": _json_safe(s.get("q25")),
                "q50": _json_safe(s.get("q50")),
                "q75": _json_safe(s.get("q75")),
                "histogram": None,
                "top_values": None,
            }
            if _is_numeric(dtype):
                lo, hi = _as_float(s.get("min")), _as_float(s.get("max"))
                if lo is not None and hi is not None and profile["count"] > 0:
                    profile["histogram"] = _histogram(con, table, s["column_name"], lo, hi)
            else:
                profile["top_values"] = _top_values(con, table, s["column_name"])
            columns.append(profile)

    return {"row_count": row_count, "columns": columns}
