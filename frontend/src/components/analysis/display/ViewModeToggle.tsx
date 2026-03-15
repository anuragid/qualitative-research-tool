import { List, LayoutGrid, Table2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "../../ui/toggle-group";
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
    <ToggleGroup
      type="single"
      value={viewMode}
      onValueChange={(value) => {
        if (value) onChange(value as ViewMode);
      }}
      size="sm"
    >
      {modes.map(({ value, icon: Icon, label }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label}>
          <Icon className="h-4 w-4" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
