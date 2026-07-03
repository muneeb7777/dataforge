# DataForge

Full-stack data engineering & analytics platform: upload datasets, explore them
with SQL, transform them with declarative pipelines, chart them, run statistics
and forecasts, and export the results — all backed by DuckDB for analytics and
Postgres for metadata.

## Features

- **Ingestion** — upload CSV/TSV/Excel/JSON/Parquet (up to 500 MB); files land in
  DuckDB tables with typed schema metadata. A scheduled flow also syncs
  [FRED](https://fred.stlouisfed.org/) economic series daily.
- **Explore** — read-only SQL editor (DuckDB syntax) over every dataset.
- **Studio** — declarative transform pipelines (`filter`, `select`, `rename`,
  `derive`, `sort`, `join`) compiled to SQL, previewed live, and materialized as
  new datasets with full provenance.
- **Grid** — ag-grid views with infinite scrolling and server-side sorting.
- **Profiling** — per-column stats: nulls, distincts, quartiles, histograms,
  top values.
- **Charts** — bar/line/scatter with aggregation pushed down to DuckDB.
- **Stats** — correlation matrix, Welch t-test, chi-square, OLS regression, and
  Prophet time-series forecasting.
- **Exports** — background CSV/Parquet/XLSX exports via Celery with job polling.
- **Auth** — JWT authentication (fastapi-users); every data route is protected.

## Quickstart

Requires Docker Desktop.

```bash
cp .env.example .env        # then edit secrets if you care
docker compose up -d --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| API      | http://localhost:8000      |
| API docs | http://localhost:8000/docs |

Register a user on the login screen, upload a CSV on the Datasets page, and go.

To enable the FRED sync, get a free API key at
https://fred.stlouisfed.org/docs/api/api_key.html, set `FRED_API_KEY` in `.env`,
and restart. Series are configurable via `FRED_SERIES` (default
`GDP,CPIAUCSL,UNRATE`); trigger manually with `POST /api/fred/sync`.

## Development

Both containers hot-reload from bind mounts (uvicorn `--reload`, Vite HMR).
Database migrations run automatically on backend start; to apply a migration
added while the stack is running:

```bash
docker compose exec backend alembic upgrade head
```

Tests (hermetic — temp DuckDB per test, no Postgres needed):

```bash
docker compose exec backend pytest -q
```

Frontend typecheck:

```bash
docker compose exec frontend npx tsc -b
```

The Celery worker does **not** hot-reload; after changing task modules run
`docker compose restart worker`.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data flow, decisions
- [ERD.md](docs/ERD.md) — entity-relationship diagram
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — what was built, step by step

## Stack

FastAPI · SQLAlchemy 2 (async) · Alembic · Postgres 16 · DuckDB · Celery + Redis ·
pandas / scipy / statsmodels / scikit-learn / Prophet · React 18 · Vite ·
TypeScript · Tailwind · TanStack Query · ag-grid · Plotly · Zustand
