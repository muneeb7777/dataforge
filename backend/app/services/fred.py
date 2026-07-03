"""FRED (Federal Reserve Economic Data) scheduled ingestion.

Originally specced as a Prefect flow; prefect 2.x pins pydantic<2.9 and broke
the build, so the schedule runs on Celery beat instead (see ARCHITECTURE.md).

Each configured series lands as a first-class Dataset backed by a DuckDB table
`fred_<series_id>`, upserted by name on every sync so the data stays fresh.
"""
import logging
import time
from datetime import datetime, timezone

import duckdb
import httpx
import pandas as pd
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.celery_app import celery_app
from app.core.config import get_settings
from app.models.dataset import Dataset
from app.services.ingestion import _db_file, _qident

logger = logging.getLogger(__name__)

FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"
_PLACEHOLDER_KEYS = ("", "your-fred-api-key-here")

_engine = create_engine(get_settings().sync_database_url, pool_pre_ping=True)
_SessionLocal = sessionmaker(bind=_engine)


def api_key_configured() -> bool:
    return get_settings().fred_api_key not in _PLACEHOLDER_KEYS


def observations_to_df(payload: dict) -> pd.DataFrame:
    """FRED returns observations as [{date, value}] with '.' for missing."""
    rows = payload.get("observations", [])
    df = pd.DataFrame(rows, columns=["date", "value"])
    if df.empty:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"), "value": pd.Series(dtype="float64")})
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["value"] = pd.to_numeric(df["value"].replace(".", None), errors="coerce")
    return df.dropna(subset=["date"]).reset_index(drop=True)


def fetch_series(series_id: str) -> pd.DataFrame:
    settings = get_settings()
    response = httpx.get(
        FRED_OBSERVATIONS_URL,
        params={"series_id": series_id, "api_key": settings.fred_api_key, "file_type": "json"},
        timeout=30,
    )
    response.raise_for_status()
    return observations_to_df(response.json())


def _connect_rw(attempts: int = 5, delay: float = 0.6) -> duckdb.DuckDBPyConnection:
    """The worker writes to DuckDB; the backend's write connections are
    short-lived, so retry briefly instead of failing on lock contention."""
    for attempt in range(attempts):
        try:
            return duckdb.connect(_db_file())
        except duckdb.IOException:
            if attempt == attempts - 1:
                raise
            time.sleep(delay)
    raise RuntimeError("unreachable")


def _load_df(df: pd.DataFrame, table: str) -> dict:
    con = _connect_rw()
    try:
        con.register("_fred_df", df)
        con.execute(f"CREATE OR REPLACE TABLE {_qident(table)} AS SELECT * FROM _fred_df")
        con.unregister("_fred_df")
        row_count = con.execute(f"SELECT COUNT(*) FROM {_qident(table)}").fetchone()[0]
        described = con.execute(f"DESCRIBE {_qident(table)}").fetchall()
    finally:
        con.close()
    columns = [{"name": name, "dtype": dtype} for name, dtype, *_ in described]
    return {"row_count": row_count, "column_count": len(columns), "columns": columns}


def sync_series(series_id: str) -> int:
    """Fetch one series and upsert its Dataset row. Returns the dataset id."""
    df = fetch_series(series_id)
    name = f"FRED {series_id}"
    session = _SessionLocal()
    try:
        dataset = session.execute(
            select(Dataset).where(Dataset.name == name)
        ).scalar_one_or_none()
        if dataset is None:
            dataset = Dataset(
                name=name,
                original_filename=f"fred:{series_id}",
                file_type="fred",
                file_path="",
                status="pending",
            )
            session.add(dataset)
            session.flush()

        table = f"fred_{series_id.lower()}"
        try:
            meta = _load_df(df, table)
            dataset.duckdb_table = table
            dataset.row_count = meta["row_count"]
            dataset.column_count = meta["column_count"]
            dataset.columns = meta["columns"]
            dataset.status = "ready"
            dataset.error_message = None
        except Exception as exc:
            dataset.status = "error"
            dataset.error_message = str(exc)[:2000]
            raise
        finally:
            session.commit()
        return dataset.id
    finally:
        session.close()


@celery_app.task(name="fred.sync")
def sync_all() -> dict:
    """Scheduled entrypoint: sync every configured series."""
    if not api_key_configured():
        logger.warning("FRED sync skipped: FRED_API_KEY is not configured")
        return {"skipped": True, "reason": "FRED_API_KEY not configured"}

    settings = get_settings()
    results: dict[str, str] = {}
    for series_id in [s.strip().upper() for s in settings.fred_series.split(",") if s.strip()]:
        try:
            dataset_id = sync_series(series_id)
            results[series_id] = f"ok (dataset {dataset_id})"
        except Exception as exc:
            logger.exception("FRED sync failed for %s", series_id)
            results[series_id] = f"error: {exc}"
    return {"skipped": False, "results": results}
