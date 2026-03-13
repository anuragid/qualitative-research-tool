import type { SystemPrinciple } from "../../types";
import { Badge } from "../ui/Badge";
import { Compass, Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/Accordion";

interface SystemPrinciplesListProps {
  systemPrinciples: SystemPrinciple[];
}

const priorityStyles: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-0",
  high: "bg-brand-mustard/10 text-brand-mustard border-0",
  medium: "bg-brand-olive/10 text-brand-olive border-0",
};

const priorityBorderStyles: Record<string, string> = {
  critical: "border-l-destructive",
  high: "border-l-brand-mustard",
  medium: "border-l-brand-olive",
};

const scopeStyles: Record<string, string> = {
  universal: "bg-brand-maroon/10 text-brand-maroon border-0",
  segmented: "bg-accent-blue-bg text-accent-blue border-0",
};

export function SystemPrinciplesList({ systemPrinciples }: SystemPrinciplesListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h4 text-foreground">
          System-Level Design Principles ({systemPrinciples.length})
        </h3>
        <div className="flex gap-2 text-sm">
          {Object.entries(priorityStyles).map(([priority, style]) => (
            <Badge key={priority} className={style}>
              {priority}
            </Badge>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {systemPrinciples.map((principle) => (
          <AccordionItem key={principle.system_principle_id} value={principle.system_principle_id}>
            <div className={`bg-card rounded-2xl overflow-hidden border-l-4 ${
              priorityBorderStyles[principle.priority] || "border-l-brand-olive"
            }`}>
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-base-04">
                <div className="flex items-start gap-3 text-left flex-1">
                  <Compass className="h-5 w-5 text-brand-maroon flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className={priorityStyles[principle.priority]}>
                        {principle.priority} priority
                      </Badge>
                      <Badge className={scopeStyles[principle.scope]}>
                        {principle.scope}
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-base text-base-85">
                      {principle.principle}
                    </h4>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-5 pb-5">
                <div className="space-y-4 pl-8">
                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Principle
                    </div>
                    <p className="text-base-85 text-base font-medium leading-relaxed">
                      {principle.principle}
                    </p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Rationale
                    </div>
                    <p className="text-base-55 leading-relaxed">
                      {principle.rationale}
                    </p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Context Considerations
                    </div>
                    <p className="text-base-55 leading-relaxed">
                      {principle.context_considerations}
                    </p>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Strategic How Might We... ({principle.how_might_we.length})
                    </div>
                    <ul className="space-y-3">
                      {principle.how_might_we.map((hmw, idx) => (
                        <li key={idx} className="flex gap-2 p-3 bg-brand-pale-blue/30 rounded-xl border border-accent-blue-border/20">
                          <span className="text-accent-blue font-semibold">{idx + 1}.</span>
                          <span className="text-base-85">{hmw}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="text-label text-base-40 uppercase mb-2">
                      Related Cross-Video Insight
                    </div>
                    <Badge variant="outline" className="font-mono text-xs text-base-55 border-base-09">
                      {principle.cross_insight_id}
                    </Badge>
                  </div>

                  <div className="text-label text-base-25 font-mono">
                    ID: {principle.system_principle_id}
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
