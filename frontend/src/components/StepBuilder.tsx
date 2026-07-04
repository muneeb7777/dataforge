import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type { Dataset } from "../lib/types";
import { STEP_TYPES, newStep } from "../lib/steps";
import type { JoinStep, RenameStep, SelectStep, SortStep, Step } from "../lib/steps";

const inputCls =
  "w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-700";

const COLUMNS_DATALIST = "studio-source-columns";

function RowButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: typeof Plus;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="text-slate-500 hover:text-slate-200"
    >
      <Icon size={13} />
    </button>
  );
}

function ColumnInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={COLUMNS_DATALIST}
      className={inputCls}
    />
  );
}

function StepBody({
  step,
  datasets,
  onChange,
}: {
  step: Step;
  datasets: Dataset[];
  onChange: (s: Step) => void;
}) {
  switch (step.type) {
    case "filter":
      return (
        <input
          value={step.condition}
          onChange={(e) => onChange({ ...step, condition: e.target.value })}
          placeholder="quantity > 5 AND region = 'North'"
          className={`${inputCls} font-mono`}
        />
      );

    case "select": {
      const set = (i: number, v: string) => {
        const columns = [...step.columns];
        columns[i] = v;
        onChange({ ...step, columns });
      };
      return (
        <div className="space-y-1">
          {step.columns.map((col, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <ColumnInput value={col} onChange={(v) => set(i, v)} placeholder="column" />
              <RowButton
                icon={X}
                label="Remove column"
                onClick={() =>
                  onChange({ ...step, columns: step.columns.filter((_, j) => j !== i) } as SelectStep)
                }
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...step, columns: [...step.columns, ""] })}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <Plus size={12} /> column
          </button>
        </div>
      );
    }

    case "rename": {
      const entries = Object.entries(step.mapping);
      const setEntries = (next: [string, string][]) =>
        onChange({ ...step, mapping: Object.fromEntries(next) } as RenameStep);
      return (
        <div className="space-y-1">
          {entries.map(([oldName, newName], i) => (
            <div key={i} className="flex items-center gap-1.5">
              <ColumnInput
                value={oldName}
                onChange={(v) => {
                  const next: [string, string][] = [...entries];
                  next[i] = [v, newName];
                  setEntries(next);
                }}
                placeholder="old name"
              />
              <span className="text-xs text-slate-600">→</span>
              <input
                value={newName}
                onChange={(e) => {
                  const next: [string, string][] = [...entries];
                  next[i] = [oldName, e.target.value];
                  setEntries(next);
                }}
                placeholder="new name"
                className={inputCls}
              />
              <RowButton
                icon={X}
                label="Remove rename"
                onClick={() => setEntries(entries.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEntries([...entries, ["", ""]])}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <Plus size={12} /> rename
          </button>
        </div>
      );
    }

    case "derive":
      return (
        <div className="space-y-1">
          <input
            value={step.column}
            onChange={(e) => onChange({ ...step, column: e.target.value })}
            placeholder="new column name"
            className={inputCls}
          />
          <input
            value={step.expression}
            onChange={(e) => onChange({ ...step, expression: e.target.value })}
            placeholder="quantity * unit_price * (1 - discount)"
            className={`${inputCls} font-mono`}
          />
        </div>
      );

    case "sort": {
      const setKey = (i: number, patch: Partial<SortStep["by"][number]>) => {
        const by = step.by.map((k, j) => (j === i ? { ...k, ...patch } : k));
        onChange({ ...step, by });
      };
      return (
        <div className="space-y-1">
          {step.by.map((key, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <ColumnInput value={key.column} onChange={(v) => setKey(i, { column: v })} placeholder="column" />
              <label className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={key.desc}
                  onChange={(e) => setKey(i, { desc: e.target.checked })}
                />
                desc
              </label>
              <RowButton
                icon={X}
                label="Remove sort key"
                onClick={() => onChange({ ...step, by: step.by.filter((_, j) => j !== i) } as SortStep)}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...step, by: [...step.by, { column: "", desc: false }] })}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <Plus size={12} /> sort key
          </button>
        </div>
      );
    }

    case "join": {
      const setPair = (i: number, patch: Partial<JoinStep["on"][number]>) => {
        const on = step.on.map((k, j) => (j === i ? { ...k, ...patch } : k));
        onChange({ ...step, on });
      };
      return (
        <div className="space-y-1">
          <div className="flex gap-1.5">
            <select
              value={step.dataset_id || ""}
              onChange={(e) => onChange({ ...step, dataset_id: Number(e.target.value) || 0 })}
              className={inputCls}
            >
              <option value="">join dataset…</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  #{d.id} {d.name}
                </option>
              ))}
            </select>
            <select
              value={step.how}
              onChange={(e) => onChange({ ...step, how: e.target.value as JoinStep["how"] })}
              className={`${inputCls} w-24 shrink-0`}
            >
              {(["inner", "left", "right", "full"] as const).map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          {step.on.map((pair, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <ColumnInput value={pair.left} onChange={(v) => setPair(i, { left: v })} placeholder="left column" />
              <span className="text-xs text-slate-600">=</span>
              <input
                value={pair.right}
                onChange={(e) => setPair(i, { right: e.target.value })}
                placeholder="right column"
                className={inputCls}
              />
              <RowButton
                icon={X}
                label="Remove join key"
                onClick={() => onChange({ ...step, on: step.on.filter((_, j) => j !== i) } as JoinStep)}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...step, on: [...step.on, { left: "", right: "" }] })}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
          >
            <Plus size={12} /> join key
          </button>
        </div>
      );
    }
  }
}

export default function StepBuilder({
  steps,
  onChange,
  sourceColumns,
  datasets,
}: {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  sourceColumns: string[];
  datasets: Dataset[];
}) {
  const replace = (i: number, step: Step) => onChange(steps.map((s, j) => (j === i ? step : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <datalist id={COLUMNS_DATALIST}>
        {sourceColumns.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {steps.map((step, i) => (
        <div key={i} className="rounded-md border border-slate-800 p-2.5" data-step={step.type}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
              {i + 1}. {step.type}
            </span>
            <span className="flex items-center gap-2">
              <RowButton icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} />
              <RowButton icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} />
              <RowButton
                icon={Trash2}
                label="Delete step"
                onClick={() => onChange(steps.filter((_, j) => j !== i))}
              />
            </span>
          </div>
          <StepBody step={step} datasets={datasets} onChange={(s) => replace(i, s)} />
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        {STEP_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange([...steps, newStep(t)])}
            className="flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
          >
            <Plus size={12} /> {t}
          </button>
        ))}
      </div>
    </div>
  );
}
