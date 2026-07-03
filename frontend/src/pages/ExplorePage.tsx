import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play, Table2 } from "lucide-react";
import { api } from "../lib/api";
import type { ColumnInfo, Dataset } from "../lib/types";
import ResultsGrid from "../components/ResultsGrid";

interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
}

export default function ExplorePage() {
  const [sql, setSql] = useState("");

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => (await api.get("/api/datasets")).data as Dataset[],
  });

  const query = useMutation({
    mutationFn: async (statement: string) =>
      (await api.post("/api/explore/query", { sql: statement, max_rows: 200 })).data as QueryResult,
  });

  const run = () => {
    if (sql.trim()) query.mutate(sql);
  };

  const queryError = query.isError
    ? ((query.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
      "Query failed")
    : null;

  const readyDatasets = datasets?.filter((d) => d.status === "ready" && d.duckdb_table) ?? [];

  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-slate-800 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tables
        </h3>
        {!readyDatasets.length ? (
          <p className="text-sm text-slate-600">No datasets ingested yet.</p>
        ) : (
          <ul className="space-y-1">
            {readyDatasets.map((ds) => (
              <li key={ds.id}>
                <button
                  onClick={() => setSql(`SELECT * FROM ${ds.duckdb_table} LIMIT 100`)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-900"
                  title={`${ds.name} (${ds.row_count?.toLocaleString()} rows)`}
                >
                  <Table2 size={14} className="shrink-0 text-slate-500" />
                  <span className="truncate">
                    {ds.duckdb_table}
                    <span className="ml-1 text-xs text-slate-500">{ds.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden p-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Explore</h2>
            <p className="text-sm text-slate-500">
              Read-only SQL over your datasets (DuckDB syntax) · Ctrl+Enter to run
            </p>
          </div>
          <button
            onClick={run}
            disabled={query.isPending || !sql.trim()}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            <Play size={16} />
            {query.isPending ? "Running…" : "Run"}
          </button>
        </div>

        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          spellCheck={false}
          placeholder="SELECT region, SUM(quantity) AS units FROM ds_1 GROUP BY region ORDER BY units DESC"
          className="mb-4 h-36 w-full shrink-0 resize-y rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-700"
        />

        {queryError && (
          <div className="mb-3 rounded-md border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
            {queryError}
          </div>
        )}

        {query.data && (
          <>
            <p className="mb-2 text-xs text-slate-500">
              {query.data.row_count.toLocaleString()} row{query.data.row_count === 1 ? "" : "s"}
              {query.data.truncated && " (truncated)"} · {query.data.duration_ms} ms
            </p>
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-800">
              <ResultsGrid columns={query.data.columns} rows={query.data.rows} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
