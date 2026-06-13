import { describe, it, expect } from "vitest";
import {
  ProjectSchema,
  ProjectStatusSchema,
  ProjectAnalysisSchema,
  SystemPrincipleSchema,
  MetaPatternSchema,
} from "../project";
import { parseErrorMessage } from "../../lib/parseError";

describe("ProjectStatusSchema", () => {
  it("accepts every backend-supported status including archived", () => {
    for (const status of [
      "planning",
      "ready",
      "processing",
      "completed",
      "archived",
      "error",
    ] as const) {
      expect(ProjectStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects unknown status", () => {
    expect(() => ProjectStatusSchema.parse("bogus")).toThrow();
  });
});

describe("ProjectSchema", () => {
  const VALID = {
    id: "b3e8f956-1114-4387-85fa-05c934ed940d",
    name: "Research Study",
    description: "Interview data",
    created_by: "user-1",
    created_at: "2026-04-07T12:00:00Z",
    updated_at: "2026-04-07T12:00:00Z",
    status: "ready" as const,
    error_message: null,
  };

  it("parses a valid project payload", () => {
    expect(() => ProjectSchema.parse(VALID)).not.toThrow();
  });

  it("allows videos to be omitted entirely (list endpoint shape)", () => {
    const parsed = ProjectSchema.parse(VALID);
    expect(parsed.videos).toBeUndefined();
  });

  it("rejects a payload missing a required field", () => {
    const { name: _name, ...missing } = VALID;
    expect(() => ProjectSchema.parse(missing)).toThrow();
  });
});

describe("ProjectAnalysisSchema", () => {
  it("parses a not_started sentinel payload", () => {
    const sentinel = {
      id: null,
      project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
      video_ids: [],
      cross_video_patterns: null,
      patterns_completed_at: null,
      cross_video_insights: null,
      insights_completed_at: null,
      cross_video_principles: null,
      principles_completed_at: null,
      status: "not_started" as const,
      started_at: null,
      completed_at: null,
      error_message: null,
    };
    const parsed = ProjectAnalysisSchema.parse(sentinel);
    expect(parsed.status).toBe("not_started");
    expect(parsed.cross_video_patterns).toBeNull();
  });

  it("parses a completed project analysis payload", () => {
    const completed = {
      id: "c4a0f0d0-0000-4000-a000-000000000000",
      project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
      video_ids: ["b3e8f956-1114-4387-85fa-05c934ed940d"],
      cross_video_patterns: null,
      patterns_completed_at: null,
      cross_video_insights: null,
      insights_completed_at: null,
      cross_video_principles: null,
      principles_completed_at: null,
      status: "completed" as const,
      started_at: "2026-04-07T12:00:00Z",
      completed_at: "2026-04-07T12:05:00Z",
      error_message: null,
    };
    expect(() => ProjectAnalysisSchema.parse(completed)).not.toThrow();
  });
});

describe("ProjectAnalysisSchema error_message field", () => {
  const BASE = {
    id: "c4a0f0d0-0000-4000-a000-000000000000",
    project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
    video_ids: [],
    cross_video_patterns: null,
    patterns_completed_at: null,
    cross_video_insights: null,
    insights_completed_at: null,
    cross_video_principles: null,
    principles_completed_at: null,
    status: "error" as const,
    started_at: null,
    completed_at: null,
  };

  it("parses when error_message is null", () => {
    const parsed = ProjectAnalysisSchema.parse({ ...BASE, error_message: null });
    expect(parsed.error_message).toBeNull();
  });

  it("parses when error_message field is null (simulates backend omitting the field)", () => {
    // The field is z.string().nullable(); passing null simulates a backend
    // that returns the field as null (new rows before any error occurs).
    const parsed = ProjectAnalysisSchema.parse({ ...BASE, error_message: null });
    expect(parsed.error_message).toBeNull();
  });

  it("parses when error_message is a JSON-encoded error string", () => {
    const jsonError = JSON.stringify({
      step: "cross_relate",
      error_type: "ValueError",
      retryable: false,
      message: "rate limit exceeded",
    });
    const parsed = ProjectAnalysisSchema.parse({ ...BASE, error_message: jsonError });
    expect(parsed.error_message).toBe(jsonError);
    // Verify that parseErrorMessage can decode it
    const decoded = parseErrorMessage(parsed.error_message!);
    expect(decoded.message).toBe("rate limit exceeded");
  });
});

describe("SystemPrincipleSchema", () => {
  it("accepts a null how_might_we — same class of bug as DesignPrinciple", () => {
    const parsed = SystemPrincipleSchema.parse({
      system_principle_id: "sp1",
      cross_insight_id: "ci1",
      principle: "do a thing",
      rationale: "because",
      context_considerations: "context",
      how_might_we: null,
      scope: "universal",
      priority: "high",
    });
    expect(parsed.how_might_we).toBeNull();
  });
});

describe("MetaPatternSchema", () => {
  it("parses a meta pattern with populated appears_in_videos", () => {
    const parsed = MetaPatternSchema.parse({
      meta_pattern_id: "mp1",
      pattern_name: "Recurring theme",
      description: "Shows up in multiple interviews",
      appears_in_videos: ["v1", "v2"],
      related_patterns: ["p1"],
      consistency: "consistent",
      context_sensitivity: "low",
      significance: "high",
    });
    expect(parsed.appears_in_videos.length).toBe(2);
  });
});
