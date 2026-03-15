// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme } from "./useTheme";

// Track matchMedia listeners
let mediaQueryListeners: ((e: { matches: boolean }) => void)[] = [];
let matchMediaResult = false;

function setupMatchMedia(matches: boolean) {
  matchMediaResult = matches;
  mediaQueryListeners = [];
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchMediaResult,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(
        (_event: string, handler: (e: { matches: boolean }) => void) => {
          mediaQueryListeners.push(handler);
        }
      ),
      removeEventListener: vi.fn(
        (_event: string, handler: (e: { matches: boolean }) => void) => {
          mediaQueryListeners = mediaQueryListeners.filter((h) => h !== handler);
        }
      ),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Create a simple localStorage mock that the source code can use
let localStore: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => localStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStore[key];
  }),
  clear: vi.fn(() => {
    localStore = {};
  }),
  get length() {
    return Object.keys(localStore).length;
  },
  key: vi.fn((index: number) => Object.keys(localStore)[index] ?? null),
};

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, null, children);
}

describe("useTheme", () => {
  beforeEach(() => {
    localStore = {};
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    // Reset all mocks to default implementations
    localStorageMock.getItem.mockReset().mockImplementation((key: string) => localStore[key] ?? null);
    localStorageMock.setItem.mockReset().mockImplementation((key: string, value: string) => {
      localStore[key] = value;
    });
    setupMatchMedia(false);
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("returns default theme context when used outside provider", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
    expect(typeof result.current.setTheme).toBe("function");
  });

  it("defaults to system theme (light) when no stored preference", () => {
    setupMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("defaults to system theme (dark) when system prefers dark", () => {
    setupMatchMedia(true);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("reads stored dark theme from localStorage", () => {
    localStore["methodex-theme"] = "dark";
    setupMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("sets theme to light and persists to localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "methodex-theme",
      "light"
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("sets theme to dark and adds dark class to document", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "methodex-theme",
      "dark"
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("sets theme to system and resolves based on matchMedia", () => {
    setupMatchMedia(true);

    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("system");
    });

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "methodex-theme",
      "system"
    );
  });

  it("responds to system theme changes when theme is 'system'", () => {
    setupMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.resolvedTheme).toBe("light");

    // Simulate system dark mode change
    act(() => {
      for (const listener of mediaQueryListeners) {
        listener({ matches: true });
      }
    });

    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores system theme changes when theme is explicitly set", () => {
    setupMatchMedia(false);

    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("light");
    });

    // Simulate system change to dark
    act(() => {
      for (const listener of mediaQueryListeners) {
        listener({ matches: true });
      }
    });

    // Should remain light since explicitly set
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("removes dark class when switching from dark to light", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.setTheme("light");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("responds to system theme change from dark to light", () => {
    setupMatchMedia(true);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.resolvedTheme).toBe("dark");

    // Simulate system light mode change
    act(() => {
      for (const listener of mediaQueryListeners) {
        listener({ matches: false });
      }
    });

    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("reads stored light theme from localStorage", () => {
    localStore["methodex-theme"] = "light";
    setupMatchMedia(true);

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
  });
});
