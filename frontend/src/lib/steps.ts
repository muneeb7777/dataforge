/** Studio pipeline step types — mirror backend app/schemas/studio.py exactly. */

export interface FilterStep {
  type: "filter";
  condition: string;
}
export interface SelectStep {
  type: "select";
  columns: string[];
}
export interface RenameStep {
  type: "rename";
  mapping: Record<string, string>;
}
export interface DeriveStep {
  type: "derive";
  column: string;
  expression: string;
}
export interface SortKey {
  column: string;
  desc: boolean;
}
export interface SortStep {
  type: "sort";
  by: SortKey[];
}
export interface JoinKey {
  left: string;
  right: string;
}
export interface JoinStep {
  type: "join";
  dataset_id: number;
  how: "inner" | "left" | "right" | "full";
  on: JoinKey[];
}

export type Step = FilterStep | SelectStep | RenameStep | DeriveStep | SortStep | JoinStep;

export const STEP_TYPES = ["filter", "select", "rename", "derive", "sort", "join"] as const;

export function newStep(type: Step["type"]): Step {
  switch (type) {
    case "filter":
      return { type, condition: "" };
    case "select":
      return { type, columns: [""] };
    case "rename":
      return { type, mapping: { "": "" } };
    case "derive":
      return { type, column: "", expression: "" };
    case "sort":
      return { type, by: [{ column: "", desc: false }] };
    case "join":
      return { type, dataset_id: 0, how: "inner", on: [{ left: "", right: "" }] };
  }
}

/** Strip incomplete rows so partially-filled forms don't 422 on preview. */
export function pruneSteps(steps: Step[]): Step[] {
  const pruned: Step[] = [];
  for (const step of steps) {
    switch (step.type) {
      case "filter":
        if (step.condition.trim()) pruned.push(step);
        break;
      case "select": {
        const columns = step.columns.filter((c) => c.trim());
        if (columns.length) pruned.push({ ...step, columns });
        break;
      }
      case "rename": {
        const mapping = Object.fromEntries(
          Object.entries(step.mapping).filter(([o, n]) => o.trim() && n.trim()),
        );
        if (Object.keys(mapping).length) pruned.push({ ...step, mapping });
        break;
      }
      case "derive":
        if (step.column.trim() && step.expression.trim()) pruned.push(step);
        break;
      case "sort": {
        const by = step.by.filter((k) => k.column.trim());
        if (by.length) pruned.push({ ...step, by });
        break;
      }
      case "join": {
        const on = step.on.filter((k) => k.left.trim() && k.right.trim());
        if (step.dataset_id > 0 && on.length) pruned.push({ ...step, on });
        break;
      }
    }
  }
  return pruned;
}
