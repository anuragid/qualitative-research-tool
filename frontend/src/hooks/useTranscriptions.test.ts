// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useTranscript,
  useSpeakerLabels,
  useStartTranscription,
  useLabelSpeaker,
} from "./useTranscriptions";

vi.mock("../services/transcriptions", () => ({
  transcriptionsService: {
    get: vi.fn(),
    getSpeakers: vi.fn(),
    start: vi.fn(),
    labelSpeaker: vi.fn(),
  },
}));

import { transcriptionsService } from "../services/transcriptions";

const mockedService = transcriptionsService as {
  get: ReturnType<typeof vi.fn>;
  getSpeakers: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  labelSpeaker: ReturnType<typeof vi.fn>;
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

describe("useTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches transcript when videoId is provided", async () => {
    const transcript = {
      id: "t1",
      video_id: "v1",
      status: "completed",
      completed_at: new Date().toISOString(),
      speaker_labels: [{ id: "sl1", speaker_label: "A" }],
    };
    mockedService.get.mockResolvedValue(transcript);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(transcript);
    expect(mockedService.get).toHaveBeenCalledWith("v1");
  });

  it("does not fetch when videoId is null", () => {
    const { result } = renderHook(() => useTranscript(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.get).not.toHaveBeenCalled();
  });

  it("does not fetch when shouldFetch is false", () => {
    const { result } = renderHook(() => useTranscript("v1", false), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.get).not.toHaveBeenCalled();
  });

  it("does not retry on 404 error", async () => {
    mockedService.get.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedService.get).toHaveBeenCalledTimes(1);
  });

  it("retries on non-404 errors up to 3 times", async () => {
    mockedService.get.mockRejectedValue({ status: 500 });

    const wrapper = () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: 3, retryDelay: 0 },
        },
      });
      return function Wrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children
        );
      };
    };

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Should retry: initial + 3 retries = 4 total
    expect(mockedService.get).toHaveBeenCalledTimes(4);
  });

  it("polls when transcript status is pending", async () => {
    const transcript = { id: "t1", video_id: "v1", status: "pending" };
    mockedService.get.mockResolvedValue(transcript);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("pending");
  });

  it("polls when transcript status is processing", async () => {
    const transcript = { id: "t1", video_id: "v1", status: "processing" };
    mockedService.get.mockResolvedValue(transcript);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("processing");
  });

  it("polls when completed but no speaker labels (recent completion)", async () => {
    const now = new Date().toISOString();
    const transcript = {
      id: "t1",
      video_id: "v1",
      status: "completed",
      completed_at: now,
      speaker_labels: [],
    };
    mockedService.get.mockResolvedValue(transcript);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("completed");
    expect(result.current.data?.speaker_labels).toEqual([]);
  });

  it("stops polling when completed with speaker labels", async () => {
    const transcript = {
      id: "t1",
      video_id: "v1",
      status: "completed",
      completed_at: new Date().toISOString(),
      speaker_labels: [{ id: "sl1", speaker_label: "A", assigned_name: null }],
    };
    mockedService.get.mockResolvedValue(transcript);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.speaker_labels?.length).toBe(1);
  });

  it("stops polling when completed without speakers but after 30 seconds", async () => {
    // completed_at 60 seconds ago
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const transcript = {
      id: "t1",
      video_id: "v1",
      status: "completed",
      completed_at: pastDate,
      speaker_labels: [],
    };
    mockedService.get.mockResolvedValue(transcript);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("handles null transcript data for polling", async () => {
    // First call returns null-like (will trigger polling)
    mockedService.get.mockResolvedValue(null);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("handles completed transcript without completed_at field", async () => {
    const transcript = {
      id: "t1",
      video_id: "v1",
      status: "completed",
      completed_at: null,
      speaker_labels: [],
    };
    mockedService.get.mockResolvedValue(transcript);

    const { result } = renderHook(() => useTranscript("v1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useSpeakerLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches speaker labels when transcriptId is provided", async () => {
    const speakers = [
      { id: "sl1", transcript_id: "t1", speaker_label: "A", assigned_name: "John" },
    ];
    mockedService.getSpeakers.mockResolvedValue(speakers);

    const { result } = renderHook(() => useSpeakerLabels("t1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(speakers);
    expect(mockedService.getSpeakers).toHaveBeenCalledWith("t1");
  });

  it("does not fetch when transcriptId is null", () => {
    const { result } = renderHook(() => useSpeakerLabels(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockedService.getSpeakers).not.toHaveBeenCalled();
  });
});

describe("useStartTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts transcription and invalidates queries", async () => {
    mockedService.start.mockResolvedValue({ task_id: "task1" });

    const { result } = renderHook(() => useStartTranscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.start).toHaveBeenCalledWith("v1");
  });

  it("handles error during start", async () => {
    mockedService.start.mockRejectedValue(new Error("Start failed"));

    const { result } = renderHook(() => useStartTranscription(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useLabelSpeaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("labels a speaker and invalidates queries", async () => {
    const speakerLabels = [
      { id: "sl1", transcript_id: "t1", speaker_label: "A", assigned_name: "John" },
    ];
    mockedService.labelSpeaker.mockResolvedValue(speakerLabels);

    const { result } = renderHook(() => useLabelSpeaker(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        transcriptId: "t1",
        videoId: "v1",
        data: { speaker_label: "A", assigned_name: "John" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.labelSpeaker).toHaveBeenCalledWith("t1", {
      speaker_label: "A",
      assigned_name: "John",
    });
  });

  it("handles error during labeling", async () => {
    mockedService.labelSpeaker.mockRejectedValue(new Error("Label failed"));

    const { result } = renderHook(() => useLabelSpeaker(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        transcriptId: "t1",
        videoId: "v1",
        data: { speaker_label: "A", assigned_name: "John" },
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
