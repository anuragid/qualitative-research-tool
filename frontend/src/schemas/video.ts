import { z } from "zod";
import { VideoAnalysisSchema, VideoAnalysisStatusEmbedSchema } from "./analysis";
import { TranscriptSchema } from "./transcript";

/**
 * Video status enum — matches backend `Video.status` column.
 *
 * "error" is the catch-all for any failure during transcribe/analyze.
 */
export const VideoStatusSchema = z.enum([
  "uploaded",
  "transcribing",
  "transcribed",
  "analyzing",
  "analyzed",
  "error",
]);

export type VideoStatus = z.infer<typeof VideoStatusSchema>;

/**
 * Video schema for list/polled contexts — matches backend `VideoListItemResponse`.
 *
 * The `analysis` field is a lightweight status embed (`VideoAnalysisStatusEmbedSchema`)
 * rather than the full `VideoAnalysisSchema`. This means the 5 heavy JSONB blobs
 * (chunks, inferences, patterns, insights, design_principles) are NOT present.
 *
 * Deploy-window tolerance: `VideoAnalysisStatusEmbedSchema` uses `.passthrough()`
 * so any blob fields sent by an old backend during the rollout window are silently
 * carried through without triggering a SchemaValidationError.
 *
 * Full blob payload is only available via `GET /api/videos/:id/analysis`
 * (non-polled), validated by `VideoAnalysisSchema`.
 *
 * Field nullability mirrors the legacy TypeScript type in `types/index.ts`
 * so existing consumers compile unchanged. `transcript` remains optional —
 * it is not part of the list shape but appears on single-video endpoints.
 */
export const VideoSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  filename: z.string(),
  file_size_bytes: z.number(),
  duration_seconds: z.number().nullable(),
  uploaded_at: z.string(),
  status: VideoStatusSchema,
  error_message: z.string().nullable(),
  transcript: TranscriptSchema.optional(),
  // Lightweight status embed in list contexts; full blobs only on detail endpoint.
  analysis: VideoAnalysisStatusEmbedSchema.optional(),
});

export type Video = z.infer<typeof VideoSchema>;

export const VideoListSchema = z.array(VideoSchema);

/**
 * Video schema for detail/single-video contexts — includes the full analysis
 * blob payload via `VideoAnalysisSchema`. Only used by non-polled endpoints
 * like `GET /api/videos/:id` and `GET /api/videos/:id/analysis`.
 */
export const VideoDetailSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  filename: z.string(),
  file_size_bytes: z.number(),
  duration_seconds: z.number().nullable(),
  uploaded_at: z.string(),
  status: VideoStatusSchema,
  error_message: z.string().nullable(),
  transcript: TranscriptSchema.optional(),
  analysis: VideoAnalysisSchema.optional(),
});

export type VideoDetail = z.infer<typeof VideoDetailSchema>;
