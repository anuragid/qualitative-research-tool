// Project types
export interface Project {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "active" | "archived";
  videos?: Video[];
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  created_by?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  status?: "active" | "archived";
}

// Video types
export interface Video {
  id: string;
  project_id: string;
  filename: string;
  s3_key: string;
  s3_url: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  uploaded_at: string;
  status: VideoStatus;
  error_message: string | null;
  transcript?: Transcript;
  analysis?: VideoAnalysis;
}

export type VideoStatus =
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "analyzing"
  | "completed"
  | "error";

export interface UploadVideoResponse {
  video: Video;
  upload_url: string;
}

// Transcript types
export interface Transcript {
  id: string;
  video_id: string;
  assemblyai_id: string;
  raw_transcript: any;
  processed_transcript: ProcessedTranscript;
  status: "pending" | "processing" | "completed" | "error";
  created_at: string;
  completed_at: string | null;
  speaker_labels?: SpeakerLabel[];
}

export interface ProcessedTranscript {
  text: string;
  utterances: Utterance[];
}

export interface Utterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SpeakerLabel {
  id: string;
  transcript_id: string;
  speaker_label: string;
  assigned_name: string | null;
  role: string | null;
  created_at: string;
}

export interface LabelSpeakerDto {
  speaker_label: string;
  assigned_name: string;
  role?: string;
}

// Analysis types
export interface VideoAnalysis {
  id: string;
  video_id: string;
  chunks: Chunk[] | null;
  chunks_completed_at: string | null;
  inferences: Inference[] | null;
  inferences_completed_at: string | null;
  patterns: Pattern[] | null;
  patterns_completed_at: string | null;
  insights: Insight[] | null;
  insights_completed_at: string | null;
  design_principles: DesignPrinciple[] | null;
  principles_completed_at: string | null;
  status: AnalysisStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export type AnalysisStatus = "pending" | "running" | "completed" | "failed";

export interface Chunk {
  chunk_id: string;
  speaker: string;
  timestamp: string;
  text: string;
  type: "quote" | "observation" | "context" | "fact";
}

export interface Inference {
  chunk_id: string;
  inferences: InferenceItem[];
}

export interface InferenceItem {
  inference_id: string;
  meaning: string;
  importance: string;
  context: string;
}

export interface Pattern {
  pattern_id: string;
  pattern_name: string;
  description: string;
  related_inferences: string[];
  relationship_type: "convergent" | "divergent" | "tension" | "causal";
  frequency: "high" | "medium" | "low";
  significance: string;
}

export interface Insight {
  insight_id: string;
  headline: string;
  explanation: string;
  supporting_patterns: string[];
  evidence: string[];
  type: "non-consensus" | "first-principles" | "surprising" | "revealing";
  implications: string;
  confidence: "high" | "medium" | "low";
}

export interface DesignPrinciple {
  principle_id: string;
  insight_id: string;
  principle: string;
  rationale: string;
  how_might_we: string[];
  priority: "high" | "medium" | "low";
}

// Project Analysis (Cross-Video) types
export interface ProjectAnalysis {
  id: string;
  project_id: string;
  video_ids: string[];
  cross_video_patterns: MetaPattern[] | null;
  patterns_completed_at: string | null;
  cross_video_insights: CrossInsight[] | null;
  insights_completed_at: string | null;
  cross_video_principles: SystemPrinciple[] | null;
  principles_completed_at: string | null;
  status: AnalysisStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface MetaPattern {
  meta_pattern_id: string;
  pattern_name: string;
  description: string;
  appears_in_videos: string[];
  related_patterns: string[];
  consistency: "consistent" | "varying" | "contradictory";
  context_sensitivity: string;
  significance: string;
}

export interface CrossInsight {
  cross_insight_id: string;
  headline: string;
  explanation: string;
  supporting_meta_patterns: string[];
  consistency_across_videos: "high" | "medium" | "low";
  contextual_factors: string;
  evidence: string[];
  scope: "universal" | "context-dependent";
  implications: string;
  confidence: "high" | "medium" | "low";
}

export interface SystemPrinciple {
  system_principle_id: string;
  cross_insight_id: string;
  principle: string;
  rationale: string;
  context_considerations: string;
  how_might_we: string[];
  scope: "universal" | "segmented";
  priority: "critical" | "high" | "medium";
}

// Task types
export interface AnalysisTask {
  id: string;
  video_id: string | null;
  project_id: string | null;
  task_type: TaskType;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  celery_task_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export type TaskType =
  | "transcription"
  | "chunk"
  | "infer"
  | "relate"
  | "explain"
  | "activate"
  | "cross_relate"
  | "cross_explain"
  | "cross_activate";

// Video-Transcript Sync types
export interface Word {
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
  speaker: string;
  confidence: number;
}

export interface WordLevelTranscript {
  words: Word[];
  duration: number; // total video duration in ms
}

export interface SearchMatch {
  text: string;
  count: number;
  timestamps: [number, number][]; // [start, end] pairs in milliseconds
  indexes: number[];
}

export interface TranscriptSearchResult {
  total_count: number;
  matches: SearchMatch[];
}
