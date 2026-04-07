import { z } from "zod";
import { VideoAnalysisSchema } from "./analysis";
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
 * Video schema — matches backend `VideoResponse` (see
 * `backend/app/models/schemas.py :: VideoResponse`).
 *
 * Field nullability mirrors the legacy TypeScript type in
 * `types/index.ts` so existing consumers compile unchanged. Nested
 * `analysis` and `transcript` are optional — populated on some
 * endpoints (e.g. `/api/videos/:id`) and absent on list endpoints.
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
  analysis: VideoAnalysisSchema.optional(),
});

export type Video = z.infer<typeof VideoSchema>;

export const VideoListSchema = z.array(VideoSchema);
