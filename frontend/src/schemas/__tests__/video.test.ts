import { describe, it, expect } from "vitest";
import { VideoSchema, VideoStatusSchema, VideoListSchema } from "../video";

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
});
