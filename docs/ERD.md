# Entity-relationship diagram

Postgres holds metadata; each `datasets` row points at a DuckDB table
(`duckdb_table`) where the actual rows live.

```mermaid
erDiagram
    USERS {
        uuid id PK
        string email UK
        string hashed_password
        bool is_active
        bool is_superuser
        bool is_verified
    }

    DATASETS {
        int id PK
        string name
        string original_filename
        string file_type "csv|tsv|xlsx|xls|json|parquet|derived|fred"
        string file_path "uploaded file on disk; empty for derived/fred"
        string duckdb_table "ds_<id> or fred_<series>"
        string status "pending|ready|error"
        text error_message
        int row_count
        int column_count
        jsonb columns "[{name, dtype}]"
        int source_dataset_id FK "null unless studio-derived"
        jsonb pipeline "studio steps that produced it"
        timestamptz created_at
        timestamptz updated_at
    }

    EXPORT_JOBS {
        int id PK
        int dataset_id FK
        string format "csv|parquet|xlsx"
        string status "queued|running|done|error"
        string file_path
        text error_message
        string celery_task_id
        timestamptz created_at
        timestamptz completed_at
    }

    DATASETS ||--o{ EXPORT_JOBS : "is exported by"
    DATASETS |o--o{ DATASETS : "derived from (source_dataset_id)"
```

Notes:

- `users` is standalone for now — datasets are not yet owned per-user (single
  workspace). Adding an `owner_id` FK is the natural next migration.
- Deleting a dataset cascades its export jobs (`ondelete=CASCADE`) but only
  nulls `source_dataset_id` on derived datasets (`ondelete=SET NULL`), so
  derivations survive their source with provenance intact in `pipeline`.
- DuckDB tables are intentionally outside this diagram: their schema is
  per-dataset and recorded in `datasets.columns`.
