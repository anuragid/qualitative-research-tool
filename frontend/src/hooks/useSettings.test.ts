// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSettings } from "./useSettings";

vi.mock("../services/settings", () => ({
  settingsService: {
    getSettings: vi.fn(),
    addApiKey: vi.fn(),
    updatePreferredModel: vi.fn(),
    deleteApiKey: vi.fn(),
    refreshBalance: vi.fn(),
    getRecommendedModels: vi.fn().mockResolvedValue({
      standard: { id: "test-standard", name: "Test Standard", description: "Standard model" },
      advanced: { id: "test-advanced", name: "Test Advanced", description: "Advanced model" },
    }),
    searchModels: vi.fn().mockResolvedValue([]),
  },
}));

import { settingsService } from "../services/settings";
import type { BalanceInfo } from "../types";

const mockedService = settingsService as {
  getSettings: ReturnType<typeof vi.fn>;
  addApiKey: ReturnType<typeof vi.fn>;
  updatePreferredModel: ReturnType<typeof vi.fn>;
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

const baseSettings = {
  preferred_model: null,
  has_api_key: false,
  key_hint: null,
  key_validated_at: null,
  available_models: [
    { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", tier: "standard", provider: "Meta" },
  ],
  balance: null,
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
    mockedService.getSettings.mockResolvedValue(baseSettings);
  });

  it("fetches settings and returns them", async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings).toEqual(baseSettings);
  });

  it("exposes addApiKey, updatePreferredModel, deleteApiKey, refreshBalance", async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(typeof result.current.addApiKey).toBe("function");
    expect(typeof result.current.updatePreferredModel).toBe("function");
    expect(typeof result.current.deleteApiKey).toBe("function");
    expect(typeof result.current.refreshBalance).toBe("function");
    // updateSettings is removed
    expect(
      (result.current as Record<string, unknown>).updateSettings,
    ).toBeUndefined();
  });

  it("addApiKey writes the response into the cache", async () => {
    const updated = {
      ...baseSettings,
      has_api_key: true,
      key_hint: "1234",
      balance: { ...mockBalance, balance_remaining: 8.52 },
    };
    mockedService.addApiKey.mockResolvedValue(updated);
    // Ensure the background refetch (triggered by invalidateQueries) also returns
    // the updated data so it doesn't clobber the setQueryData result.
    mockedService.getSettings.mockResolvedValue(updated);

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await act(async () => {
      await result.current.addApiKey("sk-or-v1-test1234");
    });

    await waitFor(() => {
      expect(result.current.settings?.has_api_key).toBe(true);
      expect(result.current.settings?.key_hint).toBe("1234");
    });
    expect(mockedService.addApiKey).toHaveBeenCalledWith("sk-or-v1-test1234");
  });

  it("updatePreferredModel writes the response into the cache", async () => {
    const updated = {
      ...baseSettings,
      preferred_model: "meta-llama/llama-4-scout",
    };
    mockedService.updatePreferredModel.mockResolvedValue(updated);
    // Ensure the background refetch (triggered by invalidateQueries) also returns
    // the updated data so it doesn't clobber the setQueryData result.
    mockedService.getSettings.mockResolvedValue(updated);

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await act(async () => {
      await result.current.updatePreferredModel("meta-llama/llama-4-scout");
    });

    await waitFor(() => {
      expect(result.current.settings?.preferred_model).toBe(
        "meta-llama/llama-4-scout",
      );
    });
    expect(mockedService.updatePreferredModel).toHaveBeenCalledWith("meta-llama/llama-4-scout");
  });

  it("addApiKey error surfaces via addKeyError and does not update cache", async () => {
    mockedService.addApiKey.mockRejectedValue(new Error("Invalid key"));

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.settings).toBeDefined());

    await act(async () => {
      try {
        await result.current.addApiKey("sk-or-v1-broken");
      } catch {
        /* expected */
      }
    });

    await waitFor(() => {
      expect(result.current.addKeyError).toBeTruthy();
      expect(result.current.settings?.has_api_key).toBe(false);
    });
    expect((result.current.addKeyError as Error).message).toBe("Invalid key");
  });

  it("deletes API key and invalidates queries", async () => {
    mockedService.getSettings.mockResolvedValue({ ...baseSettings, has_api_key: true });
    mockedService.deleteApiKey.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteApiKey();
    });

    await waitFor(() => expect(result.current.isDeletingKey).toBe(false));
    expect(mockedService.deleteApiKey).toHaveBeenCalledOnce();
  });

  it("refreshBalance calls service and merges into cached settings", async () => {
    const refreshed: BalanceInfo = { ...mockBalance, balance_remaining: 5.5 };
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
    let resolveDelete: (value: unknown) => void;
    mockedService.deleteApiKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      void result.current.deleteApiKey();
    });

    await waitFor(() => expect(result.current.isDeletingKey).toBe(true));

    await act(async () => {
      resolveDelete!(undefined);
    });

    await waitFor(() => expect(result.current.isDeletingKey).toBe(false));
  });

  it("isAddingKey pending state is exposed", async () => {
    let resolveAdd: (value: typeof baseSettings) => void;
    mockedService.addApiKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      void result.current.addApiKey("sk-or-v1-pending");
    });

    await waitFor(() => expect(result.current.isAddingKey).toBe(true));

    await act(async () => {
      resolveAdd!({ ...baseSettings, has_api_key: true, key_hint: "pend" });
    });

    await waitFor(() => expect(result.current.isAddingKey).toBe(false));
  });
});
