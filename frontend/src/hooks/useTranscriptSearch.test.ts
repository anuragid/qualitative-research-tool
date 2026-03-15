// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTranscriptSearch } from "./useTranscriptSearch";

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

describe("useTranscriptSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches search results when videoId and query are provided", async () => {
    const searchResult = {
      total_count: 3,
      matches: [
        { text: "design", count: 2, timestamps: [[100, 200], [500, 600]], indexes: [0, 5] },
        { text: "user", count: 1, timestamps: [[300, 400]], indexes: [3] },
      ],
    };
    mockedApi.get.mockResolvedValue({ data: searchResult });

    const { result } = renderHook(
      () => useTranscriptSearch("v1", "design,user"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(searchResult);
    expect(mockedApi.get).toHaveBeenCalledWith(
      "/api/videos/v1/transcript/search",
      { params: { query: "design,user" } }
    );
  });

  it("does not fetch when videoId is null", () => {
    const { result } = renderHook(
      () => useTranscriptSearch(null, "test"),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("does not fetch when query is empty", () => {
    const { result } = renderHook(
      () => useTranscriptSearch("v1", ""),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("does not fetch when both videoId is null and query is empty", () => {
    const { result } = renderHook(
      () => useTranscriptSearch(null, ""),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("handles error from API", async () => {
    mockedApi.get.mockRejectedValue(new Error("Search failed"));

    const { result } = renderHook(
      () => useTranscriptSearch("v1", "test"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
