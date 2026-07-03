import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import Plot from "react-plotly.js";
import { api } from "../lib/api";
import type { Dataset } from "../lib/types";

/* Categorical palette (dataviz reference, dark steps) — validated against the
 * slate-950 surface; slots are assigned to series in fixed order, never cycled. */
const SERIES_COLORS = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
];
const MAX_SERIES = SERIES_COLORS.length;

const CHART_TYPES = ["bar", "line", "scatter"] as const;
const AGGS = ["none", "sum", "avg", "min", "max", "count", "count_distinct"] as const;
type ChartType = (typeof CHART_TYPES)[number];
type Agg = (typeof AGGS)[number];

interface VizRow {
  x: unknown;
  y: unknown;
  series?: unknown;
}
interface VizResult {
  rows: VizRow[];
  truncated: boolean;
  sql: string;
}

function Select({
  label,
  value,
  onChange,
  options,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowEmpty?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-2 text-slate-200 outline-none focus:border-indigo-700"
      >
        {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ChartsPage() {
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [agg, setAgg] = useState<Agg>("sum");
  const [series, setSeries] = useState("");

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => (await api.get("/api/datasets")).data as Dataset[],
  });
  const readyDatasets = datasets?.filter((d) => d.status === "ready") ?? [];
  const dataset = readyDatasets.find((d) => d.id === datasetId);
  const columns = dataset?.columns?.map((c) => c.name) ?? [];

  const fetchData = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/viz/data", {
          dataset_id: datasetId,
          x,
          y: agg === "count" ? null : y || null,
          agg,
          series: series || null,
          limit: 2000,
        })
      ).data as VizResult,
  });

  const canRender = datasetId !== "" && x !== "" && (agg === "count" || y !== "");

  const { traces, seriesOverflow } = useMemo(() => {
    const rows = fetchData.data?.rows ?? [];
    // Group rows into one trace per series value; slot colors assigned in
    // first-appearance order and kept stable for the result set.
    const bySeries = new Map<string, VizRow[]>();
    for (const row of rows) {
      const key = row.series === undefined ? "" : String(row.series);
      if (!bySeries.has(key)) bySeries.set(key, []);
      bySeries.get(key)!.push(row);
    }
    const names = [...bySeries.keys()];
    const overflow = names.length > MAX_SERIES;
    const kept = names.slice(0, MAX_SERIES);
    const plotType = chartType === "bar" ? "bar" : "scatter";
    const mode = chartType === "line" ? "lines+markers" : "markers";
    return {
      seriesOverflow: overflow,
      traces: kept.map((name, i) => ({
        type: plotType as "bar" | "scatter",
        ...(plotType === "scatter" ? { mode } : {}),
        name: name || (y || "count"),
        x: bySeries.get(name)!.map((r) => r.x as string | number),
        y: bySeries.get(name)!.map((r) => r.y as number),
        marker: { color: SERIES_COLORS[i] },
        ...(chartType === "line" ? { line: { color: SERIES_COLORS[i], width: 2 } } : {}),
      })),
    };
  }, [fetchData.data, chartType, y]);

  const error = fetchData.isError
    ? ((fetchData.error as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail ?? "Failed to fetch chart data")
    : null;

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 p-6">
        <div>
          <h2 className="text-2xl font-semibold">Charts</h2>
          <p className="text-sm text-slate-500">Aggregation runs in DuckDB</p>
        </div>

        <Select
          label="Dataset"
          value={datasetId === "" ? "" : String(datasetId)}
          onChange={(v) => {
            setDatasetId(v ? Number(v) : "");
            setX("");
            setY("");
            setSeries("");
            fetchData.reset();
          }}
          options={readyDatasets.map((d) => String(d.id))}
          allowEmpty="Select…"
        />
        {dataset && (
          <p className="-mt-2 text-xs text-slate-500">
            {dataset.name} · {dataset.row_count?.toLocaleString()} rows
          </p>
        )}

        <Select
          label="Chart type"
          value={chartType}
          onChange={(v) => setChartType(v as ChartType)}
          options={[...CHART_TYPES]}
        />
        <Select label="X axis" value={x} onChange={setX} options={columns} allowEmpty="Select…" />
        <Select
          label="Aggregation"
          value={agg}
          onChange={(v) => setAgg(v as Agg)}
          options={[...AGGS]}
        />
        {agg !== "count" && (
          <Select label="Y axis" value={y} onChange={setY} options={columns} allowEmpty="Select…" />
        )}
        <Select
          label="Series (group by)"
          value={series}
          onChange={setSeries}
          options={columns}
          allowEmpty="(none)"
        />

        <button
          onClick={() => fetchData.mutate()}
          disabled={!canRender || fetchData.isPending}
          className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          <BarChart3 size={16} />
          {fetchData.isPending ? "Loading…" : "Render chart"}
        </button>

        {error && (
          <div className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {seriesOverflow && (
          <div className="rounded-md border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-300">
            More than {MAX_SERIES} series — extra series are hidden. Narrow the group-by
            column instead.
          </div>
        )}
        {fetchData.data?.truncated && (
          <div className="rounded-md border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-300">
            Result truncated to 2,000 points.
          </div>
        )}

        {fetchData.data && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer text-slate-400">Compiled SQL</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 leading-relaxed">
              {fetchData.data.sql}
            </pre>
          </details>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden p-6">
        {!fetchData.data ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-600">
            Configure a chart and hit Render.
          </div>
        ) : (
          <Plot
            data={traces}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            config={{ displaylogo: false, responsive: true }}
            layout={{
              autosize: true,
              paper_bgcolor: "#020617",
              plot_bgcolor: "#020617",
              font: { color: "#cbd5e1", family: "inherit", size: 13 },
              xaxis: { gridcolor: "#1e293b", zerolinecolor: "#334155", title: { text: x } },
              yaxis: {
                gridcolor: "#1e293b",
                zerolinecolor: "#334155",
                title: { text: agg === "none" ? y : `${agg}(${y || "*"})` },
              },
              showlegend: traces.length > 1,
              legend: { orientation: "h", y: -0.15 },
              barmode: "group",
              margin: { t: 24, r: 16, b: 48, l: 56 },
              hovermode: "closest",
            }}
          />
        )}
      </div>
    </div>
  );
}
