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
    getRecommendedModels: vi.fn().mockResolvedValue({
      standard: { id: "test-free", name: "Test Free", description: "Free model" },
      advanced: { id: "test-premium", name: "Test Premium", description: "Premium model" },
    }),
    searchModels: vi.fn().mockResolvedValue([]),
  },
}));

import { settingsService } from "../services/settings";

const mockedService = settingsService as {
  getSettings: ReturnType<typeof vi.fn>;
  updateSettings: ReturnType<typeof vi.fn>;
  deleteApiKey: ReturnType<typeof vi.fn>;
  getRecommendedModels: ReturnType<typeof vi.fn>;
  searchModels: ReturnType<typeof vi.fn>;
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
