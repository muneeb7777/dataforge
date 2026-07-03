import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import ProfilePanel from "../components/ProfilePanel";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, IDatasource } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { api } from "../lib/api";
import type { Dataset, DatasetPreview } from "../lib/types";

const BLOCK_SIZE = 100;

export default function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"data" | "profile">("data");

  const { data: dataset } = useQuery({
    queryKey: ["dataset", id],
    queryFn: async () => (await api.get(`/api/datasets/${id}`)).data as Dataset,
    enabled: !!id,
  });

  const columnDefs = useMemo<ColDef[]>(
    () =>
      (dataset?.columns ?? []).map((col) => ({
        colId: col.name,
        headerName: col.name,
        headerTooltip: col.dtype,
        valueGetter: (p) => p.data?.[col.name],
      })),
    [dataset?.columns],
  );

  // Infinite row model: ag-grid asks for blocks; we translate to limit/offset
  // (+ single-column server-side sort) against the preview endpoint.
  const datasource = useMemo<IDatasource>(
    () => ({
      getRows: async (params) => {
        const sort = params.sortModel[0];
        try {
          const { data } = await api.get(`/api/datasets/${id}/preview`, {
            params: {
              limit: params.endRow - params.startRow,
              offset: params.startRow,
              sort_by: sort?.colId,
              sort_dir: sort?.sort,
            },
          });
          const preview = data as DatasetPreview;
          params.successCallback(preview.rows, preview.total_rows);
        } catch {
          params.failCallback();
        }
      },
    }),
    [id],
  );

  return (
    <div className="flex h-screen flex-col p-8">
      <Link
        to="/datasets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft size={14} /> All datasets
      </Link>

      {!dataset ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <h2 className="text-2xl font-semibold">{dataset.name}</h2>
          <p className="mb-4 text-sm text-slate-500">
            {dataset.original_filename} · {dataset.file_type.toUpperCase()} ·{" "}
            {dataset.row_count?.toLocaleString() ?? "?"} rows · {dataset.column_count ?? "?"}{" "}
            columns
            {dataset.source_dataset_id != null && (
              <>
                {" "}
                · derived from{" "}
                <Link
                  to={`/datasets/${dataset.source_dataset_id}`}
                  className="text-indigo-400 hover:underline"
                >
                  #{dataset.source_dataset_id}
                </Link>
              </>
            )}
          </p>

          {dataset.status === "error" && (
            <div className="mb-4 rounded-md border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
              Ingestion failed: {dataset.error_message}
            </div>
          )}

          {dataset.status === "ready" && (
            <>
              <div className="mb-3 flex gap-1 border-b border-slate-800">
                {(["data", "profile"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={clsx(
                      "-mb-px border-b-2 px-4 py-2 text-sm capitalize",
                      tab === t
                        ? "border-indigo-500 text-slate-100"
                        : "border-transparent text-slate-500 hover:text-slate-300",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "data" ? (
                <div className="ag-theme-quartz-dark min-h-0 flex-1 rounded-lg border border-slate-800">
                  <AgGridReact
                    columnDefs={columnDefs}
                    rowModelType="infinite"
                    datasource={datasource}
                    cacheBlockSize={BLOCK_SIZE}
                    maxBlocksInCache={10}
                    defaultColDef={{ sortable: true, resizable: true, minWidth: 110 }}
                    animateRows={false}
                    enableCellTextSelection
                  />
                </div>
              ) : (
                <ProfilePanel datasetId={id!} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
