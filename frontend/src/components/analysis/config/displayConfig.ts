// displayConfig.ts
// Centralized style maps, sort options, and filter options for all analysis steps.
// Eliminates duplication across 8 list components.

export const ANALYSIS_STEPS = [
  "chunks", "inferences", "patterns", "insights", "principles",
  "metaPatterns", "crossInsights", "systemPrinciples",
] as const;

export type AnalysisStep = (typeof ANALYSIS_STEPS)[number];

// ===== CHUNK TYPES =====
export const chunkTypeStyles: Record<string, { border: string; badge: string; icon: string }> = {
  quote: { border: "border-l-brand-forest", badge: "bg-brand-forest text-white", icon: "Q" },
  fact: { border: "border-l-brand-mustard", badge: "bg-brand-mustard text-white", icon: "F" },
  context: { border: "border-l-brand-maroon", badge: "bg-brand-maroon text-white", icon: "C" },
  observation: { border: "border-l-brand-olive", badge: "bg-brand-olive text-white", icon: "O" },
};

// ===== INSIGHT TYPES =====
export const insightTypeStyles: Record<string, string> = {
  "non-consensus": "bg-brand-crimson text-white",
  "first-principles": "bg-brand-forest text-white",
  "surprising": "bg-brand-burnt-orange text-white",
  "revealing": "bg-brand-maroon text-white",
};

// ===== CONFIDENCE =====
export const confidenceStyles: Record<string, string> = {
  high: "bg-brand-forest/20 text-brand-forest border-brand-forest/30",
  medium: "bg-brand-mustard/20 text-brand-mustard border-brand-mustard/30",
  low: "bg-base-04 text-base-55 border-border",
};

// ===== PRIORITY =====
export const priorityStyles: Record<string, { badge: string; border: string }> = {
  critical: { badge: "bg-destructive text-white", border: "border-l-destructive" },
  high: { badge: "bg-brand-crimson text-white", border: "border-l-brand-crimson" },
  medium: { badge: "bg-brand-mustard text-white", border: "border-l-brand-mustard" },
  low: { badge: "bg-accent-blue-bg text-accent-blue", border: "border-l-accent-blue" },
};

// ===== FREQUENCY =====
export const frequencyStyles: Record<string, string> = {
  high: "bg-brand-forest/20 text-brand-forest",
  medium: "bg-brand-mustard/20 text-brand-mustard",
  low: "bg-base-04 text-base-55",
};

// ===== RELATIONSHIP TYPE =====
export const relationshipTypeStyles: Record<string, string> = {
  convergent: "bg-brand-forest/20 text-brand-forest",
  divergent: "bg-brand-burnt-orange/20 text-brand-burnt-orange",
  tension: "bg-brand-crimson/20 text-brand-crimson",
  causal: "bg-accent-blue-bg text-accent-blue",
};

// ===== CONSISTENCY =====
export const consistencyStyles: Record<string, string> = {
  consistent: "bg-brand-forest/20 text-brand-forest",
  varying: "bg-brand-mustard/20 text-brand-mustard",
  contradictory: "bg-brand-crimson/20 text-brand-crimson",
  high: "bg-brand-forest/20 text-brand-forest",
  medium: "bg-brand-mustard/20 text-brand-mustard",
  low: "bg-brand-crimson/20 text-brand-crimson",
};

// ===== SCOPE =====
export const scopeStyles: Record<string, string> = {
  universal: "bg-accent-blue-bg text-accent-blue",
  "context-dependent": "bg-brand-mustard/20 text-brand-mustard",
  segmented: "bg-brand-maroon/20 text-brand-maroon",
};

// ===== SORT OPTIONS =====
export interface SortOption {
  field: string;
  label: string;
  direction?: "asc" | "desc";
}

export const sortOptions: Record<AnalysisStep, SortOption[]> = {
  chunks: [
    { field: "type", label: "Type" },
    { field: "speaker", label: "Speaker" },
    { field: "timestamp", label: "Timestamp" },
  ],
  inferences: [
    { field: "chunk_id", label: "Chunk" },
    { field: "count", label: "Inference Count", direction: "desc" },
  ],
  patterns: [
    { field: "frequency", label: "Frequency", direction: "desc" },
    { field: "relationship_type", label: "Relationship" },
    { field: "pattern_name", label: "Name" },
  ],
  insights: [
    { field: "confidence", label: "Confidence", direction: "desc" },
    { field: "type", label: "Type" },
    { field: "headline", label: "Headline" },
  ],
  principles: [
    { field: "priority", label: "Priority", direction: "desc" },
    { field: "principle", label: "Principle" },
  ],
  metaPatterns: [
    { field: "consistency", label: "Consistency" },
    { field: "appears_in_videos.length", label: "Video Count", direction: "desc" },
    { field: "pattern_name", label: "Name" },
  ],
  crossInsights: [
    { field: "confidence", label: "Confidence", direction: "desc" },
    { field: "consistency_across_videos", label: "Consistency" },
    { field: "scope", label: "Scope" },
  ],
  systemPrinciples: [
    { field: "priority", label: "Priority", direction: "desc" },
    { field: "scope", label: "Scope" },
  ],
};

// ===== FILTER OPTIONS =====
export interface FilterOption {
  field: string;
  label: string;
  values: string[];
}

export const filterOptions: Record<AnalysisStep, FilterOption[]> = {
  chunks: [
    { field: "type", label: "Type", values: ["quote", "fact", "context", "observation"] },
  ],
  inferences: [],
  patterns: [
    { field: "relationship_type", label: "Relationship", values: ["convergent", "divergent", "tension", "causal"] },
    { field: "frequency", label: "Frequency", values: ["high", "medium", "low"] },
  ],
  insights: [
    { field: "type", label: "Type", values: ["non-consensus", "first-principles", "surprising", "revealing"] },
    { field: "confidence", label: "Confidence", values: ["high", "medium", "low"] },
  ],
  principles: [
    { field: "priority", label: "Priority", values: ["high", "medium", "low"] },
  ],
  metaPatterns: [
    { field: "consistency", label: "Consistency", values: ["consistent", "varying", "contradictory"] },
  ],
  crossInsights: [
    { field: "confidence", label: "Confidence", values: ["high", "medium", "low"] },
    { field: "scope", label: "Scope", values: ["universal", "context-dependent"] },
  ],
  systemPrinciples: [
    { field: "priority", label: "Priority", values: ["critical", "high", "medium"] },
    { field: "scope", label: "Scope", values: ["universal", "segmented"] },
  ],
};
