import type { Insight } from "../../types";
import { Badge } from "../ui/Badge";
import { Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";
import { insightTypeStyles, confidenceStyles } from "./config/displayConfig";
import { InsightCard } from "./cards/InsightCard";
import { CardView } from "./display/CardView";
import { TableView, type TableColumn } from "./display/TableView";
import type { ViewMode, SortConfig } from "./hooks/useAnalysisDisplay";

interface InsightsListProps {
  insights: Insight[];
  viewMode?: ViewMode;
  sort?: SortConfig | null;
  onSort?: (config: SortConfig | null) => void;
}

const insightColumns: TableColumn<Insight>[] = [
  { key: "type", label: "Type", sortable: true, render: (ins) => (
    <Badge className={`${insightTypeStyles[ins.type] || ""} text-label`}>{ins.type}</Badge>
  ), className: "w-36" },
  { key: "confidence", label: "Confidence", sortable: true, render: (ins) => (
    <Badge className={`${confidenceStyles[ins.confidence] || ""} text-label border`}>
      {ins.confidence}
    </Badge>
  ), className: "w-28" },
  { key: "headline", label: "Headline", sortable: true, render: (ins) => (
    <span className="font-semibold text-sm text-base-85">{ins.headline}</span>
  ) },
  { key: "explanation", label: "Explanation", render: (ins) => (
    <p className="text-sm text-base-55 line-clamp-2">{ins.explanation}</p>
  ) },
  { key: "evidence", label: "Evidence", sortable: false, render: (ins) => (
    <span className="text-sm text-base-40">{ins.evidence.length}</span>
  ), className: "w-24" },
];

export function InsightsList({ insights, viewMode = "list", sort, onSort }: InsightsListProps) {
  if (viewMode === "grid") {
    return (
      <CardView columns={2}>
        {insights.map((insight, i) => (
          <InsightCard key={insight.insight_id || i} insight={insight} compact />
        ))}
      </CardView>
    );
  }

  if (viewMode === "table") {
    return (
      <TableView
        data={insights}
        columns={insightColumns}
        sort={sort || null}
        onSort={onSort || (() => {})}
      />
    );
  }

  // Default: list view (accordion)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          Insights ({insights.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(insightTypeStyles)
            .filter(([type]) => insights.some((ins) => ins.type === type))
            .map(([type, style]) => (
              <Badge key={type} className={style}>
                {type}
              </Badge>
            ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {insights.map((insight) => (
          <AccordionItem key={insight.insight_id} value={insight.insight_id}>
            <div className="bg-card rounded-2xl overflow-hidden border-l-4 border-l-brand-maroon">
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-base-04">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Sparkles className="h-5 w-5 text-brand-maroon flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className={insightTypeStyles[insight.type]}>
                        {insight.type}
                      </Badge>
                      <Badge className={confidenceStyles[insight.confidence]}>
                        {insight.confidence} confidence
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-base text-base-85 mb-1">
                      {insight.headline}
                    </h4>
                    <p className="text-sm text-base-55 line-clamp-2">
                      {insight.explanation}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-5 pb-5">
                <div className="space-y-4 pl-8">
                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Explanation
                    </div>
                    <p className="text-base-85 leading-relaxed">{insight.explanation}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Implications
                    </div>
                    <p className="text-base-85 leading-relaxed">{insight.implications}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Evidence ({insight.evidence.length})
                    </div>
                    <ul className="space-y-2">
                      {insight.evidence.map((item, idx) => (
                        <li key={idx} className="flex gap-2 p-3 bg-brand-pale-blue/30 rounded-xl">
                          <span className="text-base-25">&#8226;</span>
                          <span className="text-base-55">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Supporting Patterns ({insight.supporting_patterns.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {insight.supporting_patterns.map((patternId) => (
                        <Badge key={patternId} variant="outline" className="font-mono text-xs text-base-55 border-base-09">
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
