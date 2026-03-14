import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AnalysisToolbar } from "./AnalysisToolbar";
import type { ViewMode, SortConfig } from "../hooks/useAnalysisDisplay";
import type { AnalysisStep } from "../config/displayConfig";

const meta = {
  title: "Analysis/AnalysisToolbar",
  component: AnalysisToolbar,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof AnalysisToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Interactive wrapper that provides real state management for the toolbar.
 */
function ToolbarDemo({ step }: { step: AnalysisStep }) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<"all" | "none" | Set<string>>("all");

  const toggleFilter = (field: string, value: string) => {
    setActiveFilters((prev) => {
      const current = prev[field] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: next };
    });
  };

  const clearFilters = () => setActiveFilters({});
  const expandAll = () => setExpandedItems("all");
  const collapseAll = () => setExpandedItems("none");

  const processData = <T extends Record<string, any>>(items: T[]): T[] => items;

  return (
    <div className="max-w-3xl">
      <AnalysisToolbar
        step={step}
        viewMode={viewMode}
        setViewMode={setViewMode}
        sort={sort}
        setSort={setSort}
        activeFilters={activeFilters}
        toggleFilter={toggleFilter}
        clearFilters={clearFilters}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        expandedItems={expandedItems}
        expandAll={expandAll}
        collapseAll={collapseAll}
        processData={processData}
      />
      <div className="mt-4 p-4 rounded-lg bg-base-04 text-sm text-base-55">
        <p><strong>View mode:</strong> {viewMode}</p>
        <p><strong>Sort:</strong> {sort ? `${sort.field} (${sort.direction})` : "none"}</p>
        <p><strong>Filters:</strong> {Object.keys(activeFilters).length > 0
          ? Object.entries(activeFilters).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" | ")
          : "none"
        }</p>
        <p><strong>Search:</strong> {searchQuery || "none"}</p>
        <p><strong>Expanded:</strong> {String(expandedItems)}</p>
      </div>
    </div>
  );
}

/**
 * Chunks mode with type filter chips (quote, fact, context, observation).
 */
export const ChunksMode: Story = {
  render: () => <ToolbarDemo step="chunks" />,
};

/**
 * Insights mode with confidence and type filter chips.
 */
export const InsightsMode: Story = {
  render: () => <ToolbarDemo step="insights" />,
};

/**
 * Patterns mode with relationship and frequency filters.
 */
export const PatternsMode: Story = {
  render: () => <ToolbarDemo step="patterns" />,
};

/**
 * Inferences mode with no filters (demonstrates toolbar without filter bar).
 */
export const InferencesMode: Story = {
  render: () => <ToolbarDemo step="inferences" />,
};

/**
 * Cross-insights mode with confidence and scope filters.
 */
export const CrossInsightsMode: Story = {
  render: () => <ToolbarDemo step="crossInsights" />,
};

/**
 * System principles mode with priority and scope filters.
 */
export const SystemPrinciplesMode: Story = {
  render: () => <ToolbarDemo step="systemPrinciples" />,
};
