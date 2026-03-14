import { Badge } from "../../ui/Badge";
import { Network } from "lucide-react";
import { consistencyStyles } from "../config/displayConfig";
import type { MetaPattern } from "../../../types";

interface MetaPatternCardProps {
  metaPattern: MetaPattern;
  compact?: boolean;
}

export function MetaPatternCard({ metaPattern, compact = false }: MetaPatternCardProps) {
  const consStyle = consistencyStyles[metaPattern.consistency] || "";

  return (
    <div className="bg-card rounded-xl p-3 sm:p-4">
      <div className="flex items-start gap-2 mb-2">
        <Network className="h-4 w-4 text-accent-blue flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm text-base-85">
              {metaPattern.pattern_name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${consStyle} text-label`}>
              {metaPattern.consistency}
            </Badge>
            <Badge className="bg-accent-blue-bg text-accent-blue text-label">
              {metaPattern.appears_in_videos.length} video{metaPattern.appears_in_videos.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </div>
      <p className={`text-sm text-base-55 mt-2 ${compact ? "line-clamp-2" : ""}`}>
        {metaPattern.description}
      </p>
      {!compact && (
        <div className="mt-2 text-label text-base-40">
          {metaPattern.related_patterns.length} related pattern{metaPattern.related_patterns.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
