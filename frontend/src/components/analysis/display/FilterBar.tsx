import { X } from "lucide-react";
import type { FilterOption } from "../config/displayConfig";

interface FilterBarProps {
  options: FilterOption[];
  activeFilters: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
  onClear: () => void;
}

export function FilterBar({ options, activeFilters, onToggle, onClear }: FilterBarProps) {
  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) =>
        opt.values.map((value) => {
          const isActive = activeFilters[opt.field]?.includes(value);
          return (
            <button
              key={`${opt.field}-${value}`}
              onClick={() => onToggle(opt.field, value)}
              className={`text-label px-2.5 py-1 rounded-full border transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                isActive
                  ? "bg-interactive-focus-bg text-interactive-focus border-interactive-focus-border"
                  : "bg-transparent text-text-tertiary border-border hover:border-base-25 hover:text-text-primary"
              }`}
            >
              {value}
            </button>
          );
        })
      )}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="text-label text-text-placeholder hover:text-text-secondary flex items-center gap-1 transition-colors duration-[var(--duration-micro)]"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
