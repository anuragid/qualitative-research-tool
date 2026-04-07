import { describe, it, expect } from "vitest";
import {
  TranscriptSchema,
  WordLevelTranscriptSchema,
  TranscriptStatusSchema,
} from "../transcript";

describe("TranscriptStatusSchema", () => {
  it("accepts backend status values", () => {
    for (const status of ["pending", "processing", "completed", "error"] as const) {
      expect(TranscriptStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects unknown status", () => {
    expect(() => TranscriptStatusSchema.parse("bogus")).toThrow();
  });
});

describe("TranscriptSchema", () => {
  const VALID = {
    id: "b3e8f956-1114-4387-85fa-05c934ed940d",
    video_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
    assemblyai_id: "ag-1",
    raw_transcript: {},
    processed_transcript: {
      text: "Hello world",
      utterances: [
        {
          speaker: "A",
          text: "Hello world",
          start: 0,
          end: 1000,
          confidence: 0.95,
        },
      ],
    },
    status: "completed" as const,
    created_at: "2026-04-07T12:00:00Z",
    completed_at: "2026-04-07T12:01:00Z",
  };

  it("parses a valid transcript payload", () => {
    expect(() => TranscriptSchema.parse(VALID)).not.toThrow();
  });

  it("rejects an invalid transcript status", () => {
    expect(() => TranscriptSchema.parse({ ...VALID, status: "bogus" })).toThrow();
  });
});

describe("WordLevelTranscriptSchema", () => {
  it("parses a typical payload", () => {
    const parsed = WordLevelTranscriptSchema.parse({
      words: [
        { text: "hello", start: 0, end: 500, speaker: "A", confidence: 0.9 },
        { text: "world", start: 500, end: 1000, speaker: "A", confidence: 0.9 },
      ],
      duration: 1000,
    });
    expect(parsed.words.length).toBe(2);
    expect(parsed.duration).toBe(1000);
  });

  it("rejects a payload where words is an object instead of an array", () => {
    expect(() =>
      WordLevelTranscriptSchema.parse({
        words: {},
        duration: 0,
      }),
    ).toThrow();
  });
});
