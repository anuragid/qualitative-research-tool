import type { CrossInsight } from "../../types";
import { Badge } from "../ui/badge";
import { Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { scopeStyles, consistencyStyles, confidenceStyles } from "./config/displayConfig";
import { CrossInsightCard } from "./cards/CrossInsightCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface CrossInsightsListProps {
  crossInsights: CrossInsight[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
}

const crossInsightColumns: TableColumn<CrossInsight>[] = [
  {
    key: "headline",
    label: "Headline",
    sortable: true,
    render: (ci) => (
      <span className="font-semibold text-sm text-text-primary">{ci.headline}</span>
    ),
  },
  {
    key: "scope",
    label: "Scope",
    sortable: true,
    render: (ci) => (
      <Badge className={`${scopeStyles[ci.scope] || ""} text-label`}>
        {ci.scope}
      </Badge>
    ),
    className: "w-36",
  },
  {
    key: "consistency_across_videos",
    label: "Consistency",
    sortable: true,
    render: (ci) => (
      <Badge className={`${consistencyStyles[ci.consistency_across_videos] || ""} text-label`}>
        {ci.consistency_across_videos}
      </Badge>
    ),
    className: "w-32",
  },
  {
    key: "confidence",
    label: "Confidence",
    sortable: true,
    render: (ci) => (
      <Badge className={`${confidenceStyles[ci.confidence] || ""} text-label`}>
        {ci.confidence}
      </Badge>
    ),
    className: "w-32",
  },
];

export function CrossInsightsList({ crossInsights, viewMode = "list", sort, onSort }: CrossInsightsListProps) {
  if (viewMode === "grid") {
    return (
      <CardView columns={2}>
        {crossInsights.map((insight) => (
          <CrossInsightCard key={insight.cross_insight_id} insight={insight} compact />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    return (
      <TableView
        data={crossInsights}
        columns={crossInsightColumns}
        sort={sort || null}
        onSort={onSort || (() => {})}
      />
    );
  }

  // Default: list view (accordion behavior)
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-h4 text-foreground">
          Cross-Video Insights ({crossInsights.length})
        </h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(scopeStyles)
            .filter(([type]) => crossInsights.some((ci) => ci.scope === type))
            .map(([type, style]) => (
              <Badge key={type} className={style}>
                {type}
              </Badge>
            ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {crossInsights.map((insight) => (
          <AccordionItem key={insight.cross_insight_id} value={insight.cross_insight_id}>
            <div className="bg-card rounded-2xl overflow-hidden border-l-4 border-l-interactive-focus">
              <AccordionTrigger className="px-3 sm:px-5 py-4 hover:no-underline hover:bg-interactive-fill">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Sparkles className="h-5 w-5 text-interactive-focus flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className={scopeStyles[insight.scope]}>
                        {insight.scope}
                      </Badge>
                      <Badge className={consistencyStyles[insight.consistency_across_videos]}>
                        {insight.consistency_across_videos} consistency
                      </Badge>
                      <Badge className={confidenceStyles[insight.confidence]}>
                        {insight.confidence} confidence
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-base text-text-primary mb-1">
                      {insight.headline}
                    </h4>
                    <p className="text-sm text-text-tertiary line-clamp-2">
                      {insight.explanation}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-3 sm:px-5 pb-5">
                <div className="space-y-4 pl-4 sm:pl-8">
                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Explanation
                    </div>
                    <p className="text-text-primary leading-relaxed">{insight.explanation}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Implications
                    </div>
                    <p className="text-text-primary leading-relaxed">{insight.implications}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Contextual Factors
                    </div>
                    <p className="text-text-primary leading-relaxed">{insight.contextual_factors}</p>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Evidence From Videos ({insight.evidence.length})
                    </div>
                    <ul className="space-y-2">
                      {insight.evidence.map((item, idx) => (
                        <li key={idx} className="flex gap-2 p-3 bg-brand-pale-blue/30 rounded-xl">
                          <span className="text-text-disabled">&#8226;</span>
                          <span className="text-text-tertiary">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="text-label text-text-placeholder uppercase mb-2">
                      Supporting Meta-Patterns ({insight.supporting_meta_patterns.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {insight.supporting_meta_patterns.map((patternId) => (
                        <Badge key={patternId} variant="outline" className="font-mono text-xs text-text-tertiary border-border">
                          {patternId}
                        </Badge>
                      ))}
                    </div>
                  </div>

                </div>
              </AccordionContent>
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
