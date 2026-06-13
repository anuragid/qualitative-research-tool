import { describe, it, expect } from "vitest";
import { VideoSchema, VideoStatusSchema, VideoListSchema, VideoDetailSchema } from "../video";

describe("VideoStatusSchema", () => {
  it("accepts every backend status value", () => {
    for (const status of [
      "uploaded",
      "transcribing",
      "transcribed",
      "analyzing",
      "analyzed",
      "error",
    ] as const) {
      expect(VideoStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects unknown statuses", () => {
    expect(() => VideoStatusSchema.parse("not_a_real_status")).toThrow();
  });
});

describe("VideoSchema", () => {
  const VALID_MINIMAL = {
    id: "b3e8f956-1114-4387-85fa-05c934ed940d",
    project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
    filename: "test.mp4",
    file_size_bytes: 123456,
    duration_seconds: 3,
    uploaded_at: "2026-04-07T17:17:01Z",
    status: "analyzed" as const,
    error_message: null,
  };

  it("parses a valid minimal video payload", () => {
    expect(() => VideoSchema.parse(VALID_MINIMAL)).not.toThrow();
  });

  it("tolerates null duration_seconds for audio-only uploads", () => {
    const parsed = VideoSchema.parse({
      ...VALID_MINIMAL,
      duration_seconds: null,
    });
    expect(parsed.duration_seconds).toBeNull();
  });

  it("rejects a payload with a bad status enum", () => {
    expect(() =>
      VideoSchema.parse({
        ...VALID_MINIMAL,
        status: "not_a_real_status",
      }),
    ).toThrow();
  });

  it("rejects a payload missing a required UUID field", () => {
    const { id: _id, ...missing } = VALID_MINIMAL;
    expect(() => VideoSchema.parse(missing)).toThrow();
  });

  it("parses a list of videos via VideoListSchema", () => {
    expect(() =>
      VideoListSchema.parse([VALID_MINIMAL, VALID_MINIMAL]),
    ).not.toThrow();
  });

  it("accepts a lightweight analysis status embed (no blobs) in list shape", () => {
    const withStatusEmbed = {
      ...VALID_MINIMAL,
      analysis: {
        id: "c4a0f0d0-0000-4000-a000-000000000001",
        video_id: VALID_MINIMAL.id,
        status: "completed" as const,
        started_at: "2026-04-07T12:00:00Z",
        completed_at: "2026-04-07T12:05:00Z",
        current_step: "activate",
        step_status: { chunk: "completed", activate: "completed" },
      },
    };
    const parsed = VideoSchema.parse(withStatusEmbed);
    expect(parsed.analysis?.status).toBe("completed");
    // Blob fields are NOT present — schema does not define them
    // (passthrough means they'd be retained if present, but they shouldn't be)
    expect((parsed.analysis as Record<string, unknown>)?.chunks).toBeUndefined();
    expect((parsed.analysis as Record<string, unknown>)?.inferences).toBeUndefined();
  });

  it("deploy-window tolerance: blob fields from old backend are passed through without SchemaValidationError", () => {
    // Simulates old backend sending blobs during the deploy window.
    // VideoAnalysisStatusEmbedSchema uses .passthrough() so these are retained
    // but do NOT cause a validation failure.
    const withBlobs = {
      ...VALID_MINIMAL,
      analysis: {
        id: "c4a0f0d0-0000-4000-a000-000000000002",
        video_id: VALID_MINIMAL.id,
        status: "completed" as const,
        started_at: null,
        completed_at: null,
        current_step: null,
        step_status: null,
        chunks: [{ chunk_id: "c1" }],        // old backend blob
        inferences: [{ chunk_id: "c1" }],   // old backend blob
        patterns: [],
        insights: [],
        design_principles: [],
      },
    };
    expect(() => VideoSchema.parse(withBlobs)).not.toThrow();
    const parsed = VideoSchema.parse(withBlobs);
    expect(parsed.analysis?.status).toBe("completed");
  });
});

describe("VideoDetailSchema", () => {
  const VALID_MINIMAL = {
    id: "b3e8f956-1114-4387-85fa-05c934ed940d",
    project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
    filename: "test.mp4",
    file_size_bytes: 123456,
    duration_seconds: 3,
    uploaded_at: "2026-04-07T17:17:01Z",
    status: "analyzed" as const,
    error_message: null,
  };

  it("parses a video detail payload without analysis", () => {
    expect(() => VideoDetailSchema.parse(VALID_MINIMAL)).not.toThrow();
  });

  it("accepts full VideoAnalysis blobs in analysis field", () => {
    const withFullAnalysis = {
      ...VALID_MINIMAL,
      analysis: {
        id: "c4a0f0d0-0000-4000-a000-000000000003",
        video_id: VALID_MINIMAL.id,
        chunks: [{ chunk_id: "c1", speaker: "A", timestamp: "0:00", text: "hi", type: "speech" }],
        inferences: null,
        patterns: null,
        insights: null,
        design_principles: null,
        status: "completed" as const,
        started_at: null,
        completed_at: null,
        error_message: null,
        current_step: "activate",
        step_status: null,
        chunk_completed_at: null,
        infer_completed_at: null,
        relate_completed_at: null,
        explain_completed_at: null,
        activate_completed_at: null,
        // Timestamp fields required by VideoAnalysisSchema
        chunks_completed_at: null,
        inferences_completed_at: null,
        patterns_completed_at: null,
        insights_completed_at: null,
        principles_completed_at: null,
      },
    };
    const parsed = VideoDetailSchema.parse(withFullAnalysis);
    expect(parsed.analysis?.chunks?.length).toBe(1);
  });
});
