import type { Insight } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface InsightsListProps {
  insights: Insight[];
}

const insightTypeColors = {
  "non-consensus": "bg-chart-3/10 text-chart-3",
  "first-principles": "bg-info/10 text-info",
  "surprising": "bg-chart-2/10 text-chart-2",
  "revealing": "bg-success/10 text-success",
};

const confidenceColors = {
  high: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  low: "bg-muted text-muted-foreground",
};

export function InsightsList({ insights }: InsightsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Insights ({insights.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(insightTypeColors).map(([type, color]) => (
            <Badge key={type} className={color}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {insights.map((insight) => (
          <AccordionItem key={insight.insight_id} value={insight.insight_id}>
            <Card className="border-l-4 border-l-chart-3">
              <CardContent className="p-0">
                <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-muted">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Sparkles className="h-5 w-5 text-chart-3 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={insightTypeColors[insight.type]}>
                          {insight.type}
                        </Badge>
                        <Badge className={confidenceColors[insight.confidence]}>
                          {insight.confidence} confidence
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-base mb-1">
                        {insight.headline}
                      </h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {insight.explanation}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4 pl-8">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Explanation
                      </div>
                      <p className="text-foreground leading-relaxed">{insight.explanation}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Implications
                      </div>
                      <p className="text-foreground leading-relaxed">{insight.implications}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Evidence ({insight.evidence.length})
                      </div>
                      <ul className="space-y-2">
                        {insight.evidence.map((item, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-muted-foreground/60">•</span>
                            <span className="text-muted-foreground">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Supporting Patterns ({insight.supporting_patterns.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {insight.supporting_patterns.map((patternId) => (
                          <Badge key={patternId} variant="outline" className="font-mono text-xs">
                            {patternId}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground/60 font-mono">
                      ID: {insight.insight_id}
                    </div>
                  </div>
                </AccordionContent>
              </CardContent>
            </Card>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
