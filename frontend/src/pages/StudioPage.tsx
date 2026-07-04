import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import type { ColumnInfo, Dataset } from "../lib/types";
import type { Step } from "../lib/steps";
import { pruneSteps } from "../lib/steps";
import StepBuilder from "../components/StepBuilder";
import ResultsGrid from "../components/ResultsGrid";

interface PreviewResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
  sql: string;
}

function apiDetail(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  return typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "Request failed";
}

export default function StudioPage() {
  const queryClient = useQueryClient();
  const [sourceId, setSourceId] = useState<number | "">("");
  const [mode, setMode] = useState<"builder" | "json">("builder");
  const [steps, setSteps] = useState<Step[]>([]);
  const [jsonText, setJsonText] = useState("[]");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [saved, setSaved] = useState<Dataset | null>(null);

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => (await api.get("/api/datasets")).data as Dataset[],
  });
  const readyDatasets = datasets?.filter((d) => d.status === "ready") ?? [];
  const source = readyDatasets.find((d) => d.id === sourceId);
  const sourceColumns = source?.columns?.map((c) => c.name) ?? [];

  const effectiveSteps = useMemo(() => pruneSteps(steps), [steps]);

  const switchMode = (next: "builder" | "json") => {
    if (next === mode) return;
    if (next === "json") {
      setJsonText(JSON.stringify(steps, null, 2));
      setJsonError(null);
      setMode("json");
    } else {
      try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) throw new Error("steps must be a JSON array");
        setSteps(parsed as Step[]);
        setJsonError(null);
        setMode("builder");
      } catch (e) {
        setJsonError(`Fix JSON before switching: ${(e as Error).message}`);
      }
    }
  };

  const onJsonChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("steps must be a JSON array");
      setSteps(parsed as Step[]);
      setJsonError(null);
    } catch (e) {
      setJsonError(`Invalid JSON: ${(e as Error).message}`);
    }
  };

  const preview = useMutation({
    mutationFn: async (body: { source_dataset_id: number; steps: Step[] }) =>
      (await api.post("/api/studio/preview", { ...body, limit: 100 })).data as PreviewResult,
  });

  // Live preview: debounce on source/steps changes.
  useEffect(() => {
    if (sourceId === "") return;
    const handle = setTimeout(
      () => preview.mutate({ source_dataset_id: sourceId, steps: effectiveSteps }),
      600,
    );
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, effectiveSteps]);

  const materialize = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/studio/materialize", {
          source_dataset_id: sourceId,
          steps: effectiveSteps,
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
    sourceId !== "" && effectiveSteps.length > 0 && !!newName.trim() && !materialize.isPending;

  return (
    <div className="flex h-screen">
      <div className="flex w-[28rem] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 p-6">
        <div>
          <h2 className="text-2xl font-semibold">Studio</h2>
          <p className="text-sm text-slate-500">
            Transform pipelines: preview live, save as a new dataset
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Source dataset</span>
          <select
            value={sourceId === "" ? "" : String(sourceId)}
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

        <div className="flex gap-1 border-b border-slate-800">
          {(["builder", "json"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={clsx(
                "-mb-px border-b-2 px-3 py-1.5 text-xs uppercase tracking-wide",
                mode === m
                  ? "border-indigo-500 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === "builder" ? (
          <StepBuilder
            steps={steps}
            onChange={setSteps}
            sourceColumns={sourceColumns}
            datasets={readyDatasets.filter((d) => d.id !== sourceId)}
          />
        ) : (
          <textarea
            value={jsonText}
            onChange={(e) => onJsonChange(e.target.value)}
            spellCheck={false}
            className="h-64 w-full resize-y rounded-md border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-200 outline-none focus:border-indigo-700"
          />
        )}
        {jsonError && <p className="text-xs text-amber-400">{jsonError}</p>}

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
          {effectiveSteps.length < steps.length && (
            <span className="ml-2 font-normal normal-case text-slate-600">
              (incomplete steps are ignored)
            </span>
          )}
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
