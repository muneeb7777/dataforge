"""Compile declarative transform pipelines to DuckDB SQL and execute them.

Each step becomes a CTE over the previous one (s0 = source scan, s1..sN = steps),
which keeps compiled SQL readable and makes DuckDB errors point at one step.
"""
import time

import duckdb

from app.schemas.studio import (
    DeriveStep,
    FilterStep,
    JoinStep,
    RenameStep,
    SelectStep,
    SortStep,
    Step,
)
from app.services.ingestion import _db_file, _duck_lock, _json_safe


class PipelineError(ValueError):
    pass


def _qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _order_clause(step: SortStep) -> str:
    return ", ".join(f"{_qident(k.column)} {'DESC' if k.desc else 'ASC'}" for k in step.by)


_JOIN_SQL = {"inner": "INNER", "left": "LEFT", "right": "RIGHT", "full": "FULL OUTER"}


def compile_pipeline(source_table: str, steps: list[Step], join_tables: dict[int, str]) -> str:
    """Compile to a WITH-chain. `join_tables` maps dataset_id -> duckdb table
    for every JoinStep (resolved by the caller against Postgres)."""
    ctes = [f"s0 AS (SELECT * FROM {_qident(source_table)})"]
    prev = "s0"
    for i, step in enumerate(steps, start=1):
        if isinstance(step, FilterStep):
            sql = f"SELECT * FROM {prev} WHERE {step.condition}"
        elif isinstance(step, SelectStep):
            cols = ", ".join(_qident(c) for c in step.columns)
            sql = f"SELECT {cols} FROM {prev}"
        elif isinstance(step, RenameStep):
            # duckdb 1.1 has no `* RENAME`; EXCLUDE + alias moves renamed cols to the end.
            excluded = ", ".join(_qident(o) for o in step.mapping)
            aliased = ", ".join(f"{_qident(o)} AS {_qident(n)}" for o, n in step.mapping.items())
            sql = f"SELECT * EXCLUDE ({excluded}), {aliased} FROM {prev}"
        elif isinstance(step, DeriveStep):
            sql = f"SELECT *, ({step.expression}) AS {_qident(step.column)} FROM {prev}"
        elif isinstance(step, SortStep):
            sql = f"SELECT * FROM {prev} ORDER BY {_order_clause(step)}"
        elif isinstance(step, JoinStep):
            right = join_tables.get(step.dataset_id)
            if right is None:
                raise PipelineError(f"Join references unknown dataset {step.dataset_id}")
            conds = " AND ".join(
                f"l.{_qident(k.left)} = r.{_qident(k.right)}" for k in step.on
            )
            sql = (
                f"SELECT * FROM {prev} AS l "
                f"{_JOIN_SQL[step.how]} JOIN {_qident(right)} AS r ON {conds}"
            )
        else:  # pragma: no cover - pydantic discriminator prevents this
            raise PipelineError(f"Unknown step type: {step!r}")
        ctes.append(f"s{i} AS ({sql})")
        prev = f"s{i}"

    query = "WITH " + ",\n     ".join(ctes) + f"\nSELECT * FROM {prev}"
    # ORDER BY inside a CTE is not guaranteed to survive the outer scan; if the
    # final step is a sort, restate it on the outer query.
    if steps and isinstance(steps[-1], SortStep):
        query += f" ORDER BY {_order_clause(steps[-1])}"
    return query


def preview_pipeline(sql: str, limit: int) -> dict:
    start = time.perf_counter()
    with _duck_lock, duckdb.connect(_db_file(), read_only=True) as con:
        cur = con.execute(sql)
        col_names = [d[0] for d in cur.description] if cur.description else []
        col_types = [str(d[1]) for d in cur.description] if cur.description else []
        raw = cur.fetchmany(limit + 1)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)

    truncated = len(raw) > limit
    raw = raw[:limit]
    return {
        "columns": [{"name": n, "dtype": t} for n, t in zip(col_names, col_types)],
        "rows": [{n: _json_safe(v) for n, v in zip(col_names, row)} for row in raw],
        "row_count": len(raw),
        "truncated": truncated,
        "duration_ms": duration_ms,
    }


def materialize_pipeline(sql: str, table: str) -> dict:
    """CREATE TABLE `table` from the compiled pipeline and return its metadata
    ({"row_count", "column_count", "columns"}), same shape as ingestion."""
    with _duck_lock, duckdb.connect(_db_file()) as con:
        con.execute(f"CREATE OR REPLACE TABLE {_qident(table)} AS {sql}")
        row_count = con.execute(f"SELECT COUNT(*) FROM {_qident(table)}").fetchone()[0]
        described = con.execute(f"DESCRIBE {_qident(table)}").fetchall()

    columns = [{"name": name, "dtype": dtype} for name, dtype, *_ in described]
    return {"row_count": row_count, "column_count": len(columns), "columns": columns}
