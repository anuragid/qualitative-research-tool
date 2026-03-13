import type { Pattern } from "../../types";
import { Badge } from "../ui/Badge";
import { Network } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface PatternsListProps {
  patterns: Pattern[];
}

const relationshipTypeStyles: Record<string, string> = {
  convergent: "bg-brand-forest/10 text-brand-forest border-0",
  divergent: "bg-brand-maroon/10 text-brand-maroon border-0",
  tension: "bg-destructive/10 text-destructive border-0",
  causal: "bg-accent-blue-bg text-accent-blue border-0",
};

const frequencyStyles: Record<string, string> = {
  high: "bg-brand-mustard/10 text-brand-mustard border-0",
  medium: "bg-brand-olive/10 text-brand-olive border-0",
  low: "bg-base-04 text-base-55 border-0",
};

export function PatternsList({ patterns }: PatternsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          Patterns ({patterns.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(relationshipTypeStyles).map(([type, style]) => (
            <Badge key={type} className={style}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {patterns.map((pattern) => (
          <AccordionItem key={pattern.pattern_id} value={pattern.pattern_id}>
            <div className="bg-card rounded-2xl overflow-hidden">
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-base-04">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Network className="h-5 w-5 text-brand-maroon flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-base-85">{pattern.pattern_name}</span>
                      <Badge className={relationshipTypeStyles[pattern.relationship_type]}>
                        {pattern.relationship_type}
                      </Badge>
                      <Badge className={frequencyStyles[pattern.frequency]}>
                        {pattern.frequency} frequency
                      </Badge>
                    </div>
                    <p className="text-sm text-base-55 line-clamp-2">
                      {pattern.description}
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
                    <p className="text-base-85">{pattern.description}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Significance
                    </div>
                    <p className="text-base-85">{pattern.significance}</p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Related Inferences ({pattern.related_inferences.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pattern.related_inferences.map((infId) => (
                        <Badge key={infId} variant="outline" className="font-mono text-xs text-base-55 border-base-09">
                          {infId}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="text-label text-base-25 font-mono">
                    ID: {pattern.pattern_id}
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
