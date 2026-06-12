import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  RouteErrorBoundary,
  ChunkLoadRecoveryReset,
} from "./RouteErrorBoundary";

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

const ATTEMPTS_KEY = "route-chunk-reload-attempts";

function Bomb({ message, name }: { message: string; name?: string }) {
  const error = new Error(message);
  if (name) error.name = name;
  throw error;
}

const reloadMock = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reloadMock.mockClear();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: reloadMock },
    writable: true,
    configurable: true,
  });
  // Error boundaries log caught errors — keep test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary chunk-load handling", () => {
  it("offers 'Reload to update' on the first chunk-load failure", () => {
    render(
      <RouteErrorBoundary routeName="test">
        <Bomb message="Failed to fetch dynamically imported module: /assets/LandingPage-abc.js" />
      </RouteErrorBoundary>
    );

    expect(screen.getByText("Update available")).toBeDefined();
    expect(screen.getByText("Reload to update")).toBeDefined();
  });

  it("marks the attempt counter and reloads when the user clicks", () => {
    render(
      <RouteErrorBoundary routeName="test">
        <Bomb message="Loading chunk 42 failed" />
      </RouteErrorBoundary>
    );

    fireEvent.click(screen.getByText("Reload to update"));

    expect(sessionStorage.getItem(ATTEMPTS_KEY)).toBe("1");
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("recognizes ChunkLoadError by error name", () => {
    render(
      <RouteErrorBoundary routeName="test">
        <Bomb message="anything" name="ChunkLoadError" />
      </RouteErrorBoundary>
    );

    expect(screen.getByText("Update available")).toBeDefined();
  });

  it("falls through to generic UI when a reload was already attempted", () => {
    sessionStorage.setItem(ATTEMPTS_KEY, "1");

    render(
      <RouteErrorBoundary routeName="test">
        <Bomb message="Failed to fetch dynamically imported module: /assets/LandingPage-abc.js" />
      </RouteErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.queryByText("Reload to update")).toBeNull();
    // Generic recovery affordances still available — no dead end.
    expect(screen.getByText("Try again")).toBeDefined();
    expect(screen.getByText("Reload page")).toBeDefined();
  });

  it("shows generic UI for non-chunk errors and clears the attempt counter", () => {
    sessionStorage.setItem(ATTEMPTS_KEY, "1");

    render(
      <RouteErrorBoundary routeName="test">
        <Bomb message="Cannot read properties of undefined" />
      </RouteErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.queryByText("Reload to update")).toBeNull();
    // Differing error invalidates the previous chunk-reload attempt.
    expect(sessionStorage.getItem(ATTEMPTS_KEY)).toBeNull();
  });
});

describe("ChunkLoadRecoveryReset", () => {
  it("clears the attempt counter on successful mount", () => {
    sessionStorage.setItem(ATTEMPTS_KEY, "1");

    render(<ChunkLoadRecoveryReset />);

    expect(sessionStorage.getItem(ATTEMPTS_KEY)).toBeNull();
  });
});
