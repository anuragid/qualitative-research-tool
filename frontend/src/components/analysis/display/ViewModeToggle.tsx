import { List, LayoutGrid, Table2 } from "lucide-react";
import type { ViewMode } from "../hooks/useAnalysisDisplay";

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const modes: { value: ViewMode; icon: typeof List; label: string }[] = [
  { value: "list", icon: List, label: "List view" },
  { value: "grid", icon: LayoutGrid, label: "Grid view" },
  { value: "table", icon: Table2, label: "Table view" },
];

export function ViewModeToggle({ viewMode, onChange }: ViewModeToggleProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-base-04 p-0.5">
      {modes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`p-1.5 rounded-md transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] ${
            viewMode === value
              ? "bg-surface-card text-foreground shadow-subtle"
              : "text-base-40 hover:text-base-62"
          }`}
          aria-label={label}
          aria-pressed={viewMode === value}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
