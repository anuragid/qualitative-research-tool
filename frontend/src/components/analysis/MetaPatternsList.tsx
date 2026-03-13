import type { MetaPattern } from "../../types";
import { Badge } from "../ui/Badge";
import { Network } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface MetaPatternsListProps {
  metaPatterns: MetaPattern[];
}

const consistencyStyles: Record<string, string> = {
  consistent: "bg-brand-forest/10 text-brand-forest border-0",
  varying: "bg-brand-mustard/10 text-brand-mustard border-0",
  contradictory: "bg-destructive/10 text-destructive border-0",
};

export function MetaPatternsList({ metaPatterns }: MetaPatternsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          Meta-Patterns ({metaPatterns.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(consistencyStyles).map(([type, style]) => (
            <Badge key={type} className={style}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {metaPatterns.map((metaPattern) => (
          <AccordionItem key={metaPattern.meta_pattern_id} value={metaPattern.meta_pattern_id}>
            <div className="bg-card rounded-2xl overflow-hidden">
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-base-04">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Network className="h-5 w-5 text-accent-blue flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-base-85">{metaPattern.pattern_name}</span>
                      <Badge className={consistencyStyles[metaPattern.consistency]}>
                        {metaPattern.consistency}
                      </Badge>
                      <Badge className="bg-accent-blue-bg text-accent-blue border-0">
                        {metaPattern.appears_in_videos.length} videos
                      </Badge>
                    </div>
                    <p className="text-sm text-base-55 line-clamp-2">
                      {metaPattern.description}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-5 pb-5">
                <div className="space-y-4 pl-8">
                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Description
                    </div>
                    <p className="text-base-85">{metaPattern.description}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Significance
                    </div>
                    <p className="text-base-85">{metaPattern.significance}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Context Sensitivity
                    </div>
                    <p className="text-base-85">{metaPattern.context_sensitivity}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Appears In Videos ({metaPattern.appears_in_videos.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {metaPattern.appears_in_videos.map((videoId) => (
                        <Badge key={videoId} variant="outline" className="font-mono text-xs text-base-55 border-base-09">
                          {videoId.substring(0, 8)}...
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Related Patterns ({metaPattern.related_patterns.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {metaPattern.related_patterns.map((patternId) => (
                        <Badge key={patternId} variant="outline" className="font-mono text-xs text-base-55 border-base-09">
                          {patternId}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="text-label text-base-25 font-mono">
                    ID: {metaPattern.meta_pattern_id}
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
