import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TranscriptViewer } from "./TranscriptViewer";
import type { Transcript } from "../../types";

// ---- Mocks ----

vi.mock("../../hooks/useWordLevelTranscript", () => ({
  useWordLevelTranscript: vi.fn(() => ({ data: undefined })),
}));

vi.mock("../../hooks/useTranscriptSearch", () => ({
  useTranscriptSearch: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

import { useWordLevelTranscript } from "../../hooks/useWordLevelTranscript";
import { useTranscriptSearch } from "../../hooks/useTranscriptSearch";

// ---- Helpers ----

function createTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: "t-1",
    video_id: "v-1",
    assemblyai_id: "aai-1",
    raw_transcript: {},
    processed_transcript: {
      text: "Hello there.",
      utterances: [
        { speaker: "Speaker A", text: "Hello there.", start: 0, end: 2000, confidence: 0.95 },
      ],
    },
    status: "completed",
    created_at: "2025-06-15T00:00:00Z",
    completed_at: "2025-06-15T00:05:00Z",
    ...overrides,
  };
}

// ---- Tests ----

describe("TranscriptViewer request gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The side panel renders as soon as the transcript row exists, which is
  // while AssemblyAI is still running. /transcript/words and /transcript/search
  // 404 until the row is completed, so the viewer must not ask before then.
  it.each(["pending", "processing", "error"] as const)(
    "does not enable word-level or search requests while the transcript is %s",
    (status) => {
      render(<TranscriptViewer transcript={createTranscript({ status })} videoId="v-1" />);

      expect(useWordLevelTranscript).toHaveBeenCalledWith("v-1", false);
      expect(useTranscriptSearch).toHaveBeenCalledWith("v-1", "", false);
    }
  );

  it("enables word-level and search requests once the transcript is completed", () => {
    render(<TranscriptViewer transcript={createTranscript()} videoId="v-1" />);

    expect(useWordLevelTranscript).toHaveBeenCalledWith("v-1", true);
    expect(useTranscriptSearch).toHaveBeenCalledWith("v-1", "", true);
  });
});
