import { Badge } from "../../ui/Badge";
import { Network } from "lucide-react";
import { relationshipTypeStyles, frequencyStyles } from "../config/displayConfig";
import type { Pattern } from "../../../types";

interface PatternCardProps {
  pattern: Pattern;
  compact?: boolean;
}

export function PatternCard({ pattern, compact = false }: PatternCardProps) {
  const relStyle = relationshipTypeStyles[pattern.relationship_type] || "";
  const freqStyle = frequencyStyles[pattern.frequency] || "";

  return (
    <div className="bg-card rounded-xl p-3 sm:p-4">
      <div className="flex items-start gap-2 mb-2">
        <Network className="h-4 w-4 text-brand-maroon flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm text-base-85">
              {pattern.pattern_name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${relStyle} text-label`}>
              {pattern.relationship_type}
            </Badge>
            <Badge className={`${freqStyle} text-label`}>
              {pattern.frequency} freq
            </Badge>
          </div>
        </div>
      </div>
      <p className={`text-sm text-base-55 mt-2 ${compact ? "line-clamp-2" : ""}`}>
        {pattern.description}
      </p>
      {!compact && (
        <div className="mt-2 text-label text-base-40">
          {pattern.related_inferences.length} related inference{pattern.related_inferences.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
