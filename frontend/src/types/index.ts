// Runtime-validated schemas are the source of truth — TypeScript types
// in this file are derived via `z.infer` in the schema modules and
// re-exported here for backward-compat with existing imports.
//
// See `docs/production-readiness/prs/pr21-frontend-defensive.md` and
// `frontend/src/schemas/` for the zod schemas that back these types.

// ---------- Schema-backed types (Video, Project, Analysis, Transcript) ----------

export type {
  Video,
  VideoStatus,
  VideoStub,
} from "../schemas/video";

export type {
  VideoAnalysis,
  AnalysisStatus,
  AnalysisStatusResponse,
  AnalysisStep,
  Chunk,
  Inference,
  Pattern,
  Insight,
  DesignPrinciple,
} from "../schemas/analysis";

export type {
  Project,
  ProjectStatus,
  ProjectAnalysis,
  MetaPattern,
  CrossInsight,
  SystemPrinciple,
} from "../schemas/project";

export type {
  Transcript,
  TranscriptStatus,
  ProcessedTranscript,
  Utterance,
  SpeakerLabel,
  WordLevelTranscript,
  Word,
  SearchMatch,
  TranscriptSearchResult,
} from "../schemas/transcript";

// ---------- BYOK balance types (hand-written, not yet schema-backed) ----------

/**
 * Balance info matching backend `BalanceInfo.as_dict()`.
 *
 * Source of truth: `docs/byok-balance-contract.md`. Verified live against
 * OpenRouter on 2026-04-06.
 */
export interface BalanceInfo {
  /** Account-level topped-up allotment in USD (from /credits). */
  total_credits: number;
  /** Account-level lifetime spend in USD (from /credits). */
  total_usage: number;
  /** Spendable amount: total_credits - total_usage. */
  balance_remaining: number;
  /** True iff the account has never purchased credits. */
  is_free_tier: boolean;
  /** Masked OpenRouter key label, e.g. "sk-or-v1-abc...xyz". */
  key_label: string;
  /** Per-key cap in USD, null if no cap is set. */
  key_limit: number | null;
  /** Per-key cap remaining in USD, null if no cap is set. */
  key_limit_remaining: number | null;
  /**
   * True iff the user can spend right now: balance_remaining > 0
   * AND (key_limit_remaining is null OR key_limit_remaining > 0).
   */
  has_credits: boolean;
  /** ISO8601 timestamp of when this snapshot was checked. */
  checked_at: string;
  /** True if this is a stale value returned because a fresh fetch failed. */
  stale: boolean;
}

// ---------- Project DTOs (request bodies, not API responses) ----------

export interface CreateProjectDto {
  name: string;
  description?: string;
  created_by?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  status?: import("../schemas/project").ProjectStatus;
}

// ---------- Inference inner item (kept as nominal alias for legacy call sites) ----------

export interface InferenceItem {
  inference_id: string;
  meaning: string;
  importance: string;
  context: string;
}

// ---------- Transcript request DTOs ----------

export interface LabelSpeakerDto {
  speaker_label: string;
  assigned_name: string;
  role?: string;
}
