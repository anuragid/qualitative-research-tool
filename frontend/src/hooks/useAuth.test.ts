// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "./useAuth";

// NOTE: When VITE_DEV_AUTH_BYPASS=true (as in our dev/test environment),
// useAuth resolves to useDevAuth at module-load time, so Clerk mocks
// are irrelevant. These tests verify the dev-bypass behavior.

// Mock Clerk hooks (even though they won't be called in dev-bypass mode)
vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: false,
    signOut: vi.fn(),
    getToken: vi.fn(),
  })),
  useUser: vi.fn(() => ({ user: null })),
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // In dev-bypass mode, useAuth always returns the dev user
  it("returns dev user in dev-bypass mode", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.user).toEqual({
      id: "dev_user_local",
      email: "dev@localhost",
      username: "dev",
    });
  });

  it("returns signOut function", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.signOut).toBeDefined();
    expect(typeof result.current.signOut).toBe("function");
  });

  it("returns getToken function that returns dev-bypass token", async () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.getToken).toBeDefined();
    const token = await result.current.getToken();
    expect(token).toBe("dev-bypass");
  });

  it("always returns isLoaded as true", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoaded).toBe(true);
  });

  it("always returns isSignedIn as true", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isSignedIn).toBe(true);
  });

  it("user has dev_user_local id", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user?.id).toBe("dev_user_local");
  });
});
