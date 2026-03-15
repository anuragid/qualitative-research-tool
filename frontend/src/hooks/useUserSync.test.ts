// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock the api module
vi.mock("../services/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

// Mock the useAuth hook
vi.mock("./useAuth", () => ({
  useAuth: vi.fn(),
}));

import { api } from "../services/api";
import { useAuth } from "./useAuth";
import { useUserSync } from "./useUserSync";

const mockedApi = api as { post: ReturnType<typeof vi.fn> };
const mockedUseAuth = useAuth as ReturnType<typeof vi.fn>;

describe("useUserSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs user when loaded, signed in, and user exists", async () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "user_123", email: "test@example.com" },
    });
    mockedApi.post.mockResolvedValue({ data: {} });

    renderHook(() => useUserSync());

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith("/api/users/sync");
    });
  });

  it("does not sync when not loaded", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });

    renderHook(() => useUserSync());

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("does not sync when not signed in", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });

    renderHook(() => useUserSync());

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("does not sync when user is null", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: null,
    });

    renderHook(() => useUserSync());

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("does not re-sync for the same user id", async () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "user_123", email: "test@example.com" },
    });
    mockedApi.post.mockResolvedValue({ data: {} });

    const { rerender } = renderHook(() => useUserSync());

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledTimes(1);
    });

    // Re-render should not trigger another sync
    rerender();

    // Wait a bit and verify no additional call
    await new Promise((r) => setTimeout(r, 50));
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
  });

  it("handles sync error gracefully", async () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "user_456", email: "test@example.com" },
    });
    mockedApi.post.mockRejectedValue(new Error("Sync failed"));

    // Should not throw
    renderHook(() => useUserSync());

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith("/api/users/sync");
    });
  });

  it("syncs when user id changes", async () => {
    mockedApi.post.mockResolvedValue({ data: {} });

    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "user_123", email: "a@example.com" },
    });

    const { rerender } = renderHook(() => useUserSync());

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledTimes(1);
    });

    // Change user id
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "user_456", email: "b@example.com" },
    });

    rerender();

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledTimes(2);
    });
  });
});
