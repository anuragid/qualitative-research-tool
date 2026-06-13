import { z } from "zod";
import { VideoStubSchema } from "./video";
import { AnalysisStatusSchema } from "./analysis";

/**
 * Project status — matches backend `_VALID_PROJECT_STATUSES` in
 * `backend/app/models/schemas.py`. "archived" is a supported status in
 * the backend too.
 */
export const ProjectStatusSchema = z.enum([
  "planning",
  "ready",
  "processing",
  "completed",
  "archived",
  "error",
]);

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/**
 * Project schema — matches backend `ProjectResponse` plus the legacy
 * `created_by` field still referenced in some frontend fixtures.
 */
export const ProjectSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string(),
    // Hand-written Project type uses `string` (non-null) for these,
    // even though the backend emits ISO strings; matching that here.
    created_by: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    status: ProjectStatusSchema,
    error_message: z.string().nullable().optional(),
    // ``VideoStubSchema`` — only id/status/uploaded_at, no analysis embed.
    // This keeps the projects-list response free of video_analyses DB reads.
    // Deploy-window tolerance: VideoStubSchema uses .passthrough() so an old
    // backend that sends full VideoListItemResponse objects still validates.
    videos: z.array(VideoStubSchema).optional(),
  })
  .passthrough();

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectListSchema = z.array(ProjectSchema);

// ---------- Project-level analysis (cross-video) ----------

export const MetaPatternSchema = z
  .object({
    meta_pattern_id: z.string(),
    pattern_name: z.string(),
    description: z.string(),
    appears_in_videos: z.array(z.string()),
    related_patterns: z.array(z.string()),
    consistency: z.string(),
    context_sensitivity: z.string(),
    significance: z.string(),
  })
  .passthrough();

export type MetaPattern = z.infer<typeof MetaPatternSchema>;

export const CrossInsightSchema = z
  .object({
    cross_insight_id: z.string(),
    headline: z.string(),
    explanation: z.string(),
    supporting_meta_patterns: z.array(z.string()),
    consistency_across_videos: z.string(),
    contextual_factors: z.string(),
    evidence: z.array(z.string()),
    scope: z.string(),
    implications: z.string(),
    confidence: z.string(),
  })
  .passthrough();

export type CrossInsight = z.infer<typeof CrossInsightSchema>;

export const SystemPrincipleSchema = z
  .object({
    system_principle_id: z.string(),
    cross_insight_id: z.string(),
    principle: z.string(),
    rationale: z.string(),
    context_considerations: z.string(),
    // See DesignPrincipleSchema — nullable to reflect the real jsonb shape.
    how_might_we: z.array(z.string()).nullable(),
    scope: z.string(),
    priority: z.string(),
  })
  .passthrough();

export type SystemPrinciple = z.infer<typeof SystemPrincipleSchema>;

/**
 * ProjectAnalysisSchema — matches backend `ProjectAnalysisResponse`.
 * Every jsonb field tolerates null for the "not_started" sentinel case.
 */
export const ProjectAnalysisSchema = z
  .object({
    id: z.string().uuid().nullable(),
    project_id: z.string().uuid(),
    video_ids: z.array(z.string()),
    cross_video_patterns: z.array(MetaPatternSchema).nullable(),
    patterns_completed_at: z.string().nullable(),
    cross_video_insights: z.array(CrossInsightSchema).nullable(),
    insights_completed_at: z.string().nullable(),
    cross_video_principles: z.array(SystemPrincipleSchema).nullable(),
    principles_completed_at: z.string().nullable(),
    status: AnalysisStatusSchema,
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    error_message: z.string().nullable(),
  })
  .passthrough();

export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;
