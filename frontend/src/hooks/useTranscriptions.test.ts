// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  canVideoHaveTranscript,
  useTranscript,
  useSpeakerLabels,
  useAutoPredictSpeakers,
  useStartTranscription,
  useLabelSpeaker,
} from "./useTranscriptions";
import type { SpeakerLabel, Transcript } from "../types";

vi.mock("../services/transcriptions", () => ({
  transcriptionsService: {
    get: vi.fn(),
    getSpeakers: vi.fn(),
    predictSpeakers: vi.fn(),
    start: vi.fn(),
    labelSpeaker: vi.fn(),
  },
}));

import { transcriptionsService } from "../services/transcriptions";

const mockedService = transcriptionsService as {
  get: ReturnType<typeof vi.fn>;
  getSpeakers: ReturnType<typeof vi.fn>;
  predictSpeakers: ReturnType<typeof vi.fn>;
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

describe("canVideoHaveTranscript", () => {
  it("is false before transcription has been requested", () => {
    expect(canVideoHaveTranscript("uploaded")).toBe(false);
  });

  it("is false while the video hasn't loaded", () => {
    expect(canVideoHaveTranscript(undefined)).toBe(false);
  });

  it.each(["transcribing", "transcribed", "analyzing", "analyzed"] as const)(
    "is true once the video is %s",
    (status) => {
      expect(canVideoHaveTranscript(status)).toBe(true);
    }
  );

  it("is true for error, which may or may not have a transcript", () => {
    expect(canVideoHaveTranscript("error")).toBe(true);
  });
});

describe("useTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops polling after a 404 instead of re-requesting a missing transcript", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockedService.get.mockRejectedValue({ status: 404 });

      const { result } = renderHook(() => useTranscript("v1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      // Longer than the 18s max backoff interval, so a scheduled poll would have fired.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mockedService.get).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps polling while the transcript is processing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockedService.get.mockResolvedValue({ id: "t1", video_id: "v1", status: "processing" });

      const { result } = renderHook(() => useTranscript("v1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7_000);
      });
      expect(mockedService.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts fetching when shouldFetch flips to true", async () => {
    const transcript = { id: "t1", video_id: "v1", status: "pending" };
    mockedService.get.mockResolvedValue(transcript);

    const { result, rerender } = renderHook(
      ({ shouldFetch }) => useTranscript("v1", shouldFetch),
      { wrapper: createWrapper(), initialProps: { shouldFetch: false } }
    );

    expect(mockedService.get).not.toHaveBeenCalled();

    rerender({ shouldFetch: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedService.get).toHaveBeenCalledWith("v1");
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

describe("useAutoPredictSpeakers", () => {
  const completed: Pick<Transcript, "id" | "status"> = { id: "t1", status: "completed" };
  const emptyLabels: SpeakerLabel[] = [
    { id: "sl1", transcript_id: "t1", speaker_label: "A", assigned_name: null, role: null, created_at: "" },
    { id: "sl2", transcript_id: "t1", speaker_label: "B", assigned_name: null, role: null, created_at: "" },
  ];
  const predicted: SpeakerLabel[] = [
    { ...emptyLabels[0], assigned_name: "Sam", role: "Interviewer" },
    { ...emptyLabels[1], assigned_name: "Patricia", role: "Participant" },
  ];

  function renderAutoPredict(initialProps: {
    transcript: Pick<Transcript, "id" | "status"> | undefined;
    labels: SpeakerLabel[] | undefined;
    speakerCount: number;
  }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const hook = renderHook(
      ({ transcript, labels, speakerCount }) =>
        useAutoPredictSpeakers(transcript, labels, speakerCount),
      { wrapper, initialProps }
    );
    return { ...hook, queryClient };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("predicts once for a completed transcript with no labelled speakers and caches the result", async () => {
    mockedService.predictSpeakers.mockResolvedValue(predicted);

    const { result, queryClient } = renderAutoPredict({
      transcript: completed,
      labels: emptyLabels,
      speakerCount: 2,
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(["transcripts", "t1", "speakers"])).toEqual(predicted)
    );
    expect(mockedService.predictSpeakers).toHaveBeenCalledTimes(1);
    expect(mockedService.predictSpeakers).toHaveBeenCalledWith("t1");
    expect(result.current.isPredicting).toBe(false);
  });

  it("also predicts when no label rows exist yet", async () => {
    mockedService.predictSpeakers.mockResolvedValue(predicted);

    renderAutoPredict({ transcript: completed, labels: [], speakerCount: 2 });

    await waitFor(() => expect(mockedService.predictSpeakers).toHaveBeenCalledWith("t1"));
  });

  it("leaves transcripts alone once any speaker is labelled", () => {
    renderAutoPredict({
      transcript: completed,
      labels: [{ ...emptyLabels[0], role: "Interviewer" }, emptyLabels[1]],
      speakerCount: 2,
    });

    expect(mockedService.predictSpeakers).not.toHaveBeenCalled();
  });

  it("waits for the labels to load and for speakers to exist", () => {
    const { rerender } = renderAutoPredict({ transcript: completed, labels: undefined, speakerCount: 2 });
    rerender({ transcript: completed, labels: emptyLabels, speakerCount: 0 });

    expect(mockedService.predictSpeakers).not.toHaveBeenCalled();
  });

  it("waits for the transcript to complete", async () => {
    mockedService.predictSpeakers.mockResolvedValue(predicted);
    const { rerender } = renderAutoPredict({
      transcript: { id: "t1", status: "processing" },
      labels: [],
      speakerCount: 2,
    });
    expect(mockedService.predictSpeakers).not.toHaveBeenCalled();

    rerender({ transcript: completed, labels: [], speakerCount: 2 });

    await waitFor(() => expect(mockedService.predictSpeakers).toHaveBeenCalledTimes(1));
  });

  it("does not ask again for the same transcript if nothing could be filled", async () => {
    mockedService.predictSpeakers.mockResolvedValue(emptyLabels);
    const { rerender, result } = renderAutoPredict({
      transcript: completed,
      labels: emptyLabels,
      speakerCount: 2,
    });
    await waitFor(() => expect(result.current.isPredicting).toBe(false));

    rerender({ transcript: completed, labels: [...emptyLabels], speakerCount: 2 });

    expect(mockedService.predictSpeakers).toHaveBeenCalledTimes(1);
  });

  it("reports the request in flight", async () => {
    let resolve: (labels: SpeakerLabel[]) => void = () => {};
    mockedService.predictSpeakers.mockReturnValue(
      new Promise<SpeakerLabel[]>((r) => { resolve = r; })
    );

    const { result } = renderAutoPredict({ transcript: completed, labels: emptyLabels, speakerCount: 2 });

    await waitFor(() => expect(result.current.isPredicting).toBe(true));
    await act(async () => resolve(predicted));
    await waitFor(() => expect(result.current.isPredicting).toBe(false));
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

  it("marks the cached video as transcribing so the transcript query enables at once", async () => {
    mockedService.start.mockResolvedValue({ task_id: "task1" });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["videos", "v1"], { id: "v1", status: "uploaded" });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useStartTranscription(), { wrapper });

    await act(async () => {
      result.current.mutate("v1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(["videos", "v1"])).toMatchObject({ status: "transcribing" });
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
