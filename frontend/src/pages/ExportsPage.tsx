import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Send } from "lucide-react";
import { api, downloadFile } from "../lib/api";
import type { Dataset } from "../lib/types";

interface ExportJob {
  id: number;
  dataset_id: number;
  dataset_name: string | null;
  format: string;
  status: "queued" | "running" | "done" | "error";
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const FORMATS = ["csv", "parquet", "xlsx"] as const;

function StatusPill({ status }: { status: ExportJob["status"] }) {
  const styles = {
    queued: "bg-slate-800 text-slate-300",
    running: "bg-amber-950 text-amber-400",
    done: "bg-emerald-950 text-emerald-400",
    error: "bg-red-950 text-red-400",
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles}`}>{status}</span>;
}

export default function ExportsPage() {
  const queryClient = useQueryClient();
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("csv");

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => (await api.get("/api/datasets")).data as Dataset[],
  });
  const readyDatasets = datasets?.filter((d) => d.status === "ready") ?? [];

  const { data: jobs } = useQuery({
    queryKey: ["exports"],
    queryFn: async () => (await api.get("/api/exports")).data as ExportJob[],
    // Poll while anything is in flight.
    refetchInterval: (query) =>
      query.state.data?.some((j) => j.status === "queued" || j.status === "running")
        ? 1500
        : false,
  });

  const launch = useMutation({
    mutationFn: async () =>
      (await api.post("/api/exports", { dataset_id: datasetId, format })).data as ExportJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exports"] }),
  });

  return (
    <div className="max-w-4xl p-8">
      <h2 className="text-2xl font-semibold">Exports</h2>
      <p className="mb-6 text-sm text-slate-500">
        Exports run in the background worker; download when done.
      </p>

      <div className="mb-8 flex items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Dataset</span>
          <select
            value={datasetId === "" ? "" : String(datasetId)}
            onChange={(e) => setDatasetId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-slate-800 bg-slate-900 px-2 py-2 text-slate-200 outline-none focus:border-indigo-700"
          >
            <option value="">Select…</option>
            {readyDatasets.map((d) => (
              <option key={d.id} value={d.id}>
                #{d.id} {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as (typeof FORMATS)[number])}
            className="rounded-md border border-slate-800 bg-slate-900 px-2 py-2 text-slate-200 outline-none focus:border-indigo-700"
          >
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => launch.mutate()}
          disabled={datasetId === "" || launch.isPending}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          <Send size={16} />
          Export
        </button>
      </div>

      {!jobs?.length ? (
        <div className="rounded-lg border border-dashed border-slate-800 p-12 text-center text-slate-500">
          No exports yet.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="py-2 pr-4 font-medium">Job</th>
              <th className="py-2 pr-4 font-medium">Dataset</th>
              <th className="py-2 pr-4 font-medium">Format</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Created</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-slate-900">
                <td className="py-2 pr-4 text-slate-400">#{job.id}</td>
                <td className="py-2 pr-4">{job.dataset_name ?? `dataset ${job.dataset_id}`}</td>
                <td className="py-2 pr-4 uppercase text-slate-400">{job.format}</td>
                <td className="py-2 pr-4">
                  <StatusPill status={job.status} />
                  {job.status === "error" && (
                    <span className="ml-2 text-xs text-red-400" title={job.error_message ?? ""}>
                      {job.error_message?.slice(0, 60)}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-slate-400">
                  {new Date(job.created_at).toLocaleTimeString()}
                </td>
                <td className="py-2 text-right">
                  {job.status === "done" && (
                    <button
                      onClick={() =>
                        downloadFile(
                          `/api/exports/${job.id}/download`,
                          `${job.dataset_name ?? `export_${job.id}`}.${job.format}`,
                        )
                      }
                      className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
                    >
                      <Download size={14} /> download
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
