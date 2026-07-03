export interface ColumnInfo {
  name: string;
  dtype: string;
}

export interface Dataset {
  id: number;
  name: string;
  original_filename: string;
  file_type: string;
  duckdb_table: string | null;
  status: "pending" | "ready" | "error";
  error_message: string | null;
  row_count: number | null;
  column_count: number | null;
  columns: ColumnInfo[] | null;
  source_dataset_id: number | null;
  pipeline: Record<string, unknown>[] | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetPreview {
  dataset_id: number;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total_rows: number;
  limit: number;
  offset: number;
}
