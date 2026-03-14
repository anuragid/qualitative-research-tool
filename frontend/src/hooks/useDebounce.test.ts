// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update value before delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 300 } }
    );

    rerender({ value: "updated", delay: 300 });

    // Before delay
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("initial");
  });

  it("updates value after delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "initial", delay: 300 } }
    );

    rerender({ value: "updated", delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("updated");
  });

  it("resets timer on rapid changes and only applies last value", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "first", delay: 300 } }
    );

    // Rapid changes
    rerender({ value: "second", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: "third", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: "fourth", delay: 300 });

    // Still showing initial value since timer keeps resetting
    expect(result.current).toBe("first");

    // After full delay from last change, should show last value
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("fourth");
  });

  it("uses default delay of 300ms", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: "initial" } }
    );

    rerender({ value: "updated" });

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("updated");
  });

  it("works with non-string types", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 42, delay: 200 } }
    );

    expect(result.current).toBe(42);

    rerender({ value: 100, delay: 200 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(100);
  });
});
