// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useWordLevelTranscript } from "./useWordLevelTranscript";

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from "../services/api";

const mockedApi = api as { get: ReturnType<typeof vi.fn> };

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

describe("useWordLevelTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches word-level transcript when videoId is provided", async () => {
    const transcriptData = {
      words: [
        { text: "Hello", start: 0, end: 500, speaker: "A", confidence: 0.95 },
        { text: "world", start: 500, end: 1000, speaker: "A", confidence: 0.92 },
      ],
      duration: 60000,
    };
    mockedApi.get.mockResolvedValue({ data: transcriptData });

    const { result } = renderHook(() => useWordLevelTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(transcriptData);
    expect(mockedApi.get).toHaveBeenCalledWith(
      "/api/videos/v1/transcript/words"
    );
  });

  it("does not fetch when videoId is null", () => {
    const { result } = renderHook(() => useWordLevelTranscript(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("handles error from API", async () => {
    mockedApi.get.mockRejectedValue(new Error("Failed to fetch"));

    const { result } = renderHook(() => useWordLevelTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
