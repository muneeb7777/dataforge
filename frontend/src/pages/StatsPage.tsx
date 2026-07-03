import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import Plot from "react-plotly.js";
import clsx from "clsx";
import { api } from "../lib/api";
import type { Dataset } from "../lib/types";

/* Palette roles (dataviz reference, dark steps, validated vs slate-950):
 * blue = primary series hue; blue↔red with a neutral gray midpoint = the
 * diverging pair for correlation polarity. */
const BLUE = "#3987e5";
const RED = "#e66767";
const MID = "#383835";
const SURFACE = "#020617";
const GRID = "#1e293b";
const INK = "#cbd5e1";

const TOOLS = ["correlation", "ttest", "chi2", "regression", "forecast"] as const;
type Tool = (typeof TOOLS)[number];
const TOOL_LABELS: Record<Tool, string> = {
  correlation: "Correlation",
  ttest: "T-test",
  chi2: "Chi-square",
  regression: "Regression",
  forecast: "Forecast",
};

const isNumericDtype = (dtype: string) =>
  /^(U?(TINY|SMALL|BIG|HUGE)?INT|INTEGER|FLOAT|DOUBLE|REAL|DECIMAL)/i.test(dtype);

const fmtP = (p: number | null) =>
  p === null ? "—" : p < 0.001 ? p.toExponential(2) : p.toFixed(4);
const fmtN = (v: number | null, d = 4) => (v === null || v === undefined ? "—" : v.toFixed(d));

function apiDetail(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  return typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "Request failed";
}

const selectCls =
  "w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-2 text-sm text-slate-200 outline-none focus:border-indigo-700";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-900 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}

const darkLayout = {
  autosize: true,
  paper_bgcolor: SURFACE,
  plot_bgcolor: SURFACE,
  font: { color: INK, family: "inherit", size: 13 },
  margin: { t: 24, r: 16, b: 48, l: 64 },
} as const;

