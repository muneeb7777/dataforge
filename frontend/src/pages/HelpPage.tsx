import type { ReactNode } from "react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-slate-800">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-900/50 group-open:border-b group-open:border-slate-800">
        {title}
      </summary>
      <div className="space-y-3 px-4 py-4 text-sm text-slate-400">{children}</div>
    </details>
  );
}

function Requires({ items }: { items: string[] }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Required inputs
      </h4>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function Example({ children }: { children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Example</h4>
      <div className="overflow-x-auto rounded bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-300">
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-900 px-1 py-0.5 text-xs text-slate-300">{children}</code>;
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h2 className="text-2xl font-semibold">Help</h2>
      <p className="mb-6 text-sm text-slate-500">
        What each part of DataForge does, what it needs from you, and one example each.
      </p>

      <div className="space-y-3">
        <Section title="Datasets — upload, preview, delete">
          <p>
            Upload data files and DataForge loads them into fast analytical tables. Column types
            (numbers, dates, text, booleans) are inferred automatically from the data. Every other
            feature — Explore, Studio, Charts, Stats, Exports — operates on these datasets. Click a
            dataset name to preview its rows and profile its columns; the trash icon deletes the
            dataset along with its underlying table and file. Datasets created by Studio show a
            &ldquo;derived from&rdquo; link back to their source, and FRED economic series (when
            configured) appear here too, refreshed daily.
          </p>
          <Requires
            items={[
              "A file in one of: CSV, TSV, Excel (.xlsx / .xls), JSON, or Parquet",
              "Maximum size 500 MB",
            ]}
          />
          <Example>
            Upload <span className="text-indigo-300">sales.csv</span> containing an{" "}
            <span className="text-indigo-300">order_date</span> column like 2026-01-05 → it appears
            as a dataset with type DATE, ready to chart by month or forecast.
          </Example>
        </Section>

        <Section title="Explore — SQL editor">
          <p>
            A read-only SQL editor (DuckDB syntax) over all of your datasets. The sidebar lists
            every table — click one to scaffold a query. Press{" "}
            <Code>Ctrl+Enter</Code> to run. Only read statements are accepted (
            <Code>SELECT</Code>, <Code>WITH</Code>, <Code>FROM</Code>, <Code>DESCRIBE</Code>,{" "}
            <Code>SHOW</Code>, <Code>SUMMARIZE</Code>, <Code>EXPLAIN</Code>, <Code>PIVOT</Code>,{" "}
            <Code>UNPIVOT</Code>) — anything that writes is rejected, and only a single statement
            may run at a time. Results are capped at 1,000 rows; a &ldquo;truncated&rdquo; note
            appears when the cap was hit.
          </p>
          <Requires items={["At least one ready dataset", "A single read-only SQL statement"]} />
          <Example>
            SELECT region, SUM(quantity) AS units FROM ds_1 GROUP BY region ORDER BY units DESC
          </Example>
        </Section>

        <Section title="Studio — transform pipelines">
          <p>
            Build a pipeline of transform steps over a source dataset, watch the result preview
            live as you edit, then <em>materialize</em> it as a new dataset (the steps and source
            are stored with it as provenance). Steps run in order, each on the previous step&rsquo;s
            output. <strong>Builder mode</strong> gives you a form card per step;{" "}
            <strong>JSON mode</strong> edits the same pipeline as text — switch freely, both edit
            the identical structure. Incomplete step forms are ignored by the preview until filled
            in.
          </p>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              The six step types
            </h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Code>filter</Code> — keep rows matching a SQL condition. Input: condition, e.g.{" "}
                <Code>quantity &gt; 5</Code>
              </li>
              <li>
                <Code>select</Code> — keep only the listed columns. Input: column names
              </li>
              <li>
                <Code>rename</Code> — rename columns. Input: old → new name pairs (renamed columns
                move to the end)
              </li>
              <li>
                <Code>derive</Code> — add a computed column. Inputs: new column name + SQL
                expression, e.g. <Code>quantity * unit_price</Code>
              </li>
              <li>
                <Code>sort</Code> — order rows. Input: one or more columns, each ascending or
                descending
              </li>
              <li>
                <Code>join</Code> — combine with another dataset. Inputs: the other dataset, join
                type (inner / left / right / full), and left = right key column pairs
              </li>
            </ul>
          </div>
          <Requires
            items={[
              "A source dataset",
              "At least one complete step",
              "A name for the materialized result",
            ]}
          />
          <Example>
            {`[{"type": "derive", "column": "revenue", "expression": "quantity * unit_price"},`}
            <br />
            {` {"type": "filter", "condition": "revenue > 100"},`}
            <br />
            {` {"type": "sort", "by": [{"column": "revenue", "desc": true}]}]`}
          </Example>
        </Section>

        <Section title="Charts — chart builder">
          <p>
            Pick a dataset, a chart type (<strong>bar</strong>, <strong>line</strong>, or{" "}
            <strong>scatter</strong>), an X-axis column, and what to plot on Y. The aggregation
            (sum, avg, min, max, count, count&nbsp;distinct — or &ldquo;none&rdquo; for raw points)
            is computed in the database, so only plot-ready values reach the browser (capped at
            2,000 points). An optional <em>series</em> column splits the data into one colored
            trace per value — up to 8 series; beyond that, narrow the group-by instead. The
            compiled SQL is shown under the controls for transparency.
          </p>
          <Requires
            items={[
              "Dataset + X-axis column",
              "Y-axis column (not needed for the count aggregation)",
              "Optional: series (group-by) column",
            ]}
          />
          <Example>
            Bar chart of <span className="text-indigo-300">region</span> (X) vs{" "}
            <span className="text-indigo-300">sum(quantity)</span> (Y), series by{" "}
            <span className="text-indigo-300">product</span> → grouped bars, one color per product.
          </Example>
        </Section>

        <Section title="Stats — tests, models & forecasts">
          <p>Five tools, each with its own input requirements:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Correlation</strong> — Pearson matrix across all numeric columns, shown as a
              blue↔red heatmap (−1 to +1). Requires ≥ 2 numeric columns.
            </li>
            <li>
              <strong>T-test</strong> — Welch&rsquo;s two-sample test of whether two groups differ
              in mean. Requires a numeric value column and a group column with{" "}
              <em>exactly two</em> distinct values (each with ≥ 2 rows).
            </li>
            <li>
              <strong>Chi-square</strong> — test of independence between two categorical columns.
              Requires two columns with 2–50 distinct values each; shows the observed counts table.
            </li>
            <li>
              <strong>Regression</strong> — ordinary least squares. Requires a numeric target and
              one or more numeric feature columns; reports coefficients with p-values, R², and
              adjusted R².
            </li>
            <li>
              <strong>Forecast</strong> — Prophet time-series forecast. Requires a date column and
              a numeric value column with ≥ 5 distinct dates; duplicate dates are summed. Horizon
              is 1–365 days. The chart shows actuals (solid), the model fit/forecast (dashed), and
              a confidence band.
            </li>
          </ul>
          <Example>
            T-test: value column <span className="text-indigo-300">quantity</span>, group column{" "}
            <span className="text-indigo-300">product_line</span> (Widget / Gadget) → t = −1.96,
            p = 0.09 → no significant difference at α = 0.05.
          </Example>
        </Section>

        <Section title="Data grid — browsing large tables">
          <p>
            Dataset pages use a virtualized grid that loads rows in blocks of 100 as you scroll, so
            million-row datasets stay responsive — the full table is never sent to the browser.
            Click a column header to sort (the sort runs in the database over the{" "}
            <em>entire</em> dataset, not just loaded rows); drag header edges to resize columns.
            Result grids in Explore and Studio additionally support client-side column filters via
            the header menus. The grid is read-only — to change data, build a Studio pipeline and
            materialize the result as a new dataset, which also preserves the original and records
            what was done to it.
          </p>
          <Requires items={["A ready dataset (or an Explore/Studio result)"]} />
          <Example>
            Open a 500k-row dataset → scroll freely; click{" "}
            <span className="text-indigo-300">revenue</span> once for ascending, again for
            descending — the top rows update from a database-side sort.
          </Example>
        </Section>

        <Section title="Exports — download your data">
          <p>
            Export any dataset to <strong>CSV</strong>, <strong>Parquet</strong>, or{" "}
            <strong>Excel (.xlsx)</strong>. Exports run as background jobs on the worker, so large
            datasets don&rsquo;t block the app: the job list refreshes automatically every couple
            of seconds while anything is queued or running, and a{" "}
            <span className="text-indigo-300">download</span> link appears when a job finishes.
            Failed jobs show their error inline.
          </p>
          <Requires items={["A ready dataset", "A format: csv, parquet, or xlsx"]} />
          <Example>
            Dataset <span className="text-indigo-300">sales_enriched</span> + format{" "}
            <span className="text-indigo-300">parquet</span> → status queued → running → done →
            download <span className="text-indigo-300">sales_enriched.parquet</span>.
          </Example>
        </Section>
      </div>
    </div>
  );
}
