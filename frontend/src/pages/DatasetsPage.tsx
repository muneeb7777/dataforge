import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { api } from "../lib/api";
import type { Dataset } from "../lib/types";

const ACCEPT = ".csv,.tsv,.xlsx,.xls,.json,.parquet";

function StatusPill({ status }: { status: Dataset["status"] }) {
  const styles = {
    ready: "bg-emerald-950 text-emerald-400",
    pending: "bg-amber-950 text-amber-400",
    error: "bg-red-950 text-red-400",
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles}`}>{status}</span>;
}

export default function DatasetsPage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => (await api.get("/api/datasets")).data as Dataset[],
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post("/api/datasets", form)).data as Dataset;
    },
    onSuccess: () => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setUploadError(detail ?? "Upload failed");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/datasets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["datasets"] }),
  });

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Datasets</h2>
          <p className="text-sm text-slate-500">Upload CSV, Excel, JSON or Parquet files</p>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
          >
            <Upload size={16} />
            {upload.isPending ? "Uploading…" : "Upload file"}
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 rounded-md border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
          {uploadError}
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : !datasets?.length ? (
        <div className="rounded-lg border border-dashed border-slate-800 p-12 text-center text-slate-500">
          No datasets yet. Upload a file to get started.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Rows</th>
              <th className="py-2 pr-4 font-medium">Columns</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Created</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {datasets.map((ds) => (
              <tr key={ds.id} className="border-b border-slate-900 hover:bg-slate-900/50">
                <td className="py-2 pr-4">
                  <Link to={`/datasets/${ds.id}`} className="text-indigo-400 hover:underline">
                    {ds.name}
                  </Link>
                </td>
                <td className="py-2 pr-4 uppercase text-slate-400">{ds.file_type}</td>
                <td className="py-2 pr-4">{ds.row_count?.toLocaleString() ?? "—"}</td>
                <td className="py-2 pr-4">{ds.column_count ?? "—"}</td>
                <td className="py-2 pr-4">
                  <StatusPill status={ds.status} />
                </td>
                <td className="py-2 pr-4 text-slate-400">
                  {new Date(ds.created_at).toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => remove.mutate(ds.id)}
                    className="text-slate-500 hover:text-red-400"
                    title="Delete dataset"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
