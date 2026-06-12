/**
 * Schema barrel — single import point for runtime zod schemas and the
 * TypeScript types derived from them via `z.infer`.
 *
 * See `docs/production-readiness/prs/pr21-frontend-defensive.md` for the
 * rationale. Every API response should be parsed through one of these
 * schemas at the `services/api.ts` boundary so shape drift becomes a
 * Sentry event + toast instead of a React render crash.
 */

export {
  VideoSchema,
  VideoDetailSchema,
  VideoListSchema,
  VideoStatusSchema,
  type Video,
  type VideoDetail,
  type VideoStatus,
} from "./video";

export {
  VideoAnalysisSchema,
  VideoAnalysisStatusEmbedSchema,
  AnalysisStatusResponseSchema,
  AnalysisStatusSchema,
  AnalysisStepSchema,
  ChunkSchema,
  InferenceSchema,
  PatternSchema,
  InsightSchema,
  DesignPrincipleSchema,
  type VideoAnalysis,
  type VideoAnalysisStatusEmbed,
  type AnalysisStatus,
  type AnalysisStatusResponse,
  type AnalysisStep,
  type Chunk,
  type Inference,
  type Pattern,
  type Insight,
  type DesignPrinciple,
} from "./analysis";

export {
  ProjectSchema,
  ProjectListSchema,
  ProjectStatusSchema,
  ProjectAnalysisSchema,
  MetaPatternSchema,
  CrossInsightSchema,
  SystemPrincipleSchema,
  type Project,
  type ProjectStatus,
  type ProjectAnalysis,
  type MetaPattern,
  type CrossInsight,
  type SystemPrinciple,
} from "./project";

export {
  TranscriptSchema,
  TranscriptStatusSchema,
  ProcessedTranscriptSchema,
  UtteranceSchema,
  SpeakerLabelSchema,
  WordLevelTranscriptSchema,
  WordSchema,
  SearchMatchSchema,
  TranscriptSearchResultSchema,
  type Transcript,
  type TranscriptStatus,
  type ProcessedTranscript,
  type Utterance,
  type SpeakerLabel,
  type WordLevelTranscript,
  type Word,
  type SearchMatch,
  type TranscriptSearchResult,
} from "./transcript";
