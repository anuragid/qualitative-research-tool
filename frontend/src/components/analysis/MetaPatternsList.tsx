import type { MetaPattern } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Network } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface MetaPatternsListProps {
  metaPatterns: MetaPattern[];
}

const consistencyColors = {
  consistent: "bg-success/10 text-success",
  varying: "bg-warning/10 text-warning",
  contradictory: "bg-destructive/10 text-destructive",
};

export function MetaPatternsList({ metaPatterns }: MetaPatternsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Meta-Patterns ({metaPatterns.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(consistencyColors).map(([type, color]) => (
            <Badge key={type} className={color}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {metaPatterns.map((metaPattern) => (
          <AccordionItem key={metaPattern.meta_pattern_id} value={metaPattern.meta_pattern_id}>
            <Card>
              <CardContent className="p-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Network className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold">{metaPattern.pattern_name}</span>
                        <Badge className={consistencyColors[metaPattern.consistency]}>
                          {metaPattern.consistency}
                        </Badge>
                        <Badge variant="outline" className="bg-info/10 text-info">
                          {metaPattern.appears_in_videos.length} videos
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {metaPattern.description}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4 pl-8">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Description
                      </div>
                      <p className="text-foreground">{metaPattern.description}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Significance
                      </div>
                      <p className="text-foreground">{metaPattern.significance}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Context Sensitivity
                      </div>
                      <p className="text-foreground">{metaPattern.context_sensitivity}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Appears In Videos ({metaPattern.appears_in_videos.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {metaPattern.appears_in_videos.map((videoId) => (
                          <Badge key={videoId} variant="outline" className="font-mono text-xs">
                            {videoId.substring(0, 8)}...
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Related Patterns ({metaPattern.related_patterns.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {metaPattern.related_patterns.map((patternId) => (
                          <Badge key={patternId} variant="outline" className="font-mono text-xs">
                            {patternId}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground/60 font-mono">
                      ID: {metaPattern.meta_pattern_id}
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
