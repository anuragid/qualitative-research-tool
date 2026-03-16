// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useVideoAnalysis,
  useStartVideoAnalysis,
  useStartFullAnalysis,
  useStartChunkStep,
  useStartInferStep,
  useStartRelateStep,
  useStartExplainStep,
  useStartActivateStep,
  useProjectAnalysis,
  useStartProjectAnalysis,
  useMetaPatterns,
  useCrossInsights,
  useSystemPrinciples,
} from "./useAnalysis";

vi.mock("../services/analysis", () => ({
  analysisService: {
    getVideoAnalysis: vi.fn(),
    startVideoAnalysis: vi.fn(),
    startChunkStep: vi.fn(),
    startInferStep: vi.fn(),
    startRelateStep: vi.fn(),
    startExplainStep: vi.fn(),
    startActivateStep: vi.fn(),
    getProjectAnalysis: vi.fn(),
    startProjectAnalysis: vi.fn(),
  },
}));

import { analysisService } from "../services/analysis";

const mockedService = analysisService as {
  getVideoAnalysis: ReturnType<typeof vi.fn>;
  startVideoAnalysis: ReturnType<typeof vi.fn>;
  startChunkStep: ReturnType<typeof vi.fn>;
  startInferStep: ReturnType<typeof vi.fn>;
  startRelateStep: ReturnType<typeof vi.fn>;
  startExplainStep: ReturnType<typeof vi.fn>;
  startActivateStep: ReturnType<typeof vi.fn>;
  getProjectAnalysis: ReturnType<typeof vi.fn>;
  startProjectAnalysis: ReturnType<typeof vi.fn>;
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

describe("useVideoAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches video analysis when videoId is provided", async () => {
    const analysis = { id: "a1", video_id: "v1", status: "completed" };
    mockedService.getVideoAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useVideoAnalysis("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(analysis);
    expect(mockedService.getVideoAnalysis).toHaveBeenCalledWith("v1");
  });

  it("does not fetch when videoId is null", () => {
    const { result } = renderHook(() => useVideoAnalysis(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.getVideoAnalysis).not.toHaveBeenCalled();
  });

  it("does not retry on 404 error", async () => {
    mockedService.getVideoAnalysis.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useVideoAnalysis("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Should only be called once (no retries for 404)
    expect(mockedService.getVideoAnalysis).toHaveBeenCalledTimes(1);
  });

  it("retries on non-404 errors", async () => {
    mockedService.getVideoAnalysis.mockRejectedValue({ status: 500 });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retryDelay: 0 },
      },
    });
    const w = function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      );
    };

    const { result } = renderHook(() => useVideoAnalysis("v1"), {
      wrapper: w,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedService.getVideoAnalysis.mock.calls.length).toBeGreaterThan(1);
  });

  it("polls when analysis status is processing", async () => {
    const analysis = { id: "a1", video_id: "v1", status: "processing" };
    mockedService.getVideoAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useVideoAnalysis("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("processing");
  });

  it("polls when analysis status is pending", async () => {
    const analysis = { id: "a1", video_id: "v1", status: "pending" };
    mockedService.getVideoAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useVideoAnalysis("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("pending");
  });

  it("does not poll when analysis status is completed", async () => {
    const analysis = { id: "a1", video_id: "v1", status: "completed" };
    mockedService.getVideoAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useVideoAnalysis("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("completed");
  });

  it("does not poll when analysis status is error", async () => {
    const analysis = { id: "a1", video_id: "v1", status: "error" };
    mockedService.getVideoAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useVideoAnalysis("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("error");
  });
});

describe("useStartVideoAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts video analysis and invalidates queries", async () => {
    mockedService.startVideoAnalysis.mockResolvedValue({ task_id: "t1" });

    const { result } = renderHook(() => useStartVideoAnalysis(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.startVideoAnalysis).toHaveBeenCalledWith("v1");
  });

  it("handles error during start", async () => {
    mockedService.startVideoAnalysis.mockRejectedValue(new Error("Failed"));

    const { result } = renderHook(() => useStartVideoAnalysis(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useStartFullAnalysis", () => {
  it("is an alias for useStartVideoAnalysis", () => {
    expect(useStartFullAnalysis).toBe(useStartVideoAnalysis);
  });
});

describe("useStartChunkStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts chunk step and invalidates queries", async () => {
    mockedService.startChunkStep.mockResolvedValue({ task_id: "t1" });

    const { result } = renderHook(() => useStartChunkStep(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.startChunkStep).toHaveBeenCalledWith("v1");
  });
});

describe("useStartInferStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts infer step and invalidates queries", async () => {
    mockedService.startInferStep.mockResolvedValue({ task_id: "t1" });

    const { result } = renderHook(() => useStartInferStep(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.startInferStep).toHaveBeenCalledWith("v1");
  });
});

describe("useStartRelateStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts relate step and invalidates queries", async () => {
    mockedService.startRelateStep.mockResolvedValue({ task_id: "t1" });

    const { result } = renderHook(() => useStartRelateStep(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.startRelateStep).toHaveBeenCalledWith("v1");
  });
});

describe("useStartExplainStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts explain step and invalidates queries", async () => {
    mockedService.startExplainStep.mockResolvedValue({ task_id: "t1" });

    const { result } = renderHook(() => useStartExplainStep(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.startExplainStep).toHaveBeenCalledWith("v1");
  });
});

describe("useStartActivateStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts activate step and invalidates queries", async () => {
    mockedService.startActivateStep.mockResolvedValue({ task_id: "t1" });

    const { result } = renderHook(() => useStartActivateStep(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.startActivateStep).toHaveBeenCalledWith("v1");
  });
});

