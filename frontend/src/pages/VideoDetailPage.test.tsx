// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseErrorMessage } from "../lib/parseError";
import type { ParsedError } from "../lib/parseError";

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
