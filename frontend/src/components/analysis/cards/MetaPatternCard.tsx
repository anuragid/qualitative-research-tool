import { Badge } from "../../ui/badge";
import { Network } from "lucide-react";
import { consistencyStyles, normalizeConsistency } from "../config/displayConfig";
import type { MetaPattern } from "../../../types";

interface MetaPatternCardProps {
  metaPattern: MetaPattern;
  compact?: boolean;
}

export function MetaPatternCard({ metaPattern, compact = false }: MetaPatternCardProps) {
  // Defensive guards — jsonb fields may be null at runtime. See PR #21.
  const appearsIn = metaPattern.appears_in_videos ?? [];
  const relatedPatterns = metaPattern.related_patterns ?? [];
  const normalized = normalizeConsistency(metaPattern.consistency);
  const consStyle = consistencyStyles[normalized] || "";

  return (
    <div className="bg-card rounded-xl p-3 sm:p-4">
      <div className="flex items-start gap-2 mb-2">
        <Network className="h-4 w-4 text-interactive-focus flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm text-text-primary">
              {metaPattern.pattern_name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${consStyle} text-label`}>
              {normalized}
            </Badge>
            <Badge className="bg-interactive-focus-bg text-interactive-focus text-label">
              {appearsIn.length} video{appearsIn.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </div>
      <p className={`text-sm text-text-tertiary mt-2 ${compact ? "line-clamp-2" : ""}`}>
        {metaPattern.description}
      </p>
      {!compact && (
        <div className="mt-2 text-label text-text-placeholder">
          {relatedPatterns.length} related pattern{relatedPatterns.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
