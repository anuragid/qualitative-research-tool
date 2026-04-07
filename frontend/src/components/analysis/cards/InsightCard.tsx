import { Badge } from "../../ui/badge";
import { Sparkles } from "lucide-react";
import { insightTypeStyles, confidenceStyles } from "../config/displayConfig";
import type { Insight } from "../../../types";

interface InsightCardProps {
  insight: Insight;
  compact?: boolean;
}

export function InsightCard({ insight, compact = false }: InsightCardProps) {
  // Defensive guards — jsonb fields may be null at runtime. See PR #21.
  const evidence = insight.evidence ?? [];
  const supportingPatterns = insight.supporting_patterns ?? [];
  const typeStyle = insightTypeStyles[insight.type] || "";
  const confStyle = confidenceStyles[insight.confidence] || "";

  return (
    <div className="bg-card rounded-xl p-3 sm:p-4 border-l-4 border-l-brand-maroon">
      <div className="flex items-start gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-brand-maroon flex-shrink-0 mt-0.5" />
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${typeStyle} text-label`}>{insight.type}</Badge>
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
          {evidence.length} evidence &middot; {supportingPatterns.length} pattern{supportingPatterns.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
