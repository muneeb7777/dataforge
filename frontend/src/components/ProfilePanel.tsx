import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface HistogramBin {
  lo: number;
  hi: number;
  count: number;
}
interface TopValue {
  value: unknown;
  count: number;
}
export interface ColumnProfile {
  name: string;
  dtype: string;
  count: number;
  null_count: number;
  null_pct: number;
  approx_distinct: number | null;
  min: unknown;
  max: unknown;
  mean: number | null;
  std: number | null;
  q25: unknown;
  q50: unknown;
  q75: unknown;
  histogram: HistogramBin[] | null;
  top_values: TopValue[] | null;
}
interface DatasetProfile {
  dataset_id: number;
  row_count: number;
  columns: ColumnProfile[];
}

const BAR = "#6366f1"; // indigo-500, validated vs slate-950 surface

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return String(v);
};

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="truncate text-slate-300" title={String(value ?? "")}>
        {fmt(value)}
      </span>
    </div>
  );
}

/** 10-bin inline histogram: thin bars anchored to the baseline, 2px gaps,
 * rounded data-ends, native tooltip per bar. Single series → single hue. */
function Histogram({ bins }: { bins: HistogramBin[] }) {
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div className="flex h-16 items-end gap-[2px]" role="img" aria-label="value distribution">
      {bins.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[4px]"
          style={{
            height: `${Math.max((b.count / max) * 100, b.count > 0 ? 4 : 0)}%`,
            minHeight: b.count > 0 ? 3 : 0,
            backgroundColor: BAR,
          }}
          title={`${fmt(b.lo)} – ${fmt(b.hi)}: ${b.count.toLocaleString()} rows`}
        />
      ))}
    </div>
  );
}

/** Top values as horizontal magnitude bars; labels wear text tokens, the bar
 * carries only magnitude. */
function TopValues({ values, total }: { values: TopValue[]; total: number }) {
  const max = Math.max(...values.map((v) => v.count), 1);
  return (
    <ul className="space-y-1.5">
      {values.map((v, i) => (
        <li key={i} title={`${String(v.value)}: ${v.count.toLocaleString()} rows`}>
          <div className="mb-0.5 flex justify-between gap-2 text-xs">
            <span className="truncate text-slate-300">{fmt(v.value)}</span>
            <span className="shrink-0 text-slate-500">
              {v.count.toLocaleString()} · {((v.count / total) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-900">
            <div
              className="h-full rounded-full"
              style={{ width: `${(v.count / max) * 100}%`, backgroundColor: BAR }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ColumnCard({ col, rowCount }: { col: ColumnProfile; rowCount: number }) {
  const isNumeric = col.histogram !== null;
  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h4 className="truncate font-medium text-slate-200" title={col.name}>
          {col.name}
        </h4>
        <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-400">
          {col.dtype}
        </span>
      </div>

      {col.histogram && <div className="mb-3"><Histogram bins={col.histogram} /></div>}
      {col.top_values && col.top_values.length > 0 && (
        <div className="mb-3"><TopValues values={col.top_values} total={rowCount} /></div>
      )}

      <div className="space-y-1 text-xs">
        <Stat label="nulls" value={`${col.null_count.toLocaleString()} (${col.null_pct}%)`} />
        <Stat label="distinct ≈" value={col.approx_distinct} />
        <Stat label="min" value={col.min} />
        <Stat label="max" value={col.max} />
        {isNumeric && (
          <>
            <Stat label="mean" value={col.mean} />
            <Stat label="std" value={col.std} />
            <Stat label="q25 / median / q75" value={`${fmt(col.q25)} / ${fmt(col.q50)} / ${fmt(col.q75)}`} />
          </>
        )}
      </div>
    </div>
  );
}

export default function ProfilePanel({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dataset-profile", datasetId],
    queryFn: async () =>
      (await api.get(`/api/datasets/${datasetId}/profile`)).data as DatasetProfile,
  });

  if (isLoading) return <p className="text-sm text-slate-500">Profiling…</p>;
  if (isError || !data)
    return <p className="text-sm text-red-400">Failed to compute profile.</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.columns.map((col) => (
          <ColumnCard key={col.name} col={col} rowCount={data.row_count} />
        ))}
      </div>
    </div>
  );
}
