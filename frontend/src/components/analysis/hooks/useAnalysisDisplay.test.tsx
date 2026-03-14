// useAnalysisDisplay.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnalysisDisplay } from "./useAnalysisDisplay";
import type { AnalysisStep } from "../config/displayConfig";

// Wrap with MemoryRouter for useSearchParams
import { MemoryRouter } from "react-router-dom";
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("useAnalysisDisplay", () => {
  it("defaults to list viewMode", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    expect(result.current.viewMode).toBe("list");
  });

  it("changes viewMode", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.setViewMode("grid"));
    expect(result.current.viewMode).toBe("grid");
  });

  it("defaults to no active filters", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    expect(result.current.activeFilters).toEqual({});
  });

  it("toggles a filter value", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.toggleFilter("type", "quote"));
    expect(result.current.activeFilters).toEqual({ type: ["quote"] });
  });

  it("toggles filter off when already active", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.toggleFilter("type", "quote"));
    act(() => result.current.toggleFilter("type", "quote"));
    expect(result.current.activeFilters).toEqual({});
  });

  it("clears all filters", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.toggleFilter("type", "quote"));
    act(() => result.current.toggleFilter("type", "fact"));
    act(() => result.current.clearFilters());
    expect(result.current.activeFilters).toEqual({});
  });

  it("sets and clears search query", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    act(() => result.current.setSearchQuery("user interview"));
    expect(result.current.searchQuery).toBe("user interview");
    act(() => result.current.setSearchQuery(""));
    expect(result.current.searchQuery).toBe("");
  });

  it("sets sort config", () => {
    const { result } = renderHook(() => useAnalysisDisplay("insights"), { wrapper });
    act(() => result.current.setSort({ field: "confidence", direction: "desc" }));
    expect(result.current.sort).toEqual({ field: "confidence", direction: "desc" });
  });

  it("processData filters items", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    const chunks = [
      { type: "quote", text: "hello" },
      { type: "fact", text: "world" },
      { type: "quote", text: "foo" },
    ];
    act(() => result.current.toggleFilter("type", "quote"));
    const processed = result.current.processData(chunks);
    expect(processed).toHaveLength(2);
    expect(processed.every((c: any) => c.type === "quote")).toBe(true);
  });

  it("processData searches by text content", () => {
    const { result } = renderHook(() => useAnalysisDisplay("chunks"), { wrapper });
    const chunks = [
      { type: "quote", text: "usability testing" },
      { type: "fact", text: "demographics data" },
    ];
    act(() => result.current.setSearchQuery("usability"));
    const processed = result.current.processData(chunks);
    expect(processed).toHaveLength(1);
    expect(processed[0].text).toBe("usability testing");
  });
});
