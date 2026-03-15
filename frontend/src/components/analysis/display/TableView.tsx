import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../ui/table";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { SortConfig } from "../hooks/useAnalysisDisplay";

export interface TableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (item: T) => React.ReactNode;
  className?: string;
}

interface TableViewProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  sort: SortConfig | null;
  onSort: (config: SortConfig | null) => void;
  onRowClick?: (item: T) => void;
}

export function TableView<T extends object>({
  data, columns, sort, onSort, onRowClick,
}: TableViewProps<T>) {
  const handleHeaderClick = (col: TableColumn<T>) => {
    if (!col.sortable) return;
    if (sort?.field === col.key) {
      onSort(sort.direction === "desc" ? { field: col.key, direction: "asc" } : null);
    } else {
      onSort({ field: col.key, direction: "desc" });
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`text-label ${col.sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${col.className || ""}`}
                onClick={() => handleHeaderClick(col)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sort?.field === col.key && (
                    sort.direction === "desc"
                      ? <ArrowDown className="h-3 w-3 text-interactive-focus" />
                      : <ArrowUp className="h-3 w-3 text-interactive-focus" />
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, i) => (
            <TableRow
              key={i}
              className={onRowClick ? "cursor-pointer hover:bg-interactive-fill" : ""}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.render(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
