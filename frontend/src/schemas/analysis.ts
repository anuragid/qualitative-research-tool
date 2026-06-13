import { z } from "zod";

/**
 * Analysis status — shared between video and project analysis rows.
 *
 * "not_started" is a frontend-facing sentinel emitted by the backend
 * when the parent row exists but no analysis row has been created yet.
 * See `backend/app/routes/videos.py :: get_video_analysis` and Sentry
 * JAVASCRIPT-REACT-6 for the crash this guards against.
 */
export const AnalysisStatusSchema = z.enum([
  "not_started",
  "pending",
  "processing",
  "completed",
  "error",
]);

export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

/**
 * Step names for the 5-step per-video analysis pipeline.
 * Backend uses these as keys in `step_status` and as `current_step` values.
 */
export const AnalysisStepSchema = z.enum([
  "chunk",
  "infer",
  "relate",
  "explain",
  "activate",
]);

export type AnalysisStep = z.infer<typeof AnalysisStepSchema>;

/**
 * InferenceItem — inner leaf of Inference.inferences[].
 */
export const InferenceItemSchema = z
  .object({
    inference_id: z.string(),
    meaning: z.string(),
    importance: z.string(),
    context: z.string(),
  })
  .passthrough();

export type InferenceItem = z.infer<typeof InferenceItemSchema>;

/**
 * Chunk — output of the chunking step. Backend stores as jsonb, so the
 * shape is permissive via `.passthrough()` (extra fields are kept).
 * Nullable fields match the legacy TypeScript type exactly.
 */
export const ChunkSchema = z
  .object({
    chunk_id: z.string(),
    speaker: z.string(),
    timestamp: z.string(),
    text: z.string(),
    type: z.string(),
  })
  .passthrough();

export type Chunk = z.infer<typeof ChunkSchema>;

/**
 * Inference — output of the inference step.
 */
export const InferenceSchema = z
  .object({
    chunk_id: z.string(),
    inferences: z.array(InferenceItemSchema),
  })
  .passthrough();

export type Inference = z.infer<typeof InferenceSchema>;

/**
 * Pattern — output of the relate step.
 */
export const PatternSchema = z
  .object({
    pattern_id: z.string(),
    pattern_name: z.string(),
    description: z.string(),
    related_inferences: z.array(z.string()),
    relationship_type: z.string(),
    frequency: z.string(),
    significance: z.string(),
  })
  .passthrough();

export type Pattern = z.infer<typeof PatternSchema>;

/**
 * Insight — output of the explain step.
 */
export const InsightSchema = z
  .object({
    insight_id: z.string(),
    headline: z.string(),
    explanation: z.string(),
    supporting_patterns: z.array(z.string()),
    evidence: z.array(z.string()),
    type: z.string(),
    implications: z.string(),
    confidence: z.string(),
  })
  .passthrough();

export type Insight = z.infer<typeof InsightSchema>;

/**
 * Design principle — output of the activate step. `how_might_we` is the
 * field that caused Sentry JAVASCRIPT-REACT-6 when it came back `null`.
 */
export const DesignPrincipleSchema = z
  .object({
    principle_id: z.string(),
    insight_id: z.string(),
    principle: z.string(),
    rationale: z.string(),
    // Nullable matches the legacy type and reflects the real backend
    // behavior — empty HMW lists land as `null` via postgres jsonb. The
    // codemod ensures every call site applies `?? []` before `.length`
    // or `.map()`. See Sentry JAVASCRIPT-REACT-6.
    how_might_we: z.array(z.string()).nullable(),
    priority: z.string(),
  })
  .passthrough();

export type DesignPrinciple = z.infer<typeof DesignPrincipleSchema>;

/**
 * Full video analysis payload. Matches backend `VideoAnalysisResponse`
 * plus the additional `error_message` field that the ORM serializer
 * emits directly from the database row.
 *
 * Every jsonb list field is nullable to tolerate the "not_started"
 * sentinel payload and partial step completion.
 */
export const VideoAnalysisSchema = z
  .object({
    id: z.string().uuid().nullable(),
    video_id: z.string().uuid(),
    chunks: z.array(ChunkSchema).nullable(),
    chunks_completed_at: z.string().nullable(),
    inferences: z.array(InferenceSchema).nullable(),
    inferences_completed_at: z.string().nullable(),
    patterns: z.array(PatternSchema).nullable(),
    patterns_completed_at: z.string().nullable(),
    insights: z.array(InsightSchema).nullable(),
    insights_completed_at: z.string().nullable(),
    design_principles: z.array(DesignPrincipleSchema).nullable(),
    principles_completed_at: z.string().nullable(),
    status: AnalysisStatusSchema,
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    error_message: z.string().nullable(),
    current_step: z.string().nullable(),
    step_status: z.record(z.string(), z.string()).nullable(),
    chunk_completed_at: z.string().nullable(),
    infer_completed_at: z.string().nullable(),
    relate_completed_at: z.string().nullable(),
    explain_completed_at: z.string().nullable(),
    activate_completed_at: z.string().nullable(),
  })
  .passthrough();

export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

/**
 * Lightweight analysis status poll response.
 * Shape matches `GET /api/videos/:id/analysis/status`.
 */
export const AnalysisStatusResponseSchema = z.object({
  status: AnalysisStatusSchema,
  current_step: z.string().nullable(),
  step_status: z.record(z.string(), z.string()).nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

export type AnalysisStatusResponse = z.infer<typeof AnalysisStatusResponseSchema>;

/**
 * Lightweight analysis embed returned in list/polled contexts.
 *
 * Shape matches backend ``VideoAnalysisStatusEmbed`` — contains only status
 * and step-tracking fields, NOT the 5 heavy JSONB blobs (chunks, inferences,
 * patterns, insights, design_principles).
 *
 * Deploy-window tolerance: blob fields are explicitly stripped from the
 * backend in this PR. During the ~build-time window between backend deploy
 * and frontend deploy, the old backend may still send blobs. Using
 * `.passthrough()` means extra fields are retained without schema failure,
 * so the frontend never throws a SchemaValidationError during the rollout.
 *
 * Full blobs are only available via `GET /api/videos/:id/analysis`
 * (non-polled), which uses `VideoAnalysisSchema`.
 */
export const VideoAnalysisStatusEmbedSchema = z
  .object({
    id: z.string().uuid().nullable(),
    video_id: z.string().uuid(),
    status: AnalysisStatusSchema,
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
    current_step: z.string().nullable(),
    step_status: z.record(z.string(), z.string()).nullable(),
    chunk_completed_at: z.string().nullable().optional(),
    infer_completed_at: z.string().nullable().optional(),
    relate_completed_at: z.string().nullable().optional(),
    explain_completed_at: z.string().nullable().optional(),
    activate_completed_at: z.string().nullable().optional(),
  })
  .passthrough(); // tolerates blob fields from old backend during deploy window

export type VideoAnalysisStatusEmbed = z.infer<typeof VideoAnalysisStatusEmbedSchema>;
