import type { Pattern } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Network } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface PatternsListProps {
  patterns: Pattern[];
}

const relationshipTypeColors = {
  convergent: "bg-success/10 text-success",
  divergent: "bg-chart-3/10 text-chart-3",
  tension: "bg-destructive/10 text-destructive",
  causal: "bg-info/10 text-info",
};

const frequencyColors = {
  high: "bg-chart-2/10 text-chart-2",
  medium: "bg-warning/10 text-warning",
  low: "bg-muted text-muted-foreground",
};

export function PatternsList({ patterns }: PatternsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Patterns ({patterns.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(relationshipTypeColors).map(([type, color]) => (
            <Badge key={type} className={color}>
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {patterns.map((pattern) => (
          <AccordionItem key={pattern.pattern_id} value={pattern.pattern_id}>
            <Card>
              <CardContent className="p-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Network className="h-5 w-5 text-chart-3 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold">{pattern.pattern_name}</span>
                        <Badge className={relationshipTypeColors[pattern.relationship_type]}>
                          {pattern.relationship_type}
                        </Badge>
                        <Badge className={frequencyColors[pattern.frequency]}>
                          {pattern.frequency} frequency
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {pattern.description}
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
                      <p className="text-foreground">{pattern.description}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Significance
                      </div>
                      <p className="text-foreground">{pattern.significance}</p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Related Inferences ({pattern.related_inferences.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pattern.related_inferences.map((infId) => (
                          <Badge key={infId} variant="outline" className="font-mono text-xs">
                            {infId}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground/60 font-mono">
                      ID: {pattern.pattern_id}
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
