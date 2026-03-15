import { Badge } from "../../ui/Badge";
import { Sparkles } from "lucide-react";
import { scopeStyles, consistencyStyles, confidenceStyles } from "../config/displayConfig";
import type { CrossInsight } from "../../../types";

interface CrossInsightCardProps {
  insight: CrossInsight;
  compact?: boolean;
}

export function CrossInsightCard({ insight, compact = false }: CrossInsightCardProps) {
  const scStyle = scopeStyles[insight.scope] || "";
  const consStyle = consistencyStyles[insight.consistency_across_videos] || "";
  const confStyle = confidenceStyles[insight.confidence] || "";

  return (
    <div className="bg-card rounded-xl p-3 sm:p-4 border-l-4 border-l-interactive-focus">
      <div className="flex items-start gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-interactive-focus flex-shrink-0 mt-0.5" />
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${scStyle} text-label`}>{insight.scope}</Badge>
          <Badge className={`${consStyle} text-label`}>
            {insight.consistency_across_videos} consistency
          </Badge>
          <Badge className={`${confStyle} text-label border`}>
            {insight.confidence} confidence
          </Badge>
        </div>
      </div>
      <h4 className="font-semibold text-sm text-text-primary mb-1">
        {insight.headline}
      </h4>
      <p className={`text-sm text-text-tertiary ${compact ? "line-clamp-2" : ""}`}>
        {insight.explanation}
      </p>
      {!compact && (
        <div className="mt-2 text-label text-text-placeholder">
          {insight.evidence.length} evidence &middot; {insight.supporting_meta_patterns.length} meta-pattern{insight.supporting_meta_patterns.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
