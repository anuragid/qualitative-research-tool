// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseErrorMessage } from "../lib/parseError";
import type { ParsedError } from "../lib/parseError";
import VideoDetailPage from "./VideoDetailPage";
import { useVideo } from "../hooks/useVideos";
import { useTranscript } from "../hooks/useTranscriptions";
import type { VideoStatus } from "../types";

// ---- Unit tests for parseErrorMessage (extracted utility) ----
// These test the logic previously inline in VideoDetailPage.

describe("parseErrorMessage (VideoDetailPage scenarios)", () => {
  it("parses a full JSON error with step, error_type, retryable, and message", () => {
    const raw = JSON.stringify({
      step: "chunk",
      error_type: "llm_error",
      retryable: true,
      message: "OpenRouter returned 500",
    });

    const result = parseErrorMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.step).toBe("chunk");
    expect(result!.errorType).toBe("llm_error");
    expect(result!.retryable).toBe(true);
    expect(result!.message).toBe("OpenRouter returned 500");
  });

  it("handles a plain string error (backwards compat)", () => {
    const result = parseErrorMessage("Something went wrong during analysis");
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Something went wrong during analysis");
    expect(result!.errorType).toBe("unknown");
    expect(result!.retryable).toBe(true);
  });

  it("classifies rate_limit keywords", () => {
    expect(parseErrorMessage("rate limit exceeded")!.errorType).toBe("rate_limit");
    expect(parseErrorMessage("Error 429")!.errorType).toBe("rate_limit");
    expect(parseErrorMessage("rate_limit reached")!.errorType).toBe("rate_limit");
  });

  it("classifies timeout keywords", () => {
    expect(parseErrorMessage("request timeout")!.errorType).toBe("timeout");
    expect(parseErrorMessage("the operation timed out")!.errorType).toBe("timeout");
  });

  it("classifies network keywords", () => {
    expect(parseErrorMessage("network error")!.errorType).toBe("network");
    expect(parseErrorMessage("connection refused")!.errorType).toBe("network");
  });

  it("returns null for null/undefined/empty", () => {
    expect(parseErrorMessage(null)).toBeNull();
    expect(parseErrorMessage(undefined)).toBeNull();
    expect(parseErrorMessage("")).toBeNull();
  });
});

// ---- Tests for retry logic computed in VideoDetailPage ----

describe("canRetryTranscription logic", () => {
  // This mirrors: video.status === "error" && !transcript
  function canRetryTranscription(videoStatus: string, hasTranscript: boolean) {
    return videoStatus === "error" && !hasTranscript;
  }

  it("returns true when video is in error state and no transcript", () => {
    expect(canRetryTranscription("error", false)).toBe(true);
  });

  it("returns false when video is in error state but transcript exists", () => {
    expect(canRetryTranscription("error", true)).toBe(false);
  });

  it("returns false when video is uploaded (not error)", () => {
    expect(canRetryTranscription("uploaded", false)).toBe(false);
  });

  it("returns false when video is transcribed", () => {
    expect(canRetryTranscription("transcribed", true)).toBe(false);
  });
});

describe("canRetryAnalysis logic", () => {
  // This mirrors: video.status === "error" && !!transcript && (!analysis || analysis.status === "error")
  function canRetryAnalysis(
    videoStatus: string,
    hasTranscript: boolean,
    analysisStatus: string | null,
  ) {
    return (
      videoStatus === "error" &&
      hasTranscript &&
      (!analysisStatus || analysisStatus === "error")
    );
  }

  it("returns true when error state, transcript exists, and no analysis", () => {
    expect(canRetryAnalysis("error", true, null)).toBe(true);
  });

  it("returns true when error state, transcript exists, and analysis errored", () => {
    expect(canRetryAnalysis("error", true, "error")).toBe(true);
  });

  it("returns false when error state but no transcript", () => {
    expect(canRetryAnalysis("error", false, null)).toBe(false);
  });

  it("returns false when error state but analysis is completed", () => {
    expect(canRetryAnalysis("error", true, "completed")).toBe(false);
  });

  it("returns false when video is not in error state", () => {
    expect(canRetryAnalysis("transcribed", true, null)).toBe(false);
  });
});

