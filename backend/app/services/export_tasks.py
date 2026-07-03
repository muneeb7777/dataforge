"""Celery task: export a dataset's DuckDB table to CSV / Parquet / XLSX.

Runs in the worker process, which shares the uploads + duckdb volumes with the
backend. DuckDB allows one read-write process OR many read-only processes, and
the backend opens short-lived read-write connections during ingest/materialize —
so the worker connects read-only with a small retry loop to ride out those
windows.
"""
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.models.dataset import Dataset
from app.models.export_job import ExportJob
from app.services.ingestion import _db_file, _qident

settings = get_settings()

# Worker uses the sync driver; the async engine in app.db.session is for FastAPI.
_engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
_SessionLocal = sessionmaker(bind=_engine)

EXPORT_FORMATS = ("csv", "parquet", "xlsx")


def _exports_dir() -> Path:
    d = settings.upload_path / "exports"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _connect_readonly(attempts: int = 5, delay: float = 0.6) -> duckdb.DuckDBPyConnection:
    for attempt in range(attempts):
        try:
            return duckdb.connect(_db_file(), read_only=True)
        except duckdb.IOException:
            if attempt == attempts - 1:
                raise
            time.sleep(delay)
    raise RuntimeError("unreachable")


def _quote_literal(path: str) -> str:
    return path.replace("'", "''")


def _write_export(table: str, fmt: str, out_path: Path) -> None:
    con = _connect_readonly()
    try:
        dest = _quote_literal(str(out_path))
        if fmt == "csv":
            con.execute(f"COPY (SELECT * FROM {_qident(table)}) TO '{dest}' (HEADER, DELIMITER ',')")
        elif fmt == "parquet":
            con.execute(f"COPY (SELECT * FROM {_qident(table)}) TO '{dest}' (FORMAT PARQUET)")
        elif fmt == "xlsx":
            df = con.execute(f"SELECT * FROM {_qident(table)}").df()
            df.to_excel(out_path, index=False, engine="xlsxwriter")
        else:
            raise ValueError(f"Unsupported export format: {fmt!r}")
    finally:
        con.close()


@celery_app.task(name="exports.run")
def run_export(job_id: int) -> None:
    session = _SessionLocal()
    try:
        job = session.get(ExportJob, job_id)
        if job is None:
            return
        job.status = "running"
        session.commit()

        try:
            dataset = session.get(Dataset, job.dataset_id)
            if dataset is None or not dataset.duckdb_table:
                raise ValueError("Dataset (or its DuckDB table) no longer exists")
            out_path = _exports_dir() / f"export_{job.id}_{dataset.duckdb_table}.{job.format}"
            _write_export(dataset.duckdb_table, job.format, out_path)
            job.file_path = str(out_path)
            job.status = "done"
        except Exception as exc:  # job errors land in the row, not the worker log only
            job.status = "error"
            job.error_message = str(exc)[:2000]
        job.completed_at = datetime.now(timezone.utc)
        session.commit()
    finally:
        session.close()
