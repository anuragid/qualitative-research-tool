import { ViewModeToggle } from "./ViewModeToggle";
import { FilterBar } from "./FilterBar";
import { SortDropdown } from "./SortDropdown";
import { SearchInput } from "./SearchInput";
// ExpandCollapseToggle is deferred until accordion value prop wiring is implemented
import { sortOptions, filterOptions } from "../config/displayConfig";
import type { useAnalysisDisplay } from "../hooks/useAnalysisDisplay";

type ToolbarProps = ReturnType<typeof useAnalysisDisplay>;

export function AnalysisToolbar(props: ToolbarProps) {
  const {
    step,
    viewMode, setViewMode,
    sort, setSort,
    activeFilters, toggleFilter, clearFilters,
    searchQuery, setSearchQuery,
  } = props;

  const stepSortOptions = sortOptions[step];
  const stepFilterOptions = filterOptions[step];

  return (
    <div className="space-y-3 mb-4">
      {/* Top row: view toggle + sort + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
          <SortDropdown options={stepSortOptions} sort={sort} onSort={setSort} />
        </div>
      </div>

      {/* Filter chips row */}
      {stepFilterOptions.length > 0 && (
        <FilterBar
          options={stepFilterOptions}
          activeFilters={activeFilters}
          onToggle={toggleFilter}
          onClear={clearFilters}
        />
      )}
    </div>
  );
}
