import { z } from "zod";

/**
 * Transcript status — matches backend `Transcript.status` column.
 */
export const TranscriptStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "error",
]);

export type TranscriptStatus = z.infer<typeof TranscriptStatusSchema>;

export const UtteranceSchema = z
  .object({
    speaker: z.string(),
    text: z.string(),
    start: z.number(),
    end: z.number(),
    confidence: z.number(),
  })
  .passthrough();

export type Utterance = z.infer<typeof UtteranceSchema>;

export const ProcessedTranscriptSchema = z
  .object({
    text: z.string(),
    utterances: z.array(UtteranceSchema),
  })
  .passthrough();

export type ProcessedTranscript = z.infer<typeof ProcessedTranscriptSchema>;

export const SpeakerLabelSchema = z
  .object({
    id: z.string(),
    transcript_id: z.string(),
    speaker_label: z.string(),
    assigned_name: z.string().nullable(),
    role: z.string().nullable(),
    created_at: z.string(),
  })
  .passthrough();

export type SpeakerLabel = z.infer<typeof SpeakerLabelSchema>;

/**
 * Transcript schema — matches backend `TranscriptResponse`.
 */
export const TranscriptSchema = z
  .object({
    id: z.string().uuid(),
    video_id: z.string().uuid(),
    assemblyai_id: z.string(),
    raw_transcript: z.record(z.string(), z.unknown()),
    processed_transcript: ProcessedTranscriptSchema,
    status: TranscriptStatusSchema,
    created_at: z.string(),
    completed_at: z.string().nullable(),
    speaker_labels: z.array(SpeakerLabelSchema).optional(),
  })
  .passthrough();

export type Transcript = z.infer<typeof TranscriptSchema>;

// ---------- Word-level transcript (video sync) ----------

export const WordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  speaker: z.string(),
  confidence: z.number(),
});

export type Word = z.infer<typeof WordSchema>;

/**
 * Word-level transcript payload — `/api/videos/:id/transcript/words`.
 */
export const WordLevelTranscriptSchema = z.object({
  words: z.array(WordSchema),
  duration: z.number(),
});

export type WordLevelTranscript = z.infer<typeof WordLevelTranscriptSchema>;

// ---------- Search match types (client-side, kept here for cohesion) ----------

export const SearchMatchSchema = z.object({
  text: z.string(),
  count: z.number(),
  timestamps: z.array(z.tuple([z.number(), z.number()])),
  indexes: z.array(z.number()),
});

export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const TranscriptSearchResultSchema = z.object({
  total_count: z.number(),
  matches: z.array(SearchMatchSchema),
});

export type TranscriptSearchResult = z.infer<typeof TranscriptSearchResultSchema>;
