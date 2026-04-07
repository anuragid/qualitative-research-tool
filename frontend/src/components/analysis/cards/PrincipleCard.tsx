import { Badge } from "../../ui/badge";
import { Compass } from "lucide-react";
import { priorityStyles } from "../config/displayConfig";
import type { DesignPrinciple } from "../../../types";

interface PrincipleCardProps {
  principle: DesignPrinciple;
  compact?: boolean;
}

export function PrincipleCard({ principle, compact = false }: PrincipleCardProps) {
  const pStyle = priorityStyles[principle.priority] || priorityStyles.low;

  return (
    <div className={`bg-card rounded-xl p-3 sm:p-4 border-l-4 ${pStyle.border}`}>
      <div className="flex items-start gap-2 mb-2">
        <Compass className="h-4 w-4 text-interactive-focus flex-shrink-0 mt-0.5" />
        <Badge className={`${pStyle.badge} text-label`}>
          {principle.priority} priority
        </Badge>
      </div>
      <h4 className="font-semibold text-sm text-text-primary mb-1">
        {principle.principle}
      </h4>
      <p className={`text-sm text-text-tertiary ${compact ? "line-clamp-2" : ""}`}>
        {principle.rationale}
      </p>
      {!compact && (
        <div className="mt-2 text-label text-text-placeholder">
          {(principle.how_might_we ?? []).length} HMW question{(principle.how_might_we ?? []).length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
