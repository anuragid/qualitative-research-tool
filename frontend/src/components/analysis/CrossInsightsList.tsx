import type { CrossInsight } from "../../types";
import { Badge } from "../ui/Badge";
import { Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface CrossInsightsListProps {
  crossInsights: CrossInsight[];
}

const scopeStyles: Record<string, string> = {
  universal: "bg-brand-maroon/10 text-brand-maroon border-0",
  "context-dependent": "bg-accent-blue-bg text-accent-blue border-0",
};

const consistencyStyles: Record<string, string> = {
  high: "bg-brand-forest/10 text-brand-forest border-0",
  medium: "bg-brand-mustard/10 text-brand-mustard border-0",
  low: "bg-base-04 text-base-55 border-0",
};

const confidenceStyles: Record<string, string> = {
  high: "bg-brand-forest/10 text-brand-forest border-0",
  medium: "bg-brand-mustard/10 text-brand-mustard border-0",
  low: "bg-base-04 text-base-55 border-0",
};

export function CrossInsightsList({ crossInsights }: CrossInsightsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-h4 text-foreground">
          Cross-Video Insights ({crossInsights.length})
        </h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(scopeStyles).map(([type, style]) => (
            <Badge key={type} className={style}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {crossInsights.map((insight) => (
          <AccordionItem key={insight.cross_insight_id} value={insight.cross_insight_id}>
            <div className="bg-card rounded-2xl overflow-hidden border-l-4 border-l-accent-blue">
              <AccordionTrigger className="px-3 sm:px-5 py-4 hover:no-underline hover:bg-base-04">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Sparkles className="h-5 w-5 text-accent-blue flex-shrink-0 mt-0.5" />
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
                    <h4 className="font-semibold text-base text-base-85 mb-1">
                      {insight.headline}
                    </h4>
                    <p className="text-sm text-base-55 line-clamp-2">
                      {insight.explanation}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-3 sm:px-5 pb-5">
                <div className="space-y-4 pl-4 sm:pl-8">
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
                      Contextual Factors
                    </div>
                    <p className="text-base-85 leading-relaxed">{insight.contextual_factors}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Evidence From Videos ({insight.evidence.length})
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
                      Supporting Meta-Patterns ({insight.supporting_meta_patterns.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {insight.supporting_meta_patterns.map((patternId) => (
                        <Badge key={patternId} variant="outline" className="font-mono text-xs text-base-55 border-base-09">
                          {patternId}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="text-label text-base-25 font-mono">
                    ID: {insight.cross_insight_id}
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