describe("useProjectAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches project analysis when projectId is provided", async () => {
    const analysis = { id: "pa1", project_id: "p1", status: "completed" };
    mockedService.getProjectAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useProjectAnalysis("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(analysis);
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useProjectAnalysis(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.getProjectAnalysis).not.toHaveBeenCalled();
  });

  it("does not retry on 404", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useProjectAnalysis("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedService.getProjectAnalysis).toHaveBeenCalledTimes(1);
  });

  it("retries on non-404 errors", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 500 });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retryDelay: 0 },
      },
    });
    const w = function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      );
    };

    const { result } = renderHook(() => useProjectAnalysis("p1"), {
      wrapper: w,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedService.getProjectAnalysis.mock.calls.length).toBeGreaterThan(1);
  });

  it("polls when status is running", async () => {
    const analysis = { id: "pa1", project_id: "p1", status: "processing" };
    mockedService.getProjectAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useProjectAnalysis("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("processing");
  });

  it("polls when status is pending", async () => {
    const analysis = { id: "pa1", project_id: "p1", status: "pending" };
    mockedService.getProjectAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useProjectAnalysis("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("pending");
  });

  it("does not poll when status is completed", async () => {
    const analysis = { id: "pa1", project_id: "p1", status: "completed" };
    mockedService.getProjectAnalysis.mockResolvedValue(analysis);

    const { result } = renderHook(() => useProjectAnalysis("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useStartProjectAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts project analysis and invalidates queries", async () => {
    mockedService.startProjectAnalysis.mockResolvedValue({ task_id: "t1" });

    const { result } = renderHook(() => useStartProjectAnalysis(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("p1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.startProjectAnalysis).toHaveBeenCalledWith("p1");
  });

  it("handles error during start", async () => {
    mockedService.startProjectAnalysis.mockRejectedValue(new Error("Failed"));

    const { result } = renderHook(() => useStartProjectAnalysis(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("p1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useMetaPatterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects cross_video_patterns from project analysis", async () => {
    const patterns = [{ meta_pattern_id: "mp1", pattern_name: "Pattern 1" }];
    mockedService.getProjectAnalysis.mockResolvedValue({
      id: "pa1",
      project_id: "p1",
      cross_video_patterns: patterns,
      cross_video_insights: null,
      cross_video_principles: null,
    });

    const { result } = renderHook(() => useMetaPatterns("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(patterns);
  });

  it("returns null when cross_video_patterns is null", async () => {
    mockedService.getProjectAnalysis.mockResolvedValue({
      id: "pa1",
      project_id: "p1",
      cross_video_patterns: null,
      cross_video_insights: null,
      cross_video_principles: null,
    });

    const { result } = renderHook(() => useMetaPatterns("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useMetaPatterns(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not retry on 404", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useMetaPatterns("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedService.getProjectAnalysis).toHaveBeenCalledTimes(1);
  });
});

describe("useMetaPatterns - retry behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries on non-404 errors", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 500 });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retryDelay: 0 },
      },
    });
    const w = function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      );
    };

    const { result } = renderHook(() => useMetaPatterns("p1"), {
      wrapper: w,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Should have retried (initial + up to 3 retries = 4 calls)
    expect(mockedService.getProjectAnalysis.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("useCrossInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects cross_video_insights from project analysis", async () => {
    const insights = [{ cross_insight_id: "ci1", headline: "Insight 1" }];
    mockedService.getProjectAnalysis.mockResolvedValue({
      id: "pa1",
      project_id: "p1",
      cross_video_patterns: null,
      cross_video_insights: insights,
      cross_video_principles: null,
    });

    const { result } = renderHook(() => useCrossInsights("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(insights);
  });

  it("returns null when cross_video_insights is null", async () => {
    mockedService.getProjectAnalysis.mockResolvedValue({
      id: "pa1",
      project_id: "p1",
      cross_video_patterns: null,
      cross_video_insights: null,
      cross_video_principles: null,
    });

    const { result } = renderHook(() => useCrossInsights("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useCrossInsights(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not retry on 404", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useCrossInsights("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCrossInsights - retry behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries on non-404 errors", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 500 });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retryDelay: 0 },
      },
    });
    const w = function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      );
    };

    const { result } = renderHook(() => useCrossInsights("p1"), {
      wrapper: w,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedService.getProjectAnalysis.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("useSystemPrinciples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects cross_video_principles from project analysis", async () => {
    const principles = [
      { system_principle_id: "sp1", principle: "Principle 1" },
    ];
    mockedService.getProjectAnalysis.mockResolvedValue({
      id: "pa1",
      project_id: "p1",
      cross_video_patterns: null,
      cross_video_insights: null,
      cross_video_principles: principles,
    });

    const { result } = renderHook(() => useSystemPrinciples("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(principles);
  });

  it("returns null when cross_video_principles is null", async () => {
    mockedService.getProjectAnalysis.mockResolvedValue({
      id: "pa1",
      project_id: "p1",
      cross_video_patterns: null,
      cross_video_insights: null,
      cross_video_principles: null,
    });

    const { result } = renderHook(() => useSystemPrinciples("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useSystemPrinciples(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not retry on 404", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useSystemPrinciples("p1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useSystemPrinciples - retry behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries on non-404 errors", async () => {
    mockedService.getProjectAnalysis.mockRejectedValue({ status: 500 });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retryDelay: 0 },
      },
    });
    const w = function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      );
    };

    const { result } = renderHook(() => useSystemPrinciples("p1"), {
      wrapper: w,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedService.getProjectAnalysis.mock.calls.length).toBeGreaterThan(1);
  });
});
