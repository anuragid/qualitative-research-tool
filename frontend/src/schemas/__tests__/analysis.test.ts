import { describe, it, expect } from "vitest";
import {
  AnalysisStatusSchema,
  VideoAnalysisSchema,
  DesignPrincipleSchema,
  AnalysisStatusResponseSchema,
} from "../analysis";

describe("AnalysisStatusSchema", () => {
  it("accepts every backend status value including not_started sentinel", () => {
    for (const status of [
      "not_started",
      "pending",
      "processing",
      "completed",
      "error",
    ] as const) {
      expect(AnalysisStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects unknown status", () => {
    expect(() => AnalysisStatusSchema.parse("bogus")).toThrow();
  });
});

describe("VideoAnalysisSchema — not_started sentinel", () => {
  it("parses the not_started sentinel payload from the backend", () => {
    // See backend/app/routes/videos.py :: get_video_analysis — this is
    // the exact shape emitted when the parent video exists but no
    // video_analyses row has been created yet. It's the payload that
    // caused Sentry JAVASCRIPT-REACT-6 when the frontend wasn't ready
    // for `id: null` and `chunks: null` etc.
    const sentinel = {
      id: null,
      video_id: "b3e8f956-1114-4387-85fa-05c934ed940d",
      chunks: null,
      chunks_completed_at: null,
      inferences: null,
      inferences_completed_at: null,
      patterns: null,
      patterns_completed_at: null,
      insights: null,
      insights_completed_at: null,
      design_principles: null,
      principles_completed_at: null,
      status: "not_started" as const,
      started_at: null,
      completed_at: null,
      error_message: null,
      current_step: null,
      step_status: null,
      chunk_completed_at: null,
      infer_completed_at: null,
      relate_completed_at: null,
      explain_completed_at: null,
      activate_completed_at: null,
    };
    const parsed = VideoAnalysisSchema.parse(sentinel);
    expect(parsed.status).toBe("not_started");
    expect(parsed.chunks).toBeNull();
    expect(parsed.design_principles).toBeNull();
  });

  it("parses a completed analysis payload with populated jsonb arrays", () => {
    const completed = {
      id: "c4a0f0d0-0000-4000-a000-000000000000",
      video_id: "b3e8f956-1114-4387-85fa-05c934ed940d",
      chunks: [
        {
          chunk_id: "c1",
          speaker: "Alice",
          timestamp: "00:01",
          text: "hello",
          type: "quote",
        },
      ],
      chunks_completed_at: null,
      inferences: null,
      inferences_completed_at: null,
      patterns: null,
      patterns_completed_at: null,
      insights: null,
      insights_completed_at: null,
      design_principles: null,
      principles_completed_at: null,
      status: "completed" as const,
      started_at: null,
      completed_at: null,
      error_message: null,
      current_step: null,
      step_status: { chunk: "completed" },
      chunk_completed_at: null,
      infer_completed_at: null,
      relate_completed_at: null,
      explain_completed_at: null,
      activate_completed_at: null,
    };
    const parsed = VideoAnalysisSchema.parse(completed);
    expect(parsed.chunks?.length).toBe(1);
    expect(parsed.chunks?.[0]?.chunk_id).toBe("c1");
  });

  it("rejects a payload missing the required video_id", () => {
    expect(() =>
      VideoAnalysisSchema.parse({
        id: null,
        status: "pending",
      }),
    ).toThrow();
  });
});

describe("DesignPrincipleSchema", () => {
  it("accepts a null how_might_we — the exact case behind JAVASCRIPT-REACT-6", () => {
    // Sentry JAVASCRIPT-REACT-6 was thrown from Array.map inside the
    // PrinciplesList render path when principle.how_might_we came back
    // null from jsonb. The schema now permits that shape so the error
    // surfaces as (nothing) at parse time — the codemod in
    // PrinciplesList.tsx and PrincipleCard.tsx handles the actual
    // rendering via `?? []`.
    const parsed = DesignPrincipleSchema.parse({
      principle_id: "p1",
      insight_id: "i1",
      principle: "do a thing",
      rationale: "because",
      how_might_we: null,
      priority: "high",
    });
    expect(parsed.how_might_we).toBeNull();
  });

  it("accepts a populated how_might_we list", () => {
    const parsed = DesignPrincipleSchema.parse({
      principle_id: "p1",
      insight_id: "i1",
      principle: "do a thing",
      rationale: "because",
      how_might_we: ["HMW 1", "HMW 2"],
      priority: "high",
    });
    expect(parsed.how_might_we?.length).toBe(2);
  });
});

describe("AnalysisStatusResponseSchema", () => {
  it("parses a typical poll response", () => {
    const parsed = AnalysisStatusResponseSchema.parse({
      status: "processing",
      current_step: "infer",
      step_status: { chunk: "completed", infer: "processing" },
      started_at: "2026-04-07T12:00:00Z",
      completed_at: null,
    });
    expect(parsed.status).toBe("processing");
    expect(parsed.current_step).toBe("infer");
  });
});
