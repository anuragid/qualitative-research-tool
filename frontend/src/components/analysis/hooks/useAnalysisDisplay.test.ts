// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnalysisDisplay } from "./useAnalysisDisplay";

describe("useAnalysisDisplay", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    expect(result.current.viewMode).toBe("list");
    expect(result.current.sort).toBeNull();
    expect(result.current.activeFilters).toEqual({});
    expect(result.current.searchQuery).toBe("");
    expect(result.current.expandedItems).toBe("all");
    expect(result.current.step).toBe("chunks");
  });

  it("sets view mode", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.setViewMode("grid");
    });

    expect(result.current.viewMode).toBe("grid");

    act(() => {
      result.current.setViewMode("table");
    });

    expect(result.current.viewMode).toBe("table");
  });

  it("sets sort config", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.setSort({ field: "type", direction: "asc" });
    });

    expect(result.current.sort).toEqual({ field: "type", direction: "asc" });
  });

  it("sets search query", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.setSearchQuery("hello");
    });

    expect(result.current.searchQuery).toBe("hello");
  });

  it("toggleFilter adds a filter value", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.toggleFilter("type", "quote");
    });

    expect(result.current.activeFilters).toEqual({ type: ["quote"] });
  });

  it("toggleFilter adds multiple values for the same field", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.toggleFilter("type", "quote");
    });
    act(() => {
      result.current.toggleFilter("type", "fact");
    });

    expect(result.current.activeFilters).toEqual({ type: ["quote", "fact"] });
  });

  it("toggleFilter removes a value when toggled again", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.toggleFilter("type", "quote");
    });
    act(() => {
      result.current.toggleFilter("type", "fact");
    });
    act(() => {
      result.current.toggleFilter("type", "quote");
    });

    expect(result.current.activeFilters).toEqual({ type: ["fact"] });
  });

  it("toggleFilter removes field entirely when last value is toggled off", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.toggleFilter("type", "quote");
    });
    act(() => {
      result.current.toggleFilter("type", "quote");
    });

    expect(result.current.activeFilters).toEqual({});
  });

  it("clearFilters removes all filters", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.toggleFilter("type", "quote");
      result.current.toggleFilter("type", "fact");
    });

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.activeFilters).toEqual({});
  });

  it("expandAll sets expandedItems to 'all'", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.collapseAll();
    });
    expect(result.current.expandedItems).toBe("none");

    act(() => {
      result.current.expandAll();
    });
    expect(result.current.expandedItems).toBe("all");
  });

  it("collapseAll sets expandedItems to 'none'", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"));

    act(() => {
      result.current.collapseAll();
    });

    expect(result.current.expandedItems).toBe("none");
  });

  describe("processData", () => {
    it("returns items as-is with no filters, search, or sort", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      const items = [
        { type: "quote", text: "Hello" },
        { type: "fact", text: "World" },
      ];

      const processed = result.current.processData(items);
      expect(processed).toEqual(items);
      // Should be a copy, not the same reference
      expect(processed).not.toBe(items);
    });

    it("filters items by active filter", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.toggleFilter("type", "quote");
      });

      const items = [
        { type: "quote", text: "Hello" },
        { type: "fact", text: "World" },
        { type: "quote", text: "Foo" },
      ];

      const processed = result.current.processData(items);
      expect(processed).toEqual([
        { type: "quote", text: "Hello" },
        { type: "quote", text: "Foo" },
      ]);
    });

    it("filters items with multiple filter values", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.toggleFilter("type", "quote");
        result.current.toggleFilter("type", "fact");
      });

      const items = [
        { type: "quote", text: "A" },
        { type: "fact", text: "B" },
        { type: "context", text: "C" },
      ];

      const processed = result.current.processData(items);
      expect(processed).toEqual([
        { type: "quote", text: "A" },
        { type: "fact", text: "B" },
      ]);
    });

    it("searches across all string values", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSearchQuery("world");
      });

      const items = [
        { type: "quote", text: "Hello World" },
        { type: "fact", text: "Foo Bar" },
      ];

      const processed = result.current.processData(items);
      expect(processed).toEqual([{ type: "quote", text: "Hello World" }]);
    });

    it("search is case-insensitive", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSearchQuery("HELLO");
      });

      const items = [
        { type: "quote", text: "hello world" },
        { type: "fact", text: "Goodbye" },
      ];

      const processed = result.current.processData(items);
      expect(processed).toHaveLength(1);
      expect(processed[0].text).toBe("hello world");
    });

    it("ignores empty search query", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSearchQuery("   ");
      });

      const items = [
        { type: "quote", text: "Hello" },
        { type: "fact", text: "World" },
      ];

      const processed = result.current.processData(items);
      expect(processed).toHaveLength(2);
    });

    it("search ignores non-string values", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSearchQuery("42");
      });

      const items = [
        { type: "quote", text: "value is 42", count: 42 },
        { type: "fact", text: "other", count: 42 },
      ];

      const processed = result.current.processData(items);
      // Only the one with "42" in a string value should match
      expect(processed).toEqual([
        { type: "quote", text: "value is 42", count: 42 },
      ]);
    });

    it("sorts by string fields ascending", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSort({ field: "text", direction: "asc" });
      });

      const items = [
        { type: "quote", text: "Banana" },
        { type: "fact", text: "Apple" },
        { type: "context", text: "Cherry" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.text)).toEqual(["Apple", "Banana", "Cherry"]);
    });

    it("sorts by string fields descending", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSort({ field: "text", direction: "desc" });
      });

      const items = [
        { type: "quote", text: "Banana" },
        { type: "fact", text: "Apple" },
        { type: "context", text: "Cherry" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.text)).toEqual(["Cherry", "Banana", "Apple"]);
    });

    it("sorts by numeric fields", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSort({ field: "count", direction: "asc" });
      });

      const items = [
        { text: "A", count: 30 },
        { text: "B", count: 10 },
        { text: "C", count: 20 },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.count)).toEqual([10, 20, 30]);
    });

    it("sorts by numeric fields descending", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSort({ field: "count", direction: "desc" });
      });

      const items = [
        { text: "A", count: 30 },
        { text: "B", count: 10 },
        { text: "C", count: 20 },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.count)).toEqual([30, 20, 10]);
    });

    it("sorts by priority using custom order", () => {
      const { result } = renderHook(() => useAnalysisDisplay("principles"));

      act(() => {
        result.current.setSort({ field: "priority", direction: "asc" });
      });

      const items = [
        { principle: "A", priority: "low" },
        { principle: "B", priority: "critical" },
        { principle: "C", priority: "high" },
        { principle: "D", priority: "medium" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.priority)).toEqual([
        "critical",
        "high",
        "medium",
        "low",
      ]);
    });

    it("sorts by priority descending reverses the order", () => {
      const { result } = renderHook(() => useAnalysisDisplay("principles"));

      act(() => {
        result.current.setSort({ field: "priority", direction: "desc" });
      });

      const items = [
        { principle: "A", priority: "low" },
        { principle: "B", priority: "critical" },
        { principle: "C", priority: "high" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.priority)).toEqual([
        "low",
        "high",
        "critical",
      ]);
    });

    it("sorts by frequency using custom priority order", () => {
      const { result } = renderHook(() => useAnalysisDisplay("patterns"));

      act(() => {
        result.current.setSort({ field: "frequency", direction: "asc" });
      });

      const items = [
        { pattern_name: "A", frequency: "low" },
        { pattern_name: "B", frequency: "high" },
        { pattern_name: "C", frequency: "medium" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.frequency)).toEqual([
        "high",
        "medium",
        "low",
      ]);
    });

    it("sorts by confidence using custom priority order", () => {
      const { result } = renderHook(() => useAnalysisDisplay("insights"));

      act(() => {
        result.current.setSort({ field: "confidence", direction: "asc" });
      });

      const items = [
        { headline: "A", confidence: "low" },
        { headline: "B", confidence: "high" },
        { headline: "C", confidence: "medium" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.confidence)).toEqual([
        "high",
        "medium",
        "low",
      ]);
    });

    it("sorts by consistency_across_videos using custom priority order", () => {
      const { result } = renderHook(() => useAnalysisDisplay("crossInsights"));

      act(() => {
        result.current.setSort({ field: "consistency_across_videos", direction: "asc" });
      });

      const items = [
        { headline: "A", consistency_across_videos: "low" },
        { headline: "B", consistency_across_videos: "high" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.consistency_across_videos)).toEqual([
        "high",
        "low",
      ]);
    });

    it("handles unknown priority values (maps to 99)", () => {
      const { result } = renderHook(() => useAnalysisDisplay("principles"));

      act(() => {
        result.current.setSort({ field: "priority", direction: "asc" });
      });

      const items = [
        { principle: "A", priority: "unknown" },
        { principle: "B", priority: "high" },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.priority)).toEqual(["high", "unknown"]);
    });

    it("handles nested field paths in sort", () => {
      const { result } = renderHook(() => useAnalysisDisplay("metaPatterns"));

      act(() => {
        result.current.setSort({ field: "nested.value", direction: "asc" });
      });

      const items = [
        { name: "A", nested: { value: "beta" } },
        { name: "B", nested: { value: "alpha" } },
      ];

      const processed = result.current.processData(items);
      expect(processed.map((i) => i.name)).toEqual(["B", "A"]);
    });

    it("handles missing nested fields gracefully", () => {
      const { result } = renderHook(() => useAnalysisDisplay("metaPatterns"));

      act(() => {
        result.current.setSort({ field: "nested.missing", direction: "asc" });
      });

      const items = [
        { name: "A", nested: {} },
        { name: "B" },
      ];

      // Should not throw, just handle undefined values
      const processed = result.current.processData(items);
      expect(processed).toHaveLength(2);
    });

    it("combines filter, search, and sort", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.toggleFilter("type", "quote");
        result.current.setSearchQuery("hello");
        result.current.setSort({ field: "text", direction: "asc" });
      });

      const items = [
        { type: "quote", text: "Hello World" },
        { type: "fact", text: "Hello Again" },
        { type: "quote", text: "Goodbye" },
        { type: "quote", text: "Hello There" },
      ];

      const processed = result.current.processData(items);
      // Filtered to type=quote, searched for "hello", sorted by text asc
      expect(processed).toEqual([
        { type: "quote", text: "Hello There" },
        { type: "quote", text: "Hello World" },
      ]);
    });

    it("handles sort with null/undefined values", () => {
      const { result } = renderHook(() => useAnalysisDisplay("chunks"));

      act(() => {
        result.current.setSort({ field: "text", direction: "asc" });
      });

      const items = [
        { type: "quote", text: "Beta" },
        { type: "fact" },
        { type: "context", text: "Alpha" },
      ];

      const processed = result.current.processData(items as Array<{ type: string; text?: string }>);
      expect(processed).toHaveLength(3);
    });
  });
});