export default function StatsPage() {
  const [tool, setTool] = useState<Tool>("correlation");
  const [datasetId, setDatasetId] = useState<number | "">("");
  // per-tool column picks (reset when dataset changes)
  const [cols, setCols] = useState<Record<string, string>>({});
  const [features, setFeatures] = useState<string[]>([]);
  const [periods, setPeriods] = useState(30);

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => (await api.get("/api/datasets")).data as Dataset[],
  });
  const readyDatasets = datasets?.filter((d) => d.status === "ready") ?? [];
  const dataset = readyDatasets.find((d) => d.id === datasetId);
  const allCols = dataset?.columns ?? [];
  const numericCols = allCols.filter((c) => isNumericDtype(c.dtype)).map((c) => c.name);
  const allNames = allCols.map((c) => c.name);

  const run = useMutation({
    mutationFn: async () => {
      const base = { dataset_id: datasetId };
      const bodies: Record<Tool, unknown> = {
        correlation: base,
        ttest: { ...base, value_column: cols.value, group_column: cols.group },
        chi2: { ...base, column_a: cols.a, column_b: cols.b },
        regression: { ...base, target: cols.target, features },
        forecast: {
          ...base,
          date_column: cols.date,
          value_column: cols.value,
          periods,
          freq: "D",
        },
      };
      return (await api.post(`/api/stats/${tool}`, bodies[tool])).data;
    },
  });

  const pick = (key: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setCols((c) => ({ ...c, [key]: e.target.value }));

  const ready: Record<Tool, boolean> = {
    correlation: datasetId !== "",
    ttest: datasetId !== "" && !!cols.value && !!cols.group,
    chi2: datasetId !== "" && !!cols.a && !!cols.b,
    regression: datasetId !== "" && !!cols.target && features.length > 0,
    forecast: datasetId !== "" && !!cols.date && !!cols.value,
  };

  const error = run.isError ? apiDetail(run.error) : null;
  const result = run.data as Record<string, never> | undefined;

  const colSelect = (key: string, options: string[], empty = "Select…") => (
    <select value={cols[key] ?? ""} onChange={pick(key)} className={selectCls}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 p-6">
        <div>
          <h2 className="text-2xl font-semibold">Stats</h2>
          <p className="text-sm text-slate-500">Hypothesis tests, models &amp; forecasts</p>
        </div>

        <Field label="Dataset">
          <select
            value={datasetId === "" ? "" : String(datasetId)}
            onChange={(e) => {
              setDatasetId(e.target.value ? Number(e.target.value) : "");
              setCols({});
              setFeatures([]);
              run.reset();
            }}
            className={selectCls}
          >
            <option value="">Select…</option>
            {readyDatasets.map((d) => (
              <option key={d.id} value={d.id}>
                #{d.id} {d.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                run.reset();
              }}
              className={clsx(
                "rounded-md px-2.5 py-1.5 text-xs",
                tool === t
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200",
              )}
            >
              {TOOL_LABELS[t]}
            </button>
          ))}
        </div>

        {tool === "correlation" && (
          <p className="text-xs text-slate-500">
            Pearson correlation across all numeric columns.
          </p>
        )}
        {tool === "ttest" && (
          <>
            <Field label="Value column (numeric)">{colSelect("value", numericCols)}</Field>
            <Field label="Group column (2 levels)">{colSelect("group", allNames)}</Field>
          </>
        )}
        {tool === "chi2" && (
          <>
            <Field label="Column A">{colSelect("a", allNames)}</Field>
            <Field label="Column B">{colSelect("b", allNames)}</Field>
          </>
        )}
        {tool === "regression" && (
          <>
            <Field label="Target (numeric)">{colSelect("target", numericCols)}</Field>
            <Field label="Features">
              <div className="space-y-1 rounded-md border border-slate-800 p-2">
                {numericCols
                  .filter((c) => c !== cols.target)
                  .map((c) => (
                    <label key={c} className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={features.includes(c)}
                        onChange={(e) =>
                          setFeatures((f) =>
                            e.target.checked ? [...f, c] : f.filter((x) => x !== c),
                          )
                        }
                      />
                      {c}
                    </label>
                  ))}
              </div>
            </Field>
          </>
        )}
        {tool === "forecast" && (
          <>
            <Field label="Date column">{colSelect("date", allNames)}</Field>
            <Field label="Value column (numeric)">{colSelect("value", numericCols)}</Field>
            <Field label="Horizon (days)">
              <input
                type="number"
                min={1}
                max={365}
                value={periods}
                onChange={(e) => setPeriods(Number(e.target.value))}
                className={selectCls}
              />
            </Field>
          </>
        )}

        <button
          onClick={() => run.mutate()}
          disabled={!ready[tool] || run.isPending}
          className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          <FlaskConical size={16} />
          {run.isPending ? "Running…" : "Run"}
        </button>

        {error && (
          <div className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-y-auto p-6">
        {!result ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-600">
            Configure a test and hit Run.
          </div>
        ) : tool === "correlation" ? (
          <Plot
            data={[
              {
                type: "heatmap",
                x: result.columns,
                y: result.columns,
                z: result.matrix,
                zmin: -1,
                zmax: 1,
                colorscale: [
                  [0, BLUE],
                  [0.5, MID],
                  [1, RED],
                ],
                colorbar: { tickfont: { color: INK } },
              } as never,
            ]}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            config={{ displaylogo: false, responsive: true }}
            layout={{ ...darkLayout, xaxis: { gridcolor: GRID }, yaxis: { gridcolor: GRID } }}
          />
        ) : tool === "ttest" ? (
          <div className="max-w-md">
            <h3 className="mb-3 text-lg font-medium">Welch's t-test</h3>
            <StatRow label={`mean(${result.group_a})`} value={`${fmtN(result.mean_a)} (n=${result.n_a})`} />
            <StatRow label={`mean(${result.group_b})`} value={`${fmtN(result.mean_b)} (n=${result.n_b})`} />
            <StatRow label="t statistic" value={fmtN(result.t_stat)} />
            <StatRow label="p-value" value={fmtP(result.p_value)} />
            <p className="mt-3 text-xs text-slate-500">
              {result.p_value !== null && result.p_value < 0.05
                ? "Difference is significant at α = 0.05."
                : "No significant difference at α = 0.05."}
            </p>
          </div>
        ) : tool === "chi2" ? (
          <div className="max-w-2xl">
            <h3 className="mb-3 text-lg font-medium">Chi-square test of independence</h3>
            <StatRow label="χ²" value={fmtN(result.chi2)} />
            <StatRow label="degrees of freedom" value={result.dof} />
            <StatRow label="p-value" value={fmtP(result.p_value)} />
            <h4 className="mb-2 mt-5 text-sm font-medium text-slate-400">Observed counts</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-left">
                    <th className="px-3 py-2" />
                    {(result.col_labels as string[]).map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.observed as number[][]).map((row, i) => (
                    <tr key={i} className="border-t border-slate-900">
                      <td className="px-3 py-1.5 font-medium text-slate-400">
                        {(result.row_labels as string[])[i]}
                      </td>
                      {row.map((v, j) => (
                        <td key={j} className="px-3 py-1.5 tabular-nums">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tool === "regression" ? (
          <div className="max-w-2xl">
            <h3 className="mb-3 text-lg font-medium">OLS regression</h3>
            <StatRow label="R²" value={fmtN(result.r2)} />
            <StatRow label="adjusted R²" value={fmtN(result.adj_r2)} />
            <StatRow label="observations" value={result.n_obs} />
            <h4 className="mb-2 mt-5 text-sm font-medium text-slate-400">Coefficients</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-left">
                    {["term", "coef", "std err", "t", "p-value"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.coefficients as {
                    name: string; coef: number | null; std_err: number | null;
                    t_stat: number | null; p_value: number | null;
                  }[]).map((c) => (
                    <tr key={c.name} className="border-t border-slate-900 tabular-nums">
                      <td className="px-3 py-1.5 font-medium text-slate-300">{c.name}</td>
                      <td className="px-3 py-1.5">{fmtN(c.coef)}</td>
                      <td className="px-3 py-1.5">{fmtN(c.std_err)}</td>
                      <td className="px-3 py-1.5">{fmtN(c.t_stat, 3)}</td>
                      <td className="px-3 py-1.5">{fmtP(c.p_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* forecast: one entity, one hue — actuals solid, fit dashed, band translucent */
          <Plot
            data={[
              {
                type: "scatter",
                mode: "lines",
                name: "upper",
                x: (result.forecast as { ds: string }[]).map((r) => r.ds),
                y: (result.forecast as { yhat_upper: number }[]).map((r) => r.yhat_upper),
                line: { width: 0 },
                showlegend: false,
                hoverinfo: "skip",
              },
              {
                type: "scatter",
                mode: "lines",
                name: "interval",
                x: (result.forecast as { ds: string }[]).map((r) => r.ds),
                y: (result.forecast as { yhat_lower: number }[]).map((r) => r.yhat_lower),
                fill: "tonexty",
                fillcolor: "rgba(57, 135, 229, 0.15)",
                line: { width: 0 },
                showlegend: false,
                hoverinfo: "skip",
              },
              {
                type: "scatter",
                mode: "lines",
                name: "forecast",
                x: (result.forecast as { ds: string }[]).map((r) => r.ds),
                y: (result.forecast as { yhat: number }[]).map((r) => r.yhat),
                line: { color: BLUE, width: 2, dash: "dash" },
              },
              {
                type: "scatter",
                mode: "lines+markers",
                name: "actual",
                x: (result.history as { ds: string }[]).map((r) => r.ds),
                y: (result.history as { y: number }[]).map((r) => r.y),
                line: { color: BLUE, width: 2 },
                marker: { size: 8 },
              },
            ]}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
            config={{ displaylogo: false, responsive: true }}
            layout={{
              ...darkLayout,
              xaxis: { gridcolor: GRID },
              yaxis: { gridcolor: GRID },
              showlegend: true,
              legend: { orientation: "h", y: -0.15 },
              hovermode: "x unified",
            }}
          />
        )}
      </div>
    </div>
  );
}
