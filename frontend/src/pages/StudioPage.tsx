import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { api } from "../lib/api";
import type { ColumnInfo, Dataset } from "../lib/types";
import ResultsGrid from "../components/ResultsGrid";

interface PreviewResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
  sql: string;
}

const STEP_REFERENCE = [
  '{"type": "filter", "condition": "quantity > 5"}',
  '{"type": "select", "columns": ["region", "quantity"]}',
  '{"type": "rename", "mapping": {"old_name": "new_name"}}',
  '{"type": "derive", "column": "revenue", "expression": "quantity * unit_price"}',
  '{"type": "sort", "by": [{"column": "revenue", "desc": true}]}',
  '{"type": "join", "dataset_id": 2, "how": "left", "on": [{"left": "region", "right": "region"}]}',
];

function apiDetail(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  return typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "Request failed";
}

export default function StudioPage() {
  const queryClient = useQueryClient();
  const [sourceId, setSourceId] = useState<number | "">("");
  const [stepsText, setStepsText] = useState("[]");
  const [newName, setNewName] = useState("");
  const [saved, setSaved] = useState<Dataset | null>(null);

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => (await api.get("/api/datasets")).data as Dataset[],
  });
  const readyDatasets = datasets?.filter((d) => d.status === "ready") ?? [];

  const parsedSteps = useMemo(() => {
    try {
      const value = JSON.parse(stepsText);
      return Array.isArray(value) ? { steps: value, error: null } : { steps: null, error: "Steps must be a JSON array" };
    } catch (e) {
      return { steps: null, error: `Invalid JSON: ${(e as Error).message}` };
    }
  }, [stepsText]);

  const preview = useMutation({
    mutationFn: async (body: { source_dataset_id: number; steps: unknown[] }) =>
      (await api.post("/api/studio/preview", { ...body, limit: 100 })).data as PreviewResult,
  });

  // Live preview: debounce on source/steps changes.
  useEffect(() => {
    if (sourceId === "" || !parsedSteps.steps) return;
    const handle = setTimeout(
      () => preview.mutate({ source_dataset_id: sourceId, steps: parsedSteps.steps! }),
      500,
    );
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, stepsText, parsedSteps.steps]);

  const materialize = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/studio/materialize", {
          source_dataset_id: sourceId,
          steps: parsedSteps.steps,
          name: newName.trim(),
        })
      ).data as Dataset,
    onSuccess: (ds) => {
      setSaved(ds);
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });

  const previewError = preview.isError ? apiDetail(preview.error) : null;
  const saveError = materialize.isError ? apiDetail(materialize.error) : null;
  const canSave =
    sourceId !== "" && !!parsedSteps.steps?.length && !!newName.trim() && !materialize.isPending;

  return (
    <div className="flex h-screen">
      <div className="flex w-[26rem] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 p-6">
        <div>
          <h2 className="text-2xl font-semibold">Studio</h2>
          <p className="text-sm text-slate-500">Transform pipelines: preview live, save as a new dataset</p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Source dataset</span>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")}
            className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-2 text-slate-200 outline-none focus:border-indigo-700"
          >
            <option value="">Select…</option>
            {readyDatasets.map((ds) => (
              <option key={ds.id} value={ds.id}>
                #{ds.id} {ds.name} ({ds.row_count?.toLocaleString()} rows)
              </option>
            ))}
          </select>
        </label>

        <label className="block flex-1 text-sm">
          <span className="mb-1 block text-slate-400">Steps (JSON array, applied in order)</span>
          <textarea
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            spellCheck={false}
            className="h-64 w-full resize-y rounded-md border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-200 outline-none focus:border-indigo-700"
          />
        </label>
        {parsedSteps.error && <p className="text-xs text-amber-400">{parsedSteps.error}</p>}

        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer text-slate-400">Step reference</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 leading-relaxed">
            {STEP_REFERENCE.join("\n")}
          </pre>
        </details>

        <div className="border-t border-slate-800 pt-4">
          <label className="mb-2 block text-sm">
            <span className="mb-1 block text-slate-400">Save result as</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="new dataset name"
              className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-2 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-700"
            />
          </label>
          <button
            onClick={() => materialize.mutate()}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={16} />
            {materialize.isPending ? "Materializing…" : "Materialize as dataset"}
          </button>
          {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
          {saved && (
            <p className="mt-2 text-xs text-emerald-400">
              Saved as{" "}
              <Link to={`/datasets/${saved.id}`} className="underline">
                #{saved.id} {saved.name}
              </Link>{" "}
              ({saved.row_count?.toLocaleString()} rows)
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-6">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Live preview
        </h3>

        {sourceId === "" ? (
          <p className="text-sm text-slate-600">Pick a source dataset to see a preview.</p>
        ) : previewError ? (
          <div className="mb-3 rounded-md border border-red-900 bg-red-950 px-4 py-2 text-sm text-red-300">
            {previewError}
          </div>
        ) : null}

        {preview.data && !previewError && (
          <>
            <p className="mb-2 text-xs text-slate-500">
              {preview.data.row_count.toLocaleString()} row
              {preview.data.row_count === 1 ? "" : "s"}
              {preview.data.truncated && " (truncated)"} · {preview.data.duration_ms} ms
              {preview.isPending && " · refreshing…"}
            </p>
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-800">
              <ResultsGrid columns={preview.data.columns} rows={preview.data.rows} />
            </div>
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer text-slate-400">Compiled SQL</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 leading-relaxed">
                {preview.data.sql}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
