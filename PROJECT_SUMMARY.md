# Project summary

DataForge was built incrementally against an 11-step build order, each step
verified end-to-end against the running Docker stack before moving on. All 11
steps are complete as of 2026-07-04, plus a test suite, CI, docs, and the FRED
scheduled flow.

## What exists

| Step | Deliverable | Status |
|---|---|---|
| 1 | Scaffold: docker-compose (postgres/redis/backend/worker/frontend), FastAPI + config + async SQLAlchemy + Celery plumbing, Vite/React/Tailwind shell | ✅ |
| 2 | Docker images build & stack boots with healthchecks | ✅ |
| 3 | Ingestion: multi-format upload → DuckDB `ds_<id>` tables, dataset registry, datasets UI | ✅ |
| 4 | Explore: read-only SQL endpoint + editor page | ✅ |
| 5 | Studio: declarative pipelines (filter/select/rename/derive/sort/join) → CTE SQL, live preview, materialize with provenance (migration 0002) | ✅ |
| 6 | Grid: ag-grid infinite row model with server-side sort; shared results grid | ✅ |
| 7 | Profiling: SUMMARIZE-based column stats, histograms, top values, Profile tab | ✅ |
| 8 | Charts: DuckDB-pushed aggregation + Plotly builder with validated palette | ✅ |
| 9 | Stats/ML: correlation, Welch t-test, chi-square, OLS, Prophet forecast | ✅ |
| 10 | Exports: Celery jobs → CSV/Parquet/XLSX on shared volume, polling UI (migration 0003) | ✅ |
| 11 | Auth: fastapi-users JWT, all data routes protected, login UI (migration 0004) | ✅ |
| + | FRED scheduled ingestion (Celery beat daily; manual `POST /api/fred/sync`) | ✅ (needs `FRED_API_KEY`) |
| + | Backend test suite — 48 hermetic pytest tests | ✅ |
| + | GitHub Actions CI (backend pytest, frontend tsc) | ✅ |
| + | Docs: README, ARCHITECTURE, ERD, this summary | ✅ |

## Notable engineering decisions

1. **Two-store split** — Postgres for metadata, a DuckDB file for data; every
   analytical operation compiles to DuckDB SQL rather than shipping rows.
2. **Prefect dropped for Celery beat** — prefect 2.x's `pydantic<2.9` pin made
   the image unbuildable; the scheduled FRED flow runs on the already-present
   Celery infrastructure instead.
3. **Two-tier SQL trust model** — Explore/Studio accept raw DuckDB fragments
   behind read-only connections + statement gating; all other endpoints
   validate identifiers against schemas and accept no SQL.
4. **Provenance-first transforms** — materialized pipelines store their step
   JSON and source dataset id, so a future visual builder round-trips the same
   structure.

## Dependency pins that matter (hard-won)

- `pydantic==2.9.2` ⟂ `prefect 2.x` — do not re-add prefect 2.x.
- `cmdstanpy==1.2.0` — required by `prophet==1.1.5` (newer cmdstanpy rejects
  prophet's bundled cmdstan).
- `duckdb==1.1.1` — no `SELECT * RENAME`; studio uses `* EXCLUDE` + alias.

## Verification status

- 48 pytest tests green (~2.5 s), run inside the backend container.
- Frontend passes a full `tsc -b` typecheck.
- Every API surface was exercised live with curl during development, including
  failure paths (injection attempts, unknown columns, wrong group counts,
  missing API keys).
- UI flows were verified at the module-compilation and data-contract level;
  the rendered pages deserve one human click-through.

## Known gaps / next steps

- Datasets are workspace-global; no per-user ownership yet (`owner_id` FK is
  the natural next migration).
- Studio has a JSON step editor; the visual builder is deferred by design.
- No frontend component tests (vitest is configured but unused).
- Export files accumulate on the volume; no retention policy.
- Single-node DuckDB concurrency model (documented in ARCHITECTURE.md).
