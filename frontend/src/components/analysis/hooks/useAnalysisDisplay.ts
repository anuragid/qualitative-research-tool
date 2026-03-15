// useAnalysisDisplay.ts
import { useState, useCallback } from "react";
import type { AnalysisStep } from "../config/displayConfig";

export type ViewMode = "list" | "grid" | "table";
export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface AnalysisDisplayState {
  viewMode: ViewMode;
  sort: SortConfig | null;
  activeFilters: Record<string, string[]>;
  searchQuery: string;
  expandedItems: "all" | "none" | Set<string>;
}

export function useAnalysisDisplay(step: AnalysisStep) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<"all" | "none" | Set<string>>("all");

  const toggleFilter = useCallback((field: string, value: string) => {
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
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters({});
  }, []);

  const expandAll = useCallback(() => setExpandedItems("all"), []);
  const collapseAll = useCallback(() => setExpandedItems("none"), []);

  const processData = useCallback(
    <T extends object>(items: T[]): T[] => {
      let result = [...items];

      // Apply filters
      for (const [field, values] of Object.entries(activeFilters)) {
        if (values.length > 0) {
          result = result.filter((item) => values.includes(String((item as Record<string, unknown>)[field])));
        }
      }

      // Apply search — searches all string values in each item
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter((item) =>
          Object.values(item).some(
            (val) =>
              typeof val === "string" && val.toLowerCase().includes(q)
          )
        );
      }

      // Apply sort
      if (sort) {
        const priorityOrder: Record<string, number> = {
          critical: 0, high: 1, medium: 2, low: 3,
        };
        const dir = sort.direction === "desc" ? -1 : 1;

        result.sort((a, b) => {
          const aVal = getNestedValue(a as Record<string, unknown>, sort.field);
          const bVal = getNestedValue(b as Record<string, unknown>, sort.field);

          // Handle priority/frequency/confidence ordering
          if (sort.field === "priority" || sort.field === "frequency" || sort.field === "confidence" || sort.field === "consistency_across_videos") {
            const aOrder = priorityOrder[String(aVal)] ?? 99;
            const bOrder = priorityOrder[String(bVal)] ?? 99;
            return (aOrder - bOrder) * dir;
          }

          // Handle numeric (including array.length)
          if (typeof aVal === "number" && typeof bVal === "number") {
            return (aVal - bVal) * dir;
          }

          // String comparison
          return String(aVal || "").localeCompare(String(bVal || "")) * dir;
        });
      }

      return result;
    },
    [activeFilters, searchQuery, sort]
  );

  return {
    viewMode,
    setViewMode,
    sort,
    setSort,
    activeFilters,
    toggleFilter,
    clearFilters,
    searchQuery,
    setSearchQuery,
    expandedItems,
    expandAll,
    collapseAll,
    processData,
    step,
  };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
