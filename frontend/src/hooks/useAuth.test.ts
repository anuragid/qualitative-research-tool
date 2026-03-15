// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "./useAuth";

const mockSignOut = vi.fn();
const mockGetToken = vi.fn();

// Mock Clerk hooks
vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(),
  useUser: vi.fn(),
}));

import { useAuth as useClerkAuth, useUser } from "@clerk/react";

const mockedClerkAuth = useClerkAuth as ReturnType<typeof vi.fn>;
const mockedUseUser = useUser as ReturnType<typeof vi.fn>;

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loaded signed-in user with full data", () => {
    mockedClerkAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      signOut: mockSignOut,
      getToken: mockGetToken,
    });
    mockedUseUser.mockReturnValue({
      user: {
        id: "user_123",
        primaryEmailAddress: { emailAddress: "test@example.com" },
        username: "testuser",
      },
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.user).toEqual({
      id: "user_123",
      email: "test@example.com",
      username: "testuser",
    });
    expect(result.current.signOut).toBe(mockSignOut);
    expect(result.current.getToken).toBe(mockGetToken);
  });

  it("returns null user when not signed in", () => {
    mockedClerkAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      signOut: mockSignOut,
      getToken: mockGetToken,
    });
    mockedUseUser.mockReturnValue({ user: null });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("returns isSignedIn as false when clerk returns undefined", () => {
    mockedClerkAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: undefined,
      signOut: mockSignOut,
      getToken: mockGetToken,
    });
    mockedUseUser.mockReturnValue({ user: null });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isSignedIn).toBe(false);
  });

  it("handles user without email", () => {
    mockedClerkAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      signOut: mockSignOut,
      getToken: mockGetToken,
    });
    mockedUseUser.mockReturnValue({
      user: {
        id: "user_456",
        primaryEmailAddress: null,
        username: null,
      },
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toEqual({
      id: "user_456",
      email: "",
      username: undefined,
    });
  });

  it("handles not loaded state", () => {
    mockedClerkAuth.mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
      signOut: mockSignOut,
      getToken: mockGetToken,
    });
    mockedUseUser.mockReturnValue({ user: null });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("handles user with username as null (returns undefined)", () => {
    mockedClerkAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      signOut: mockSignOut,
      getToken: mockGetToken,
    });
    mockedUseUser.mockReturnValue({
      user: {
        id: "user_789",
        primaryEmailAddress: { emailAddress: "user@test.com" },
        username: null,
      },
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.user?.username).toBeUndefined();
  });
});
