import type { SystemPrinciple } from "../../types";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Compass, Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface SystemPrinciplesListProps {
  systemPrinciples: SystemPrinciple[];
}

const priorityColors = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-chart-2/10 text-chart-2 border-chart-2/30",
  medium: "bg-warning/10 text-warning border-warning/30",
};

const scopeColors = {
  universal: "bg-chart-3/10 text-chart-3",
  segmented: "bg-info/10 text-info",
};

export function SystemPrinciplesList({ systemPrinciples }: SystemPrinciplesListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          System-Level Design Principles ({systemPrinciples.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(priorityColors).map(([priority, color]) => (
            <Badge key={priority} className={color}>
              {priority}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {systemPrinciples.map((principle) => (
          <AccordionItem key={principle.system_principle_id} value={principle.system_principle_id}>
            <Card className={`border-l-4 ${
              principle.priority === "critical"
                ? "border-l-destructive"
                : principle.priority === "high"
                ? "border-l-chart-2"
                : "border-l-warning"
            }`}>
              <CardContent className="p-0">
                <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-muted">
                  <div className="flex items-start gap-3 text-left flex-1">
                    <Compass className="h-5 w-5 text-chart-3 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={priorityColors[principle.priority]}>
                          {principle.priority} priority
                        </Badge>
                        <Badge className={scopeColors[principle.scope]}>
                          {principle.scope}
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-base">
                        {principle.principle}
                      </h4>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4 pl-8">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Principle
                      </div>
                      <p className="text-foreground text-base font-medium leading-relaxed">
                        {principle.principle}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Rationale
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {principle.rationale}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Context Considerations
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {principle.context_considerations}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Strategic How Might We... ({principle.how_might_we.length})
                      </div>
                      <ul className="space-y-3">
                        {principle.how_might_we.map((hmw, idx) => (
                          <li key={idx} className="flex gap-2 p-3 bg-chart-3/10 rounded-lg border border-chart-3/20">
                            <span className="text-chart-3 font-semibold">{idx + 1}.</span>
                            <span className="text-foreground">{hmw}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Related Cross-Video Insight
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {principle.cross_insight_id}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground/60 font-mono">
                      ID: {principle.system_principle_id}
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
