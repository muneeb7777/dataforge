"""Shared fixtures: point DuckDB/upload storage at a temp dir per test."""
import duckdb
import pytest

from app.core.config import get_settings


@pytest.fixture()
def duck_env(tmp_path, monkeypatch):
    """Isolated storage: each test gets its own DuckDB file + upload dir.

    Settings are cached with lru_cache and read env vars (which take precedence
    over .env), so overriding the env + clearing the cache is sufficient.
    """
    monkeypatch.setenv("DUCKDB_DIR", str(tmp_path / "duckdb"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


@pytest.fixture()
def seed(duck_env):
    """Run raw SQL against the (temp) DuckDB store to set up tables."""
    from app.services.ingestion import _db_file

    def _seed(*statements: str) -> None:
        with duckdb.connect(_db_file()) as con:
            for statement in statements:
                con.execute(statement)

    return _seed
