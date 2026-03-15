import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import type { SortOption } from "../config/displayConfig";
import type { SortConfig } from "../hooks/useAnalysisDisplay";

interface SortDropdownProps {
  options: SortOption[];
  sort: SortConfig | null;
  onSort: (config: SortConfig | null) => void;
}

export function SortDropdown({ options, sort, onSort }: SortDropdownProps) {
  if (options.length === 0) return null;

  const handleSort = (opt: SortOption) => {
    if (sort?.field === opt.field) {
      // Toggle direction or clear
      if (sort.direction === "desc") {
        onSort({ field: opt.field, direction: "asc" });
      } else {
        onSort(null); // clear sort
      }
    } else {
      onSort({ field: opt.field, direction: opt.direction || "desc" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-ui">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sort ? `Sort: ${options.find((o) => o.field === sort.field)?.label || sort.field}` : "Sort"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.field} onClick={() => handleSort(opt)}>
            <span className="flex-1">{opt.label}</span>
            {sort?.field === opt.field && (
              sort.direction === "desc"
                ? <ArrowDown className="h-3.5 w-3.5 text-interactive-focus" />
                : <ArrowUp className="h-3.5 w-3.5 text-interactive-focus" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
