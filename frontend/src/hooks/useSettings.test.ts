// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSettings } from "./useSettings";

vi.mock("../services/settings", () => ({
  settingsService: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    deleteApiKey: vi.fn(),
    refreshBalance: vi.fn(),
    getRecommendedModels: vi.fn().mockResolvedValue({
      standard: { id: "test-free", name: "Test Free", description: "Free model" },
      advanced: { id: "test-premium", name: "Test Premium", description: "Premium model" },
    }),
    searchModels: vi.fn().mockResolvedValue([]),
  },
}));

import { settingsService } from "../services/settings";
import type { BalanceInfo } from "../types";

const mockedService = settingsService as {
  getSettings: ReturnType<typeof vi.fn>;
  updateSettings: ReturnType<typeof vi.fn>;
  deleteApiKey: ReturnType<typeof vi.fn>;
  refreshBalance: ReturnType<typeof vi.fn>;
  getRecommendedModels: ReturnType<typeof vi.fn>;
  searchModels: ReturnType<typeof vi.fn>;
};

const mockBalance: BalanceInfo = {
  total_credits: 10,
  total_usage: 2.75,
  balance_remaining: 7.25,
  is_free_tier: false,
  key_label: "sk-or-v1-abc...xyz",
  key_limit: null,
  key_limit_remaining: null,
  has_credits: true,
  checked_at: "2026-04-06T22:00:00Z",
  stale: false,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe("useSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches settings and returns them", async () => {
    const settings = {
      preferred_model: "gpt-4",
      has_api_key: true,
      available_models: [{ id: "gpt-4", name: "GPT-4", tier: "premium" }],
    };
    mockedService.getSettings.mockResolvedValue(settings);

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings).toEqual(settings);
  });

  it("updates settings and invalidates queries", async () => {
    const initial = {
      preferred_model: null,
      has_api_key: false,
      available_models: [],
    };
    const updated = {
      preferred_model: "gpt-4",
      has_api_key: true,
      available_models: [{ id: "gpt-4", name: "GPT-4", tier: "premium" }],
    };
    mockedService.getSettings.mockResolvedValue(initial);
    mockedService.updateSettings.mockResolvedValue(updated);

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.updateSettings({ preferred_model: "gpt-4" });
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));
    expect(mockedService.updateSettings).toHaveBeenCalledWith({
      preferred_model: "gpt-4",
    });
  });

  it("deletes API key and invalidates queries", async () => {
    const settings = {
      preferred_model: null,
      has_api_key: true,
      available_models: [],
    };
    mockedService.getSettings.mockResolvedValue(settings);
    mockedService.deleteApiKey.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.deleteApiKey();
    });

    await waitFor(() => expect(result.current.isDeletingKey).toBe(false));
    expect(mockedService.deleteApiKey).toHaveBeenCalledOnce();
  });

  it("exposes isUpdating state during mutation", async () => {
    const settings = {
      preferred_model: null,
      has_api_key: false,
      available_models: [],
    };
    mockedService.getSettings.mockResolvedValue(settings);

    let resolveUpdate: (value: unknown) => void;
    mockedService.updateSettings.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
    );

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ preferred_model: "test" });
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(true));

    await act(async () => {
      resolveUpdate!(settings);
    });

    await waitFor(() => expect(result.current.isUpdating).toBe(false));
  });

  it("refreshBalance calls service and merges into cached settings", async () => {
    const settings = {
      preferred_model: "gpt-4",
      has_api_key: true,
      key_hint: "abcd",
      key_validated_at: "2026-04-06T19:00:00Z",
      available_models: [],
      balance: null,
    };
    const refreshed: BalanceInfo = { ...mockBalance, balance_remaining: 5.5 };
    mockedService.getSettings.mockResolvedValue(settings);
    mockedService.refreshBalance.mockResolvedValue(refreshed);

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings?.balance).toBeNull();

    let returned: BalanceInfo | undefined;
    await act(async () => {
      returned = await result.current.refreshBalance();
    });

    expect(mockedService.refreshBalance).toHaveBeenCalledOnce();
    expect(returned).toEqual(refreshed);
    // Cached settings should be optimistically merged
    await waitFor(() => {
      expect(result.current.settings?.balance).toEqual(refreshed);
    });
  });

  it("refreshBalance exposes isRefreshingBalance pending state", async () => {
    const settings = {
      preferred_model: null,
      has_api_key: true,
      key_hint: null,
      key_validated_at: null,
      available_models: [],
      balance: null,
    };
    mockedService.getSettings.mockResolvedValue(settings);

    let resolveRefresh: (value: BalanceInfo) => void = () => {};
    mockedService.refreshBalance.mockImplementation(
      () =>
        new Promise<BalanceInfo>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      void result.current.refreshBalance();
    });

    await waitFor(() => expect(result.current.isRefreshingBalance).toBe(true));

    await act(async () => {
      resolveRefresh(mockBalance);
    });

    await waitFor(() =>
      expect(result.current.isRefreshingBalance).toBe(false),
    );
  });

  it("refreshBalance surfaces errors via refreshBalanceError", async () => {
    const settings = {
      preferred_model: null,
      has_api_key: true,
      key_hint: null,
      key_validated_at: null,
      available_models: [],
      balance: null,
    };
    mockedService.getSettings.mockResolvedValue(settings);
    mockedService.refreshBalance.mockRejectedValue(
      new Error("Service Unavailable"),
    );

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refreshBalance().catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.refreshBalanceError).toBeInstanceOf(Error),
    );
    expect((result.current.refreshBalanceError as Error).message).toBe(
      "Service Unavailable",
    );
  });

  it("exposes isDeletingKey state during mutation", async () => {
    const settings = {
      preferred_model: null,
      has_api_key: true,
      available_models: [],
    };
    mockedService.getSettings.mockResolvedValue(settings);

    let resolveDelete: (value: unknown) => void;
    mockedService.deleteApiKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        })
    );

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.deleteApiKey();
    });

    await waitFor(() => expect(result.current.isDeletingKey).toBe(true));

    await act(async () => {
      resolveDelete!(undefined);
    });

    await waitFor(() => expect(result.current.isDeletingKey).toBe(false));
  });
});
