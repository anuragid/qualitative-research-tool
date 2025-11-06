import type { CrossInsight } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface CrossInsightsListProps {
  crossInsights: CrossInsight[];
}

const scopeColors = {
  universal: "bg-purple-100 text-purple-800",
  "context-dependent": "bg-blue-100 text-blue-800",
};

const consistencyColors = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-800",
};

const confidenceColors = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-800",
};

export function CrossInsightsList({ crossInsights }: CrossInsightsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Cross-Video Insights ({crossInsights.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(scopeColors).map(([type, color]) => (
            <Badge key={type} className={color}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {crossInsights.map((insight) => (
          <AccordionItem key={insight.cross_insight_id} value={insight.cross_insight_id}>
            <Card className="border-l-4 border-l-blue-400">
              <CardContent className="p-0">
                <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-gray-50">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Sparkles className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={scopeColors[insight.scope]}>
                          {insight.scope}
                        </Badge>
                        <Badge className={consistencyColors[insight.consistency_across_videos]}>
                          {insight.consistency_across_videos} consistency
                        </Badge>
                        <Badge className={confidenceColors[insight.confidence]}>
                          {insight.confidence} confidence
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-base mb-1">
                        {insight.headline}
                      </h4>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {insight.explanation}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4 pl-8">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Explanation
                      </div>
                      <p className="text-gray-900 leading-relaxed">{insight.explanation}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Implications
                      </div>
                      <p className="text-gray-900 leading-relaxed">{insight.implications}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Contextual Factors
                      </div>
                      <p className="text-gray-900 leading-relaxed">{insight.contextual_factors}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Evidence From Videos ({insight.evidence.length})
                      </div>
                      <ul className="space-y-2">
                        {insight.evidence.map((item, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Supporting Meta-Patterns ({insight.supporting_meta_patterns.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {insight.supporting_meta_patterns.map((patternId) => (
                          <Badge key={patternId} variant="outline" className="font-mono text-xs">
                            {patternId}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-gray-400 font-mono">
                      ID: {insight.cross_insight_id}
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
