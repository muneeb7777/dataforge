import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import type { ColumnInfo } from "../lib/types";

/** Client-side ag-grid for result sets already in memory (Explore, Studio). */
export default function ResultsGrid({
  columns,
  rows,
}: {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
}) {
  const columnDefs = useMemo<ColDef[]>(
    () =>
      columns.map((col) => ({
        colId: col.name,
        headerName: col.name,
        headerTooltip: col.dtype,
        // valueGetter instead of field: column names may contain dots.
        valueGetter: (p) => p.data?.[col.name],
      })),
    [columns],
  );

  return (
    <div className="ag-theme-quartz-dark h-full w-full">
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: true, resizable: true, filter: true, minWidth: 110 }}
        animateRows={false}
        enableCellTextSelection
      />
    </div>
  );
}
