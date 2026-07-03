"""Build and run chart-data queries: aggregation is pushed down to DuckDB so the
browser only receives plot-ready rows. All identifiers are validated against the
table schema — this endpoint takes no raw SQL fragments."""
import duckdb

from app.services.ingestion import _db_file, _duck_lock, _json_safe, _qident

_AGG_SQL = {
    "sum": "SUM({y})",
    "avg": "AVG({y})",
    "min": "MIN({y})",
    "max": "MAX({y})",
    "count": "COUNT(*)",
    "count_distinct": "COUNT(DISTINCT {y})",
}


class VizError(ValueError):
    pass


def chart_data(
    table: str,
    x: str,
    y: str | None,
    agg: str,
    series: str | None,
    limit: int,
) -> dict:
    with _duck_lock, duckdb.connect(_db_file(), read_only=True) as con:
        schema_cols = {d[0] for d in con.execute(f"DESCRIBE {_qident(table)}").fetchall()}
        for role, col in (("x", x), ("y", y), ("series", series)):
            if col is not None and col not in schema_cols:
                raise VizError(f"Unknown {role} column: {col!r}")

        select = [f"{_qident(x)} AS x"]
        group: list[str] = []
        if agg == "none":
            if y is None:
                raise VizError("y column is required when agg is 'none'")
            select.append(f"{_qident(y)} AS y")
        else:
            if agg != "count" and y is None:
                raise VizError(f"y column is required for agg {agg!r}")
            select.append(_AGG_SQL[agg].format(y=_qident(y) if y else "") + " AS y")
            group = ["1"]
        if series is not None:
            select.insert(1, f"{_qident(series)} AS series")
            if group:
                group.append("2")

        sql = f"SELECT {', '.join(select)} FROM {_qident(table)} WHERE {_qident(x)} IS NOT NULL"
        if group:
            sql += f" GROUP BY {', '.join(group)}"
        sql += " ORDER BY 1"

        cur = con.execute(sql)
        col_names = [d[0] for d in cur.description]
        raw = cur.fetchmany(limit + 1)

    truncated = len(raw) > limit
    rows = [
        {name: _json_safe(v) for name, v in zip(col_names, row)} for row in raw[:limit]
    ]
    return {"rows": rows, "truncated": truncated, "sql": sql}
