import { Badge } from "../../ui/Badge";
import { Sparkles } from "lucide-react";
import { insightTypeStyles, confidenceStyles } from "../config/displayConfig";
import type { Insight } from "../../../types";

interface InsightCardProps {
  insight: Insight;
  compact?: boolean;
}

export function InsightCard({ insight, compact = false }: InsightCardProps) {
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
      <h4 className="font-semibold text-sm text-base-85 mb-1">
        {insight.headline}
      </h4>
      <p className={`text-sm text-base-55 ${compact ? "line-clamp-2" : ""}`}>
        {insight.explanation}
      </p>
      {!compact && (
        <div className="mt-2 text-label text-base-40">
          {insight.evidence.length} evidence &middot; {insight.supporting_patterns.length} pattern{insight.supporting_patterns.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