describe("retry button visibility", () => {
  // Retry buttons show when: parsedError.retryable && (canRetryTranscription || canRetryAnalysis)

  it("shows retry when error is retryable and canRetryTranscription is true", () => {
    const parsedError: ParsedError = {
      message: "Transcription failed",
      errorType: "network",
      retryable: true,
    };
    const canRetryTranscription = true;
    const canRetryAnalysis = false;

    const showRetry =
      parsedError.retryable && (canRetryTranscription || canRetryAnalysis);
    expect(showRetry).toBe(true);
  });

  it("shows retry when error is retryable and canRetryAnalysis is true", () => {
    const parsedError: ParsedError = {
      message: "Analysis failed",
      errorType: "llm_error",
      retryable: true,
    };
    const canRetryTranscription = false;
    const canRetryAnalysis = true;

    const showRetry =
      parsedError.retryable && (canRetryTranscription || canRetryAnalysis);
    expect(showRetry).toBe(true);
  });

  it("hides retry when error is not retryable", () => {
    const parsedError: ParsedError = {
      message: "Validation error",
      errorType: "validation",
      retryable: false,
    };
    const canRetryTranscription = true;
    const canRetryAnalysis = false;

    const showRetry =
      parsedError.retryable && (canRetryTranscription || canRetryAnalysis);
    expect(showRetry).toBe(false);
  });

  it("hides retry when neither canRetryTranscription nor canRetryAnalysis", () => {
    const parsedError: ParsedError = {
      message: "Some error",
      errorType: "unknown",
      retryable: true,
    };
    const canRetryTranscription = false;
    const canRetryAnalysis = false;

    const showRetry =
      parsedError.retryable && (canRetryTranscription || canRetryAnalysis);
    expect(showRetry).toBe(false);
  });
});

// ---- Request gating: the page must not ask for a transcript that can't exist yet ----

vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));
vi.mock("../components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/videos/MediaPlayerSection", () => ({ MediaPlayerSection: () => null }));
vi.mock("../components/videos/TranscriptSidePanel", () => ({ TranscriptSidePanel: () => null }));
vi.mock("../components/analysis/AnalysisSection", () => ({ AnalysisSection: () => null }));
vi.mock("../hooks/useVideos", () => ({
  useVideo: vi.fn(),
  useVideoPlaybackUrl: () => ({ data: undefined }),
}));
vi.mock("../hooks/useProjects", () => ({ useProject: () => ({ data: undefined }) }));
vi.mock("../hooks/useTranscriptions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useTranscriptions")>();
  const idleMutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    ...actual,
    useTranscript: vi.fn(() => ({ data: undefined, isLoading: false })),
    useSpeakerLabels: () => ({ data: undefined }),
    useStartTranscription: idleMutation,
    useLabelSpeaker: idleMutation,
  };
});
vi.mock("../hooks/useAnalysis", () => {
  const idleMutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useVideoAnalysis: () => ({ data: undefined, isLoading: false }),
    useVideoAnalysisStatus: () => ({ data: undefined }),
    useStartFullAnalysis: idleMutation,
    useStartChunkStep: idleMutation,
    useStartInferStep: idleMutation,
    useStartRelateStep: idleMutation,
    useStartExplainStep: idleMutation,
    useStartActivateStep: idleMutation,
  };
});

function renderVideoPage(status: VideoStatus | undefined) {
  vi.mocked(useVideo).mockReturnValue({
    data: status
      ? {
          id: "v-1",
          project_id: "p-1",
          filename: "interview.mp4",
          file_size_bytes: 1024,
          duration_seconds: 60,
          uploaded_at: "2026-10-24T00:00:00Z",
          status,
          error_message: null,
        }
      : undefined,
    isLoading: false,
  } as unknown as ReturnType<typeof useVideo>);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/videos/v-1"]}>
        <Routes>
          <Route path="/videos/:videoId" element={<VideoDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("VideoDetailPage transcript request gating", () => {
  it("does not request the transcript for a freshly uploaded video", () => {
    renderVideoPage("uploaded");

    expect(useTranscript).toHaveBeenLastCalledWith("v-1", false);
    expect(screen.getByRole("button", { name: /start transcription/i })).toBeTruthy();
  });

  it("does not request the transcript before the video has loaded", () => {
    renderVideoPage(undefined);

    expect(useTranscript).toHaveBeenLastCalledWith("v-1", false);
  });

  it.each(["transcribing", "transcribed", "analyzing", "analyzed", "error"] as const)(
    "requests the transcript once the video is %s",
    (status) => {
      renderVideoPage(status);

      expect(useTranscript).toHaveBeenLastCalledWith("v-1", true);
    }
  );
});
